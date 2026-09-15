import { build_options, env, handler_default } from "./build/handler.js";
import "./build/mime.conf.js";

const { serve } = globalThis.Bun;
const hostname = env("HOST", "0.0.0.0");
const port = parseInt(env("PORT", 3000));
const { httpserver, websocket } = handler_default(build_options.assets ?? true);

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

const runnerUrl =
  process.env.RUNNER_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "http://agent-runner.ether.svc.cluster.local:8080"
    : "http://localhost:8085");

async function proxyToRunner(
  slug: string,
  req: Request,
  rawHost: string,
  isPreview: boolean = false,
): Promise<Response | null> {
  const url = new URL(req.url);
  const prefix = isPreview ? `/dev/${slug}` : `/prod/${slug}`;
  const targetUrl = `${runnerUrl}${prefix}${url.pathname}${url.search}`;

  const forwardHeaders = new Headers(req.headers);
  forwardHeaders.set("x-forwarded-host", rawHost);
  forwardHeaders.set("accept-encoding", "identity");

  const res = await fetch(targetUrl, {
    method: req.method,
    headers: forwardHeaders,
    body:
      req.method !== "GET" && req.method !== "HEAD"
        ? await req.blob()
        : undefined,
    signal: AbortSignal.timeout(15000),
  });

  if (res.ok || (res.status >= 300 && res.status < 500)) {
    const resHeaders = new Headers(res.headers);
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");
    if (isPreview) {
      resHeaders.delete("x-frame-options");
      resHeaders.delete("content-security-policy");
    }
    const contentType = resHeaders.get("content-type") || "";
    if (contentType.includes("text/html")) {
      resHeaders.set("Clear-Site-Data", '"cache"');
      resHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
    }
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    });
  }
  return null;
}

const serverOptions: any = {
  baseURI: env("ORIGIN", undefined),
  hostname,
  port,
  development: env("SERVERDEV", build_options.development ?? false),
  error(error: any) {
    console.error(error);
    return new Response("Uh oh!!", { status: 500 });
  },
  async fetch(req: Request, srv: any) {
    const rawHost =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const host = rawHost.split(":")[0].toLowerCase();
    const url = new URL(req.url);

    // 1. If running in a tenant namespace with TENANT_SLUG defined (e.g. web-prod)
    const envSlug = process.env.TENANT_SLUG;
    if (envSlug) {
      try {
        const proxied = await proxyToRunner(envSlug, req, rawHost, false);
        if (proxied) return proxied;
      } catch (err: any) {
        console.warn(
          `[Proxy to runner failed for tenant ${envSlug}]:`,
          err.message,
        );
      }
    }

    // 2. Check if host is a preview subdomain (e.g. preview-tester.ether.paris)
    if (host.startsWith("preview-") && host.endsWith(".ether.paris")) {
      const candidate = host.slice(8).replace(".ether.paris", "");
      if (candidate.length > 0 && !RESERVED_SLUGS.has(candidate)) {
        try {
          const proxied = await proxyToRunner(candidate, req, rawHost, true);
          if (proxied) return proxied;
        } catch (err: any) {
          console.warn(`[Preview proxy failed for ${candidate}]:`, err.message);
        }
      }
    }

    // 3. Check if host is a published tenant (e.g. tester.ether.paris)
    if (
      host.endsWith(".ether.paris") &&
      host !== "ether.paris" &&
      host !== "www.ether.paris" &&
      host !== "studio.ether.paris"
    ) {
      const candidate = host.replace(".ether.paris", "");
      if (candidate.length > 0 && !RESERVED_SLUGS.has(candidate)) {
        try {
          const proxied = await proxyToRunner(candidate, req, rawHost, false);
          if (proxied) return proxied;
        } catch (err: any) {
          console.warn(`[Tenant proxy failed for ${candidate}]:`, err.message);
        }
      }
    }

    // Fallback: standard SvelteKit application
    return httpserver(req, srv);
  },
};

if (websocket) {
  serverOptions.websocket = websocket;
}

console.info(
  `Listening on ${hostname + ":" + port}` + (websocket ? " (Websocket)" : ""),
);
serve(serverOptions);
