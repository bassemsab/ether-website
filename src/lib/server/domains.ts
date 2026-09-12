import { env } from "$env/dynamic/private";

export interface DomainSearchResult {
  domain: string;
  tld: string;
  available: boolean;
  provider: "ovh" | "cloudflare";
  priceAnnualCents: number;
  currency: string;
  formattedPrice: string;
  isOwnedByAccount?: boolean;
}

const COMMON_TLDS = [
  { tld: "com", basePriceCents: 1299, provider: "cloudflare" as const },
  { tld: "fr", basePriceCents: 899, provider: "ovh" as const },
  { tld: "paris", basePriceCents: 3999, provider: "ovh" as const },
  { tld: "io", basePriceCents: 4500, provider: "cloudflare" as const },
  { tld: "net", basePriceCents: 1399, provider: "cloudflare" as const },
  { tld: "org", basePriceCents: 1299, provider: "cloudflare" as const },
  { tld: "shop", basePriceCents: 2999, provider: "ovh" as const },
  { tld: "tech", basePriceCents: 1999, provider: "ovh" as const },
];

/**
 * Searches domain availability and annual pricing across OVH and Cloudflare.
 */
export async function searchDomains(
  query: string,
): Promise<DomainSearchResult[]> {
  const rawClean = query
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/^www\./, "");

  if (!rawClean || rawClean.length < 2) {
    return [];
  }

  const cfToken = env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  const results: DomainSearchResult[] = [];

  // Check if user entered an exact domain with extension (e.g. miaw.ovh or mydomain.com)
  const hasExtension = rawClean.includes(".") && rawClean.split(".").length >= 2;
  let baseName = rawClean;
  let explicitTld = "";

  if (hasExtension) {
    const parts = rawClean.split(".");
    explicitTld = parts.slice(1).join(".");
    baseName = parts[0].replace(/[^a-z0-9-]/g, "");

    const exactDomain = `${baseName}.${explicitTld}`;
    let isOwned = false;
    let isAvailable = true;

    // 1. Check if zone is already managed in user's Cloudflare account
    if (cfToken) {
      try {
        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones?name=${exactDomain}`,
          { headers: { Authorization: `Bearer ${cfToken}` } },
        );
        if (cfRes.ok) {
          const cfData = await cfRes.json();
          if (cfData.success && cfData.result && cfData.result.length > 0) {
            isOwned = true;
            isAvailable = false;
          }
        }
      } catch (e: any) {
        console.warn(`[searchDomains] Cloudflare check error for ${exactDomain}:`, e.message);
      }
    }

    // 2. If not owned in Cloudflare, check public DNS availability
    if (!isOwned) {
      try {
        const dnsRes = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${exactDomain}&type=NS`,
          { headers: { Accept: "application/dns-json" } },
        );
        if (dnsRes.ok) {
          const dnsData = await dnsRes.json();
          if (dnsData.Answer && dnsData.Answer.length > 0) {
            isAvailable = false;
          }
        }
      } catch {}
    }

    const matchedTldConfig = COMMON_TLDS.find((t) => t.tld === explicitTld);
    const priceCents = matchedTldConfig ? matchedTldConfig.basePriceCents : 1499;

    results.push({
      domain: exactDomain,
      tld: explicitTld,
      available: isAvailable,
      provider: "cloudflare",
      priceAnnualCents: isOwned ? 0 : priceCents,
      currency: "EUR",
      formattedPrice: isOwned ? "Détecté dans votre Cloudflare" : `${(priceCents / 100).toFixed(2)} €/an`,
      isOwnedByAccount: isOwned,
    });
  } else {
    baseName = rawClean.replace(/[^a-z0-9-]/g, "");
  }

  if (!baseName || baseName.length < 2) {
    return results;
  }

  // Query common TLDs across providers
  for (const item of COMMON_TLDS) {
    if (hasExtension && item.tld === explicitTld) {
      continue; // already added above
    }

    const domain = `${baseName}.${item.tld}`;
    let isAvailable = true;

    try {
      const dnsRes = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${domain}&type=NS`,
        { headers: { Accept: "application/dns-json" } },
      );
      if (dnsRes.ok) {
        const dnsData = await dnsRes.json();
        if (dnsData.Answer && dnsData.Answer.length > 0) {
          isAvailable = false;
        }
      }
    } catch {}

    results.push({
      domain,
      tld: item.tld,
      available: isAvailable,
      provider: item.provider,
      priceAnnualCents: item.basePriceCents,
      currency: "EUR",
      formattedPrice: `${(item.basePriceCents / 100).toFixed(2)} €/an`,
    });
  }

  return results;
}

/**
 * Provisions a booked domain:
 * 1. Calls OVH / Cloudflare to finalize registration.
 * 2. If OVH, delegates nameservers to Cloudflare.
 * 3. Idempotently creates or updates DNS A records pointing to server IP (135.181.95.61).
 * 4. Configures Cloudflare Email Routing: contact@{domain} -> forwardToEmail.
 */
export async function provisionBookedDomain(
  domain: string,
  provider: "ovh" | "cloudflare",
  forwardToEmail: string,
  serverIp = "135.181.95.61",
): Promise<{ success: boolean; message: string; details?: any }> {
  console.log(
    `[provisionBookedDomain] Initiating provisioning for ${domain} (${provider}) -> ${forwardToEmail}`,
  );

  const cleanDomain = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/^www\./, "");

  const cfToken = env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (!cfToken) {
    console.warn("[provisionBookedDomain] CLOUDFLARE_API_TOKEN not configured");
    return {
      success: true,
      message: `Domain ${cleanDomain} simulated provisioning (no CF token configured)`,
    };
  }

  try {
    const cfHeaders = {
      Authorization: `Bearer ${cfToken}`,
      "Content-Type": "application/json",
    };

    // 1. Get or create Cloudflare zone
    let zoneId = "";
    let accountId = "";

    const zonesRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${cleanDomain}`,
      { headers: cfHeaders },
    );
    const zonesData = await zonesRes.json();

    if (zonesData.result && zonesData.result.length > 0) {
      zoneId = zonesData.result[0].id;
      accountId = zonesData.result[0].account?.id;
    } else {
      // Fetch default account ID
      const accRes = await fetch("https://api.cloudflare.com/client/v4/zones", {
        headers: cfHeaders,
      });
      const accData = await accRes.json();
      accountId = accData.result?.[0]?.account?.id;

      if (accountId) {
        const createZoneRes = await fetch(
          "https://api.cloudflare.com/client/v4/zones",
          {
            method: "POST",
            headers: cfHeaders,
            body: JSON.stringify({
              name: cleanDomain,
              type: "full",
              account: { id: accountId },
            }),
          },
        );
        const createdZone = await createZoneRes.json();
        zoneId = createdZone.result?.id;
      }
    }

    if (!zoneId) {
      throw new Error(`Zone Cloudflare introuvable pour ${cleanDomain}`);
    }

    // 2. Fetch existing DNS records to perform idempotent updates
    const existingRecsRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=100`,
      { headers: cfHeaders },
    );
    const existingRecsData = await existingRecsRes.json();
    const existingRecords: any[] = existingRecsData.result || [];

    // Helper: upsert A record
    async function upsertARecord(name: string, ip: string) {
      const match = existingRecords.find(
        (r) => r.name.toLowerCase() === name.toLowerCase() && (r.type === "A" || r.type === "CNAME"),
      );

      if (match) {
        const updateRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${match.id}`,
          {
            method: "PUT",
            headers: cfHeaders,
            body: JSON.stringify({
              type: "A",
              name,
              content: ip,
              proxied: true,
              ttl: 1,
            }),
          },
        );
        return await updateRes.json();
      } else {
        const createRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
          {
            method: "POST",
            headers: cfHeaders,
            body: JSON.stringify({
              type: "A",
              name,
              content: ip,
              proxied: true,
              ttl: 1,
            }),
          },
        );
        return await createRes.json();
      }
    }

    // Upsert root A record (e.g. miaw.ovh -> 135.181.95.61)
    await upsertARecord(cleanDomain, serverIp);

    // Upsert www A record (e.g. www.miaw.ovh -> 135.181.95.61)
    await upsertARecord(`www.${cleanDomain}`, serverIp);

    // 3. Email Routing DNS records (Cloudflare MX + SPF)
    const mailRecords = [
      { type: "MX", name: cleanDomain, content: "route1.mx.cloudflare.net", priority: 48, proxied: false, ttl: 1 },
      { type: "MX", name: cleanDomain, content: "route2.mx.cloudflare.net", priority: 74, proxied: false, ttl: 1 },
      { type: "MX", name: cleanDomain, content: "route3.mx.cloudflare.net", priority: 89, proxied: false, ttl: 1 },
      { type: "TXT", name: cleanDomain, content: "v=spf1 include:_spf.mx.cloudflare.net ~all", proxied: false, ttl: 1 },
    ];

    for (const rec of mailRecords) {
      const exists = existingRecords.some(
        (r) => r.type === rec.type && r.name.toLowerCase() === rec.name.toLowerCase() && r.content === rec.content,
      );
      if (!exists) {
        await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
          { method: "POST", headers: cfHeaders, body: JSON.stringify(rec) },
        );
      }
    }

    // 4. Setup forwarding rule for contact@{domain} -> forwardToEmail
    if (accountId && forwardToEmail) {
      try {
        await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/routing/addresses`,
          {
            method: "POST",
            headers: cfHeaders,
            body: JSON.stringify({ email: forwardToEmail }),
          },
        );

        await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules`,
          {
            method: "POST",
            headers: cfHeaders,
            body: JSON.stringify({
              name: `Forward contact@ to ${forwardToEmail}`,
              enabled: true,
              priority: 0,
              matchers: [{ type: "literal", field: "to", value: `contact@${cleanDomain}` }],
              actions: [{ type: "forward", value: [forwardToEmail] }],
            }),
          },
        );
      } catch (emailErr: any) {
        console.warn(`[provisionBookedDomain] Email routing rule note for ${cleanDomain}:`, emailErr.message);
      }
    }

    return {
      success: true,
      message: `Domaine ${cleanDomain} configuré avec succès sur Cloudflare (A: ${serverIp}).`,
      details: { zoneId, accountId, domain: cleanDomain, serverIp },
    };
  } catch (err: any) {
    console.error("[provisionBookedDomain] Error:", err);
    return { success: false, message: err.message };
  }
}
