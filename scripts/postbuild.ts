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

  var reqBody =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.blob()
      : undefined;

  var res = null;
  var maxAttempts = isPreview ? 3 : 1;

  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: reqBody,
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok || (res.status >= 300 && res.status < 500)) {
        break;
      }
    } catch (err) {
      if (attempt === maxAttempts) {
        console.warn("[Proxy attempt " + attempt + " failed for " + slug + "]:", err.message);
      }
    }
    if (attempt < maxAttempts) {
      await new Promise(function(r) { setTimeout(r, 250); });
    }
  }

  if (res && (res.ok || (res.status >= 300 && res.status < 500))) {
    var resHeaders = new Headers(res.headers);
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");
    if (isPreview) {
      resHeaders.delete("x-frame-options");
      resHeaders.delete("content-security-policy");
    }
    var contentType = resHeaders.get("content-type") || "";
    if (contentType.includes("text/html")) {
      resHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
      if (isPreview) {
        var html = await res.text();
        var guardScript = \`<script>
(function(){
  try{
    var k='__ether_r_ts',c='__ether_r_cnt';
    var now=Date.now();
    var last=parseInt(sessionStorage.getItem(k)||'0',10);
    var count=parseInt(sessionStorage.getItem(c)||'0',10);
    if(now-last<4000){
      count++;
      sessionStorage.setItem(c,String(count));
      if(count>=3){
        console.warn('[Ether] Rapid reload loop suppressed');
        var noop=function(){};
        try{window.location.reload=noop;}catch(_){}
      }
    }else{
      sessionStorage.setItem(c,'0');
    }
    sessionStorage.setItem(k,String(now));
  }catch(_){}
})();
<\\/script>\`;
        var modifiedHtml = html.includes("<head>")
          ? html.replace("<head>", "<head>" + guardScript)
          : (guardScript + html);
        return new Response(modifiedHtml, {
          status: res.status,
          statusText: res.statusText,
          headers: resHeaders,
        });
      }
    }
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    });
  }

  // If isPreview and dev server is compiling/restarting, serve a friendly auto-refreshing 200 page
  // (NEVER return 502/null to an iframe preview or Chrome will permanently replace it with 'refused to connect')
  if (isPreview && (req.headers.get("accept")?.includes("text/html") || url.pathname === "/")) {
    var retryHtml = \`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="1">
  <title>Mise à jour en cours...</title>
  <style>
    :root {
      --bg: #0b0a10;
      --card-bg: rgba(22, 21, 32, 0.85);
      --border: rgba(255, 255, 255, 0.08);
      --text: #f3f4f6;
      --subtext: #9ca3af;
      --accent: #8b5cf6;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f9fafb;
        --card-bg: rgba(255, 255, 255, 0.9);
        --border: rgba(0, 0, 0, 0.08);
        --text: #111827;
        --subtext: #6b7280;
        --accent: #6d28d9;
      }
    }
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      box-sizing: border-box;
    }
    .card {
      text-align: center;
      padding: 24px 28px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
      backdrop-filter: blur(12px);
      max-width: 320px;
      width: 100%;
    }
    .spinner {
      width: 22px;
      height: 22px;
      margin: 0 auto 14px auto;
      border: 2.5px solid rgba(139, 92, 246, 0.2);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }
    h3 {
      margin: 0 0 6px 0;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    p {
      margin: 0;
      font-size: 12px;
      color: var(--subtext);
      line-height: 1.4;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h3>Mise à jour en cours</h3>
    <p>Application des modifications et reconnexion automatique...</p>
  </div>
  <script>
    setTimeout(function() {
      try { window.location.reload(); } catch(e) {}
    }, 1000);
  <\\/script>
</body>
</html>\`;
    return new Response(retryHtml, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        pragma: "no-cache",
      },
    });
  }

  return null;
}

function isScannerProbe(pathname) {
  var p = pathname.toLowerCase();
  if (
    p.startsWith("/wp-") ||
    p.startsWith("/xmlrpc") ||
    p.startsWith("/.env") ||
    p.startsWith("/.git") ||
    p.startsWith("/php") ||
    p.startsWith("/actuator") ||
    p.startsWith("/setup.cgi") ||
    p.startsWith("/solr") ||
    p.startsWith("/autodiscover") ||
    p.startsWith("/config.")
  ) {
    return true;
  }
  var exts = [".php", ".asp", ".aspx", ".jsp", ".cgi", ".env", ".git", ".bak", ".old"];
  for (var i = 0; i < exts.length; i++) {
    if (p.endsWith(exts[i])) return true;
  }
  return false;
}

async function handleTenantProdRequest(slug, req, rawHost) {
  var url = new URL(req.url);

  // 1. Instant 404 for vulnerability scanners
  if (isScannerProbe(url.pathname)) {
    return new Response("Not Found", { status: 404 });
  }

  var userAgent = req.headers.get("user-agent") || "";
  var isCrawler = /Googlebot|bingbot|yandex|Baiduspider|DuckDuckBot/i.test(userAgent);
  var targetPodUrl = "http://web-prod.tenant-" + slug + ".svc.cluster.local:3000";

  // Quick check if the tenant pod is awake
  var isAwake = false;
  try {
    var probe = await fetch(targetPodUrl + "/api/_health", {
      signal: AbortSignal.timeout(200),
    });
    if (probe.ok) isAwake = true;
  } catch (_) {}

  // 2. Search crawler policy: if asleep, serve pre-rendered static HTML directly from runner snapshot in 5ms
  if (isCrawler && !isAwake) {
    try {
      var snapRes = await fetch(runnerUrl + "/snapshot/" + slug, {
        signal: AbortSignal.timeout(1000),
      });
      if (snapRes.ok) {
        return new Response(snapRes.body, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            "X-Served-By": "Ether-Static-Crawler-Cache",
          },
        });
      }
    } catch (_) {}
  }

  // 3. If asleep and visitor is human: wake up the pod in background (~800ms) while holding connection
  if (!isAwake) {
    try {
      console.log("[wake-on-request] Scaling up pod for tenant '" + slug + "'...");
      var scaleProc = Bun.spawn(
        ["kubectl", "scale", "deployment/web-prod", "--replicas=1", "-n", "tenant-" + slug],
        { stdout: "pipe", stderr: "pipe" },
      );
      await scaleProc.exited;

      for (var attempt = 0; attempt < 80; attempt++) {
        try {
          var check = await fetch(targetPodUrl + "/api/_health", {
            signal: AbortSignal.timeout(250),
          });
          if (check.ok) {
            isAwake = true;
            break;
          }
        } catch (_) {}
        await new Promise(function(r) { setTimeout(r, 100); });
      }
    } catch (err) {
      console.warn("[wake-on-request] Failed to scale up tenant " + slug + ":", err.message);
    }
  }

  // 4. Proxy to the live tenant pod if awake
  if (isAwake) {
    var forwardHeaders = new Headers(req.headers);
    forwardHeaders.set("host", "web-prod.tenant-" + slug + ".svc.cluster.local:3000");
    forwardHeaders.set("x-forwarded-host", rawHost);
    forwardHeaders.set("accept-encoding", "identity");

    var reqBody =
      req.method !== "GET" && req.method !== "HEAD" ? await req.blob() : undefined;

    try {
      var podRes = await fetch(targetPodUrl + url.pathname + url.search, {
        method: req.method,
        headers: forwardHeaders,
        body: reqBody,
      });

      var resHeaders = new Headers(podRes.headers);
      resHeaders.delete("content-encoding");
      resHeaders.delete("content-length");

      return new Response(podRes.body, {
        status: podRes.status,
        statusText: podRes.statusText,
        headers: resHeaders,
      });
    } catch (err) {
      console.warn("[Proxy to tenant pod failed for " + slug + "]:", err.message);
    }
  }

  // 5. Fallback to runner if tenant pod is not yet provisioned
  return proxyToRunner(slug, req, rawHost, false);
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
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
          var protocol =
            req.headers.get("sec-websocket-protocol") || "vite-hmr";
          var targetWsUrl = runnerUrl.replace(/^http/, "ws") + "/dev/" + candidate + url.pathname + url.search;
          var upgraded = srv.upgrade(req, {
            data: { targetWsUrl: targetWsUrl, protocol: protocol, tenantSlug: candidate },
            headers: protocol
              ? { "Sec-WebSocket-Protocol": protocol }
              : undefined,
          });
          if (upgraded) return undefined;
        }

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
      !host.startsWith("preview-") &&
      host !== "ether.paris" &&
      host !== "www.ether.paris" &&
      host !== "studio.ether.paris"
    ) {
      var candidate = host.replace(".ether.paris", "");
      if (candidate.length > 0 && !RESERVED_SLUGS.has(candidate)) {
        try {
          var proxied = await handleTenantProdRequest(candidate, req, rawHost);
          if (proxied) return proxied;
        } catch (err) {
          console.warn("[Tenant proxy failed for " + candidate + "]:", err.message);
        }
      }
    }

    // Fallback: standard SvelteKit application
    return httpserver(req, srv);
  },
  websocket: {
    open(ws) {
      if (ws.data && ws.data.targetWsUrl) {
        var protocol = ws.data.protocol || "vite-hmr";
        var queue = [];
        ws.data.queue = queue;
        try {
          var targetWs = new WebSocket(ws.data.targetWsUrl, protocol);
          ws.data.targetWs = targetWs;

          targetWs.onopen = () => {
            while (queue.length > 0) {
              var msg = queue.shift();
              try {
                targetWs.send(msg);
              } catch (_) {}
            }
          };

          targetWs.onmessage = (event) => {
            try {
              ws.send(event.data);
            } catch (_) {}
          };

          targetWs.onclose = (event) => {
            try {
              ws.close(event.code, event.reason);
            } catch (_) {}
          };

          targetWs.onerror = (err) => {
            console.warn("[Entry WS Proxy] Error for " + ws.data.tenantSlug + ":", err.message);
          };
        } catch (err) {
          console.error("[Entry WS Proxy] Failed to connect to " + ws.data.targetWsUrl + ":", err.message);
          try {
            ws.close(1011, "Backend dev server unreachable");
          } catch (_) {}
        }
      } else if (websocket && websocket.open) {
        websocket.open(ws);
      }
    },
    message(ws, message) {
      if (ws.data && ws.data.targetWs && ws.data.targetWs.readyState === WebSocket.OPEN) {
        try {
          ws.data.targetWs.send(message);
        } catch (_) {}
      } else if (ws.data && ws.data.queue) {
        ws.data.queue.push(message);
      } else if (websocket && websocket.message) {
        websocket.message(ws, message);
      }
    },
    close(ws, code, reason) {
      if (ws.data && ws.data.targetWs) {
        try {
          ws.data.targetWs.close(code, reason);
        } catch (_) {}
      } else if (websocket && websocket.close) {
        websocket.close(ws, code, reason);
      }
    },
  },
};

console.info("Listening on " + hostname + ":" + port + " (Websocket)");
serve(serverOptions);
`;

  writeFileSync(buildIndex, content);
  console.log(
    "✔ Successfully wrapped build/index.js with tenant reverse proxy",
  );
}
