import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { dispatchAgyPrompt, streamAgyPrompt } from "$lib/server/agent-bridge";
import {
  getTenantBySlug,
  checkTenantPromptLimit,
  incrementTenantPromptCount,
} from "$lib/server/db";

export const GET: RequestHandler = async ({ url }) => {
  const projectSlug = url.searchParams.get("project") || "tester";
  const tenant = await getTenantBySlug(projectSlug);
  const plan = tenant?.plan || "demo";
  const quota = checkTenantPromptLimit(projectSlug, plan);

  return json({
    success: true,
    project: projectSlug,
    plan,
    ...quota,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const isStream = request.headers.get("accept") === "text/event-stream";
    const body = await request.json();
    const prompt = (body.prompt || "").trim();
    const projectSlug = (body.projectSlug || "tester").trim();
    const conversationId = body.conversationId;
    const preferredProfile = body.profile === "auto" ? undefined : body.profile;

    if (!prompt) {
      return json({ success: false, error: "Prompt requis" }, { status: 400 });
    }

    // 1. Tenant Fair-Use Quota Check
    const tenant = await getTenantBySlug(projectSlug);
    const plan = tenant?.plan || "demo";
    const quota = checkTenantPromptLimit(projectSlug, plan);

    if (!quota.allowed) {
      const errorMsg = `Vous avez atteint votre quota quotidien de ${quota.limit} prompts pour ce site (${plan}). Votre quota sera réinitialisé demain à minuit.`;

      if (isStream || body.stream) {
        const stream = new ReadableStream({
          start(controller) {
            const sendEvent = (event: string, data: any) => {
              controller.enqueue(
                new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
              );
            };
            sendEvent("error", { message: errorMsg, quotaExceeded: true });
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      return json({ success: false, error: errorMsg, quotaExceeded: true }, { status: 429 });
    }

    // 2. Increment prompt counter
    incrementTenantPromptCount(projectSlug);

    // 3. Dispatch prompt to agent runner daemon
    if (isStream || body.stream) {
      return await streamAgyPrompt({
        tenantSlug: projectSlug,
        userPrompt: prompt,
        conversationId,
        preferredProfile,
      });
    }

    const result = await dispatchAgyPrompt({
      tenantSlug: projectSlug,
      userPrompt: prompt,
      conversationId,
      preferredProfile,
    });

    return json({
      success: true,
      response: result.output,
      profileUsed: result.profileUsed,
      conversationId: result.conversationId || `conv_${Date.now()}`,
      quotaRemaining: Math.max(0, quota.remaining - 1),
    });
  } catch (err: any) {
    console.error("[api/studio/chat] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
