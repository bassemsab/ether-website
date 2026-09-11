import { env } from "$env/dynamic/private";

const STALWART_API_URL = env.STALWART_API_URL || "https://mail.ether.paris/api";
const STALWART_ADMIN_USER = env.STALWART_ADMIN_USER || "admin";
const STALWART_ADMIN_PASSWORD = env.STALWART_ADMIN_PASSWORD;

interface StalwartPrincipal {
  type: "domain" | "individual" | "group" | "apiKey";
  name: string;
  description?: string;
  quota?: number;
  secrets?: string[];
  emails?: string[];
  roles?: string[];
  tenant?: string;
}

async function authenticate(): Promise<string> {
  if (!STALWART_ADMIN_PASSWORD) {
    throw new Error("Stalwart admin password not configured");
  }

  const response = await fetch(`${STALWART_API_URL}/oauth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "code",
      client_id: "webadmin",
      redirect_uri: "stalwart://auth",
      nonce: crypto.randomUUID(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Stalwart auth error: ${response.statusText}`);
  }

  // Note: In a real implementation, we'd handle the OAuth flow properly
  // For now, we'll use basic auth with admin credentials
  return Buffer.from(
    `${STALWART_ADMIN_USER}:${STALWART_ADMIN_PASSWORD}`,
  ).toString("base64");
}

export async function createDomain(domain: string) {
  const auth = await authenticate();

  const response = await fetch(`${STALWART_API_URL}/principal`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "domain",
      name: domain,
      description: `Domain for ${domain}`,
      quota: 0,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    // Domain might already exist, that's okay
    if (error.includes("already exists")) {
      return { name: domain, exists: true };
    }
    throw new Error(`Stalwart API error: ${error}`);
  }

  return response.json();
}

export async function createUser(
  username: string,
  domain: string,
  password: string,
) {
  const auth = await authenticate();
  const email = `${username}@${domain}`;

  const response = await fetch(`${STALWART_API_URL}/principal`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "individual",
      name: username,
      description: `User for ${domain}`,
      secrets: [password],
      emails: [email],
      roles: ["email-send", "email-receive"],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Stalwart API error: ${error}`);
  }

  return response.json();
}

export async function listDomains() {
  const auth = await authenticate();

  const response = await fetch(`${STALWART_API_URL}/principal?type=domain`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Stalwart API error: ${error}`);
  }

  return response.json();
}

export async function getDomain(domain: string) {
  const auth = await authenticate();

  const response = await fetch(`${STALWART_API_URL}/principal/${domain}`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Stalwart API error: ${error}`);
  }

  return response.json();
}

export function generateSecurePassword(length: number = 24): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}
