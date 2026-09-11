import { env } from "$env/dynamic/private";
import { createOrUpdateUser, createSession, getUserByGithubId } from "$lib/server/db";
import { randomBytes } from "crypto";

const GITHUB_CLIENT_ID = env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = env.GITHUB_CLIENT_SECRET;
const BASE_URL = env.BASE_URL || "http://localhost:5173";

interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
}

interface GitHubTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  scope: string;
}

export function generateState(): string {
  return randomBytes(32).toString("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Resolves the shared cookie domain across all ether.paris subdomains (studio, tenant, main)
 */
export function getSessionCookieDomain(host?: string | null): string | undefined {
  if (!host) {
    return process.env.NODE_ENV === "production" ? ".ether.paris" : undefined;
  }
  const cleanHost = host.split(":")[0].toLowerCase();
  if (cleanHost.endsWith("ether.paris")) {
    return ".ether.paris";
  }
  return undefined;
}

export function getGitHubOAuthUrl(state: string): string {
  if (!GITHUB_CLIENT_ID) {
    throw new Error("GITHUB_CLIENT_ID not configured");
  }

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${BASE_URL}/auth/github/callback`,
    scope: "repo",
    state: state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<GitHubTokenResponse> {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    throw new Error("GitHub OAuth credentials not configured");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code,
      redirect_uri: `${BASE_URL}/auth/github/callback`,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GitHub OAuth error: ${error.error_description || error.error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }

  return data;
}

export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub user: ${response.statusText}`);
  }

  return response.json();
}

export async function handleGitHubCallback(code: string): Promise<{ user: any; sessionToken: string }> {
  // Exchange code for access token
  const tokenData = await exchangeCodeForToken(code);

  // Get GitHub user info
  const githubUser = await getGitHubUser(tokenData.access_token);

  // Create or update user in database
  const user = await createOrUpdateUser(
    githubUser.id.toString(),
    githubUser.login,
    githubUser.email,
    tokenData.access_token,
    tokenData.refresh_token || null,
    githubUser.avatar_url
  );

  if (!user) {
    throw new Error("Failed to create user");
  }

  // Create session (30 days validity)
  const sessionToken = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  const session = await createSession(user.id, sessionToken, expiresAt);

  if (!session) {
    throw new Error("Failed to create session");
  }

  return { user, sessionToken };
}

export async function refreshGitHubToken(refreshToken: string): Promise<string | null> {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return null;
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.access_token || null;
}
