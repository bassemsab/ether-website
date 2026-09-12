import { writeFileSync, existsSync } from "fs";
import { join } from "path";

const buildIndex = join(process.cwd(), "build", "index.js");

if (existsSync(buildIndex)) {
  const content = `// @bun
import {
  build_options,
  env,
  handler_default
} from "./handler.js";
import "./mime.conf.js";

var { serve } = globalThis.Bun;
var hostname = env("HOST", "0.0.0.0");
var port = parseInt(env("PORT", 3000));
var { httpserver, websocket } = handler_default(build_options.assets ?? true);

var RESERVED_SLUGS = new Set([
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

var runnerUrl =
  process.env.RUNNER_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "http://agent-runner.ether.svc.cluster.local:8080"
    : "http://localhost:8085");

async function proxyToRunner(slug, req, rawHost, isPreview = false) {
  var url = new URL(req.url);
  var prefix = isPreview ? ("/dev/" + slug) : ("/prod/" + slug);
  var targetUrl = runnerUrl + prefix + url.pathname + url.search;

  var forwardHeaders = new Headers(req.headers);
  forwardHeaders.set("x-forwarded-host", rawHost);
  forwardHeaders.set("accept-encoding", "identity");

  var res = await fetch(targetUrl, {
    method: req.method,
    headers: forwardHeaders,
    body:
      req.method !== "GET" && req.method !== "HEAD"
        ? await req.blob()
        : undefined,
    signal: AbortSignal.timeout(15000),
  });

  if (res.ok || (res.status >= 300 && res.status < 500)) {
    var resHeaders = new Headers(res.headers);
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");
    if (isPreview) {
      resHeaders.delete("x-frame-options");
      resHeaders.delete("content-security-policy");
    }
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    });
  }
  return null;
}

var serverOptions = {
  baseURI: env("ORIGIN", undefined),
  hostname,
  port,
  development: env("SERVERDEV", build_options.development ?? false),
  error(error) {
    console.error(error);
    return new Response("Uh oh!!", { status: 500 });
  },
  async fetch(req, srv) {
    var rawHost =
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      "";
    var host = rawHost.split(":")[0].toLowerCase();
    var url = new URL(req.url);

    // 1. If running in a tenant namespace with TENANT_SLUG defined (e.g. web-prod)
    var envSlug = process.env.TENANT_SLUG;
    if (envSlug) {
      try {
        var proxied = await proxyToRunner(envSlug, req, rawHost, false);
        if (proxied) return proxied;
      } catch (err) {
        console.warn("[Proxy to runner failed for tenant " + envSlug + "]:", err.message);
      }
    }

    // 2. Check if host is a preview subdomain (e.g. preview-tester.ether.paris)
    if (host.startsWith("preview-") && host.endsWith(".ether.paris")) {
      var candidate = host.slice(8).replace(".ether.paris", "");
      if (candidate.length > 0 && !RESERVED_SLUGS.has(candidate)) {
        try {
          var proxied = await proxyToRunner(candidate, req, rawHost, true);
          if (proxied) return proxied;
        } catch (err) {
          console.warn("[Preview proxy failed for " + candidate + "]:", err.message);
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
      var candidate = host.replace(".ether.paris", "");
      if (candidate.length > 0 && !RESERVED_SLUGS.has(candidate)) {
        try {
          var proxied = await proxyToRunner(candidate, req, rawHost, false);
          if (proxied) return proxied;
        } catch (err) {
          console.warn("[Tenant proxy failed for " + candidate + "]:", err.message);
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

console.info("Listening on " + hostname + ":" + port + (websocket ? " (Websocket)" : ""));
serve(serverOptions);
`;

  writeFileSync(buildIndex, content);
  console.log("✔ Successfully wrapped build/index.js with tenant reverse proxy");
}
