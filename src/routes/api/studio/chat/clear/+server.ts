import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { clearStudioChatHistory, deleteStudioConversation, getTenantBySlug, resolveUserWorkspace } from "$lib/server/db";

function isUserAuthorizedForTenant(locals: App.Locals, tenant: any): boolean {
  if (!locals.user) return false;
  const adminEmails = [
    "bassem.bme@gmail.com",
    "bassem1alsa@gmail.com",
    process.env.ADMIN_EMAIL,
    process.env.RESEND_CONTACT_EMAIL,
  ]
    .filter(Boolean)
    .map((e) => e!.trim().toLowerCase());
  const userEmail = (locals.user.email || "").trim().toLowerCase();
  const isAdmin =
    adminEmails.includes(userEmail) || userEmail.endsWith("@ether.paris");
  const isOwner =
    tenant.user_id === locals.user.id ||
    (tenant.email && tenant.email.trim().toLowerCase() === userEmail);
  return isOwner || isAdmin;
}

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
    const tenant = await resolveUserWorkspace(locals.user, cookies, requestedSlug);
    const projectSlug = tenant.slug || "workspace";
    const conversationId = body.conversationId ? String(body.conversationId).trim() : null;

    if (conversationId) {
      deleteStudioConversation(projectSlug, conversationId);
    } else {
      clearStudioChatHistory(projectSlug);
    }

    return json({ success: true, projectSlug, conversationId });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
