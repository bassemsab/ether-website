import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from "fs";
import { join, relative, dirname } from "path";
import {
  listStoredProfiles,
  generateAuthUrl,
  exchangeCodeForTokens,
  fetchUserEmail,
  saveProfile,
  createEmptyProfile,
  injectProfileIntoTenantSandbox,
  markProfileThrottled,
  getNextHealthyProfile,
  incrementProfileTurnCount,
} from "./auth-helper";

const PORT = parseInt(process.env.PORT || "8080", 10);
const DATA_DIR =
  process.env.DATA_DIR ||
  (process.platform === "darwin"
    ? join(process.cwd(), ".local-data")
    : "/data");
const MAX_CONCURRENT_TURNS = parseInt(
  process.env.MAX_CONCURRENT_TURNS || "3",
  10,
);

function formatToolStep(toolName: string, params: any, su?: any): string {
  // If the agent framework provided an explicit toolAction / toolSummary, prioritize it
  const explicitSummary =
    params?.toolSummary ||
    params?.toolAction ||
    su?.tool_info?.toolSummary ||
    su?.tool_info?.toolAction ||
    su?.tool_summary;
  if (explicitSummary && typeof explicitSummary === "string") {
    const clean = explicitSummary.trim();
    if (
      clean.length > 0 &&
      clean.length < 60 &&
      !clean.toLowerCase().includes("generic")
    ) {
      return clean;
    }
  }

  if (toolName === "write_to_file") {
    const file = params?.TargetFile
      ? params.TargetFile.split("/").pop()
      : "fichier";
    return `Création de ${file}`;
  }

  if (
    toolName === "replace_file_content" ||
    toolName === "multi_replace_file_content"
  ) {
    const file = params?.TargetFile
      ? params.TargetFile.split("/").pop()
      : "fichier";
    return `Mise à jour de ${file}`;
  }

  if (toolName === "run_command") {
    const cmd = (params?.CommandLine || "").trim();
    if (!cmd) return "Exécution de commande";

    if (cmd.includes("install") || cmd.includes("add")) {
      return "Installation des dépendances";
    }
    if (cmd.includes("build")) {
      return "Compilation du site";
    }
    if (cmd.includes("check") || cmd.includes("tsc")) {
      return "Vérification des types TypeScript";
    }
    if (cmd.includes("dev") || cmd.includes("vite")) {
      return "Démarrage du serveur de prévisualisation";
    }
    if (cmd.startsWith("curl") || cmd.includes("http")) {
      return "Test HTTP de la page";
    }
    if (
      cmd.startsWith("sqlite") ||
      cmd.includes(".sqlite") ||
      cmd.includes("app.db")
    ) {
      return "Initialisation de la base SQLite";
    }
    if (cmd.startsWith("ls") || cmd.startsWith("find")) {
      return "Exploration des dossiers";
    }
    if (
      cmd.startsWith("cat") ||
      cmd.startsWith("head") ||
      cmd.startsWith("tail")
    ) {
      const file = cmd.split(/\s+/).pop()?.split("/").pop();
      return file ? `Consultation de ${file}` : "Consultation des fichiers";
    }
    if (
      cmd.startsWith("mkdir") ||
      cmd.startsWith("cp") ||
      cmd.startsWith("mv")
    ) {
      return "Organisation de l'arborescence";
    }
    if (cmd.startsWith("git")) {
      return "Gestion de version Git";
    }
    const baseCmd = cmd.split(/\s+/)[0];
    return `Exécution : ${baseCmd}`;
  }

  if (
    toolName === "view_file" ||
    toolName === "read_resource" ||
    toolName === "read_url_content"
  ) {
    const file =
      params?.AbsolutePath?.split("/").pop() ||
      params?.Uri?.split("/").pop() ||
      params?.Url ||
      "fichier";
    return `Lecture de ${file}`;
  }

  if (toolName === "list_dir") {
    const dir = params?.DirectoryPath?.split("/").pop();
    return dir ? `Exploration du dossier ${dir}` : "Exploration du projet";
  }

  if (toolName === "find_by_name") {
    const pattern = params?.Pattern || "";
    return pattern
      ? `Recherche de fichier "${pattern}"`
      : "Recherche de fichiers";
  }

  if (toolName === "grep_search") {
    const query = (params?.Query || "").slice(0, 25);
    return query ? `Recherche de "${query}"` : "Recherche dans le code";
  }

  if (toolName === "schedule") {
    return "Planification d'une tâche";
  }

  return "Analyse et préparation...";
}

// Ensure base directories exist
mkdirSync(join(DATA_DIR, "profiles"), { recursive: true });
mkdirSync(join(DATA_DIR, "tenants"), { recursive: true });

// Tenant queue tracking
const tenantLocks = new Map<string, Promise<any>>();
let globalActiveTurns = 0;

/**
 * Executes a function within a per-tenant sequential lock, respecting global concurrency limit.
 */
async function enqueueTenantTurn<T>(
  tenant: string,
  fn: () => Promise<T>,
): Promise<T> {
  while (globalActiveTurns >= MAX_CONCURRENT_TURNS) {
    await new Promise((r) => setTimeout(r, 200));
  }

  const currentLock = tenantLocks.get(tenant) || Promise.resolve();
  let releaseLock: () => void;
  const nextLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  tenantLocks.set(
    tenant,
    currentLock.then(() => nextLock),
  );

  await currentLock;
  globalActiveTurns++;

  try {
    return await fn();
  } finally {
    globalActiveTurns--;
    releaseLock!();
    if (tenantLocks.get(tenant) === nextLock) {
      tenantLocks.delete(tenant);
    }
  }
}

/**
 * Resolves the best initial Google profile for execution.
 */
function resolveInitialProfile(requestedProfile?: string): string {
  const next = getNextHealthyProfile(DATA_DIR, requestedProfile);
  if (next) return next;

  const profiles = listStoredProfiles(DATA_DIR);
  if (profiles.length > 0) return profiles[0].name;

  return "primary";
}

/**
 * Detects if a process output indicates a Google rate limit / quota exhaustion.
 */
function isQuotaError(output: string): boolean {
  const lower = output.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("exhausted resource")
  );
}

/**
 * Prepares the tenant codebase directory with full SvelteKit project structure if empty.
 */
function ensureTenantCodebase(tenantSlug: string): string {
  const codeDir = join(DATA_DIR, "tenants", tenantSlug, "code");
  mkdirSync(codeDir, { recursive: true });

  const pkgJson = join(codeDir, "package.json");
  if (!existsSync(pkgJson)) {
    writeFileSync(
      pkgJson,
      JSON.stringify(
        {
          name: tenantSlug,
          version: "1.0.0",
          private: true,
          dependencies: {
            "@sveltejs/kit": "^2.0.0",
            svelte: "^5.0.0",
            tailwindcss: "^3.4.3",
            "svelte-adapter-bun": "^1.0.1",
          },
          type: "module",
          scripts: {
            dev: "vite dev",
            build: "vite build",
            preview: "vite preview",
          },
        },
        null,
        2,
      ),
    );
  }

  const svelteConfig = join(codeDir, "svelte.config.js");
  if (!existsSync(svelteConfig)) {
    writeFileSync(
      svelteConfig,
      `import adapter from "svelte-adapter-bun";\n\n/** @type {import("@sveltejs/kit").Config} */\nconst config = {\n  kit: {\n    adapter: adapter()\n  }\n};\n\nexport default config;\n`,
    );
  }

  const viteConfig = join(codeDir, "vite.config.js");
  if (!existsSync(viteConfig)) {
    writeFileSync(
      viteConfig,
      `import { sveltekit } from "@sveltejs/kit/vite";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  plugins: [sveltekit()],\n  server: {\n    hmr: false\n  }\n});\n`,
    );
  }

  const srcDir = join(codeDir, "src");
  mkdirSync(srcDir, { recursive: true });

  const appHtml = join(srcDir, "app.html");
  if (!existsSync(appHtml)) {
    writeFileSync(
      appHtml,
      `<!doctype html>\n<html lang="fr">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    %sveltekit.head%\n  </head>\n  <body data-sveltekit-preload-data="hover">\n    <div style="display: contents">%sveltekit.body%</div>\n  </body>\n</html>\n`,
    );
  }

  const appCss = join(srcDir, "app.css");
  if (!existsSync(appCss)) {
    writeFileSync(
      appCss,
      `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`,
    );
  }

  const routesDir = join(srcDir, "routes");
  mkdirSync(routesDir, { recursive: true });

  const layoutSvelte = join(routesDir, "+layout.svelte");
  if (!existsSync(layoutSvelte)) {
    writeFileSync(
      layoutSvelte,
      `<script lang="ts">\n  import "../app.css";\n  let { children } = $props();\n</script>\n\n{@render children()}\n`,
    );
  }

  const pageSvelte = join(routesDir, "+page.svelte");
  if (!existsSync(pageSvelte)) {
    writeFileSync(
      pageSvelte,
      `<script lang="ts">\n  let count = $state(0);\n</script>\n\n<svelte:head>\n  <title>${tenantSlug} — Site Officiel</title>\n</svelte:head>\n\n<main class="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">\n  <div class="max-w-2xl w-full text-center space-y-6">\n    <h1 class="text-4xl font-bold">Bienvenue sur ${tenantSlug}</h1>\n    <p class="text-muted-foreground">Site propulsé par Ether Studio et Svelte 5</p>\n    <button onclick={() => count++} class="px-4 py-2 rounded bg-brand text-white font-medium cursor-pointer">\n      Compteur : {count}\n    </button>\n  </div>\n</main>\n`,
    );
  }

  return codeDir;
}

// Vite Dev Server Management for Tenant Previews
interface DevServerInstance {
  proc: any;
  port: number;
  ready: boolean;
  lastActive: number;
}
const tenantDevServers = new Map<string, DevServerInstance>();
let nextAvailablePort = 5200;

async function getOrLaunchTenantDevServer(slug: string): Promise<number> {
  const existing = tenantDevServers.get(slug);
  if (existing && !existing.proc.killed) {
    existing.lastActive = Date.now();
    return existing.port;
  }

  const codeDir = ensureTenantCodebase(slug);
  const port = nextAvailablePort++;

  // Spawn vite dev server
  const proc = Bun.spawn(
    ["bun", "x", "vite", "dev", "--host", "0.0.0.0", "--port", String(port)],
    {
      cwd: codeDir,
      env: {
        ...process.env,
        PORT: String(port),
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  const instance: DevServerInstance = {
    proc,
    port,
    ready: false,
    lastActive: Date.now(),
  };
  tenantDevServers.set(slug, instance);

  // Poll for ready state
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const ping = await fetch(`http://127.0.0.1:${port}`);
      if (ping.status < 500) {
        instance.ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }

  return port;
}

// Production Server Management for Published Tenants
const tenantProdServers = new Map<string, DevServerInstance>();
let nextAvailableProdPort = 5400;

async function getOrLaunchTenantProdServer(slug: string): Promise<number> {
  const existing = tenantProdServers.get(slug);
  if (existing && !existing.proc.killed) {
    existing.lastActive = Date.now();
    return existing.port;
  }

  const codeDir = ensureTenantCodebase(slug);
  const port = nextAvailableProdPort++;

  const buildIndex = join(codeDir, "build", "index.js");
  if (!existsSync(buildIndex)) {
    const buildProc = Bun.spawn(["bun", "run", "build"], {
      cwd: codeDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    await buildProc.exited;
  }

  const proc = existsSync(buildIndex)
    ? Bun.spawn(["bun", "./build/index.js"], {
        cwd: codeDir,
        env: {
          ...process.env,
          PORT: String(port),
          HOST: "0.0.0.0",
        },
        stdout: "inherit",
        stderr: "inherit",
      })
    : Bun.spawn(
        [
          "bun",
          "x",
          "vite",
          "dev",
          "--host",
          "0.0.0.0",
          "--port",
          String(port),
        ],
        {
          cwd: codeDir,
          env: {
            ...process.env,
            PORT: String(port),
          },
          stdout: "inherit",
          stderr: "inherit",
        },
      );

  const instance: DevServerInstance = {
    proc,
    port,
    ready: false,
    lastActive: Date.now(),
  };
  tenantProdServers.set(slug, instance);

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const ping = await fetch(`http://127.0.0.1:${port}`);
      if (ping.status < 500) {
        instance.ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }

  return port;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Tenant Vite Dev Server Reverse Proxy
    const devMatch = path.match(/^\/(?:dev|preview)\/([a-zA-Z0-9_-]+)(\/.*)?$/);
    if (devMatch) {
      const tenantSlug = devMatch[1];
      const subPath = (devMatch[2] || "/") + url.search;

      try {
        const devPort = await getOrLaunchTenantDevServer(tenantSlug);
        const targetUrl = `http://127.0.0.1:${devPort}${subPath}`;

        const reqHeaders = new Headers(req.headers);
        reqHeaders.set("host", `127.0.0.1:${devPort}`);

        const bodyData =
          req.method !== "GET" && req.method !== "HEAD"
            ? await req.blob()
            : undefined;

        const proxyRes = await fetch(targetUrl, {
          method: req.method,
          headers: reqHeaders,
          body: bodyData,
        });

        const resHeaders = new Headers(proxyRes.headers);
        resHeaders.set("Access-Control-Allow-Origin", "*");
        resHeaders.delete("X-Frame-Options");
        resHeaders.delete("Content-Security-Policy");

        return new Response(proxyRes.body, {
          status: proxyRes.status,
          statusText: proxyRes.statusText,
          headers: resHeaders,
        });
      } catch (err: any) {
        return new Response(`Dev server proxy error: ${err.message}`, {
          status: 502,
          headers: corsHeaders,
        });
      }
    }

    // Tenant Production Server Reverse Proxy (for Published Sites)
    const prodMatch = path.match(/^\/prod\/([a-zA-Z0-9_-]+)(\/.*)?$/);
    if (prodMatch) {
      const tenantSlug = prodMatch[1];
      const subPath = (prodMatch[2] || "/") + url.search;

      try {
        const prodPort = await getOrLaunchTenantProdServer(tenantSlug);
        const targetUrl = `http://127.0.0.1:${prodPort}${subPath}`;

        const reqHeaders = new Headers(req.headers);
        reqHeaders.set("host", `127.0.0.1:${prodPort}`);

        const bodyData =
          req.method !== "GET" && req.method !== "HEAD"
            ? await req.blob()
            : undefined;

        const proxyRes = await fetch(targetUrl, {
          method: req.method,
          headers: reqHeaders,
          body: bodyData,
        });

        const resHeaders = new Headers(proxyRes.headers);
        resHeaders.set("Access-Control-Allow-Origin", "*");
        resHeaders.delete("X-Frame-Options");
        resHeaders.delete("Content-Security-Policy");

        return new Response(proxyRes.body, {
          status: proxyRes.status,
          statusText: proxyRes.statusText,
          headers: resHeaders,
        });
      } catch (err: any) {
        return new Response(`Production server proxy error: ${err.message}`, {
          status: 502,
          headers: corsHeaders,
        });
      }
    }

    // Tenant Files Listing & Saving Endpoint (Single source of truth)
    const filesMatch = path.match(/^\/files\/([a-zA-Z0-9_-]+)$/);
    if (filesMatch) {
      const tenantSlug = filesMatch[1];
      const codeDir = ensureTenantCodebase(tenantSlug);

      if (req.method === "GET") {
        const files: Record<string, any> = {};
        const ignoredDirs = new Set([
          "node_modules",
          ".svelte-kit",
          ".git",
          ".gemini",
          ".gemini-sandbox",
          "dist",
          "build",
        ]);
        const ignoredFiles = new Set(["bun.lock", ".DS_Store", "thumbs.db"]);

        function scan(dir: string) {
          if (!existsSync(dir)) return;
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              if (!ignoredDirs.has(entry.name) && !entry.name.startsWith(".")) {
                scan(fullPath);
              }
            } else if (entry.isFile()) {
              if (ignoredFiles.has(entry.name) || entry.name.startsWith("."))
                continue;
              const rel = relative(codeDir, fullPath).replace(/\\/g, "/");
              let lang = "html";
              if (
                rel.endsWith(".ts") ||
                rel.endsWith(".js") ||
                rel.endsWith(".mjs")
              )
                lang = "typescript";
              else if (rel.endsWith(".json")) lang = "json";

              try {
                const stat = statSync(fullPath);
                if (stat.size <= 500 * 1024) {
                  files[rel] = {
                    name: entry.name,
                    path: rel,
                    lang,
                    content: readFileSync(fullPath, "utf-8"),
                    size: stat.size,
                  };
                }
              } catch {}
            }
          }
        }
        scan(codeDir);

        return Response.json(
          { success: true, projectSlug: tenantSlug, files },
          { headers: corsHeaders },
        );
      }

      if (req.method === "POST") {
        try {
          const body = await req.json();
          const relPath = (body.path || "").trim().replace(/^\/+/, "");
          const content = typeof body.content === "string" ? body.content : "";

          if (!relPath) {
            return Response.json(
              { success: false, error: "Chemin de fichier requis" },
              { status: 400, headers: corsHeaders },
            );
          }

          const fullPath = join(codeDir, relPath);
          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, content, "utf-8");

          return Response.json(
            { success: true, projectSlug: tenantSlug, path: relPath },
            { headers: corsHeaders },
          );
        } catch (err: any) {
          return Response.json(
            { success: false, error: err.message },
            { status: 500, headers: corsHeaders },
          );
        }
      }
    }

    // Tenant Production Build Endpoint (Triggered when user clicks "Publier")
    const buildMatch = path.match(/^\/build\/([a-zA-Z0-9_-]+)$/);
    if (buildMatch && req.method === "POST") {
      const tenantSlug = buildMatch[1];
      const codeDir = ensureTenantCodebase(tenantSlug);

      try {
        const buildProc = Bun.spawn(["bun", "run", "build"], {
          cwd: codeDir,
          env: {
            ...process.env,
            NODE_ENV: "production",
          },
          stdout: "pipe",
          stderr: "pipe",
        });

        const [stdout, stderr] = await Promise.all([
          new Response(buildProc.stdout).text(),
          new Response(buildProc.stderr).text(),
        ]);
        const exitCode = await buildProc.exited;

        // If a production server is currently running, restart it to load the new build
        const existingProd = tenantProdServers.get(tenantSlug);
        if (existingProd && !existingProd.proc.killed) {
          try {
            existingProd.proc.kill();
          } catch {}
          tenantProdServers.delete(tenantSlug);
          await getOrLaunchTenantProdServer(tenantSlug);
        }

        return Response.json(
          {
            success: exitCode === 0,
            exitCode,
            stdout,
            stderr,
          },
          { headers: corsHeaders },
        );
      } catch (err: any) {
        return Response.json(
          { success: false, error: err.message },
          { status: 500, headers: corsHeaders },
        );
      }
    }
    if (path === "/health" && req.method === "GET") {
      const profiles = listStoredProfiles(DATA_DIR);
      return Response.json(
        {
          status: "ok",
          uptime: process.uptime(),
          activeTurns: globalActiveTurns,
          maxConcurrent: MAX_CONCURRENT_TURNS,
          profilesCount: profiles.length,
          profiles,
        },
        { headers: corsHeaders },
      );
    }

    // List Profiles with Quota Telemetry
    if (path === "/profiles" && req.method === "GET") {
      const profiles = listStoredProfiles(DATA_DIR);
      return Response.json(
        { success: true, profiles },
        { headers: corsHeaders },
      );
    }

    // Create New Profile Slot (e.g. profile-3, profile-4)
    if (path === "/profiles/create" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const profile = (body.profile || `profile-${Date.now()}`).trim();
        createEmptyProfile(DATA_DIR, profile);

        const authUrl = generateAuthUrl(DATA_DIR, profile, body.clientId);
        return Response.json(
          { success: true, profile, authUrl },
          { headers: corsHeaders },
        );
      } catch (err: any) {
        return Response.json(
          { success: false, error: err.message },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    // Start OAuth Flow (Generates Authorization URL with PKCE)
    if (path === "/auth/start" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const profile = (body.profile || "primary").trim();
        const authUrl = generateAuthUrl(DATA_DIR, profile, body.clientId);
        return Response.json(
          { success: true, profile, authUrl },
          { headers: corsHeaders },
        );
      } catch (err: any) {
        return Response.json(
          { success: false, error: err.message },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    // Finish OAuth Flow (Exchanges Code for Tokens & Saves Profile)
    if (path === "/auth/finish" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const profile = (body.profile || "primary").trim();
        const code = (body.code || "").trim();

        if (!code) {
          return Response.json(
            { success: false, error: "Authorization code is required" },
            { status: 400, headers: corsHeaders },
          );
        }

        const tokenPayload = await exchangeCodeForTokens(
          DATA_DIR,
          code,
          profile,
          body.clientId,
          body.clientSecret,
        );
        const email = await fetchUserEmail(tokenPayload.access_token);
        saveProfile(DATA_DIR, profile, tokenPayload, email);

        return Response.json(
          {
            success: true,
            profile,
            email,
            expiry: tokenPayload.expiry,
          },
          { headers: corsHeaders },
        );
      } catch (err: any) {
        return Response.json(
          { success: false, error: err.message },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    // Import / Direct Save Profile Tokens
    if (path === "/profiles/import" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const profile = (body.profile || "primary").trim();
        const tokenData = body.tokenData;
        const email = body.email;

        if (!tokenData || !tokenData.access_token) {
          return Response.json(
            { success: false, error: "Valid tokenData is required" },
            { status: 400, headers: corsHeaders },
          );
        }

        saveProfile(DATA_DIR, profile, tokenData, email);
        return Response.json(
          {
            success: true,
            profile,
            message: `Profile ${profile} imported successfully`,
          },
          { headers: corsHeaders },
        );
      } catch (err: any) {
        return Response.json(
          { success: false, error: err.message },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    // Prompt Turn Execution with Transparent Auto-Failover
    if (path === "/prompt" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const project = (body.project || "tester").trim();
        const prompt = (body.prompt || "").trim();
        const image = body.image as
          | { name: string; type: string; base64: string }
          | undefined;
        const requestedProfile = body.profile;
        const conversationId = body.conversationId;
        const isStream =
          body.stream === true ||
          req.headers.get("accept") === "text/event-stream";

        if (!prompt && !image) {
          return Response.json(
            { success: false, error: "Prompt or image is required" },
            { status: 400, headers: corsHeaders },
          );
        }

        const tenantCodeDir = ensureTenantCodebase(project);
        const triedProfiles: string[] = [];

        // If an image was attached, decode and save it into static/uploads/
        let savedImagePath = "";
        let savedImageUrl = "";
        if (image && image.base64) {
          try {
            const uploadsDir = join(tenantCodeDir, "static", "uploads");
            mkdirSync(uploadsDir, { recursive: true });

            let ext = "png";
            if (image.name && image.name.includes(".")) {
              ext =
                image.name
                  .split(".")
                  .pop()!
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, "") || "png";
            } else if (image.type) {
              const sub = image.type.split("/")[1];
              if (sub)
                ext = sub.replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
            }

            const cleanBase = (
              image.name ? image.name.replace(/\.[^/.]+$/, "") : "image"
            )
              .toLowerCase()
              .replace(/[^a-z0-9_-]/g, "_")
              .slice(0, 30);
            const fileName = `${cleanBase || "upload"}_${Date.now()}.${ext}`;
            const targetFile = join(uploadsDir, fileName);

            const cleanBase64 = image.base64.replace(/^data:[^;]+;base64,/, "");
            const buffer = Buffer.from(cleanBase64, "base64");
            writeFileSync(targetFile, buffer);

            savedImagePath = targetFile;
            savedImageUrl = `/uploads/${fileName}`;
            console.log(
              `[Runner] Saved uploaded image to ${targetFile} (Public URL: ${savedImageUrl})`,
            );
          } catch (imgErr: any) {
            console.error(
              `[Runner] Failed to save attached image: ${imgErr.message}`,
            );
          }
        }

        let effectivePrompt = prompt;
        if (savedImagePath) {
          const imageInstructions = [
            `[User Attached Image]`,
            `File Path on disk: ${savedImagePath}`,
            `Web Public Path: ${savedImageUrl}`,
            `Instructions: The user attached an image for this task. You can inspect this image file directly using the view_file tool with "${savedImagePath}". If you need to display or reference this image on the website (e.g. in Svelte components or HTML), reference it via its public URL path "${savedImageUrl}" (e.g. <img src="${savedImageUrl}" alt="..." />).`,
            prompt
              ? `\nUser Message: ${prompt}`
              : `\nUser Message: Please inspect and incorporate or act on this attached image.`,
          ].join("\n");
          effectivePrompt = imageInstructions;
        }

        // Execute turn within per-tenant sequential queue
        if (isStream) {
          // SSE Stream with transparent quota retry
          const stream = new ReadableStream({
            async start(controller) {
              const sendEvent = (event: string, data: any) => {
                const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(new TextEncoder().encode(payload));
              };

              try {
                await enqueueTenantTurn(project, async () => {
                  let activeProfile = resolveInitialProfile(requestedProfile);
                  let success = false;
                  let attemptCount = 0;
                  const maxAttempts = 3;

                  while (!success && attemptCount < maxAttempts) {
                    attemptCount++;
                    triedProfiles.push(activeProfile);

                    // Prepare tenant sandbox with Google credentials
                    let sandboxHome = join(
                      DATA_DIR,
                      "tenants",
                      project,
                      ".gemini-sandbox",
                    );
                    try {
                      sandboxHome = injectProfileIntoTenantSandbox(
                        DATA_DIR,
                        activeProfile,
                        project,
                      );
                    } catch (e: any) {
                      console.error(
                        `[Runner] Sandbox injection error: ${e.message}`,
                      );
                      mkdirSync(
                        join(sandboxHome, ".gemini", "antigravity-cli"),
                        { recursive: true },
                      );
                    }

                    const agyBin = Bun.which("agy") || "/usr/local/bin/agy";
                    const hasAgy = existsSync(agyBin);

                    if (!hasAgy) {
                      throw new Error(
                        "Antigravity CLI (agy) binary is not installed on runner",
                      );
                    }

                    const args = [
                      agyBin,
                      "-p",
                      effectivePrompt,
                      "--add-dir",
                      tenantCodeDir,
                      "--output-format",
                      "stream-json",
                      "--dangerously-skip-permissions",
                    ];
                    if (conversationId) {
                      args.push("--conversation", conversationId);
                    }

                    const proc = Bun.spawn(args, {
                      cwd: tenantCodeDir,
                      env: {
                        ...process.env,
                        HOME: sandboxHome,
                        AGY_PROFILE: activeProfile,
                      },
                      stdout: "pipe",
                      stderr: "pipe",
                    });

                    // Send keepalive comment every 3s so browser / reverse proxy never drops connection
                    const keepaliveInterval = setInterval(() => {
                      try {
                        controller.enqueue(
                          new TextEncoder().encode(": keepalive\n\n"),
                        );
                      } catch (e) {}
                    }, 3000);

                    const reader = proc.stdout.getReader();
                    const decoder = new TextDecoder();
                    let fullOutput = "";
                    let lineBuffer = "";
                    let capturedConvId = conversationId;

                    try {
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunkStr = decoder.decode(value);
                        lineBuffer += chunkStr;
                        const lines = lineBuffer.split("\n");
                        lineBuffer = lines.pop() || "";

                        for (const rawLine of lines) {
                          const line = rawLine.trim();
                          if (!line) continue;
                          try {
                            const parsed = JSON.parse(line);
                            if (
                              parsed.event === "init" &&
                              parsed.conversation_id
                            ) {
                              capturedConvId = parsed.conversation_id;
                            } else if (parsed.event === "step_update") {
                              const su = parsed.step_update;
                              if (
                                su.step_type === "tool" &&
                                su.state === "ACTIVE"
                              ) {
                                const toolName =
                                  su.tool_name ||
                                  su.tool_info?.name ||
                                  "action";
                                const friendlyMsg = formatToolStep(
                                  toolName,
                                  su.tool_info?.parameters,
                                  su,
                                );
                                sendEvent("step", {
                                  id: su.step_index,
                                  name: friendlyMsg,
                                  state: "running",
                                });
                              } else if (
                                su.step_type === "tool" &&
                                (su.state === "DONE" || su.state === "ERROR")
                              ) {
                                sendEvent("step", {
                                  id: su.step_index,
                                  state: "completed",
                                });
                              } else if (
                                su.step_type === "agent_response" &&
                                su.text_delta
                              ) {
                                fullOutput += su.text_delta;
                                sendEvent("chunk", { text: su.text_delta });
                              }
                            } else if (parsed.event === "result") {
                              if (parsed.result?.response && !fullOutput) {
                                fullOutput = parsed.result.response;
                                sendEvent("chunk", { text: fullOutput });
                              }
                            }
                          } catch {
                            // Plain text or unexpected non-JSON output
                            fullOutput += line + "\n";
                            sendEvent("chunk", { text: line + "\n" });
                          }
                        }
                      }
                    } finally {
                      clearInterval(keepaliveInterval);
                    }

                    const stderrText = await new Response(proc.stderr).text();
                    await proc.exited;

                    const combinedOutput = `${fullOutput} ${stderrText}`;

                    if (proc.exitCode !== 0 && isQuotaError(combinedOutput)) {
                      console.warn(
                        `[Runner] Quota limit detected on profile [${activeProfile}]. Auto-failing over...`,
                      );
                      markProfileThrottled(activeProfile);

                      const nextProfile = getNextHealthyProfile(
                        DATA_DIR,
                        undefined,
                        triedProfiles,
                      );
                      if (nextProfile) {
                        activeProfile = nextProfile;
                        continue; // Retry with next profile
                      }
                    }

                    success = proc.exitCode === 0;
                    if (success) {
                      incrementProfileTurnCount(activeProfile);
                    } else if (!fullOutput && stderrText) {
                      sendEvent("chunk", {
                        text: `\n⚠️ Erreur: ${stderrText.trim()}`,
                      });
                    }

                    sendEvent("done", {
                      success,
                      profileUsed: activeProfile,
                      conversationId:
                        capturedConvId ||
                        conversationId ||
                        `conv_${Date.now()}`,
                      exitCode: proc.exitCode,
                      savedImageUrl: savedImageUrl || undefined,
                    });
                  }
                });
              } catch (turnErr: any) {
                sendEvent("error", { error: turnErr.message });
              } finally {
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              ...corsHeaders,
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        } else {
          // Standard JSON request/response with automatic failover retry
          const result = await enqueueTenantTurn(project, async () => {
            let activeProfile = resolveInitialProfile(requestedProfile);
            let attemptCount = 0;
            const maxAttempts = 3;

            while (attemptCount < maxAttempts) {
              attemptCount++;
              triedProfiles.push(activeProfile);

              let sandboxHome = join(
                DATA_DIR,
                "tenants",
                project,
                ".gemini-sandbox",
              );
              try {
                sandboxHome = injectProfileIntoTenantSandbox(
                  DATA_DIR,
                  activeProfile,
                  project,
                );
              } catch (e: any) {
                console.error(`[Runner] Sandbox injection error: ${e.message}`);
                mkdirSync(join(sandboxHome, ".gemini", "antigravity-cli"), {
                  recursive: true,
                });
              }

              const agyBin = Bun.which("agy") || "/usr/local/bin/agy";
              const hasAgy = existsSync(agyBin);

              if (!hasAgy) {
                throw new Error(
                  "Antigravity CLI (agy) binary is not installed on runner",
                );
              }

              const args = [
                agyBin,
                "-p",
                effectivePrompt,
                "--add-dir",
                tenantCodeDir,
                "--dangerously-skip-permissions",
              ];
              if (conversationId) {
                args.push("--conversation", conversationId);
              }

              const proc = Bun.spawn(args, {
                cwd: tenantCodeDir,
                env: {
                  ...process.env,
                  HOME: sandboxHome,
                  AGY_PROFILE: activeProfile,
                },
                stdout: "pipe",
                stderr: "pipe",
              });

              const stdout = await new Response(proc.stdout).text();
              const stderr = await new Response(proc.stderr).text();
              await proc.exited;

              const combinedOutput = `${stdout} ${stderr}`;

              if (proc.exitCode !== 0 && isQuotaError(combinedOutput)) {
                console.warn(
                  `[Runner] Quota limit detected on profile [${activeProfile}]. Auto-failing over...`,
                );
                markProfileThrottled(activeProfile);

                const nextProfile = getNextHealthyProfile(
                  DATA_DIR,
                  undefined,
                  triedProfiles,
                );
                if (nextProfile) {
                  activeProfile = nextProfile;
                  continue; // Retry with next profile
                }
              }

              const success = proc.exitCode === 0;
              if (success) {
                incrementProfileTurnCount(activeProfile);
              }

              return {
                success,
                response: stdout || stderr,
                profileUsed: activeProfile,
                conversationId: conversationId || `conv_${Date.now()}`,
                exitCode: proc.exitCode,
                savedImageUrl: savedImageUrl || undefined,
              };
            }

            return {
              success: false,
              response:
                "All configured Google profiles have reached their quota limits.",
              profileUsed: activeProfile,
              conversationId: conversationId || `conv_${Date.now()}`,
              exitCode: -1,
            };
          });

          return Response.json(result, { headers: corsHeaders });
        }
      } catch (err: any) {
        return Response.json(
          { success: false, error: err.message },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});

console.log(`🤖 Ether Agent Runner Server started on port ${PORT}`);
