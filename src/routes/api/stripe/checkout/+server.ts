import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createDomainCheckoutSession } from "$lib/server/stripe";
import { recordDomainOrder, getTenantById } from "$lib/server/db";
import { resolveLiveDomainPriceCents } from "$lib/server/domains";

export const POST: RequestHandler = async ({ request, locals, url }) => {
  if (!locals.user) {
    return json({ success: false, error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tenantId, domain, provider } = body;
    let clientPriceCents = body.priceCents;

    if (!tenantId || !domain) {
      return json(
        { success: false, error: "Paramètres manquants" },
        { status: 400 },
      );
    }

    const tenant = await getTenantById(tenantId);
    if (!tenant || tenant.user_id !== locals.user.id) {
      return json(
        { success: false, error: "Site introuvable ou accès refusé" },
        { status: 404 },
      );
    }

    // Resolve live marked-up price on server to guarantee authenticity
    const resolved = await resolveLiveDomainPriceCents(domain);
    const effectivePriceCents =
      clientPriceCents && Math.abs(clientPriceCents - resolved.priceCents) <= 50
        ? clientPriceCents
        : resolved.priceCents;
    const effectiveProvider = provider || resolved.provider || "ovh";

    const origin = url.origin;
    const successUrl = `${origin}/dashboard?domain_success=true&domain=${encodeURIComponent(domain)}`;
    const cancelUrl = `${origin}/dashboard?domain_canceled=true`;

    const { url: checkoutUrl, sessionId } = await createDomainCheckoutSession({
      tenantId,
      domain,
      provider: effectiveProvider,
      priceCents: effectivePriceCents,
      customerEmail: locals.user.email || tenant.email,
      successUrl,
      cancelUrl,
    });

    // Record order in database
    await recordDomainOrder(
      tenantId,
      domain,
      effectiveProvider,
      sessionId,
      effectivePriceCents,
      "eur",
    );

    return json({ success: true, url: checkoutUrl });
  } catch (err: any) {
    console.error("[api/stripe/checkout] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
