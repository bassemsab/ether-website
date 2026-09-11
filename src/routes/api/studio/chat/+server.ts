import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { dispatchAgyPrompt, streamAgyPrompt } from "$lib/server/agent-bridge";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const isStream = request.headers.get("accept") === "text/event-stream";
    const body = await request.json();
    const prompt = (body.prompt || "").trim();
    const projectSlug = (body.projectSlug || "tester").trim();
    const conversationId = body.conversationId;
    const preferredProfile = body.profile;

    if (!prompt) {
      return json({ success: false, error: "Prompt requis" }, { status: 400 });
    }

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
    });
  } catch (err: any) {
    console.error("[api/studio/chat] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
