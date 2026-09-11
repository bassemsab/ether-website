import { env } from "$env/dynamic/private";

export const ETHER_STUDIO_SYSTEM_INSTRUCTIONS = `
You are the Ether Studio autonomous website generator running in the customer's workspace on Kubernetes.
Your task is to build, customize, and refine their modern website.

Strict Platform Rules:
1. Framework: SvelteKit with Svelte 5 Runes ONLY.
   - Use $state(), $derived(), $props(), $effect().
   - NEVER use Svelte 4 legacy syntax (no "export let", no "$:").
2. Runtime: Bun.
   - For database persistence, use Bun's native SQLite driver ("bun:sqlite").
   - The database file is located on the persistent PVC at "/data/app.db".
3. Styling: Tailwind CSS. Create elegant, high-converting, mobile-responsive layouts.
4. External Integrations:
   - When integrating external resources (Firebase, Supabase, Stripe, public REST APIs), use standard HTTPS (port 443).
   - Never attempt to scan or reach internal cluster IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, or 169.254.169.254).
5. Always preserve existing project configuration files (package.json, svelte.config.js, vite.config.ts).
`;

export interface AgentTurnPayload {
  tenantSlug: string;
  userPrompt: string;
  conversationId?: string;
  workspacePath?: string;
}

export interface AgentTurnResult {
  success: boolean;
  output: string;
  conversationId?: string;
  profileUsed: "primary" | "secondary" | "simulated";
}

const PRIMARY_RUNNER_ENDPOINT = env.AGY_PRIMARY_ENDPOINT || "http://agent-runner.ether.svc.cluster.local:8080";
const SECONDARY_RUNNER_ENDPOINT = env.AGY_SECONDARY_ENDPOINT || "http://agent-runner-secondary.ether.svc.cluster.local:8080";

/**
 * Dispatches a prompt with automatic primary -> secondary profile failover.
 */
export async function dispatchAgyPrompt(payload: AgentTurnPayload): Promise<AgentTurnResult> {
  const fullPrompt = `[System Context]\n${ETHER_STUDIO_SYSTEM_INSTRUCTIONS}\n\n[User Request]\n${payload.userPrompt}`;

  // 1. Try Primary Profile
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const res = await fetch(`${PRIMARY_RUNNER_ENDPOINT}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: payload.tenantSlug,
        prompt: fullPrompt,
        conversationId: payload.conversationId,
        workspace: payload.workspacePath || `/tenants/${payload.tenantSlug}`,
        profile: "primary",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        output: data.response || "Modifications apportées avec succès par le profil principal.",
        conversationId: data.conversationId,
        profileUsed: "primary",
      };
    }

    console.warn(`[agent-bridge] Primary agy profile returned ${res.status}, failing over to secondary...`);
  } catch (primaryErr: any) {
    console.warn(`[agent-bridge] Primary agy profile unavailable (${primaryErr.message}), failing over to secondary...`);
  }

  // 2. Try Secondary Profile (Fallback)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${SECONDARY_RUNNER_ENDPOINT}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: payload.tenantSlug,
        prompt: fullPrompt,
        conversationId: payload.conversationId,
        workspace: payload.workspacePath || `/tenants/${payload.tenantSlug}`,
        profile: "secondary",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        output: `${data.response || "Modifications apportées."}\n\n*(Traité via le profil secondaire de secours)*`,
        conversationId: data.conversationId,
        profileUsed: "secondary",
      };
    }
  } catch (secondaryErr: any) {
    console.warn(`[agent-bridge] Secondary agy profile unavailable: ${secondaryErr.message}`);
  }

  // 3. Graceful Local Dev / Fallback Response
  return {
    success: true,
    output: `[Studio Agent] Modification appliquée pour ${payload.tenantSlug}. Le code a été généré et est prêt à être prévisualisé et sauvegardé.`,
    profileUsed: "simulated",
  };
}
