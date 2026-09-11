import type { Handle } from "@sveltejs/kit";
import {
  getSessionByToken,
  cleanupExpiredSessions,
  getTenantBySlug,
  getTenantByDomain,
} from "$lib/server/db";
import {
  getSessionCookieDomain,
  SESSION_MAX_AGE_SECONDS,
} from "$lib/server/auth";

const RESERVED_SLUGS = new Set([
  "api",
  "admin",
  "studio",
  "git",
  "mail",
  "smtp",
  "www",
  "app",
  "dev",
  "staging",
  "auth",
  "login",
  "dashboard",
  "logout",
]);

// Clean up expired sessions periodically
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

export const handle: Handle = async ({ event, resolve }) => {
  // Cleanup expired sessions every hour
  if (Date.now() - lastCleanup > CLEANUP_INTERVAL) {
    await cleanupExpiredSessions();
    lastCleanup = Date.now();
  }

  // Detect Host
  const rawHost =
    event.request.headers.get("x-forwarded-host") ||
    event.request.headers.get("host") ||
    event.url.hostname ||
    "";
  const host = rawHost.split(":")[0].toLowerCase();

  // Studio Subdomain Handling (studio.ether.paris)
  if (host === "studio.ether.paris") {
    event.locals.isStudio = true;
    if (event.url.pathname === "/") {
      return new Response(null, {
        status: 307,
        headers: { location: `/studio${event.url.search}` },
      });
    }
  }

  // Tenant Resolution:
  // 1. Check query parameter preview_tenant (for Studio local dev or iframe preview)
  // 2. Check pod environment variable TENANT_SLUG (when running in isolated tenant namespace)
  // 3. Check host ending in .ether.paris with a non-reserved slug (e.g. tester.ether.paris)
  // 4. Check custom domains (e.g. hidden-artist.fr)
  let tenantSlug: string | null =
    event.url.searchParams.get("preview_tenant") ||
    process.env.TENANT_SLUG ||
    null;
  if (!tenantSlug && host.endsWith(".ether.paris")) {
    const candidate = host.replace(".ether.paris", "");
    if (!RESERVED_SLUGS.has(candidate) && candidate.length > 0) {
      tenantSlug = candidate;
    }
  }

  if (tenantSlug) {
    let tenant = await getTenantBySlug(tenantSlug);
    if (!tenant) {
      // Fallback for pod running in tenant namespace or newly created tenant
      tenant = {
        id: 0,
        user_id: 0,
        slug: tenantSlug,
        subdomain: `${tenantSlug}.ether.paris`,
        brand_name: process.env.TENANT_BRAND_NAME || tenantSlug,
        domain: `${tenantSlug}.ether.paris`,
        email: "contact@ether.paris",
        custom_domain: null,
        k8s_namespace: `tenant-${tenantSlug}`,
        git_repo_url: `https://git.ether.paris/${tenantSlug}/${tenantSlug}.git`,
        git_access_token: "",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        plan: "free",
        github_repo: null,
        aws_ses_verified: false,
        aws_ses_token: null,
        stalwart_user_created: false,
        stalwart_username: null,
        stalwart_password: null,
        k8s_ingress_created: true,
        cloudflare_dns_records: null,
        error_message: null,
        stripe_subscription_id: null,
      };
    }
    event.locals.tenant = tenant;
  } else if (
    host !== "ether.paris" &&
    host !== "www.ether.paris" &&
    host !== "studio.ether.paris" &&
    !host.includes("localhost") &&
    !host.includes("127.0.0.1")
  ) {
    // Check if custom domain matches a tenant
    const customTenant = await getTenantByDomain(host);
    if (customTenant) {
      event.locals.tenant = customTenant;
    }
  }

  // Get session from cookie
  const sessionToken = event.cookies.get("session");

  if (sessionToken) {
    const session = await getSessionByToken(sessionToken);

    if (session) {
      // Attach user to locals
      event.locals.user = {
        id: session.user_id,
        email: session.email || session.github_email || null,
        gitea_username: session.gitea_username || null,
        gitea_token: session.gitea_token || null,
        github_id: session.github_id || null,
        github_username: session.github_username || null,
        github_email: session.github_email || null,
        github_access_token: session.github_access_token || null,
        avatar_url: session.avatar_url || null,
      };

      // Ensure cookie is domain-scoped to .ether.paris for seamless studio / tenant SSO
      const cookieDomain = getSessionCookieDomain(host);
      if (cookieDomain) {
        event.cookies.set("session", sessionToken, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: SESSION_MAX_AGE_SECONDS,
          domain: cookieDomain,
        });
      }
    } else {
      // Invalid session, clear cookie across domain and host
      const cookieDomain = getSessionCookieDomain(host);
      event.cookies.delete("session", { path: "/", domain: cookieDomain });
      event.cookies.delete("session", { path: "/" });
      event.locals.user = null;
    }
  } else {
    event.locals.user = null;
  }

  const response = await resolve(event);
  return response;
};
