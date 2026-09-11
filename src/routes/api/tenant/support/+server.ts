import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantById } from "$lib/server/db";
import { sendContactEmail } from "$lib/server/email";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ success: false, error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tenantId, subject, message } = body;

    if (!message || !message.trim()) {
      return json(
        { success: false, error: "Veuillez préciser votre demande." },
        { status: 400 },
      );
    }

    let siteInfo = "Aucun site spécifique";
    if (tenantId) {
      const tenant = await getTenantById(tenantId);
      if (tenant) {
        siteInfo = `${tenant.brand_name || tenant.slug} (${tenant.custom_domain || tenant.subdomain || tenant.domain})`;
      }
    }

    const customerEmail = locals.user.email || "client@ether.paris";

    await sendContactEmail({
      name: `Client Ether · ${customerEmail}`,
      email: customerEmail,
      company: `Site : ${siteInfo}`,
      message: `[Demande d'infrastructure personnalisée / Support]\nSujet : ${subject || "Support"}\n\n${message}`,
    });

    return json({
      success: true,
      message:
        "Votre demande a bien été transmise à l'équipe d'infrastructure Ether. Nous vous répondrons sous 24h.",
    });
  } catch (err: any) {
    console.error("[api/tenant/support] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
