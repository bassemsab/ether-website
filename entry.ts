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
  const reqBody =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.blob()
      : undefined;

  let res: Response | null = null;
  const maxAttempts = isPreview ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
    } catch (err: any) {
      if (attempt === maxAttempts) {
        console.warn(`[Proxy attempt ${attempt} failed for ${slug}]:`, err.message);
      }
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  if (res && (res.ok || (res.status >= 300 && res.status < 500))) {
    const resHeaders = new Headers(res.headers);
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");
    if (isPreview) {
      resHeaders.delete("x-frame-options");
      resHeaders.delete("content-security-policy");
    }
    const contentType = resHeaders.get("content-type") || "";
    if (contentType.includes("text/html")) {
      resHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
      if (isPreview) {
        const html = await res.text();
        const guardScript = `<script>
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
</script>`;
        const modifiedHtml = html.includes("<head>")
          ? html.replace("<head>", `<head>${guardScript}`)
          : `${guardScript}${html}`;
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
    const retryHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="1">
  <title>Mise à jour de l'aperçu...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: #FBF9F5;
      color: #1E1B39;
      margin: 0;
    }
    .card {
      text-align: center;
      padding: 24px 32px;
      background: #fff;
      border: 1.5px solid #1E1B39;
      border-radius: 16px;
      box-shadow: 3px 3px 0 #1E1B39;
    }
    .spinner {
      display: inline-block;
      width: 24px;
      height: 24px;
      border: 3px solid rgba(30,27,57,0.15);
      border-radius: 50%;
      border-top-color: #1E1B39;
      animation: spin 1s linear infinite;
      margin-bottom: 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h3 style="margin:0 0 6px 0;font-size:15px;font-weight:600;">⚡ Mise à jour de l'aperçu...</h3>
    <p style="font-size:12px;color:#666;margin:0;">Le serveur applique les modifications. Reconnexion automatique...</p>
  </div>
  <script>
    setTimeout(function() {
      try { window.location.reload(); } catch(e) {}
    }, 1000);
  </script>
</body>
</html>`;
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
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const protocol =
            req.headers.get("sec-websocket-protocol") || "vite-hmr";
          const targetWsUrl = `${runnerUrl.replace(/^http/, "ws")}/dev/${candidate}${url.pathname}${url.search}`;
          const upgraded = srv.upgrade(req, {
            data: { targetWsUrl, protocol, tenantSlug: candidate },
            headers: protocol
              ? { "Sec-WebSocket-Protocol": protocol }
              : undefined,
          });
          if (upgraded) return undefined;
        }

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
      !host.startsWith("preview-") &&
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
  websocket: {
    open(ws: any) {
      if (ws.data?.targetWsUrl) {
        const protocol = ws.data.protocol || "vite-hmr";
        const queue: any[] = [];
        ws.data.queue = queue;
        try {
          const targetWs = new WebSocket(ws.data.targetWsUrl, protocol);
          ws.data.targetWs = targetWs;

          targetWs.onopen = () => {
            while (queue.length > 0) {
              const msg = queue.shift();
              try {
                targetWs.send(msg);
              } catch {}
            }
          };

          targetWs.onmessage = (event: any) => {
            try {
              ws.send(event.data);
            } catch {}
          };

          targetWs.onclose = (event: any) => {
            try {
              ws.close(event.code, event.reason);
            } catch {}
          };

          targetWs.onerror = (err: any) => {
            console.warn(
              `[Entry WS Proxy] Error for ${ws.data?.tenantSlug}:`,
              err.message,
            );
          };
        } catch (err: any) {
          console.error(
            `[Entry WS Proxy] Failed to connect to ${ws.data.targetWsUrl}:`,
            err.message,
          );
          try {
            ws.close(1011, "Backend dev server unreachable");
          } catch {}
        }
      } else if (websocket?.open) {
        websocket.open(ws);
      }
    },
    message(ws: any, message: any) {
      if (ws.data?.targetWs && ws.data.targetWs.readyState === WebSocket.OPEN) {
        try {
          ws.data.targetWs.send(message);
        } catch {}
      } else if (ws.data?.queue) {
        ws.data.queue.push(message);
      } else if (websocket?.message) {
        websocket.message(ws, message);
      }
    },
    close(ws: any, code: number, reason: string) {
      if (ws.data?.targetWs) {
        try {
          ws.data.targetWs.close(code, reason);
        } catch {}
      } else if (websocket?.close) {
        websocket.close(ws, code, reason);
      }
    },
  },
};

console.info(
  `Listening on ${hostname + ":" + port} (Websocket)`,
);
serve(serverOptions);
