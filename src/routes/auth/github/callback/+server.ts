import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  handleGitHubCallback,
  getSessionCookieDomain,
  SESSION_MAX_AGE_SECONDS,
} from "$lib/server/auth";

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Check for OAuth errors
  if (error) {
    console.error("GitHub OAuth error:", error);
    throw redirect(302, "/login?error=github_denied");
  }

  // Validate state parameter (CSRF protection)
  const storedState = cookies.get("oauth_state");
  if (!state || !storedState || state !== storedState) {
    console.error("Invalid OAuth state");
    throw redirect(302, "/login?error=invalid_state");
  }

  // Clear state cookie
  cookies.delete("oauth_state", { path: "/" });

  // Check for authorization code
  if (!code) {
    console.error("No authorization code received");
    throw redirect(302, "/login?error=no_code");
  }

  try {
    // Exchange code for tokens and create user session
    const { user, sessionToken } = await handleGitHubCallback(code);

    // Set session cookie scoped across .ether.paris subdomains
    cookies.set("session", sessionToken, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE_SECONDS,
      sameSite: "lax",
      domain: getSessionCookieDomain(url.hostname),
    });

    // Redirect to dashboard
    throw redirect(302, "/dashboard");
  } catch (error: any) {
    // Re-throw redirect responses
    if (error.status === 302) {
      throw error;
    }
    console.error("OAuth callback error:", error);
    throw redirect(302, "/login?error=auth_failed");
  }
};
