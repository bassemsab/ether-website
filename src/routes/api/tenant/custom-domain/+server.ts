import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantById, getTenantBySlug, updateTenantStatus } from "$lib/server/db";
import { fulfillDomainPurchase } from "$lib/server/stripe";
import { updateTenantCustomDomainIngress } from "$lib/server/k8s-tenant";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ success: false, error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tenantId, slug, domain, action = "link" } = body;

    let tenant = tenantId ? await getTenantById(tenantId) : null;
    if (!tenant && slug) {
      tenant = await getTenantBySlug(slug);
    }

    if (!tenant) {
      return json(
        { success: false, error: "Site introuvable ou inexistant" },
        { status: 404 },
      );
    }

    // Check ownership or admin permissions
    const adminEmails = [
      "bassem.bme@gmail.com",
      "bassem1alsa@gmail.com",
      process.env.ADMIN_EMAIL,
      process.env.RESEND_CONTACT_EMAIL,
    ]
      .filter(Boolean)
      .map((e) => e!.trim().toLowerCase());

    const userEmail = (locals.user.email || "").trim().toLowerCase();
    const isOwner = tenant.user_id === locals.user.id;
    const isAdmin = adminEmails.includes(userEmail);

    if (!isOwner && !isAdmin) {
      return json(
        { success: false, error: "Accès refusé pour ce site" },
        { status: 403 },
      );
    }

    // Unlink custom domain action
    if (action === "unlink") {
      const namespace = tenant.k8s_namespace || `tenant-${tenant.slug}`;
      const subdomain = tenant.subdomain || `${tenant.slug}.ether.paris`;

      if (tenant.slug) {
        await updateTenantCustomDomainIngress(
          tenant.slug,
          namespace,
          subdomain,
          "",
        );
      }

      await updateTenantStatus(tenant.domain, tenant.status, {
        custom_domain: null,
      });

      return json({
        success: true,
        message: "Nom de domaine personnalisé détaché avec succès.",
      });
    }

    // Link custom domain action
    if (!domain || typeof domain !== "string" || domain.trim().length < 3) {
      return json(
        { success: false, error: "Nom de domaine invalide" },
        { status: 400 },
      );
    }

    const cleanDomain = domain
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "")
      .replace(/^www\./, "");

    const result = await fulfillDomainPurchase({
      tenantId: tenant.id,
      domain: cleanDomain,
      provider: "cloudflare",
      customerEmail: locals.user.email || tenant.email,
      priceCents: 0,
    });

    if (!result.success) {
      return json(
        { success: false, error: result.error || "Erreur de configuration du domaine" },
        { status: 500 },
      );
    }

    return json({
      success: true,
      domain: cleanDomain,
      message: `Le domaine ${cleanDomain} est maintenant relié à votre site !`,
      dnsResult: result.dnsResult,
    });
  } catch (err: any) {
    console.error("[api/tenant/custom-domain] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
