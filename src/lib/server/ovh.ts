import crypto from "crypto";

let env: Record<string, string | undefined> = {};
try {
  // @ts-ignore
  const dynamicPrivate = await import("$env/dynamic/private");
  env = dynamicPrivate.env;
} catch {
  env = process.env as Record<string, string | undefined>;
}

const DEFAULT_ENDPOINT = "https://eu.api.ovh.com/1.0";

function getOvhCredentials() {
  const ak = env.OVH_APPLICATION_KEY || process.env.OVH_APPLICATION_KEY;
  const as = env.OVH_APPLICATION_SECRET || process.env.OVH_APPLICATION_SECRET;
  const ck = env.OVH_CONSUMER_KEY || process.env.OVH_CONSUMER_KEY;

  if (!ak || !as || !ck) {
    return null;
  }
  return { ak, as, ck };
}

/**
 * Execute an authenticated request to the OVH REST API.
 */
export async function callOvhApi(
  method: string,
  path: string,
  body?: any,
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const creds = getOvhCredentials();
  if (!creds) {
    return {
      ok: false,
      status: 500,
      error: "Identifiants OVH non configurés (OVH_APPLICATION_KEY / SECRET / CONSUMER_KEY)",
    };
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${DEFAULT_ENDPOINT}${cleanPath}`;
  const bodyStr = body ? JSON.stringify(body) : "";

  try {
    // 1. Fetch server time for time synchronization
    const timeRes = await fetch(`${DEFAULT_ENDPOINT}/auth/time`);
    const timestamp = parseInt(await timeRes.text(), 10) || Math.floor(Date.now() / 1000);

    // 2. Generate OVH signature: "$1$" + SHA1_HEX(AS + "+" + CK + "+" + METHOD + "+" + QUERY_URL + "+" + BODY + "+" + TSTAMP)
    const toSign = `${creds.as}+${creds.ck}+${method.toUpperCase()}+${url}+${bodyStr}+${timestamp}`;
    const sha1 = crypto.createHash("sha1").update(toSign).digest("hex");
    const signature = `$1$${sha1}`;

    // 3. Send request
    const res = await fetch(url, {
      method: method.toUpperCase(),
      headers: {
        "X-Ovh-Application": creds.ak,
        "X-Ovh-Consumer": creds.ck,
        "X-Ovh-Timestamp": timestamp.toString(),
        "X-Ovh-Signature": signature,
        "Content-Type": "application/json",
      },
      body: body ? bodyStr : undefined,
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      const errMsg = data?.message || (typeof data === "string" ? data : `Erreur OVH HTTP ${res.status}`);
      return { ok: false, status: res.status, error: errMsg, data };
    }

    return { ok: true, status: res.status, data };
  } catch (err: any) {
    console.error(`[OVH API] Request error for ${method} ${cleanPath}:`, err);
    return { ok: false, status: 500, error: err.message };
  }
}

/**
 * Checks if a domain is registered and managed in our OVH account.
 */
export async function checkOvhDomain(domain: string): Promise<{
  exists: boolean;
  domain?: string;
  state?: string;
  nameServerType?: string;
  nameservers?: string[];
  info?: any;
}> {
  const cleanDomain = domain.toLowerCase().trim().replace(/^www\./, "");
  const res = await callOvhApi("GET", `/domain/${cleanDomain}`);

  if (!res.ok) {
    return { exists: false };
  }

  const info = res.data;
  const nsList = Array.isArray(info.nameServers)
    ? info.nameServers.map((ns: any) => (typeof ns === "string" ? ns : ns.host)).filter(Boolean)
    : [];

  return {
    exists: true,
    domain: cleanDomain,
    state: info.state,
    nameServerType: info.nameServerType,
    nameservers: nsList,
    info,
  };
}

/**
 * Updates nameservers for an OVH domain (e.g. delegating to Cloudflare nameservers).
 */
export async function updateOvhNameservers(
  domain: string,
  nameservers: string[],
): Promise<{ success: boolean; message: string; taskId?: number }> {
  const cleanDomain = domain.toLowerCase().trim().replace(/^www\./, "");

  if (!nameservers || nameservers.length === 0) {
    return { success: false, message: "Aucun serveur DNS fourni pour la délégation" };
  }

  console.log(`[OVH] Delegating nameservers for ${cleanDomain} to:`, nameservers);

  const payload = {
    nameServers: nameservers.map((ns) => ({ host: ns })),
  };

  const res = await callOvhApi("POST", `/domain/${cleanDomain}/nameServers/update`, payload);

  if (!res.ok) {
    console.error(`[OVH] Failed to update nameservers for ${cleanDomain}:`, res.error);
    return { success: false, message: res.error || "Échec de mise à jour des DNS OVH" };
  }

  const taskId = res.data?.id;
  console.log(`[OVH] Delegation task created for ${cleanDomain}: Task ID ${taskId}`);

  return {
    success: true,
    message: `Délégation OVH effectuée avec succès vers ${nameservers.join(", ")} (Tâche ${taskId || "créée"}).`,
    taskId,
  };
}

export interface OvhTldPrice {
  tld: string;
  currency: string;
  creationPriceCents: number;
  promoPriceCents?: number;
  renewalPriceCents?: number;
  activePriceCents: number;
}

const tldPricingCache = new Map<string, { timestamp: number; price: OvhTldPrice }>();
const PRICING_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

/**
 * Fetches live TLD pricing directly from the OVH REST catalog API.
 * Uses an in-memory cache to guarantee sub-millisecond lookups on repeated queries.
 */
export async function getOvhTldPricing(tld: string): Promise<OvhTldPrice | null> {
  const cleanTld = tld.toLowerCase().replace(/^\./, "").trim();
  if (!cleanTld) return null;

  const cached = tldPricingCache.get(cleanTld);
  if (cached && Date.now() - cached.timestamp < PRICING_CACHE_TTL_MS) {
    return cached.price;
  }

  try {
    const res = await callOvhApi(
      "GET",
      `/order/catalog/formatted/domain?ovhSubsidiary=FR&planCode=${encodeURIComponent(cleanTld)}`,
    );

    if (!res.ok || !res.data?.extensions?.[0]) {
      return null;
    }

    const ext = res.data.extensions[0];
    const creationCents = ext.prices?.creation?.value
      ? Math.round(ext.prices.creation.value / 1_000_000)
      : 0;
    const promoCents = ext.promotion?.value
      ? Math.round(ext.promotion.value / 1_000_000)
      : undefined;
    const renewalCents = ext.prices?.renewal?.value
      ? Math.round(ext.prices.renewal.value / 1_000_000)
      : undefined;

    const activeCents =
      promoCents !== undefined && promoCents > 0 ? promoCents : creationCents;

    const price: OvhTldPrice = {
      tld: cleanTld,
      currency: ext.currency || "EUR",
      creationPriceCents: creationCents,
      promoPriceCents: promoCents,
      renewalPriceCents: renewalCents,
      activePriceCents: activeCents,
    };

    tldPricingCache.set(cleanTld, { timestamp: Date.now(), price });
    return price;
  } catch (err: any) {
    console.warn(`[OVH] Failed to fetch live pricing for TLD .${cleanTld}:`, err?.message);
    return null;
  }
}

export function clearOvhPricingCache(): void {
  tldPricingCache.clear();
}

