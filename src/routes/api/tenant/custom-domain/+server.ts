import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getTenantById,
  getTenantBySlug,
  updateTenantStatus,
  getTenantOwnedDomains,
  isDomainOwnedByTenant,
} from "$lib/server/db";
import { updateTenantCustomDomainIngress } from "$lib/server/k8s-tenant";
import { checkOvhDomain } from "$lib/server/ovh";
import { provisionMaddyCredentials } from "$lib/server/maddy";
import { sendDomainLinkedEmail } from "$lib/server/email";

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ success: false, error: "Non autorisé" }, { status: 401 });
  }

  const tenantIdStr = url.searchParams.get("tenantId");
  const slug = url.searchParams.get("slug");

  let tenant = tenantIdStr ? await getTenantById(parseInt(tenantIdStr, 10)) : null;
  if (!tenant && slug) {
    tenant = await getTenantBySlug(slug);
  }

  if (!tenant) {
    return json({ success: false, error: "Site introuvable" }, { status: 404 });
  }

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
    return json({ success: false, error: "Accès refusé" }, { status: 403 });
  }

  // Fetch active owned domains from DB
  const owned = getTenantOwnedDomains(tenant.id);

  // Ensure miaw.ovh is listed if available in account
  if (!owned.some((d) => d.domain.toLowerCase() === "miaw.ovh")) {
    try {
      const ovhMiaw = await checkOvhDomain("miaw.ovh");
      if (ovhMiaw.exists) {
        owned.unshift({
          id: 9999,
          domain: "miaw.ovh",
          provider: "ovh",
          status: "active",
          created_at: new Date().toISOString(),
        });
      }
    } catch {}
  }

  const currentClean = (tenant.custom_domain || "").toLowerCase().trim();
  const ownedWithStatus = owned.map((item) => ({
    ...item,
    isLinked: currentClean === item.domain.toLowerCase().trim(),
  }));

  return json({
    success: true,
    currentDomain: tenant.custom_domain,
    subdomain: tenant.subdomain || `${tenant.slug}.ether.paris`,
    ownedDomains: ownedWithStatus,
  });
};

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

    // 2. Domain Ownership Verification
    // A domain is authorized if:
    //  a) It is already purchased/owned by this user/tenant in Ether (domain_orders), OR
    //  b) It is managed on our OVH account (checkOvhDomain), OR
    //  c) Its public DNS A record points directly to our server IP (135.181.95.61)
    const isEtherOwned =
      isDomainOwnedByTenant(tenant.id, cleanDomain) ||
      cleanDomain === "miaw.ovh";

    let isOvhOwned = false;
    if (!isEtherOwned) {
      try {
        const ovhCheck = await checkOvhDomain(cleanDomain);
        isOvhOwned = !!ovhCheck.exists;
      } catch {}
    }

    const expectedIp = "135.181.95.61";
    let dnsVerified = false;

    if (!isEtherOwned && !isOvhOwned) {
      try {
        const dnsRes = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanDomain)}&type=A`,
          { headers: { Accept: "application/dns-json" } },
        );
        if (dnsRes.ok) {
          const dnsData = await dnsRes.json();
          const answers = dnsData.Answer || [];
          const detectedIps: string[] = answers
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

    // If not owned on Ether/OVH and DNS not pointed, reject linking with simplified error!
    if (!isEtherOwned && !isOvhOwned && !dnsVerified) {
      return json(
        {
          success: false,
          error: `Ce domaine ne pointe pas vers Ether (${expectedIp}). Configurez l'enregistrement DNS Type A chez votre registrar pour pouvoir le relier.`,
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
      const userLocale =
        request.headers.get("accept-language")?.toLowerCase().startsWith("en")
          ? "en"
          : "fr";
      try {
        await sendDomainLinkedEmail({
          email: recipientEmail,
          domain: cleanDomain,
          tenantSlug: tenant.slug || "",
          forwardToEmail: recipientEmail,
          locale: userLocale,
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
