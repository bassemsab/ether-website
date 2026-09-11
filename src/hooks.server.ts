import type { Handle } from "@sveltejs/kit";
import {
  getSessionByToken,
  cleanupExpiredSessions,
  getTenantBySlug,
  getTenantByDomain,
  type SessionWithUser,
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
  // 1. Check if host is a preview subdomain (e.g. preview-tester.ether.paris)
  // 2. Check query parameter preview_tenant (for Studio local dev or iframe preview)
  // 3. Check pod environment variable TENANT_SLUG (when running in isolated tenant namespace)
  // 4. Check host ending in .ether.paris with a non-reserved slug (e.g. tester.ether.paris)
  // 5. Check custom domains (e.g. hidden-artist.fr)
  let isPreview = false;
  let tenantSlug: string | null =
    event.url.searchParams.get("preview_tenant") ||
    process.env.TENANT_SLUG ||
    null;

  if (event.url.searchParams.has("preview_tenant")) {
    isPreview = true;
  }

  if (!tenantSlug && host.startsWith("preview-") && host.endsWith(".ether.paris")) {
    const candidate = host.slice(8).replace(".ether.paris", "");
    if (candidate.length > 0 && !RESERVED_SLUGS.has(candidate)) {
      tenantSlug = candidate;
      isPreview = true;
    }
  }

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
      tenantSlug = customTenant.slug;
    }
  }

  // Live Vite Dev Server Proxy for Studio Preview
  // Only intercepts when in preview mode (e.g. preview-<slug>.ether.paris)
  // The actual production tenant site (e.g. tester.ether.paris) is served normally
  if (
    isPreview &&
    tenantSlug &&
    !event.locals.isStudio &&
    !event.url.pathname.startsWith("/api/")
  ) {
    const runnerUrl =
      process.env.RUNNER_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "http://agent-runner:8080"
        : "http://localhost:8085");

    try {
      const devPath = `/dev/${tenantSlug}${event.url.pathname}${event.url.search}`;
      const proxyUrl = `${runnerUrl}${devPath}`;
      const forwardHeaders = new Headers(event.request.headers);
      forwardHeaders.set("x-forwarded-host", rawHost);

      const devRes = await fetch(proxyUrl, {
        method: event.request.method,
        headers: forwardHeaders,
        body:
          event.request.method !== "GET" && event.request.method !== "HEAD"
            ? await event.request.blob()
            : undefined,
        signal: AbortSignal.timeout(4000),
      });

      if (devRes.ok || (devRes.status >= 300 && devRes.status < 500)) {
        const responseHeaders = new Headers(devRes.headers);
        responseHeaders.delete("x-frame-options");
        responseHeaders.delete("content-security-policy");
        return new Response(devRes.body, {
          status: devRes.status,
          statusText: devRes.statusText,
          headers: responseHeaders,
        });
      }
    } catch {
      // Fall through to standard resolve(event)
    }
  }

  // Production Tenant Site Proxy (for published sites, e.g. tester.ether.paris)
  if (
    !isPreview &&
    tenantSlug &&
    !event.locals.isStudio &&
    !event.url.pathname.startsWith("/api/")
  ) {
    const runnerUrl =
      process.env.RUNNER_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "http://agent-runner:8080"
        : "http://localhost:8085");

    try {
      const prodPath = `/prod/${tenantSlug}${event.url.pathname}${event.url.search}`;
      const proxyUrl = `${runnerUrl}${prodPath}`;
      const forwardHeaders = new Headers(event.request.headers);
      forwardHeaders.set("x-forwarded-host", rawHost);

      const prodRes = await fetch(proxyUrl, {
        method: event.request.method,
        headers: forwardHeaders,
        body:
          event.request.method !== "GET" && event.request.method !== "HEAD"
            ? await event.request.blob()
            : undefined,
        signal: AbortSignal.timeout(4000),
      });

      if (prodRes.ok || (prodRes.status >= 300 && prodRes.status < 500)) {
        return new Response(prodRes.body, {
          status: prodRes.status,
          statusText: prodRes.statusText,
          headers: prodRes.headers,
        });
      }
    } catch {
      // Fall through to standard resolve(event)
    }
  }

  // Get session from cookie or Authorization header (with multi-token candidate resolution)
  const authHeader = event.request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  const rawCookieHeader = event.request.headers.get("cookie") || "";
  const candidateTokens: string[] = [];

  // Parse all session cookies if multiple exist (host-only vs domain-scoped)
  const cookieMatches = rawCookieHeader.matchAll(/(?:^|;\s*)session=([^;]+)/g);
  for (const m of cookieMatches) {
    if (m[1]) {
      const decoded = decodeURIComponent(m[1].trim());
      if (decoded && !candidateTokens.includes(decoded)) {
        candidateTokens.push(decoded);
      }
    }
  }

  const svelteSessionCookie = event.cookies.get("session");
  if (svelteSessionCookie && !candidateTokens.includes(svelteSessionCookie)) {
    candidateTokens.push(svelteSessionCookie);
  }

  if (bearerToken && !candidateTokens.includes(bearerToken)) {
    candidateTokens.push(bearerToken);
  }

  let validSession: SessionWithUser | null = null;
  let activeToken: string | null = null;

  for (const token of candidateTokens) {
    const session = await getSessionByToken(token);
    if (session) {
      validSession = session;
      activeToken = token;
      break;
    }
  }

  if (validSession && activeToken) {
    // Attach user to locals
    event.locals.user = {
      id: validSession.user_id,
      email: validSession.email || validSession.github_email || null,
      gitea_username: validSession.gitea_username || null,
      gitea_token: validSession.gitea_token || null,
      github_id: validSession.github_id || null,
      github_username: validSession.github_username || null,
      github_email: validSession.github_email || null,
      github_access_token: validSession.github_access_token || null,
      avatar_url: validSession.avatar_url || null,
    };

    // Ensure cookie is domain-scoped to .ether.paris for seamless studio / tenant SSO
    const cookieDomain = getSessionCookieDomain(host);
    if (cookieDomain) {
      event.cookies.set("session", activeToken, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_MAX_AGE_SECONDS,
        domain: cookieDomain,
      });
    }
  } else {
    event.locals.user = null;
  }

  const response = await resolve(event);
  return response;
};
