import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { stopTenantTurn } from "$lib/server/agent-bridge";
import { resolveUserWorkspace } from "$lib/server/db";

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user) {
    return json(
      { success: false, error: "Non autorisé. Veuillez vous connecter." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const requestedSlug = body.projectSlug;
    const tenant = await resolveUserWorkspace(
      locals.user,
      cookies,
      requestedSlug,
    );
    const projectSlug = tenant.slug || "workspace";

    const stopped = await stopTenantTurn(projectSlug);

    return json({
      success: true,
      stopped,
      message: stopped ? "Génération arrêtée." : "Aucune génération en cours.",
    });
  } catch (err: any) {
    console.error("[api/studio/stop] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
