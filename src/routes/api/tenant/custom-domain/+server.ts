import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantById, getTenantBySlug, updateTenantStatus } from "$lib/server/db";
import { updateTenantCustomDomainIngress } from "$lib/server/k8s-tenant";
import { checkOvhDomain } from "$lib/server/ovh";
import { provisionMaddyCredentials } from "$lib/server/maddy";
import { sendDomainLinkedEmail } from "$lib/server/email";

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
        { success: false, error: "Nom de domaine manquant ou trop court" },
        { status: 400 },
      );
    }

    const cleanDomain = domain
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "")
      .replace(/^www\./, "");

    // 1. Validate domain syntax
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
    if (!domainRegex.test(cleanDomain)) {
      return json(
        { success: false, error: "Format de domaine invalide (ex: monsite.com ou boutique.fr)" },
        { status: 400 },
      );
    }

    // Disallow linking Ether reserved platform domains
    const reservedDomains = ["ether.paris", "studio.ether.paris", "api.ether.paris", "mail.ether.paris"];
    if (reservedDomains.includes(cleanDomain) || cleanDomain.endsWith(".ether.paris")) {
      return json(
        { success: false, error: "Ce domaine est réservé par l'infrastructure Ether" },
        { status: 400 },
      );
    }

    // 2. Strict Domain Ownership & DNS Verification
    // A domain CANNOT be linked unless:
    //  a) It is managed on our OVH account (checkOvhDomain), OR
    //  b) Its public DNS A record points directly to our server IP (135.181.95.61)
    let isOvhOwned = false;
    try {
      const ovhCheck = await checkOvhDomain(cleanDomain);
      isOvhOwned = !!ovhCheck.exists;
    } catch {}

    const expectedIp = "135.181.95.61";
    let dnsVerified = false;
    let detectedIps: string[] = [];

    if (!isOvhOwned) {
      try {
        const dnsRes = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanDomain)}&type=A`,
          { headers: { Accept: "application/dns-json" } },
        );
        if (dnsRes.ok) {
          const dnsData = await dnsRes.json();
          const answers = dnsData.Answer || [];
          detectedIps = answers
            .filter((a: any) => a.type === 1)
            .map((a: any) => a.data);
          if (detectedIps.includes(expectedIp)) {
            dnsVerified = true;
          }
        }
      } catch (dnsErr) {
        console.warn("[custom-domain] DNS verification lookup failed:", dnsErr);
      }
    }

    // If not on OVH and DNS does not point to our server, reject linking!
    if (!isOvhOwned && !dnsVerified) {
      const ipMessage =
        detectedIps.length > 0
          ? `Actuellement, il est dirigé vers ${detectedIps.join(", ")}.`
          : "Aucun enregistrement DNS A n'a été détecté pour ce domaine.";

      return json(
        {
          success: false,
          error: `Vérification requise : le domaine ${cleanDomain} ne pointe pas encore vers les serveurs Ether (${expectedIp}). ${ipMessage} Vous devez être propriétaire de ce domaine et ajouter un enregistrement DNS Type A pointant vers ${expectedIp} chez votre bureau d'enregistrement avant de pouvoir le relier.`,
        },
        { status: 400 },
      );
    }

    // 3. Link verified domain: Update tenant status in DB
    await updateTenantStatus(tenant.domain, tenant.status, {
      custom_domain: cleanDomain,
    });

    // 4. Update Ingress in Kubernetes with the verified custom domain
    const namespace = tenant.k8s_namespace || `tenant-${tenant.slug}`;
    const subdomain = tenant.subdomain || `${tenant.slug}.ether.paris`;
    if (tenant.slug) {
      await updateTenantCustomDomainIngress(
        tenant.slug,
        namespace,
        subdomain,
        cleanDomain,
      );
    }

    // 5. Provision Maddy SMTP credentials for contact@<cleanDomain>
    let smtpInfo = null;
    try {
      const maddyRes = await provisionMaddyCredentials(cleanDomain, "contact");
      if (maddyRes.success && maddyRes.credentials) {
        smtpInfo = maddyRes.credentials;
        await updateTenantStatus(tenant.domain, tenant.status, {
          stalwart_user_created: true,
          stalwart_username: maddyRes.credentials.username,
          stalwart_password: maddyRes.credentials.password,
        });
      }
    } catch (maddyErr: any) {
      console.warn("[custom-domain] Maddy setup note:", maddyErr?.message);
    }

    // 6. Send clean "Domain Linked" notification email (NO purchase, NO invoice)
    const recipientEmail = tenant.email || locals.user.email;
    if (recipientEmail) {
      try {
        await sendDomainLinkedEmail({
          email: recipientEmail,
          domain: cleanDomain,
          tenantSlug: tenant.slug || "",
          forwardToEmail: recipientEmail,
          smtp: smtpInfo || undefined,
        });
      } catch (emailErr: any) {
        console.warn("[custom-domain] Could not send domain linked email:", emailErr?.message);
      }
    }

    return json({
      success: true,
      domain: cleanDomain,
      message: `Le domaine ${cleanDomain} a été vérifié et relié avec succès !`,
      smtp: smtpInfo,
    });
  } catch (err: any) {
    console.error("[api/tenant/custom-domain] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
