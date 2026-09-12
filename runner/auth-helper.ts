import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
} from "fs";
import { join } from "path";
import { randomBytes, createHash, randomUUID } from "crypto";

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
  quotaStatus: "ready" | "throttled";
  throttledUntil: number | null;
  turnsCount: number;
}

interface PendingAuth {
  profile: string;
  codeVerifier: string;
  createdAt: number;
}

// In-memory runtime tracking
const profileThrottleMap = new Map<string, number>();
const profileTurnsMap = new Map<string, number>();
const pendingAuthMap = new Map<string, PendingAuth>();

/**
 * Resolves Antigravity OAuth client credentials dynamically from environment
 * or directly from the installed agy binary.
 */
export function getAgyOAuthCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  let envCid = process.env.GOOGLE_OAUTH_CLIENT_ID;
  let envSec = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (envCid && envSec) {
    return { clientId: envCid, clientSecret: envSec };
  }

  const agyBin = Bun.which("agy") || "/usr/local/bin/agy";
  if (existsSync(agyBin)) {
    try {
      const buf = readFileSync(agyBin);
      const str = buf.toString("binary");
      const cidMatch = str.match(
        /(1071006060591-[a-z0-9_]+\.apps\.googleusercontent\.com)/,
      );
      const secMatch = str.match(/(GOCSPX-[A-Za-z0-9_-]{28})/);
      if (cidMatch && !envCid) envCid = cidMatch[1];
      if (secMatch && !envSec) envSec = secMatch[1];
    } catch (e) {}
  }

  return {
    clientId: envCid || "",
    clientSecret: envSec || "",
  };
}

export const DEFAULT_REDIRECT_URI = "https://antigravity.google/oauth-callback";

// Google Scopes required by Antigravity CLI
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
  "https://www.googleapis.com/auth/aicode",
  "openid",
].join(" ");

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Marks a profile as temporarily throttled (due to 429 / Resource Exhausted).
 * Default cooldown is 10 minutes.
 */
export function markProfileThrottled(
  name: string,
  durationMs: number = 10 * 60 * 1000,
) {
  const until = Date.now() + durationMs;
  profileThrottleMap.set(name, until);
  console.warn(
    `⚠️ Profile [${name}] marked as throttled until ${new Date(until).toLocaleTimeString()}`,
  );
}

/**
 * Checks if a profile is currently available (has token, not expired, not throttled).
 */
export function isProfileAvailable(profile: ProfileStatus): boolean {
  if (!profile.hasToken || profile.isExpired) return false;
  const throttledUntil = profileThrottleMap.get(profile.name);
  if (throttledUntil && Date.now() < throttledUntil) {
    return false;
  }
  return true;
}

/**
 * Increments cumulative turns processed on a profile.
 */
export function incrementProfileTurnCount(name: string) {
  const current = profileTurnsMap.get(name) || 0;
  profileTurnsMap.set(name, current + 1);
}

/**
 * Selects the next healthy profile in the pool, excluding any already tried or throttled.
 */
export function getNextHealthyProfile(
  dataDir: string,
  preferred?: string,
  exclude: string[] = [],
): string | null {
  const profiles = listStoredProfiles(dataDir);
  const excludeSet = new Set(exclude);

  // 1. Try preferred profile if available and not excluded
  if (preferred && !excludeSet.has(preferred)) {
    const match = profiles.find((p) => p.name === preferred);
    if (match && isProfileAvailable(match)) {
      return match.name;
    }
  }

  // 2. Try any other available non-excluded profile
  for (const p of profiles) {
    if (!excludeSet.has(p.name) && isProfileAvailable(p)) {
      return p.name;
    }
  }

  return null;
}

/**
 * Generates an authorization URL with PKCE for Google login.
 */
export function generateAuthUrl(
  dataDir: string = "/data",
  profile: string = "primary",
  clientId?: string,
): string {
  const creds = getAgyOAuthCredentials();
  const effectiveClientId = clientId || creds.clientId;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const pending: PendingAuth = {
    profile,
    codeVerifier,
    createdAt: Date.now(),
  };

  pendingAuthMap.set(profile, pending);

  // Also persist to disk for durability across worker/pod restarts
  try {
    const profileDir = join(dataDir, "profiles", profile);
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, ".pending_auth.json"),
      JSON.stringify(pending),
    );
  } catch (e) {}

  const params = new URLSearchParams({
    access_type: "offline",
    client_id: effectiveClientId,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "consent",
    redirect_uri: DEFAULT_REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    state: profile,
  });

  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}

/**
 * Exchanges authorization code for access & refresh tokens with Google OAuth using stored PKCE verifier.
 */
export async function exchangeCodeForTokens(
  dataDir: string = "/data",
  code: string = "",
  profile: string = "primary",
  clientId?: string,
  clientSecret?: string,
): Promise<TokenPayload> {
  const creds = getAgyOAuthCredentials();
  const effectiveClientId = clientId || creds.clientId;
  const effectiveClientSecret = clientSecret || creds.clientSecret;

  let codeVerifier: string | undefined =
    pendingAuthMap.get(profile)?.codeVerifier;

  // If not in memory, try reading from disk
  if (!codeVerifier) {
    try {
      const pendingFile = join(
        dataDir,
        "profiles",
        profile,
        ".pending_auth.json",
      );
      if (existsSync(pendingFile)) {
        const saved = JSON.parse(readFileSync(pendingFile, "utf-8"));
        codeVerifier = saved.codeVerifier;
      }
    } catch (e) {}
  }

  const bodyParams: Record<string, string> = {
    client_id: effectiveClientId,
    client_secret: effectiveClientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: DEFAULT_REDIRECT_URI,
  };

  if (codeVerifier) {
    bodyParams.code_verifier = codeVerifier;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(bodyParams),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Google OAuth token exchange failed (${res.status}): ${errText}`,
    );
  }

  const data = (await res.json()) as any;
  const expiry = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : undefined;

  // Clean up pending auth once consumed
  pendingAuthMap.delete(profile);

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
  clientId?: string,
  clientSecret?: string,
): Promise<TokenPayload> {
  const creds = getAgyOAuthCredentials();
  const effectiveClientId = clientId || creds.clientId;
  const effectiveClientSecret = clientSecret || creds.clientSecret;

  const bodyParams: Record<string, string> = {
    client_id: effectiveClientId,
    client_secret: effectiveClientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(bodyParams),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Google OAuth token refresh failed (${res.status}): ${errText}`,
    );
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
export async function fetchUserEmail(
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      return data.email || null;
    }
  } catch (err) {
    // Non-fatal
  }
  return null;
}

/**
 * Finds the token file in a profile directory.
 */
function findTokenFile(profilePath: string): string | null {
  const candidates = [
    join(profilePath, ".gemini", "antigravity-cli", "antigravity-oauth-token"),
    join(
      profilePath,
      ".gemini",
      "antigravity-cli",
      "jetski-standalone-oauth-token",
    ),
    join(profilePath, ".gemini", "jetski-standalone-oauth-token"),
    join(profilePath, ".gemini", "antigravity-oauth-token"),
    join(profilePath, "antigravity-oauth-token"),
    join(profilePath, "jetski-standalone-oauth-token"),
  ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * Finds the accounts JSON file in a profile directory.
 */
function findAccountsFile(profilePath: string): string | null {
  const candidates = [
    join(profilePath, ".gemini", "google_accounts.json"),
    join(profilePath, ".gemini", "antigravity-cli", "google_accounts.json"),
    join(profilePath, "google_accounts.json"),
  ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
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
    const tokenPath = findTokenFile(profilePath);
    const accountsPath = findAccountsFile(profilePath);

    let hasToken = false;
    let isExpired = false;
    let expiryDate: string | null = null;
    let email: string | null = null;
    let lastUpdated: string | null = null;

    if (tokenPath) {
      try {
        const raw = JSON.parse(readFileSync(tokenPath, "utf-8"));
        const token = raw.token || raw;
        if (token && (token.access_token || token.refresh_token)) {
          hasToken = true;
          expiryDate = token.expiry || null;
          // If a refresh token is present, Google OAuth tokens can be refreshed automatically by agy!
          // Only mark as expired if there is NO refresh token AND the access token has expired.
          const hasRefreshToken = Boolean(token.refresh_token);
          if (expiryDate && !hasRefreshToken) {
            isExpired = new Date(expiryDate).getTime() <= Date.now();
          } else {
            isExpired = false;
          }
        }
      } catch (e) {
        // Corrupt token file
      }
    }

    if (accountsPath) {
      try {
        const acc = JSON.parse(readFileSync(accountsPath, "utf-8"));
        email = acc.active || (acc.old && acc.old[0]) || null;
      } catch (e) {}
    }

    // Quota and cooldown status
    const throttledUntil = profileThrottleMap.get(name) || null;
    const isCurrentlyThrottled =
      throttledUntil !== null && Date.now() < throttledUntil;
    const quotaStatus: "ready" | "throttled" = isCurrentlyThrottled
      ? "throttled"
      : "ready";
    const turnsCount = profileTurnsMap.get(name) || 0;

    result.push({
      name,
      email,
      hasToken,
      isExpired,
      expiryDate,
      lastUpdated,
      quotaStatus,
      throttledUntil: isCurrentlyThrottled ? throttledUntil : null,
      turnsCount,
    });
  }

  // Sort profiles so 'primary' is always first, then alphabetical
  result.sort((a, b) => {
    if (a.name === "primary") return -1;
    if (b.name === "primary") return 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

/**
 * Creates an empty profile directory slot for dynamic expansion.
 */
export function createEmptyProfile(dataDir: string, name: string): string {
  const profileDir = join(dataDir, "profiles", name);
  mkdirSync(join(profileDir, ".gemini", "antigravity-cli"), {
    recursive: true,
  });
  return profileDir;
}

/**
 * Saves or updates profile token files in dataDir/profiles/<name>/.
 * Writes both antigravity-oauth-token and jetski-standalone-oauth-token for cross-compatibility.
 */
export function saveProfile(
  dataDir: string,
  name: string,
  tokenPayload: TokenPayload,
  accountEmail?: string | null,
): string {
  const profileDir = join(dataDir, "profiles", name);
  const geminiDir = join(profileDir, ".gemini");
  const cliDir = join(geminiDir, "antigravity-cli");

  mkdirSync(profileDir, { recursive: true });
  mkdirSync(geminiDir, { recursive: true });
  mkdirSync(cliDir, { recursive: true });

  const tokenContent: StoredTokenFile = {
    token: {
      access_token: tokenPayload.access_token,
      token_type: tokenPayload.token_type || "Bearer",
      refresh_token: tokenPayload.refresh_token,
      expiry: tokenPayload.expiry,
    },
    auth_method: "consumer",
  };

  const serializedToken = JSON.stringify(tokenContent, null, 2);

  // Write token in all locations agy might inspect
  const tokenLocations = [
    join(cliDir, "antigravity-oauth-token"),
    join(cliDir, "jetski-standalone-oauth-token"),
    join(geminiDir, "antigravity-oauth-token"),
    join(geminiDir, "jetski-standalone-oauth-token"),
    join(profileDir, "antigravity-oauth-token"),
    join(profileDir, "jetski-standalone-oauth-token"),
  ];

  for (const loc of tokenLocations) {
    writeFileSync(loc, serializedToken, { mode: 0o600 });
  }

  const email = accountEmail || "unknown@google.com";
  const accountsContent = JSON.stringify(
    { active: email, old: [email] },
    null,
    2,
  );

  writeFileSync(join(geminiDir, "google_accounts.json"), accountsContent);
  writeFileSync(join(cliDir, "google_accounts.json"), accountsContent);
  writeFileSync(join(profileDir, "google_accounts.json"), accountsContent);

  const settingsContent = JSON.stringify(
    {
      ide: { enabled: true, hasSeenNudge: true },
      security: { auth: { selectedType: "gateway" } },
      general: { previewFeatures: true },
    },
    null,
    2,
  );

  writeFileSync(join(geminiDir, "settings.json"), settingsContent);
  writeFileSync(join(cliDir, "settings.json"), settingsContent);
  writeFileSync(join(profileDir, "settings.json"), settingsContent);

  const installId = randomUUID();
  writeFileSync(join(geminiDir, "installation_id"), installId);
  writeFileSync(join(cliDir, "installation_id"), installId);

  // Clear throttle upon fresh auth
  profileThrottleMap.delete(name);

  return profileDir;
}

/**
 * Copies Google profile credentials into a tenant sandbox (~/.gemini)
 * so agy runs autonomously as the tenant.
 */
export function injectProfileIntoTenantSandbox(
  dataDir: string,
  profileName: string,
  tenantSlug: string,
): string {
  const profileDir = join(dataDir, "profiles", profileName);

  // Tenant sandbox directory acts as HOME for agy
  const tenantDir = join(dataDir, "tenants", tenantSlug);
  const sandboxGeminiDir = join(tenantDir, ".gemini-sandbox", ".gemini");
  const cliDir = join(sandboxGeminiDir, "antigravity-cli");
  mkdirSync(cliDir, { recursive: true });

  // Locate the profile's token file
  const tokenFile = findTokenFile(profileDir);
  if (tokenFile && existsSync(tokenFile)) {
    const tokenData = readFileSync(tokenFile);
    // Write into both antigravity-oauth-token and jetski-standalone-oauth-token
    writeFileSync(join(cliDir, "antigravity-oauth-token"), tokenData, {
      mode: 0o600,
    });
    writeFileSync(join(cliDir, "jetski-standalone-oauth-token"), tokenData, {
      mode: 0o600,
    });
    writeFileSync(
      join(sandboxGeminiDir, "antigravity-oauth-token"),
      tokenData,
      { mode: 0o600 },
    );
    writeFileSync(
      join(sandboxGeminiDir, "jetski-standalone-oauth-token"),
      tokenData,
      { mode: 0o600 },
    );
  }

  // Locate accounts file
  const accountsFile = findAccountsFile(profileDir);
  if (accountsFile && existsSync(accountsFile)) {
    const accData = readFileSync(accountsFile);
    writeFileSync(join(sandboxGeminiDir, "google_accounts.json"), accData);
    writeFileSync(join(cliDir, "google_accounts.json"), accData);
  }

  // Copy or generate settings
  const settingsCandidates = [
    join(profileDir, ".gemini", "antigravity-cli", "settings.json"),
    join(profileDir, ".gemini", "settings.json"),
    join(profileDir, "settings.json"),
  ];
  let settingsWritten = false;
  for (const s of settingsCandidates) {
    if (existsSync(s)) {
      const data = readFileSync(s);
      writeFileSync(join(cliDir, "settings.json"), data);
      writeFileSync(join(sandboxGeminiDir, "settings.json"), data);
      settingsWritten = true;
      break;
    }
  }

  if (!settingsWritten) {
    const defaultSettings = JSON.stringify(
      {
        ide: { enabled: true, hasSeenNudge: true },
        security: { auth: { selectedType: "gateway" } },
        general: { previewFeatures: true },
      },
      null,
      2,
    );
    writeFileSync(join(cliDir, "settings.json"), defaultSettings);
    writeFileSync(join(sandboxGeminiDir, "settings.json"), defaultSettings);
  }

  return join(tenantDir, ".gemini-sandbox");
}
