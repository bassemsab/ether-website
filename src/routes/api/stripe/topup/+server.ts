import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  createPromptTopupCheckoutSession,
  TOPUP_PACKS,
} from "$lib/server/stripe";
import { getTenantBySlug } from "$lib/server/db";

export const POST: RequestHandler = async ({ request, locals, url }) => {
  if (!locals.user) {
    return json({ success: false, error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const projectSlug = (body.projectSlug || "tester").trim();
    const packId = body.packId as "pack_20" | "pack_50" | "pack_150";

    if (!packId || !TOPUP_PACKS[packId]) {
      return json(
        { success: false, error: "Pack de prompts invalide" },
        { status: 400 },
      );
    }

    const tenant = await getTenantBySlug(projectSlug);
    if (!tenant) {
      return json(
        { success: false, error: "Site introuvable" },
        { status: 404 },
      );
    }

    const adminEmails = [
      process.env.ADMIN_EMAIL,
      process.env.RESEND_CONTACT_EMAIL,
    ]
      .filter(Boolean)
      .map((e) => e!.trim().toLowerCase());
    const userEmail = (locals.user.email || "").trim().toLowerCase();
    const isOwnerOrAdmin =
      tenant.user_id === locals.user.id ||
      adminEmails.includes(userEmail) ||
      userEmail.endsWith("@ether.paris");

    if (!isOwnerOrAdmin) {
      return json({ success: false, error: "Accès refusé" }, { status: 403 });
    }

    const origin = url.origin;
    const successUrl = `${origin}/studio?project=${encodeURIComponent(projectSlug)}&topup_success=true&session_id={CHECKOUT_SESSION_ID}&pack=${packId}`;
    const cancelUrl = `${origin}/studio?project=${encodeURIComponent(projectSlug)}&topup_canceled=true`;

    const { url: checkoutUrl, sessionId } =
      await createPromptTopupCheckoutSession({
        tenantSlug: projectSlug,
        tenantId: tenant.id || 1,
        packId,
        customerEmail: locals.user.email || tenant.email,
        successUrl,
        cancelUrl,
      });

    return json({ success: true, url: checkoutUrl, sessionId });
  } catch (err: any) {
    console.error("[api/stripe/topup] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
