let env: Record<string, string | undefined> = {};
try {
  // @ts-ignore
  const dynamicPrivate = await import("$env/dynamic/private");
  env = dynamicPrivate.env;
} catch {
  env = process.env as Record<string, string | undefined>;
}
import {
  checkOvhDomain,
  updateOvhNameservers,
  getOvhTldPricing,
} from "$lib/server/ovh";
import { provisionMaddyCredentials, getOrCreateDkimRecord } from "$lib/server/maddy";

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
  { tld: "com", basePriceCents: 799, provider: "ovh" as const },
  { tld: "fr", basePriceCents: 499, provider: "ovh" as const },
  { tld: "net", basePriceCents: 1099, provider: "ovh" as const },
  { tld: "org", basePriceCents: 799, provider: "ovh" as const },
  { tld: "paris", basePriceCents: 2499, provider: "ovh" as const },
  { tld: "io", basePriceCents: 3099, provider: "ovh" as const },
  { tld: "shop", basePriceCents: 299, provider: "ovh" as const },
  { tld: "tech", basePriceCents: 699, provider: "ovh" as const },
];

/**
 * Calculates final consumer price in cents with markup applied to cover Stripe processing fees.
 * Default markup is 10% (can be configured via DOMAIN_MARKUP_PERCENT).
 */
export function calculateMarkedUpPriceCents(
  basePriceCents: number,
  customMarkupPercent?: number,
): number {
  if (basePriceCents <= 0) return 0;
  const configured =
    customMarkupPercent !== undefined
      ? customMarkupPercent
      : Number(env.DOMAIN_MARKUP_PERCENT || process.env.DOMAIN_MARKUP_PERCENT || 10);
  const markupPercent = isNaN(configured) ? 10 : configured;
  const factor = 1 + markupPercent / 100;
  return Math.ceil(basePriceCents * factor);
}

/**
 * Resolves live pricing for a specific domain/TLD from the OVH catalog with Stripe markup.
 */
export async function resolveLiveDomainPriceCents(
  tldOrDomain: string,
): Promise<{ priceCents: number; rawCostCents: number; provider: "ovh" | "cloudflare" }> {
  let cleanTld = tldOrDomain.toLowerCase().trim();
  if (cleanTld.includes(".")) {
    const parts = cleanTld.split(".");
    cleanTld = parts.slice(1).join(".");
  }

  const matchedConfig = COMMON_TLDS.find((t) => t.tld === cleanTld);
  const fallbackCents = matchedConfig ? matchedConfig.basePriceCents : 999;
  const provider = matchedConfig?.provider || "ovh";

  try {
    const livePricing = await getOvhTldPricing(cleanTld);
    if (livePricing && livePricing.activePriceCents > 0) {
      const markedUp = calculateMarkedUpPriceCents(livePricing.activePriceCents);
      return {
        priceCents: markedUp,
        rawCostCents: livePricing.activePriceCents,
        provider,
      };
    }
  } catch (err: any) {
    console.warn(`[resolveLiveDomainPriceCents] Live price fallback for .${cleanTld}:`, err?.message);
  }

  return {
    priceCents: calculateMarkedUpPriceCents(fallbackCents),
    rawCostCents: fallbackCents,
    provider,
  };
}

/**
 * Searches domain availability and annual pricing across OVH with live catalog pricing and Stripe markup.
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

  // Check if user entered an exact domain with extension (e.g. example.com or mydomain.com)
  const hasExtension = rawClean.includes(".") && rawClean.split(".").length >= 2;
  let baseName = rawClean;
  let explicitTld = "";

  if (hasExtension) {
    const parts = rawClean.split(".");
    explicitTld = parts.slice(1).join(".");
    baseName = parts[0].replace(/[^a-z0-9-]/g, "");
  } else {
    baseName = rawClean.replace(/[^a-z0-9-]/g, "");
  }

  if (!baseName || baseName.length < 2) {
    return [];
  }

  const tldList = hasExtension
    ? [explicitTld, ...COMMON_TLDS.map((t) => t.tld).filter((t) => t !== explicitTld)]
    : COMMON_TLDS.map((t) => t.tld);

  const domainPromises = tldList.map(async (tld) => {
    const domain = `${baseName}.${tld}`;
    let isAvailable = true;

    // Parallelize DNS check and live OVH catalog lookup
    const [dnsRes, livePricing] = await Promise.all([
      fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=NS`, {
        headers: { Accept: "application/dns-json" },
      }).catch(() => null),
      getOvhTldPricing(tld).catch(() => null),
    ]);

    if (dnsRes && dnsRes.ok) {
      try {
        const dnsData = await dnsRes.json();
        if (dnsData.Answer && dnsData.Answer.length > 0) {
          isAvailable = false;
        }
      } catch {}
    }

    const matchedConfig = COMMON_TLDS.find((t) => t.tld === tld);
    const baseCostCents =
      livePricing && livePricing.activePriceCents > 0
        ? livePricing.activePriceCents
        : matchedConfig?.basePriceCents || 999;

    const finalPriceCents = calculateMarkedUpPriceCents(baseCostCents);
    const provider = matchedConfig?.provider || "ovh";

    return {
      domain,
      tld,
      available: isAvailable,
      provider,
      priceAnnualCents: finalPriceCents,
      currency: "EUR",
      formattedPrice: `${(finalPriceCents / 100).toFixed(2)} €/an`,
    };
  });

  return await Promise.all(domainPromises);
}

/**
 * Provisions a booked domain:
 * 1. Calls OVH / Cloudflare to finalize registration.
 * 2. If OVH, delegates nameservers to Cloudflare.
 * 3. Idempotently creates or updates DNS A records pointing to server IP (135.181.95.61).
/**
 * Provisions a purchased or connected domain:
 * 1. Resolves or creates Cloudflare zone and fetches nameservers.
 * 2. If domain is in OVH, automatically updates nameservers to Cloudflare.
 * 3. Configures DNS A records for root and www pointing to serverIp (135.181.95.61).
 * 4. Configures MX, combined SPF (Cloudflare + Hetzner Maddy), and DMARC.
 * 5. Generates DKIM key pair and publishes default._domainkey DNS record.
 * 6. Sets up Cloudflare Email Routing forwarding rule: contact@{domain} -> forwardToEmail.
 * 7. Provisions Maddy SMTP credentials for contact@{domain} with STARTTLS on mail.ether.paris:587.
 */
export async function provisionBookedDomain(
  domain: string,
  provider: "ovh" | "cloudflare" = "cloudflare",
  forwardToEmail?: string,
  serverIp = "135.181.95.61",
): Promise<{ success: boolean; message: string; details?: any }> {
  console.log(
    `[provisionBookedDomain] Initiating provisioning for ${domain} (${provider}) -> forwardTo: ${forwardToEmail}`,
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
    let nameservers: string[] = [];

    const zonesRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${cleanDomain}`,
      { headers: cfHeaders },
    );
    const zonesData = await zonesRes.json();

    if (zonesData.result && zonesData.result.length > 0) {
      zoneId = zonesData.result[0].id;
      accountId = zonesData.result[0].account?.id;
      nameservers = zonesData.result[0].name_servers || [];
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
        nameservers = createdZone.result?.name_servers || [];
      }
    }

    if (!zoneId) {
      throw new Error(`Zone Cloudflare introuvable ou impossible à créer pour ${cleanDomain}`);
    }

    // 2. Automated OVH Nameserver Delegation
    let ovhDelegation = { delegated: false, message: "" };
    if (nameservers.length > 0) {
      try {
        const ovhCheck = await checkOvhDomain(cleanDomain);
        if (ovhCheck.exists) {
          console.log(`[provisionBookedDomain] Domain ${cleanDomain} found on OVH account. Updating nameservers to Cloudflare...`);
          const updateRes = await updateOvhNameservers(cleanDomain, nameservers);
          ovhDelegation = { delegated: updateRes.success, message: updateRes.message };
        }
      } catch (ovhErr: any) {
        console.warn(`[provisionBookedDomain] Note on OVH check for ${cleanDomain}:`, ovhErr.message);
      }
    }

    // 3. Fetch existing DNS records to perform idempotent upserts
    const existingRecsRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=100`,
      { headers: cfHeaders },
    );
    const existingRecsData = await existingRecsRes.json();
    const existingRecords: any[] = existingRecsData.result || [];

    async function upsertDnsRecord(rec: {
      type: string;
      name: string;
      content: string;
      priority?: number;
      proxied?: boolean;
      ttl?: number;
    }) {
      const match = existingRecords.find(
        (r) =>
          r.type === rec.type &&
          r.name.toLowerCase() === rec.name.toLowerCase() &&
          (rec.type !== "MX" || r.content.toLowerCase() === rec.content.toLowerCase()),
      );

      const payload: any = {
        type: rec.type,
        name: rec.name,
        content: rec.content,
        ttl: rec.ttl ?? 1,
      };
      if (rec.priority !== undefined) payload.priority = rec.priority;
      if (rec.proxied !== undefined) payload.proxied = rec.proxied;

      if (match) {
        const updateRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${match.id}`,
          {
            method: "PUT",
            headers: cfHeaders,
            body: JSON.stringify(payload),
          },
        );
        return await updateRes.json();
      } else {
        const createRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
          {
            method: "POST",
            headers: cfHeaders,
            body: JSON.stringify(payload),
          },
        );
        return await createRes.json();
      }
    }

    // Provision root A and www A records
    await upsertDnsRecord({ type: "A", name: cleanDomain, content: serverIp, proxied: true });
    await upsertDnsRecord({ type: "A", name: `www.${cleanDomain}`, content: serverIp, proxied: true });

    // 4. Cloudflare Email Routing MX & TXT records
    await upsertDnsRecord({ type: "MX", name: cleanDomain, content: "route1.mx.cloudflare.net", priority: 48, proxied: false });
    await upsertDnsRecord({ type: "MX", name: cleanDomain, content: "route2.mx.cloudflare.net", priority: 74, proxied: false });
    await upsertDnsRecord({ type: "MX", name: cleanDomain, content: "route3.mx.cloudflare.net", priority: 89, proxied: false });

    // Combined SPF: authorizes Cloudflare Email Routing + Maddy server IP (135.181.95.61)
    await upsertDnsRecord({
      type: "TXT",
      name: cleanDomain,
      content: `v=spf1 include:_spf.mx.cloudflare.net ip4:${serverIp} ~all`,
      proxied: false,
    });

    // DMARC record
    await upsertDnsRecord({
      type: "TXT",
      name: `_dmarc.${cleanDomain}`,
      content: "v=DMARC1; p=none;",
      proxied: false,
    });

    // 5. DKIM: generate or retrieve RSA 2048 key from Maddy
    const dkim = await getOrCreateDkimRecord(cleanDomain, "default");
    if (dkim?.txtRecord) {
      await upsertDnsRecord({
        type: "TXT",
        name: `default._domainkey.${cleanDomain}`,
        content: dkim.txtRecord,
        proxied: false,
      });
    }

    // 6. Inbound Email Forwarding via Cloudflare Email Routing
    let emailRoutingStatus = {
      forwardFrom: `contact@${cleanDomain}`,
      forwardTo: forwardToEmail || "",
      destinationVerified: false,
      ruleCreated: false,
    };

    if (accountId && forwardToEmail) {
      try {
        // Register destination address
        await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/routing/addresses`,
          {
            method: "POST",
            headers: cfHeaders,
            body: JSON.stringify({ email: forwardToEmail }),
          },
        );

        // Check if destination address is verified
        const addrsRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/routing/addresses`,
          { headers: cfHeaders },
        );
        const addrsData = await addrsRes.json();
        const destObj = addrsData.result?.find(
          (a: any) => a.email?.toLowerCase() === forwardToEmail.toLowerCase(),
        );
        const isVerified = destObj?.status === "verified";
        emailRoutingStatus.destinationVerified = !!isVerified;

        // Upsert routing rule if verified
        if (isVerified) {
          const rulesRes = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules`,
            { headers: cfHeaders },
          );
          const rulesData = await rulesRes.json();
          const existingRules = rulesData.result || [];
          const existingRule = existingRules.find((r: any) =>
            r.matchers?.some((m: any) => m.field === "to" && m.value === `contact@${cleanDomain}`),
          );

          const rulePayload = {
            name: `Forward contact@ to ${forwardToEmail}`,
            enabled: true,
            priority: 0,
            matchers: [{ type: "literal", field: "to", value: `contact@${cleanDomain}` }],
            actions: [{ type: "forward", value: [forwardToEmail] }],
          };

          if (existingRule) {
            await fetch(
              `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules/${existingRule.id}`,
              {
                method: "PUT",
                headers: cfHeaders,
                body: JSON.stringify(rulePayload),
              },
            );
          } else {
            await fetch(
              `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules`,
              {
                method: "POST",
                headers: cfHeaders,
                body: JSON.stringify(rulePayload),
              },
            );
          }
          emailRoutingStatus.ruleCreated = true;
        }
      } catch (emailErr: any) {
        console.warn(`[provisionBookedDomain] Note on email routing for ${cleanDomain}:`, emailErr.message);
      }
    }

    // 7. Outbound SMTP Credentials on Maddy (for Gmail Alias)
    let smtpCredentials = null;
    try {
      const maddyRes = await provisionMaddyCredentials(cleanDomain, "contact");
      if (maddyRes.success && maddyRes.credentials) {
        smtpCredentials = maddyRes.credentials;
      }
    } catch (maddyErr: any) {
      console.warn(`[provisionBookedDomain] Note on Maddy provisioning for ${cleanDomain}:`, maddyErr.message);
    }

    return {
      success: true,
      message: `Domaine ${cleanDomain} configuré avec succès (DNS, Redirection Email & SMTP Gmail).`,
      details: {
        zoneId,
        accountId,
        domain: cleanDomain,
        serverIp,
        nameservers,
        ovhDelegation,
        emailRouting: emailRoutingStatus,
        smtp: smtpCredentials,
        dkim: dkim ? { selector: dkim.selector } : null,
      },
    };
  } catch (err: any) {
    console.error("[provisionBookedDomain] Error:", err);
    return { success: false, message: err.message };
  }
}
