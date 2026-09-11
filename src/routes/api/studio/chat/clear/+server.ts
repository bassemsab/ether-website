import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { clearStudioChatHistory } from "$lib/server/db";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const projectSlug = (body.projectSlug || "tester").trim();

    clearStudioChatHistory(projectSlug);

    return json({ success: true, projectSlug });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
