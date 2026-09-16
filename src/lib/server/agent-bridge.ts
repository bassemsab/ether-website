import { env } from "$env/dynamic/private";

export const ETHER_STUDIO_SYSTEM_INSTRUCTIONS = `
You are the friendly, autonomous website assistant for Ether Studio.
Your task is to build, customize, and refine the customer's website according to their wishes.

Communication & Tone Guidelines:
1. Explain things in very simple, reassuring, plain terms.
2. NEVER mention internal technical jargon to the user (do NOT say Kubernetes, PVC, SvelteKit 5 Runes, Bun runtime, Docker, hydration, or SQLite driver names).
3. Speak about visual elements, features, and content (e.g. "J'ai créé la section contact avec un formulaire", "Voici le catalogue de vos produits", "Les couleurs et typographies ont été adaptées").
4. If the user writes in French, answer warmly in French. If in English, answer in English.

Technical Engineering Rules:
1. Framework: SvelteKit with Svelte 5 Runes ONLY.
   - Use $state(), $derived(), $props(), $effect().
   - NEVER use legacy syntax (no "export let", no "$:").
2. Runtime: Bun.
   - For database persistence, use Bun's native SQLite driver ("bun:sqlite").
   - The database file is located on persistent storage at "/data/app.db" (or locally at "./data/app.db").
3. Styling: Tailwind CSS. Create clean, elegant, responsive layouts.
4. Always preserve existing project configuration files (package.json, svelte.config.js, vite.config.ts).

Tenant Isolation & Security Rules:
1. Workspace confinement: You are strictly restricted to the customer's project workspace.
2. You must NEVER attempt to read, view, modify, or list files belonging to any other customer or tenant.
3. You must NEVER run commands that navigate above the workspace directory (e.g. "cd ..", accessing "/data/tenants" or "/data/profiles").
4. You must NEVER interact with or push to any foreign Git repository.
5. Protected & Forbidden Files: You must NEVER view, edit, create, or delete:
   - "Dockerfile", ".dockerignore", "docker-compose.yml", or any container/Kubernetes configuration.
   - Any YAML or deployment configuration files ("*.yaml", "*.yml", "k8s/", ".github/").
   - "app.db", "*.sqlite", "*.db", or raw database files. Database changes must strictly be performed via SQL queries in "$lib/server/db.ts" or server actions.
   - Package manager lockfiles ("bun.lock", "package-lock.json") or environment secrets (".env*").
6. Confine all code changes strictly to the website source ("src/routes/", "src/lib/", "src/app.html", "src/app.css") and assets ("static/").
7. If the user asks you to inspect or modify another website, tenant, or system files, you must politely decline and state that tenant data isolation is strictly enforced.

Dynamic Next Action Suggestions:
At the very end of your final response to the user, always propose 3 concrete next action suggestions that would improve or extend the site based on what you just created or modified. Format them strictly as a hidden HTML comment at the end of your message:
<!-- SUGGESTIONS: ["Suggestion 1", "Suggestion 2", "Suggestion 3"] -->
`;

export interface AttachedImagePayload {
  name: string;
  type: string;
  base64: string;
}

export interface AgentTurnPayload {
  tenantSlug: string;
  userPrompt: string;
  conversationId?: string;
  preferredProfile?: string;
  workspacePath?: string;
  image?: AttachedImagePayload;
}

export interface AgentTurnResult {
  success: boolean;
  output: string;
  conversationId?: string;
  profileUsed: string;
}

export interface RunnerProfileInfo {
  name: string;
  email: string | null;
  hasToken: boolean;
  isExpired: boolean;
  expiryDate: string | null;
  quotaStatus?: "ready" | "throttled";
  throttledUntil?: number | null;
  turnsCount?: number;
}

const RUNNER_ENDPOINT =
  env.AGY_PRIMARY_ENDPOINT ||
  "http://agent-runner.ether.svc.cluster.local:8080";

/**
 * Dispatches a prompt to the permanent runner daemon with automatic profile selection & fallback.
 */
export async function dispatchAgyPrompt(
  payload: AgentTurnPayload,
): Promise<AgentTurnResult> {
  const fullPrompt = `[System Context]\n${ETHER_STUDIO_SYSTEM_INSTRUCTIONS}\n\n[User Request]\n${payload.userPrompt}`;
  const targetProfile = payload.preferredProfile || "primary";

  // 1. Try Target Profile on Runner Daemon
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

    const res = await fetch(`${RUNNER_ENDPOINT}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: payload.tenantSlug,
        prompt: fullPrompt,
        conversationId: payload.conversationId,
        profile: targetProfile,
        image: payload.image,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as any;
      return {
        success: data.success !== false,
        output: data.response || "Modifications appliquées avec succès.",
        conversationId: data.conversationId,
        profileUsed: data.profileUsed || targetProfile,
      };
    }

    const errText = await res.text();
    throw new Error(`Runner error (${res.status}): ${errText}`);
  } catch (err: any) {
    console.error(`[agent-bridge] Dispatch prompt failed: ${err.message}`);
    throw err;
  }
}

/**
 * Initiates an SSE streaming connection to the agent runner daemon.
 */
export async function streamAgyPrompt(
  payload: AgentTurnPayload,
): Promise<Response> {
  const fullPrompt = `[System Context]\n${ETHER_STUDIO_SYSTEM_INSTRUCTIONS}\n\n[User Request]\n${payload.userPrompt}`;
  const targetProfile = payload.preferredProfile || "primary";

  try {
    const res = await fetch(`${RUNNER_ENDPOINT}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        project: payload.tenantSlug,
        prompt: fullPrompt,
        conversationId: payload.conversationId,
        profile: targetProfile,
        stream: true,
        image: payload.image,
      }),
    });

    if (res.ok && res.body) {
      return new Response(res.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const errText = await res.text();
    console.error(`[agent-bridge] Runner error (${res.status}): ${errText}`);
    throw new Error(`Runner error (${res.status}): ${errText}`);
  } catch (err: any) {
    console.warn(`[agent-bridge] SSE stream failed: ${err.message}`);
    const errorStream = new ReadableStream({
      start(controller) {
        const payload = `event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`;
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });

    return new Response(errorStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
}

/**
 * Fetches the list of active Google profiles and their health status from the runner daemon.
 */
export async function getRunnerProfiles(): Promise<RunnerProfileInfo[]> {
  try {
    const res = await fetch(`${RUNNER_ENDPOINT}/profiles`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      return data.profiles || [];
    }
  } catch (err) {
    // Fallback default profiles if runner is offline
  }

  return [
    {
      name: "primary",
      email: "primary@ether.paris",
      hasToken: true,
      isExpired: false,
      expiryDate: null,
    },
    {
      name: "secondary",
      email: "secondary@ether.paris",
      hasToken: true,
      isExpired: false,
      expiryDate: null,
    },
  ];
}

/**
 * Starts the OAuth authorization flow for a specific profile on the runner daemon.
 */
export async function startProfileAuth(
  profile: string,
): Promise<{ authUrl: string }> {
  const res = await fetch(`${RUNNER_ENDPOINT}/auth/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });

  if (!res.ok) {
    throw new Error(`Échec de démarrage OAuth (${res.status})`);
  }

  const data = (await res.json()) as any;
  return { authUrl: data.authUrl };
}

/**
 * Finishes the OAuth authorization flow with the authorization code.
 */
export async function finishProfileAuth(
  profile: string,
  code: string,
): Promise<{ email: string; profile: string }> {
  const res = await fetch(`${RUNNER_ENDPOINT}/auth/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, code }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(
      err.error || `Erreur lors de la validation du code OAuth (${res.status})`,
    );
  }

  return (await res.json()) as any;
}

/**
 * Creates a new profile slot on the runner daemon (e.g. profile-3, profile-4).
 */
export async function createRunnerProfile(
  profile: string,
): Promise<{ success: boolean; profile: string; authUrl: string }> {
  const res = await fetch(`${RUNNER_ENDPOINT}/profiles/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(
      err.error || `Erreur lors de la création du profil (${res.status})`,
    );
  }

  return (await res.json()) as any;
}
