import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createDomainCheckoutSession } from "$lib/server/stripe";
import { recordDomainOrder, getTenantById } from "$lib/server/db";

export const POST: RequestHandler = async ({ request, locals, url }) => {
  if (!locals.user) {
    return json({ success: false, error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tenantId, domain, provider, priceCents } = body;

    if (!tenantId || !domain || !priceCents) {
      return json({ success: false, error: "Paramètres manquants" }, { status: 400 });
    }

    const tenant = await getTenantById(tenantId);
    if (!tenant || tenant.user_id !== locals.user.id) {
      return json({ success: false, error: "Site introuvable ou accès refusé" }, { status: 404 });
    }

    const origin = url.origin;
    const successUrl = `${origin}/dashboard?domain_success=true&domain=${encodeURIComponent(domain)}`;
    const cancelUrl = `${origin}/dashboard?domain_canceled=true`;

    const { url: checkoutUrl, sessionId } = await createDomainCheckoutSession({
      tenantId,
      domain,
      provider: provider || "cloudflare",
      priceCents,
      customerEmail: locals.user.email || tenant.email,
      successUrl,
      cancelUrl,
    });

    // Record order in database
    await recordDomainOrder(
      tenantId,
      domain,
      provider || "cloudflare",
      sessionId,
      priceCents,
      "eur"
    );

    return json({ success: true, url: checkoutUrl });
  } catch (err: any) {
    console.error("[api/stripe/checkout] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
