import { env } from "$env/dynamic/private";

const CLOUDFLARE_API_TOKEN = env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = env.CLOUDFLARE_ZONE_ID;

const BASE_URL = "https://api.cloudflare.com/client/v4";

interface DNSRecord {
  type: string;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
}

export async function createDNSRecord(record: DNSRecord) {
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
    throw new Error("Cloudflare credentials not configured");
  }

  const response = await fetch(
    `${BASE_URL}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(record),
    },
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error(
      `Cloudflare API error: ${data.errors?.map((e: any) => e.message).join(", ")}`,
    );
  }

  return data.result;
}

export async function createMailDNSRecord(domain: string, serverIP: string) {
  return createDNSRecord({
    type: "A",
    name: `mail.${domain}`,
    content: serverIP,
    ttl: 300,
    proxied: false, // Can't proxy SMTP traffic
  });
}

export async function createSESTXTRecord(domain: string, token: string) {
  return createDNSRecord({
    type: "TXT",
    name: `_amazonses.${domain}`,
    content: token,
    ttl: 300,
  });
}

export async function createDKIMRecords(domain: string, dkimTokens: string[]) {
  const records = [];

  for (let i = 0; i < dkimTokens.length; i++) {
    const record = await createDNSRecord({
      type: "CNAME",
      name: `${dkimTokens[i]}._domainkey.${domain}`,
      content: `${dkimTokens[i]}.dkim.amazonses.com`,
      ttl: 300,
    });
    records.push(record);
  }

  return records;
}

export async function createMXRecord(domain: string, priority: number = 10) {
  return createDNSRecord({
    type: "MX",
    name: domain,
    content: `mail.${domain}`,
    ttl: 300,
    proxied: false,
  });
}

export async function listDNSRecords() {
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
    throw new Error("Cloudflare credentials not configured");
  }

  const response = await fetch(
    `${BASE_URL}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
    {
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      },
    },
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error(
      `Cloudflare API error: ${data.errors?.map((e: any) => e.message).join(", ")}`,
    );
  }

  return data.result;
}
