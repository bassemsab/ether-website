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

  if (
    !tenantSlug &&
    host.startsWith("preview-") &&
    host.endsWith(".ether.paris")
  ) {
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
    if (!tenant && process.env.TENANT_SLUG && process.env.TENANT_SLUG === tenantSlug) {
      // Fallback only for pod running in isolated tenant namespace
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
        git_password: null,
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
    } else if (!tenant) {
      tenantSlug = null;
    }
    event.locals.tenant = tenant || undefined;
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
        ? "http://agent-runner.ether.svc.cluster.local:8080"
        : "http://localhost:8085");

    try {
      const devPath = `/dev/${tenantSlug}${event.url.pathname}${event.url.search}`;
      const proxyUrl = `${runnerUrl}${devPath}`;
      const forwardHeaders = new Headers(event.request.headers);
      forwardHeaders.set("x-forwarded-host", rawHost);
      forwardHeaders.set("accept-encoding", "identity");

      if (event.locals.tenant?.git_repo_url) {
        forwardHeaders.set("x-git-repo-url", event.locals.tenant.git_repo_url);
      }
      if (event.locals.tenant?.git_access_token) {
        forwardHeaders.set("x-git-token", event.locals.tenant.git_access_token);
      }

      const devRes = await fetch(proxyUrl, {
        method: event.request.method,
        headers: forwardHeaders,
        body:
          event.request.method !== "GET" && event.request.method !== "HEAD"
            ? await event.request.blob()
            : undefined,
        signal: AbortSignal.timeout(15000),
      });

      // Forward Vite dev server response directly to avoid falling through to platform TenantSite
      const responseHeaders = new Headers(devRes.headers);
      responseHeaders.delete("x-frame-options");
      responseHeaders.delete("content-security-policy");
      responseHeaders.delete("content-encoding");
      responseHeaders.delete("content-length");
      responseHeaders.set(
        "cache-control",
        "no-store, no-cache, must-revalidate, max-age=0",
      );
      responseHeaders.set("pragma", "no-cache");
      responseHeaders.set("expires", "0");
      return new Response(devRes.body, {
        status: devRes.status,
        statusText: devRes.statusText,
        headers: responseHeaders,
      });
    } catch (err: any) {
      console.warn(
        `[Preview Proxy] Runner dev server unreachable for ${tenantSlug}:`,
        err.message,
      );
      return new Response(
        `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="1"><title>Mise à jour en cours...</title><style>:root{--bg:#0b0a10;--card-bg:rgba(22,21,32,0.85);--border:rgba(255,255,255,0.08);--text:#f3f4f6;--subtext:#9ca3af;--accent:#8b5cf6;}@media(prefers-color-scheme:light){:root{--bg:#f9fafb;--card-bg:rgba(255,255,255,0.9);--border:rgba(0,0,0,0.08);--text:#111827;--subtext:#6b7280;--accent:#6d28d9;}}body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);display:flex;align-items:center;justify-content:center;height:100vh;box-sizing:border-box;}.card{text-align:center;padding:24px 28px;background:var(--card-bg);border:1px solid var(--border);border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,0.12);backdrop-filter:blur(12px);max-width:320px;width:100%;}.spinner{width:22px;height:22px;margin:0 auto 14px auto;border:2.5px solid rgba(139,92,246,0.2);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s cubic-bezier(0.4,0,0.2,1) infinite;}h3{margin:0 0 6px 0;font-size:14px;font-weight:600;letter-spacing:-0.01em;}p{margin:0;font-size:12px;color:var(--subtext);line-height:1.4;}@keyframes spin{to{transform:rotate(360deg);}}</style></head><body><div class="card"><div class="spinner"></div><h3>Mise à jour en cours</h3><p>Application des modifications et reconnexion automatique...</p></div><script>setTimeout(function(){try{window.location.reload();}catch(e){}},1000);</script></body></html>`,
        {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
            pragma: "no-cache",
          },
        },
      );
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
        ? "http://agent-runner.ether.svc.cluster.local:8080"
        : "http://localhost:8085");

    try {
      const prodPath = `/prod/${tenantSlug}${event.url.pathname}${event.url.search}`;
      const proxyUrl = `${runnerUrl}${prodPath}`;
      const forwardHeaders = new Headers(event.request.headers);
      forwardHeaders.set("x-forwarded-host", rawHost);
      forwardHeaders.set("accept-encoding", "identity");

      const prodRes = await fetch(proxyUrl, {
        method: event.request.method,
        headers: forwardHeaders,
        body:
          event.request.method !== "GET" && event.request.method !== "HEAD"
            ? await event.request.blob()
            : undefined,
        signal: AbortSignal.timeout(15000),
      });

      if (prodRes.ok || (prodRes.status >= 300 && prodRes.status < 500)) {
        const responseHeaders = new Headers(prodRes.headers);
        responseHeaders.delete("content-encoding");
        responseHeaders.delete("content-length");
        const contentType = responseHeaders.get("content-type") || "";
        if (contentType.includes("text/html")) {
          responseHeaders.set(
            "Cache-Control",
            "no-cache, no-store, must-revalidate",
          );
        }
        return new Response(prodRes.body, {
          status: prodRes.status,
          statusText: prodRes.statusText,
          headers: responseHeaders,
        });
      }
    } catch (err: any) {
      console.warn(
        `[Prod Proxy] Runner prod server unreachable for ${tenantSlug}:`,
        err.message,
      );
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
