import { existsSync, statSync } from "fs";
import { join, resolve } from "path";

const PORT = parseInt(process.env.PORT || "3000", 10);
const APP_DIR = process.env.APP_DIR || "/app";
const INTERNAL_PORT = 3001;

let lastRequestTimestamp = Date.now();
let ssrProc: any = null;
let ssrReady = false;

function isBotScannerProbe(pathname: string): boolean {
  return (
    /^\/(?:wp-|xmlrpc|\.env|\.git|php|actuator|setup\.cgi|solr|autodiscover|config\.)/i.test(
      pathname,
    ) || /\.(?:php|asp|aspx|jsp|cgi|env|git|bak|old)$/i.test(pathname)
  );
}

function findEntrypoint(): {
  type: "nitro" | "sveltekit" | "dist";
  path: string;
} | null {
  const nitroPath = join(APP_DIR, ".output", "server", "index.mjs");
  if (existsSync(nitroPath)) {
    return { type: "nitro", path: nitroPath };
  }

  const sveltePath = join(APP_DIR, "build", "index.js");
  if (existsSync(sveltePath)) {
    return { type: "sveltekit", path: sveltePath };
  }

  const distIndex = join(APP_DIR, "dist", "index.html");
  if (existsSync(distIndex)) {
    return { type: "dist", path: distIndex };
  }

  return null;
}

async function ensureSsrServer(entry: { type: string; path: string }) {
  if (entry.type === "dist") return;
  if (ssrProc && ssrProc.exitCode === null) return;

  const dbPath = process.env.DB_PATH || join(APP_DIR, "app.db");
  const env: Record<string, string> = {
    ...process.env,
    PORT: String(INTERNAL_PORT),
    HOST: "127.0.0.1",
    DB_PATH: dbPath,
    NODE_ENV: "production",
  };

  console.log(
    `[Tenant Runner] Starting SSR process (${entry.type}) on internal port ${INTERNAL_PORT}...`,
  );
  ssrProc = Bun.spawn(["bun", entry.path], {
    cwd: APP_DIR,
    env,
    stdout: "inherit",
    stderr: "inherit",
  });

  // Wait for internal SSR server to be ready
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const ping = await fetch(
        `http://127.0.0.1:${INTERNAL_PORT}/api/_health`,
      ).catch(() => fetch(`http://127.0.0.1:${INTERNAL_PORT}/`));
      if (ping.status < 500) {
        ssrReady = true;
        console.log(`[Tenant Runner] SSR server is ready.`);
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
}

function getHoldingPageHtml(brandName: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="3">
  <title>${brandName} — En cours de déploiement</title>
  <style>
    :root {
      --bg: #09080e;
      --card-bg: rgba(22, 20, 32, 0.8);
      --border: rgba(255, 255, 255, 0.08);
      --text: #f3f4f6;
      --subtext: #9ca3af;
      --accent: #8b5cf6;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 40px 32px;
      max-width: 440px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 3px solid rgba(139, 92, 246, 0.2);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 24px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
    p { font-size: 14px; color: var(--subtext); margin: 0 0 20px; line-height: 1.5; }
    .footer { font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: var(--subtext); opacity: 0.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>${brandName}</h1>
    <p>Le site est en cours d'initialisation sur le réseau Ether. Cette page se rechargera automatiquement dès la fin du déploiement.</p>
    <div class="footer">Propulsé par Ether Studio</div>
  </div>
</body>
</html>`;
}

// Start primary HTTP server
const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // 1. Internal health check & activity tracking endpoint
    if (pathname === "/api/_health") {
      return Response.json({
        status: "ok",
        lastActive: lastRequestTimestamp,
        uptime: process.uptime(),
        ssrReady,
      });
    }

    // 2. Reject bot vulnerability scanners immediately
    if (isBotScannerProbe(pathname)) {
      return new Response("Not Found", { status: 404 });
    }

    // Update activity timestamp for genuine traffic
    lastRequestTimestamp = Date.now();

    const entry = findEntrypoint();

    // 3. If /app is empty or no build found yet, serve the holding page
    if (!entry) {
      const brand = process.env.TENANT_BRAND_NAME || "Ether Site";
      return new Response(getHoldingPageHtml(brand), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // 4. Fast path: Direct static client assets serving from disk
    if (pathname !== "/" && !pathname.endsWith("/")) {
      const candidatePaths: string[] = [];

      if (entry.type === "nitro") {
        candidatePaths.push(join(APP_DIR, ".output", "public", pathname));
      } else if (entry.type === "sveltekit") {
        candidatePaths.push(join(APP_DIR, "build", "client", pathname));
      } else if (entry.type === "dist") {
        candidatePaths.push(join(APP_DIR, "dist", pathname));
      }

      candidatePaths.push(join(APP_DIR, "public", pathname));
      candidatePaths.push(
        join(APP_DIR, "uploads", pathname.replace(/^\/uploads\//, "")),
      );

      for (const candidate of candidatePaths) {
        if (existsSync(candidate)) {
          try {
            const fileStat = statSync(candidate);
            if (fileStat.isFile()) {
              const resolved = resolve(candidate);
              if (!resolved.startsWith(APP_DIR)) continue;

              const bunFile = Bun.file(candidate);
              const fileHeaders = new Headers({
                "Access-Control-Allow-Origin": "*",
              });
              if (bunFile.type) {
                fileHeaders.set("Content-Type", bunFile.type);
              }

              if (
                pathname.startsWith("/assets/") ||
                pathname.startsWith("/_app/")
              ) {
                fileHeaders.set(
                  "Cache-Control",
                  "public, max-age=31536000, immutable",
                );
              } else {
                fileHeaders.set("Cache-Control", "public, max-age=3600");
              }

              return new Response(bunFile, {
                status: 200,
                headers: fileHeaders,
              });
            }
          } catch {}
        }
      }
    }

    // 5. Static SPA fallback (for Vite / React SPA)
    if (entry.type === "dist") {
      const indexHtml = join(APP_DIR, "dist", "index.html");
      if (existsSync(indexHtml)) {
        return new Response(Bun.file(indexHtml), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      }
    }

    // 6. Dynamic SSR / API Routes
    await ensureSsrServer(entry);

    const targetUrl = `http://127.0.0.1:${INTERNAL_PORT}${pathname}${url.search}`;
    const forwardHeaders = new Headers(req.headers);
    forwardHeaders.set("host", `127.0.0.1:${INTERNAL_PORT}`);
    forwardHeaders.set("accept-encoding", "identity");

    const reqBody =
      req.method !== "GET" && req.method !== "HEAD"
        ? await req.blob()
        : undefined;

    try {
      const ssrRes = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: reqBody,
      });

      const resHeaders = new Headers(ssrRes.headers);
      resHeaders.set("Access-Control-Allow-Origin", "*");
      resHeaders.delete("content-encoding");
      resHeaders.delete("content-length");

      return new Response(ssrRes.body, {
        status: ssrRes.status,
        statusText: ssrRes.statusText,
        headers: resHeaders,
      });
    } catch (err: any) {
      return new Response(
        `Application starting or unavailable: ${err.message}`,
        {
          status: 502,
          headers: { "Retry-After": "1" },
        },
      );
    }
  },
});

console.log(`[Tenant Runner] Universal server listening on 0.0.0.0:${PORT}`);

function shutdown() {
  console.log("[Tenant Runner] Shutting down gracefully...");
  if (ssrProc) {
    try {
      ssrProc.kill();
    } catch {}
  }
  server.stop();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
