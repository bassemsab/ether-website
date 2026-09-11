import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from "fs";
import { join, relative, dirname, resolve } from "path";
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

/**
 * Sanitizes a tenant slug to a safe, valid Linux username (max 24 chars).
 */
export function getTenantUsername(tenantSlug: string): string {
  const sanitized = tenantSlug.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 20);
  return `tenant_${sanitized}`;
}

/**
 * Checks whether runner is executing as root on Linux.
 */
export function isLinuxRoot(): boolean {
  return process.platform === "linux" && typeof process.getuid === "function" && process.getuid() === 0;
}

/**
 * Restricts base directories immediately at startup.
 */
if (isLinuxRoot()) {
  try {
    const profilesDir = join(DATA_DIR, "profiles");
    if (existsSync(profilesDir)) {
      Bun.spawnSync(["chmod", "700", profilesDir]);
      Bun.spawnSync(["chown", "-R", "root:root", profilesDir]);
    }
    const dbFile = join(DATA_DIR, "app.db");
    if (existsSync(dbFile)) {
      Bun.spawnSync(["chmod", "600", dbFile]);
      Bun.spawnSync(["chown", "root:root", dbFile]);
    }
  } catch (err: any) {
    console.warn(`[Security] Startup permission lock warning: ${err.message}`);
  }
}

/**
 * Ensures a dedicated unprivileged Linux system user exists for this tenant,
 * and restricts directory permissions with chmod 700 so that:
 * 1. The tenant user owns and can only access /data/tenants/<tenantSlug>
 * 2. The tenant user CANNOT read /data/profiles, other tenants, or database files
 * 3. Shared binaries (/usr/local/bin/agy, bun, git) remain 100% accessible
 */
export function ensureTenantSystemUser(tenantSlug: string): string {
  const username = getTenantUsername(tenantSlug);

  if (isLinuxRoot()) {
    try {
      const checkUser = Bun.spawnSync(["id", "-u", username]);
      if (checkUser.exitCode !== 0) {
        console.log(`[Security] Provisioning isolated Linux user: ${username}`);
        Bun.spawnSync(["useradd", "-m", "-s", "/bin/bash", username]);
      }

      // Lock down profiles to root:root (mode 700)
      const profilesDir = join(DATA_DIR, "profiles");
      if (existsSync(profilesDir)) {
        Bun.spawnSync(["chmod", "700", profilesDir]);
        Bun.spawnSync(["chown", "-R", "root:root", profilesDir]);
      }

      // Lock down app.db to root:root (mode 600)
      const dbFile = join(DATA_DIR, "app.db");
      if (existsSync(dbFile)) {
        Bun.spawnSync(["chmod", "600", dbFile]);
        Bun.spawnSync(["chown", "root:root", dbFile]);
      }

      // Confine tenant directory to tenant user (mode 700)
      const tenantDir = join(DATA_DIR, "tenants", tenantSlug);
      if (existsSync(tenantDir)) {
        Bun.spawnSync(["chmod", "700", tenantDir]);
        Bun.spawnSync(["chown", "-R", `${username}:${username}`, tenantDir]);
      }
    } catch (err: any) {
      console.error(`[Security] ensureTenantSystemUser error: ${err.message}`);
    }
  }

  return username;
}

/**
 * Ensures an isolated tmux session is running for this tenant.
 * Uses a dedicated tmux UNIX socket inside the tenant directory (/data/tenants/<slug>/tmux.sock),
 * mode 0700, accessible only by this tenant user and root.
 */
export function ensureTenantTmuxSession(tenantSlug: string): {
  active: boolean;
  socketPath: string;
  sessionName: string;
} {
  const username = ensureTenantSystemUser(tenantSlug);
  const tenantDir = join(DATA_DIR, "tenants", tenantSlug);
  const socketPath = join(tenantDir, "tmux.sock");
  const codeDir = join(tenantDir, "code");
  const sessionName = "studio";

  const hasTmux = Boolean(Bun.which("tmux") || existsSync("/usr/bin/tmux"));
  if (!hasTmux) {
    return { active: false, socketPath, sessionName };
  }

  try {
    const isRoot = isLinuxRoot();
    const checkCmd = isRoot
      ? ["runuser", "-u", username, "--", "tmux", "-S", socketPath, "has-session", "-t", sessionName]
      : ["tmux", "-S", socketPath, "has-session", "-t", sessionName];

    const checkProc = Bun.spawnSync(checkCmd);
    if (checkProc.exitCode !== 0) {
      const startCmd = isRoot
        ? ["runuser", "-u", username, "--", "tmux", "-S", socketPath, "new-session", "-d", "-s", sessionName, "-c", codeDir]
        : ["tmux", "-S", socketPath, "new-session", "-d", "-s", sessionName, "-c", codeDir];

      Bun.spawnSync(startCmd);
    }
    return { active: true, socketPath, sessionName };
  } catch (err: any) {
    console.warn(`[Tmux] ensureTenantTmuxSession error: ${err.message}`);
    return { active: false, socketPath, sessionName };
  }
}

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
 * Prepares the tenant codebase directory as a real Git clone or repository with SvelteKit.
 */
function ensureTenantCodebase(
  tenantSlug: string,
  gitRepoUrl?: string,
  gitToken?: string,
): string {
  const codeDir = join(DATA_DIR, "tenants", tenantSlug, "code");
  mkdirSync(codeDir, { recursive: true });

  const gitDir = join(codeDir, ".git");
  if (!existsSync(gitDir)) {
    let cloned = false;
    if (gitRepoUrl && gitToken) {
      let authedUrl = gitRepoUrl;
      try {
        const u = new URL(gitRepoUrl);
        if (process.env.NODE_ENV === "production" && u.hostname === "git.ether.paris") {
          authedUrl = `http://${gitToken}@gitea-http.git.svc.cluster.local:3000${u.pathname}`;
        } else {
          authedUrl = `${u.protocol}//${gitToken}@${u.host}${u.pathname}`;
        }
      } catch {}

      const cloneProc = Bun.spawnSync(["git", "clone", authedUrl, codeDir], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (cloneProc.exitCode === 0) {
        cloned = true;
        Bun.spawnSync(["git", "config", "user.name", "Ether Studio"], { cwd: codeDir });
        Bun.spawnSync(["git", "config", "user.email", "studio@ether.paris"], { cwd: codeDir });
      }
    }

    if (!cloned) {
      Bun.spawnSync(["git", "init"], { cwd: codeDir });
      Bun.spawnSync(["git", "config", "user.name", "Ether Studio"], { cwd: codeDir });
      Bun.spawnSync(["git", "config", "user.email", "studio@ether.paris"], { cwd: codeDir });
      if (gitRepoUrl && gitToken) {
        let authedUrl = gitRepoUrl;
        try {
          const u = new URL(gitRepoUrl);
          if (process.env.NODE_ENV === "production" && u.hostname === "git.ether.paris") {
            authedUrl = `http://${gitToken}@gitea-http.git.svc.cluster.local:3000${u.pathname}`;
          } else {
            authedUrl = `${u.protocol}//${gitToken}@${u.host}${u.pathname}`;
          }
        } catch {}
        Bun.spawnSync(["git", "remote", "add", "origin", authedUrl], { cwd: codeDir });
      }
    }
  }

  // Ensure .gitignore
  const gitignorePath = join(codeDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(
      gitignorePath,
      "node_modules\n.svelte-kit\nbuild\ndist\n.env\n.env.*\n!.env.example\n*.log\n.DS_Store\nThumbs.db\n",
    );
  }

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

  ensureTenantSystemUser(tenantSlug);
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
  const tenantUser = ensureTenantSystemUser(slug);
  const isRoot = isLinuxRoot();
  const port = nextAvailablePort++;

  // Spawn vite dev server under unprivileged tenant user
  const spawnCmd = isRoot
    ? ["runuser", "-u", tenantUser, "--", "bun", "x", "vite", "dev", "--host", "0.0.0.0", "--port", String(port)]
    : ["bun", "x", "vite", "dev", "--host", "0.0.0.0", "--port", String(port)];

  const proc = Bun.spawn(
    spawnCmd,
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
  const tenantUser = ensureTenantSystemUser(slug);
  const isRoot = isLinuxRoot();
  const port = nextAvailableProdPort++;

  const buildIndex = join(codeDir, "build", "index.js");
  if (!existsSync(buildIndex)) {
    const buildCmd = isRoot
      ? ["runuser", "-u", tenantUser, "--", "bun", "run", "build"]
      : ["bun", "run", "build"];
    const buildProc = Bun.spawn(buildCmd, {
      cwd: codeDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    await buildProc.exited;
  }

  const proc = existsSync(buildIndex)
    ? Bun.spawn(
        isRoot
          ? ["runuser", "-u", tenantUser, "--", "bun", "./build/index.js"]
          : ["bun", "./build/index.js"],
        {
          cwd: codeDir,
          env: {
            ...process.env,
            PORT: String(port),
            HOST: "0.0.0.0",
          },
          stdout: "inherit",
          stderr: "inherit",
        },
      )
    : Bun.spawn(
        isRoot
          ? [
              "runuser",
              "-u",
              tenantUser,
              "--",
              "bun",
              "x",
              "vite",
              "dev",
              "--host",
              "0.0.0.0",
              "--port",
              String(port),
            ]
          : [
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

          const resolvedCodeDir = resolve(codeDir);
          const fullPath = resolve(codeDir, relPath);
          if (!fullPath.startsWith(resolvedCodeDir + "/") && fullPath !== resolvedCodeDir) {
            return Response.json(
              { success: false, error: "Accès refusé : chemin en dehors de l'espace de travail du site" },
              { status: 403, headers: corsHeaders },
            );
          }

          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, content, "utf-8");

          if (isLinuxRoot()) {
            const tenantUser = ensureTenantSystemUser(tenantSlug);
            Bun.spawnSync(["chown", `${tenantUser}:${tenantUser}`, fullPath]);
          }

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

    // Git Commit and Push Endpoint
    const gitPushMatch = path.match(/^\/git\/commit-and-push\/([a-zA-Z0-9_-]+)$/);
    if (gitPushMatch && req.method === "POST") {
      const tenantSlug = gitPushMatch[1];
      const codeDir = join(DATA_DIR, "tenants", tenantSlug, "code");
      const tenantUser = ensureTenantSystemUser(tenantSlug);
      const isRoot = isLinuxRoot();

      if (!existsSync(codeDir) || !existsSync(join(codeDir, ".git"))) {
        return Response.json(
          { success: false, error: "Dépôt Git non initialisé pour ce site" },
          { status: 400, headers: corsHeaders },
        );
      }

      try {
        const body = (await req.json().catch(() => ({}))) as any;
        const commitMsg =
          body.message ||
          `Mise à jour via Ether Studio - ${new Date().toISOString()}`;

        const runGit = (gitArgs: string[]) => {
          const cmd = isRoot
            ? ["runuser", "-u", tenantUser, "--", "git", ...gitArgs]
            : ["git", ...gitArgs];
          return Bun.spawnSync(cmd, { cwd: codeDir });
        };

        // Stage all files (respecting .gitignore)
        runGit(["add", "-A"]);

        const statusProc = runGit(["status", "--porcelain"]);
        const statusStr = statusProc.stdout ? statusProc.stdout.toString() : "";
        const hasChanges = statusStr.trim().length > 0;

        let commitOutput = "No changes to commit";
        if (hasChanges) {
          const commitProc = runGit(["commit", "-m", commitMsg]);
          commitOutput =
            (commitProc.stdout ? commitProc.stdout.toString() : "") +
            (commitProc.stderr ? commitProc.stderr.toString() : "");
        }

        // Push to origin main
        const pushProc = runGit(["push", "origin", "main"]);
        const pushOutput =
          (pushProc.stdout ? pushProc.stdout.toString() : "") +
          (pushProc.stderr ? pushProc.stderr.toString() : "");

        return Response.json(
          {
            success: pushProc.exitCode === 0,
            hasChanges,
            commitOutput,
            pushOutput,
            exitCode: pushProc.exitCode,
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

    // Tenant Production Build Endpoint (Triggered when user clicks "Publier")
    const buildMatch = path.match(/^\/build\/([a-zA-Z0-9_-]+)$/);
    if (buildMatch && req.method === "POST") {
      const tenantSlug = buildMatch[1];
      const codeDir = ensureTenantCodebase(tenantSlug);
      const tenantUser = ensureTenantSystemUser(tenantSlug);
      const isRoot = isLinuxRoot();

      try {
        const buildCmd = isRoot
          ? ["runuser", "-u", tenantUser, "--", "bun", "run", "build"]
          : ["bun", "run", "build"];

        const buildProc = Bun.spawn(buildCmd, {
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

    // Tmux Session Endpoints for Isolated Shell / Inspection
    const tmuxStatusMatch = path.match(/^\/tmux\/status\/([a-zA-Z0-9_-]+)$/);
    if (tmuxStatusMatch && req.method === "GET") {
      const tenantSlug = tmuxStatusMatch[1];
      const info = ensureTenantTmuxSession(tenantSlug);
      return Response.json({ success: true, tenant: tenantSlug, ...info }, { headers: corsHeaders });
    }

    const tmuxCaptureMatch = path.match(/^\/tmux\/capture\/([a-zA-Z0-9_-]+)$/);
    if (tmuxCaptureMatch && req.method === "GET") {
      const tenantSlug = tmuxCaptureMatch[1];
      const username = ensureTenantSystemUser(tenantSlug);
      const socketPath = join(DATA_DIR, "tenants", tenantSlug, "tmux.sock");
      ensureTenantTmuxSession(tenantSlug);

      const isRoot = isLinuxRoot();
      const captureCmd = isRoot
        ? ["runuser", "-u", username, "--", "tmux", "-S", socketPath, "capture-pane", "-p", "-t", "studio"]
        : ["tmux", "-S", socketPath, "capture-pane", "-p", "-t", "studio"];

      const proc = Bun.spawnSync(captureCmd);
      const output = proc.stdout ? proc.stdout.toString() : "";
      return Response.json({ success: true, tenant: tenantSlug, output }, { headers: corsHeaders });
    }

    const tmuxExecMatch = path.match(/^\/tmux\/exec\/([a-zA-Z0-9_-]+)$/);
    if (tmuxExecMatch && req.method === "POST") {
      const tenantSlug = tmuxExecMatch[1];
      const username = ensureTenantSystemUser(tenantSlug);
      const socketPath = join(DATA_DIR, "tenants", tenantSlug, "tmux.sock");
      ensureTenantTmuxSession(tenantSlug);

      const body = (await req.json().catch(() => ({}))) as any;
      const command = (body.command || "").trim();

      if (!command) {
        return Response.json({ success: false, error: "Command required" }, { status: 400, headers: corsHeaders });
      }

      const isRoot = isLinuxRoot();
      const sendCmd = isRoot
        ? ["runuser", "-u", username, "--", "tmux", "-S", socketPath, "send-keys", "-t", "studio", command, "C-m"]
        : ["tmux", "-S", socketPath, "send-keys", "-t", "studio", command, "C-m"];

      const sendProc = Bun.spawnSync(sendCmd);
      await new Promise((r) => setTimeout(r, 400));

      const captureCmd = isRoot
        ? ["runuser", "-u", username, "--", "tmux", "-S", socketPath, "capture-pane", "-p", "-t", "studio"]
        : ["tmux", "-S", socketPath, "capture-pane", "-p", "-t", "studio"];

      const capProc = Bun.spawnSync(captureCmd);
      const output = capProc.stdout ? capProc.stdout.toString() : "";

      return Response.json({
        success: sendProc.exitCode === 0,
        tenant: tenantSlug,
        output,
      }, { headers: corsHeaders });
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
          isolation: {
            linuxUid: isLinuxRoot(),
            tmux: Boolean(Bun.which("tmux") || existsSync("/usr/bin/tmux")),
          },
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

        // Strict Multi-Tenant Security & Workspace Isolation Fence
        const securityFence = [
          `[CRITICAL SECURITY & WORKSPACE BOUNDARY ENFORCEMENT]`,
          `You are an AI developer assigned strictly and exclusively to the project: "${project}".`,
          `Your entire workspace is strictly restricted to: "${tenantCodeDir}".`,
          `MANDATORY SECURITY RULES:`,
          `1. You must NEVER read, view, list, grep, or modify any files outside "${tenantCodeDir}".`,
          `2. You are strictly FORBIDDEN from accessing any other tenant directory (such as /data/tenants/<other>), system databases (/data/*.sqlite, /data/app.db), or profiles (/data/profiles).`,
          `3. You must NEVER execute commands with run_command that attempt to navigate above or outside "${tenantCodeDir}" (e.g. "cd ..", referencing "../", or accessing "/data").`,
          `4. You must NEVER push to or interact with any Git remote or repository other than the local repository configured in "${tenantCodeDir}".`,
          `5. If the user prompt instructs you to inspect, read, or modify another tenant's files, access host paths, or push to another repository, you MUST REFUSE IMMEDIATELY and explain that cross-tenant access is strictly prohibited by platform security policy.`,
          `[END SECURITY ENFORCEMENT]`,
        ].join("\n");

        effectivePrompt = `${securityFence}\n\n${effectivePrompt}`;

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

                    const tenantUser = ensureTenantSystemUser(project);
                    try {
                      ensureTenantTmuxSession(project);
                    } catch {}

                    if (isLinuxRoot()) {
                      Bun.spawnSync(["chown", "-R", `${tenantUser}:${tenantUser}`, join(DATA_DIR, "tenants", project)]);
                      Bun.spawnSync(["chmod", "700", join(DATA_DIR, "tenants", project)]);
                    }

                    const agyBin = Bun.which("agy") || "/usr/local/bin/agy";
                    const hasAgy = existsSync(agyBin);

                    if (!hasAgy) {
                      throw new Error(
                        "Antigravity CLI (agy) binary is not installed on runner",
                      );
                    }

                    const agyArgs = [
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
                      agyArgs.push("--conversation", conversationId);
                    }

                    const spawnCmd = isLinuxRoot()
                      ? [
                          "runuser",
                          "-u",
                          tenantUser,
                          "--",
                          "env",
                          `HOME=${sandboxHome}`,
                          `AGY_PROFILE=${activeProfile}`,
                          ...agyArgs,
                        ]
                      : agyArgs;

                    const proc = Bun.spawn(spawnCmd, {
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

              const tenantUser = ensureTenantSystemUser(project);
              try {
                ensureTenantTmuxSession(project);
              } catch {}

              if (isLinuxRoot()) {
                Bun.spawnSync(["chown", "-R", `${tenantUser}:${tenantUser}`, join(DATA_DIR, "tenants", project)]);
                Bun.spawnSync(["chmod", "700", join(DATA_DIR, "tenants", project)]);
              }

              const agyBin = Bun.which("agy") || "/usr/local/bin/agy";
              const hasAgy = existsSync(agyBin);

              if (!hasAgy) {
                throw new Error(
                  "Antigravity CLI (agy) binary is not installed on runner",
                );
              }

              const agyArgs = [
                agyBin,
                "-p",
                effectivePrompt,
                "--add-dir",
                tenantCodeDir,
                "--dangerously-skip-permissions",
              ];
              if (conversationId) {
                agyArgs.push("--conversation", conversationId);
              }

              const spawnCmd = isLinuxRoot()
                ? [
                    "runuser",
                    "-u",
                    tenantUser,
                    "--",
                    "env",
                    `HOME=${sandboxHome}`,
                    `AGY_PROFILE=${activeProfile}`,
                    ...agyArgs,
                  ]
                : agyArgs;

              const proc = Bun.spawn(spawnCmd, {
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
