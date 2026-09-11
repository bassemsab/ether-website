import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { dispatchAgyPrompt } from "$lib/server/agent-bridge";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const prompt = (body.prompt || "").trim();
    const projectSlug = (body.projectSlug || "tester").trim();
    const conversationId = body.conversationId;

    if (!prompt) {
      return json({ success: false, error: "Prompt requis" }, { status: 400 });
    }

    const result = await dispatchAgyPrompt({
      tenantSlug: projectSlug,
      userPrompt: prompt,
      conversationId,
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
