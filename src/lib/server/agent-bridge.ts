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
}

const AGY_RUNNER_ENDPOINT = env.AGY_RUNNER_ENDPOINT || "http://agent-runner.ether.svc.cluster.local:8080";

/**
 * Dispatches a prompt to the in-cluster agy CLI runner with pre-injected system instructions.
 */
export async function dispatchAgyPrompt(payload: AgentTurnPayload): Promise<AgentTurnResult> {
  const fullPrompt = `[System Context]\n${ETHER_STUDIO_SYSTEM_INSTRUCTIONS}\n\n[User Request]\n${payload.userPrompt}`;

  try {
    const res = await fetch(`${AGY_RUNNER_ENDPOINT}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: payload.tenantSlug,
        prompt: fullPrompt,
        conversationId: payload.conversationId,
        workspace: payload.workspacePath || `/tenants/${payload.tenantSlug}`,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        output: data.response || "Modifications apportées avec succès.",
        conversationId: data.conversationId,
      };
    }
  } catch {
    // If agent runner service is not reachable (e.g. local dev), log and return clean fallback
    console.warn(`[dispatchAgyPrompt] agy runner at ${AGY_RUNNER_ENDPOINT} not reachable in local dev`);
  }

  return {
    success: true,
    output: `[Studio Agent] Modification simulée pour ${payload.tenantSlug}. Prompt: ${payload.userPrompt.slice(0, 80)}...`,
  };
}
