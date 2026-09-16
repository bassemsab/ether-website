import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { revertTenantChanges } from "$lib/server/agent-bridge";
import { resolveUserWorkspace, revertStudioChatMessages } from "$lib/server/db";

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user) {
    return json(
      { success: false, error: "Non autorisé. Veuillez vous connecter." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const requestedSlug = body.projectSlug;
    const messageId = body.messageId ? Number(body.messageId) : undefined;
    let targetCommit = (body.targetCommit || "").trim() || undefined;

    const tenant = await resolveUserWorkspace(
      locals.user,
      cookies,
      requestedSlug,
    );
    const projectSlug = tenant.slug || "workspace";

    // 1. Look up and delete reverted chat messages from SQLite (falls back to latest assistant message if messageId omitted)
    const revertDbRes = revertStudioChatMessages(
      projectSlug,
      messageId,
      true,
    );
    const deletedCount = revertDbRes.deletedCount;
    if (!targetCommit && revertDbRes.targetCommitHash) {
      targetCommit = revertDbRes.targetCommitHash;
    }

    // 2. Call Runner to revert git changes (git reset --hard & git clean -fd)
    const runnerRes = await revertTenantChanges(
      projectSlug,
      targetCommit,
      targetCommit ? undefined : 1,
    );

    if (!runnerRes.success) {
      return json(
        {
          success: false,
          error: runnerRes.error || "Échec de la restauration Git",
        },
        { status: 500 },
      );
    }

    return json({
      success: true,
      newHead: runnerRes.newHead,
      target: runnerRes.target,
      deletedCount,
      message: runnerRes.message || "Modifications annulées avec succès",
    });
  } catch (err: any) {
    console.error("[api/studio/revert] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
