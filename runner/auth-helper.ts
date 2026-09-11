import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

export interface TokenPayload {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expiry?: string;
  expires_in?: number;
}

export interface StoredTokenFile {
  token: TokenPayload;
  auth_method: string;
}

export interface ProfileStatus {
  name: string;
  email: string | null;
  hasToken: boolean;
  isExpired: boolean;
  expiryDate: string | null;
  lastUpdated: string | null;
}

// Google Antigravity standard OAuth Client ID
export const DEFAULT_CLIENT_ID =
  process.env.GOOGLE_OAUTH_CLIENT_ID ||
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
export const DEFAULT_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

// Standard scopes needed for Gemini / Code Assistance
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
  "https://www.googleapis.com/auth/cloud-platform",
].join(" ");

/**
 * Generates an authorization URL for manual or headless Google login.
 */
export function generateAuthUrl(
  clientId: string = DEFAULT_CLIENT_ID,
  redirectUri: string = "urn:ietf:wg:oauth:2.0:oob",
  state?: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  if (state) {
    params.set("state", state);
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges authorization code for access & refresh tokens with Google OAuth.
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string = DEFAULT_CLIENT_ID,
  clientSecret: string = DEFAULT_CLIENT_SECRET,
  redirectUri: string = "urn:ietf:wg:oauth:2.0:oob"
): Promise<TokenPayload> {
  const bodyParams: Record<string, string> = {
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  };
  if (clientSecret) {
    bodyParams.client_secret = clientSecret;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(bodyParams),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth token exchange failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const expiry = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : undefined;

  return {
    access_token: data.access_token,
    token_type: data.token_type || "Bearer",
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expiry,
  };
}

/**
 * Refreshes an expired access token using the stored refresh_token.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string = DEFAULT_CLIENT_ID,
  clientSecret: string = DEFAULT_CLIENT_SECRET
): Promise<TokenPayload> {
  const bodyParams: Record<string, string> = {
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };
  if (clientSecret) {
    bodyParams.client_secret = clientSecret;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(bodyParams),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth token refresh failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const expiry = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : undefined;

  return {
    access_token: data.access_token,
    token_type: data.token_type || "Bearer",
    refresh_token: data.refresh_token || refreshToken,
    expires_in: data.expires_in,
    expiry,
  };
}

/**
 * Attempts to fetch the Google account email using the active access token.
 */
export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      return data.email || null;
    }
  } catch (err) {
    // Non-fatal if userinfo endpoint is not reachable
  }
  return null;
}

/**
 * Lists all profiles stored under baseDir/profiles/.
 */
export function listStoredProfiles(dataDir: string): ProfileStatus[] {
  const profilesDir = join(dataDir, "profiles");
  if (!existsSync(profilesDir)) {
    return [];
  }

  const entries = readdirSync(profilesDir, { withFileTypes: true });
  const result: ProfileStatus[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const profilePath = join(profilesDir, name);
    const tokenPath = join(profilePath, "jetski-standalone-oauth-token");
    const accountsPath = join(profilePath, "google_accounts.json");

    let hasToken = false;
    let isExpired = false;
    let expiryDate: string | null = null;
    let email: string | null = null;
    let lastUpdated: string | null = null;

    if (existsSync(tokenPath)) {
      try {
        const raw = JSON.parse(readFileSync(tokenPath, "utf-8"));
        const token = raw.token || raw;
        if (token && token.access_token) {
          hasToken = true;
          expiryDate = token.expiry || null;
          if (expiryDate) {
            isExpired = new Date(expiryDate).getTime() <= Date.now();
          }
        }
      } catch (e) {
        // Corrupt token file
      }
    }

    if (existsSync(accountsPath)) {
      try {
        const acc = JSON.parse(readFileSync(accountsPath, "utf-8"));
        email = acc.active || (acc.old && acc.old[0]) || null;
      } catch (e) {}
    }

    result.push({
      name,
      email,
      hasToken,
      isExpired,
      expiryDate,
      lastUpdated,
    });
  }

  return result;
}

/**
 * Saves or updates profile token files in dataDir/profiles/<name>/.
 */
export function saveProfile(
  dataDir: string,
  name: string,
  tokenPayload: TokenPayload,
  accountEmail?: string | null
): string {
  const profileDir = join(dataDir, "profiles", name);
  mkdirSync(profileDir, { recursive: true });

  const tokenContent: StoredTokenFile = {
    token: {
      access_token: tokenPayload.access_token,
      token_type: tokenPayload.token_type || "Bearer",
      refresh_token: tokenPayload.refresh_token,
      expiry: tokenPayload.expiry,
    },
    auth_method: "consumer",
  };

  writeFileSync(
    join(profileDir, "jetski-standalone-oauth-token"),
    JSON.stringify(tokenContent, null, 2),
    { mode: 0o600 }
  );

  const email = accountEmail || "unknown@google.com";
  const accountsContent = {
    active: email,
    old: [email],
  };

  writeFileSync(
    join(profileDir, "google_accounts.json"),
    JSON.stringify(accountsContent, null, 2)
  );

  const settingsContent = {
    ide: {
      enabled: true,
      hasSeenNudge: true,
    },
    security: {
      auth: {
        selectedType: "gateway",
      },
    },
    general: {
      previewFeatures: true,
    },
  };

  writeFileSync(
    join(profileDir, "settings.json"),
    JSON.stringify(settingsContent, null, 2)
  );

  const installIdPath = join(profileDir, "installation_id");
  if (!existsSync(installIdPath)) {
    writeFileSync(installIdPath, randomUUID());
  }

  return profileDir;
}

/**
 * Copies Google profile credentials into a tenant sandbox (~/.gemini)
 * so agy runs authenticated without modifying the original profile.
 */
export function injectProfileIntoTenantSandbox(
  dataDir: string,
  profileName: string,
  tenantSlug: string
): string {
  const profileDir = join(dataDir, "profiles", profileName);
  if (!existsSync(profileDir)) {
    throw new Error(`Google profile "${profileName}" not found in ${dataDir}/profiles`);
  }

  // Tenant sandbox directory acts as HOME for agy
  const tenantDir = join(dataDir, "tenants", tenantSlug);
  const sandboxGeminiDir = join(tenantDir, ".gemini-sandbox", ".gemini");
  mkdirSync(sandboxGeminiDir, { recursive: true });

  // Files to mirror into the sandbox
  const filesToCopy = [
    "jetski-standalone-oauth-token",
    "google_accounts.json",
    "settings.json",
    "installation_id",
  ];

  for (const file of filesToCopy) {
    const src = join(profileDir, file);
    const dest = join(sandboxGeminiDir, file);
    if (existsSync(src)) {
      writeFileSync(dest, readFileSync(src));
    }
  }

  return join(tenantDir, ".gemini-sandbox");
}
