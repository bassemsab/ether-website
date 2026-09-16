import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
  symlinkSync,
} from "fs";
import { join, relative, dirname, resolve } from "path";
import { Database } from "bun:sqlite";
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

const SQLITE_EXTENSIONS = new Set(["db", "sqlite", "sqlite3"]);
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "svg",
]);
const MEDIA_EXTENSIONS = new Set(["mp4", "webm", "ogg", "mp3", "wav", "m4a"]);
const OTHER_BINARY_EXTENSIONS = new Set([
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  "wasm",
  "pdf",
  "zip",
  "tar",
  "gz",
  "rar",
  "7z",
  "iso",
  "bin",
  "exe",
  "so",
  "dylib",
  "dll",
]);

function getFileCategory(
  filename: string,
): "code" | "sqlite" | "image" | "media" | "binary" {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (SQLITE_EXTENSIONS.has(ext)) return "sqlite";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (MEDIA_EXTENSIONS.has(ext)) return "media";
  if (OTHER_BINARY_EXTENSIONS.has(ext)) return "binary";
  return "code";
}

function isBinaryFile(filename: string): boolean {
  const cat = getFileCategory(filename);
  if (cat === "image" && filename.toLowerCase().endsWith(".svg")) return false;
  return cat !== "code";
}

function getImageMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "ico":
      return "image/x-icon";
    case "bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

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
  const sanitized = tenantSlug
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 20);
  return `tenant_${sanitized}`;
}

/**
 * Checks whether runner is executing as root on Linux.
 */
export function isLinuxRoot(): boolean {
  return (
    process.platform === "linux" &&
    typeof process.getuid === "function" &&
    process.getuid() === 0
  );
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
      ? [
          "runuser",
          "-u",
          username,
          "--",
          "tmux",
          "-S",
          socketPath,
          "has-session",
          "-t",
          sessionName,
        ]
      : ["tmux", "-S", socketPath, "has-session", "-t", sessionName];

    const checkProc = Bun.spawnSync(checkCmd);
    if (checkProc.exitCode !== 0) {
      const startCmd = isRoot
        ? [
            "runuser",
            "-u",
            username,
            "--",
            "tmux",
            "-S",
            socketPath,
            "new-session",
            "-d",
            "-s",
            sessionName,
            "-c",
            codeDir,
          ]
        : [
            "tmux",
            "-S",
            socketPath,
            "new-session",
            "-d",
            "-s",
            sessionName,
            "-c",
            codeDir,
          ];

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
  // 1. If requestedProfile was explicitly provided and is healthy, use it
  if (requestedProfile) {
    const requestedMatch = getNextHealthyProfile(DATA_DIR, requestedProfile);
    if (requestedMatch) return requestedMatch;
  }

  // 2. Prioritize primary profile if healthy, then any other healthy profile
  const primaryOrHealthy = getNextHealthyProfile(DATA_DIR, "primary");
  if (primaryOrHealthy) return primaryOrHealthy;

  // 3. Fall back to sorted list of profiles (with primary first)
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
    lower.includes("exhausted resource") ||
    lower.includes("individual quota reached")
  );
}

/**
 * Resolves tenant Git clone credentials from database or Gitea cluster API if missing.
 */
async function resolveTenantGitCredentials(
  tenantSlug: string,
  gitRepoUrl?: string,
  gitToken?: string,
): Promise<{ gitRepoUrl?: string; gitToken?: string }> {
  if (gitRepoUrl && gitToken) {
    return { gitRepoUrl, gitToken };
  }

  // 1. Check local/mounted SQLite database
  const dbPaths = [
    process.env.DB_PATH,
    join(DATA_DIR, "visitors.sqlite"),
    "/data/visitors.sqlite",
  ].filter(Boolean) as string[];

  for (const dbPath of dbPaths) {
    if (existsSync(dbPath)) {
      try {
        const db = new Database(dbPath, { readonly: true });
        const row = db
          .query(
            "SELECT git_repo_url, git_access_token FROM tenants WHERE slug = ?",
          )
          .get(tenantSlug) as any;
        db.close();
        if (row?.git_repo_url) {
          return {
            gitRepoUrl: gitRepoUrl || row.git_repo_url,
            gitToken:
              gitToken ||
              row.git_access_token ||
              process.env.GITEA_ADMIN_TOKEN ||
              "6ef87fd9ad70970b5ab87bfe0c5dad0abdea75fe",
          };
        }
      } catch {}
    }
  }

  // 2. Query Gitea API directly inside cluster
  const giteaAdminToken =
    process.env.GITEA_ADMIN_TOKEN || "6ef87fd9ad70970b5ab87bfe0c5dad0abdea75fe";
  const giteaApiUrl =
    process.env.GITEA_API_URL ||
    (process.env.NODE_ENV === "production"
      ? "http://gitea-http.git.svc.cluster.local:3000/api/v1"
      : "https://git.ether.paris/api/v1");

  try {
    const res = await fetch(
      `${giteaApiUrl}/repos/search?q=${encodeURIComponent(tenantSlug)}`,
      {
        headers: { Authorization: `token ${giteaAdminToken}` },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (res.ok) {
      const data = (await res.json()) as any;
      const repo = data?.data?.find(
        (r: any) => r.name.toLowerCase() === tenantSlug.toLowerCase(),
      );
      if (repo?.clone_url) {
        return {
          gitRepoUrl: gitRepoUrl || repo.clone_url,
          gitToken: gitToken || giteaAdminToken,
        };
      }
    }
  } catch {}

  return { gitRepoUrl, gitToken };
}

/**
 * Safely executes a Git command inside a tenant's codebase repository.
 * Handles safe.directory and unprivileged tenant user ownership when running as root.
 */
function runTenantGit(
  tenantSlug: string,
  gitArgs: string[],
): { exitCode: number; stdout: string; stderr: string } {
  const codeDir = join(DATA_DIR, "tenants", tenantSlug, "code");
  const tenantUser = ensureTenantSystemUser(tenantSlug);
  const isRoot = isLinuxRoot();
  const fullGitArgs = ["-c", "safe.directory=*", ...gitArgs];
  const cmd = isRoot
    ? ["runuser", "-u", tenantUser, "--", "git", ...fullGitArgs]
    : ["git", ...fullGitArgs];

  const proc = Bun.spawnSync(cmd, { cwd: codeDir });
  return {
    exitCode: proc.exitCode,
    stdout: (proc.stdout ? proc.stdout.toString() : "").trim(),
    stderr: (proc.stderr ? proc.stderr.toString() : "").trim(),
  };
}

/**
 * Ensures the tenant's vite.config.js/ts exists and has robust HMR and watch ignore rules
 * to prevent unnecessary full-reloads when databases, git objects, or logs change.
 */
function ensureTenantViteConfig(codeDir: string) {
  const viteConfigJs = join(codeDir, "vite.config.js");
  const viteConfigTs = join(codeDir, "vite.config.ts");
  const targetConfig = existsSync(viteConfigTs) ? viteConfigTs : viteConfigJs;

  const standardConfig = `import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    watch: {
      ignored: [
        "**/.git/**",
        "**/.svelte-kit/**",
        "**/build/**",
        "**/node_modules/**",
        "**/*.db*",
        "**/*.sqlite*",
        "**/*.sqlite3*",
        "**/*.log",
        "**/bun.lock*",
        "**/.env*"
      ]
    },
    hmr: {
      overlay: false
    }
  }
});
`;

  if (!existsSync(targetConfig)) {
    writeFileSync(targetConfig, standardConfig);
    return true;
  }

  try {
    const content = readFileSync(targetConfig, "utf-8");
    if (
      !content.includes("ignored:") ||
      content.includes("clientPort: 443") ||
      content.includes("usePolling: true") ||
      !content.includes("**/*.db*") ||
      !content.includes("**/bun.lock*") ||
      content.includes("hmr: false") ||
      !content.includes("overlay: false")
    ) {
      writeFileSync(targetConfig, standardConfig);
      return true;
    }
  } catch {}
  return false;
}

/**
 * Ensures the central shared template node_modules exists so all tenants can share dependencies.
 */
function ensureSharedTemplate(): string {
  const sharedDir = join(DATA_DIR, "shared_template");
  if (!existsSync(sharedDir)) {
    mkdirSync(sharedDir, { recursive: true });
  }
  const sharedPkg = join(sharedDir, "package.json");
  if (!existsSync(sharedPkg)) {
    writeFileSync(
      sharedPkg,
      JSON.stringify(
        {
          name: "shared-template",
          version: "1.0.0",
          private: true,
          dependencies: {
            "@sveltejs/kit": "^2.0.0",
            "@sveltejs/vite-plugin-svelte": "^4.0.0",
            svelte: "^5.0.0",
            tailwindcss: "^3.4.3",
            "svelte-adapter-bun": "^1.0.1",
            vite: "^5.0.0",
            "lucide-svelte": "^0.475.0",
          },
          type: "module",
        },
        null,
        2,
      ),
    );
  }
  const sharedModulesKit = join(sharedDir, "node_modules", "@sveltejs", "kit");
  if (!existsSync(sharedModulesKit)) {
    console.log("[Runner] Installing base packages in shared template...");
    Bun.spawnSync(["bun", "install"], { cwd: sharedDir });
    if (isLinuxRoot()) {
      Bun.spawnSync(["chmod", "-R", "a+rX", sharedDir]);
    }
  }
  return sharedDir;
}

/**
 * Links shared template node_modules into a tenant code directory, saving ~110MB per tenant.
 */
function ensureTenantSharedDependencies(codeDir: string, tenantUser: string) {
  try {
    const sharedDir = ensureSharedTemplate();
    const sharedModules = join(sharedDir, "node_modules");
    if (!existsSync(sharedModules)) return;

    const tenantModules = join(codeDir, "node_modules");
    if (!existsSync(tenantModules)) {
      mkdirSync(tenantModules, { recursive: true });
    }

    const items = readdirSync(sharedModules);
    for (const item of items) {
      const src = join(sharedModules, item);
      const dest = join(tenantModules, item);
      if (!existsSync(dest)) {
        try {
          symlinkSync(src, dest);
        } catch {}
      }
    }
    const srcBin = join(sharedModules, ".bin");
    const destBin = join(tenantModules, ".bin");
    if (existsSync(srcBin) && !existsSync(destBin)) {
      try {
        symlinkSync(srcBin, destBin);
      } catch {}
    }

    if (isLinuxRoot()) {
      Bun.spawnSync(["chown", "-hR", `${tenantUser}:${tenantUser}`, tenantModules]);
    }
  } catch (e: any) {
    console.warn("[Runner] Shared dependencies link fallback:", e.message);
    const installCmd = isLinuxRoot()
      ? ["runuser", "-u", tenantUser, "--", "bun", "install"]
      : ["bun", "install"];
    Bun.spawnSync(installCmd, { cwd: codeDir });
  }
}

/**
 * Prepares the tenant codebase directory as a real Git clone or repository with SvelteKit.
 */
async function ensureTenantCodebase(
  tenantSlug: string,
  gitRepoUrl?: string,
  gitToken?: string,
): Promise<string> {
  const codeDir = join(DATA_DIR, "tenants", tenantSlug, "code");
  mkdirSync(codeDir, { recursive: true });

  // Resolve git credentials if missing
  const creds = await resolveTenantGitCredentials(
    tenantSlug,
    gitRepoUrl,
    gitToken,
  );
  gitRepoUrl = creds.gitRepoUrl;
  gitToken = creds.gitToken;

  const gitDir = join(codeDir, ".git");
  if (!existsSync(gitDir)) {
    let cloned = false;
    if (gitRepoUrl && gitToken) {
      let authedUrl = gitRepoUrl;
      try {
        const u = new URL(gitRepoUrl);
        if (
          process.env.NODE_ENV === "production" &&
          u.hostname === "git.ether.paris"
        ) {
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
        Bun.spawnSync(["git", "config", "user.name", "Ether Studio"], {
          cwd: codeDir,
        });
        Bun.spawnSync(["git", "config", "user.email", "studio@ether.paris"], {
          cwd: codeDir,
        });
      }
    }

    if (!cloned) {
      Bun.spawnSync(["git", "init"], { cwd: codeDir });
      Bun.spawnSync(["git", "config", "user.name", "Ether Studio"], {
        cwd: codeDir,
      });
      Bun.spawnSync(["git", "config", "user.email", "studio@ether.paris"], {
        cwd: codeDir,
      });
      if (gitRepoUrl && gitToken) {
        let authedUrl = gitRepoUrl;
        try {
          const u = new URL(gitRepoUrl);
          if (
            process.env.NODE_ENV === "production" &&
            u.hostname === "git.ether.paris"
          ) {
            authedUrl = `http://${gitToken}@gitea-http.git.svc.cluster.local:3000${u.pathname}`;
          } else {
            authedUrl = `${u.protocol}//${gitToken}@${u.host}${u.pathname}`;
          }
        } catch {}
        Bun.spawnSync(["git", "remote", "add", "origin", authedUrl], {
          cwd: codeDir,
        });
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
            start: "bun ./build/index.js",
          },
        },
        null,
        2,
      ),
    );
  }

  // Ensure tailwind.config.js
  const tailwindConfig = join(codeDir, "tailwind.config.js");
  if (!existsSync(tailwindConfig)) {
    writeFileSync(
      tailwindConfig,
      `/** @type {import('tailwindcss').Config} */\nexport default {\n  content: ['./src/**/*.{html,js,svelte,ts}'],\n  darkMode: 'class',\n  theme: {\n    extend: {\n      colors: {\n        background: 'hsl(var(--background, 0 0% 100%))',\n        foreground: 'hsl(var(--foreground, 240 10% 3.9%))',\n        brand: {\n          DEFAULT: 'hsl(var(--brand, 250 90% 64%))',\n          foreground: 'hsl(var(--brand-foreground, 0 0% 100%))',\n        },\n        muted: {\n          DEFAULT: 'hsl(var(--muted, 240 4.8% 95.9%))',\n          foreground: 'hsl(var(--muted-foreground, 240 3.8% 46.1%))',\n        },\n      },\n    },\n  },\n  plugins: [],\n};\n`,
    );
  }

  // Ensure postcss.config.js
  const postcssConfig = join(codeDir, "postcss.config.js");
  if (!existsSync(postcssConfig)) {
    writeFileSync(
      postcssConfig,
      `export default {\n  plugins: {\n    tailwindcss: {},\n  },\n};\n`,
    );
  }

  const svelteConfig = join(codeDir, "svelte.config.js");
  if (!existsSync(svelteConfig)) {
    writeFileSync(
      svelteConfig,
      `import adapter from "svelte-adapter-bun";\nimport { vitePreprocess } from "@sveltejs/vite-plugin-svelte";\n\n/** @type {import("@sveltejs/kit").Config} */\nconst config = {\n  preprocess: vitePreprocess(),\n  kit: {\n    adapter: adapter()\n  }\n};\n\nexport default config;\n`,
    );
  }

  ensureTenantViteConfig(codeDir);

  const srcDir = join(codeDir, "src");
  mkdirSync(srcDir, { recursive: true });

  const appHtml = join(srcDir, "app.html");
  if (!existsSync(appHtml)) {
    writeFileSync(
      appHtml,
      `<!doctype html>\n<html lang="fr">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <script>\n      (function() {\n        try {\n          var t = localStorage.getItem('theme');\n          if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {\n            document.documentElement.classList.add('dark');\n          } else {\n            document.documentElement.classList.remove('dark');\n          }\n        } catch (_) {}\n      })();\n    </script>\n    %sveltekit.head%\n  </head>\n  <body data-sveltekit-preload-data="hover" class="bg-background text-foreground min-h-screen">\n    <div style="display: contents">%sveltekit.body%</div>\n  </body>\n</html>\n`,
    );
  }

  const appCss = join(srcDir, "app.css");
  if (!existsSync(appCss)) {
    writeFileSync(
      appCss,
      `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n:root {\n  --background: 0 0% 100%;\n  --foreground: 240 10% 3.9%;\n  --brand: 250 90% 64%;\n  --brand-foreground: 0 0% 100%;\n  --muted: 240 4.8% 95.9%;\n  --muted-foreground: 240 3.8% 46.1%;\n}\n\n.dark {\n  --background: 222 47% 11%;\n  --foreground: 210 40% 98%;\n  --brand: 250 90% 64%;\n  --brand-foreground: 0 0% 100%;\n  --muted: 217 33% 17%;\n  --muted-foreground: 215 20% 65%;\n}\n`,
    );
  }

  const libServerDir = join(srcDir, "lib", "server");
  mkdirSync(libServerDir, { recursive: true });

  const dbTs = join(libServerDir, "db.ts");
  if (!existsSync(dbTs)) {
    writeFileSync(
      dbTs,
      `import { Database } from "bun:sqlite";\nimport { dirname, join } from "path";\nimport { mkdirSync } from "fs";\n\nconst DB_PATH = process.env.DB_PATH || join(process.cwd(), "app.db");\ntry {\n  mkdirSync(dirname(DB_PATH), { recursive: true });\n} catch {}\n\nexport const db = new Database(DB_PATH, { create: true });\n\ndb.run(\`\n  CREATE TABLE IF NOT EXISTS page_views (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    path TEXT NOT NULL,\n    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP\n  );\n\`);\n\ndb.run(\`\n  CREATE TABLE IF NOT EXISTS contact_submissions (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    name TEXT NOT NULL,\n    email TEXT NOT NULL,\n    message TEXT NOT NULL,\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n  );\n\`);\n`,
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

  const pageServerTs = join(routesDir, "+page.server.ts");
  if (!existsSync(pageServerTs)) {
    writeFileSync(
      pageServerTs,
      `import type { Actions, PageServerLoad } from "./$types";\nimport { db } from "$lib/server/db";\n\nexport const load: PageServerLoad = async ({ url }) => {\n  try {\n    db.run("INSERT INTO page_views (path) VALUES (?)", [url.pathname]);\n    const viewsRow = db.query("SELECT COUNT(*) as count FROM page_views").get() as { count: number } | null;\n    return {\n      viewCount: viewsRow?.count || 1,\n    };\n  } catch {\n    return { viewCount: 1 };\n  }\n};\n\nexport const actions: Actions = {\n  default: async ({ request }) => {\n    const data = await request.formData();\n    const name = (data.get("name") as string || "").trim();\n    const email = (data.get("email") as string || "").trim();\n    const message = (data.get("message") as string || "").trim();\n\n    if (!name || !email || !message) {\n      return { success: false, error: "Veuillez remplir tous les champs obligatoires." };\n    }\n\n    try {\n      db.run(\n        "INSERT INTO contact_submissions (name, email, message) VALUES (?, ?, ?)",\n        [name, email, message]\n      );\n      return { success: true, message: "Merci pour votre message ! Nous vous répondrons bientôt." };\n    } catch (err: any) {\n      return { success: false, error: "Erreur lors de l'enregistrement du message." };\n    }\n  }\n};\n`,
    );
  }

  const pageSvelte = join(routesDir, "+page.svelte");
  if (!existsSync(pageSvelte)) {
    writeFileSync(
      pageSvelte,
      `<script lang="ts">\n  let { data, form } = $props();\n  let count = $state(0);\n\n  function toggleDarkMode() {\n    if (typeof document !== "undefined") {\n      const isDark = document.documentElement.classList.toggle("dark");\n      try {\n        localStorage.setItem("theme", isDark ? "dark" : "light");\n      } catch {}\n    }\n  }\n</script>\n\n<svelte:head>\n  <title>${tenantSlug} — Site Officiel</title>\n</svelte:head>\n\n<div class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300">\n  <header class="border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/50 backdrop-blur sticky top-0 z-50">\n    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">\n      <div class="flex items-center gap-3">\n        <div class="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/30">\n          ${tenantSlug.slice(0, 1).toUpperCase()}\n        </div>\n        <span class="font-bold text-lg tracking-tight text-slate-900 dark:text-white">${tenantSlug}</span>\n      </div>\n      <div class="flex items-center gap-4">\n        <a href="#features" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition">Fonctionnalités</a>\n        <a href="#contact" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition">Contact</a>\n        <button\n          onclick={toggleDarkMode}\n          aria-label="Toggle Dark Mode"\n          class="p-2 rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition text-sm cursor-pointer"\n        >\n          <span class="hidden dark:inline">🌙</span><span class="inline dark:hidden">☀️</span>\n        </button>\n      </div>\n    </div>\n  </header>\n\n  <main class="flex-1">\n    <section class="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center space-y-6">\n      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-xs font-mono">\n        <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>\n        ${tenantSlug}.ether.paris · En ligne\n      </div>\n\n      <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-950 via-slate-800 to-indigo-600 dark:from-white dark:via-slate-200 dark:to-indigo-300 max-w-3xl mx-auto">\n        Bienvenue sur ${tenantSlug}\n      </h1>\n\n      <p class="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">\n        Votre nouveau site web haute performance propulsé par Ether Studio, SvelteKit 5 Runes et Bun Runtime.\n      </p>\n\n      <div class="flex flex-wrap items-center justify-center gap-4 pt-4">\n        <button\n          onclick={() => count++}\n          class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/30 transition cursor-pointer flex items-center gap-2"\n        >\n          <span>Compteur interactif</span>\n          <span class="px-2 py-0.5 rounded-full bg-indigo-700/80 text-xs font-mono font-bold text-white">{count}</span>\n        </button>\n        <a\n          href="#contact"\n          class="px-6 py-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium border border-slate-200 dark:border-slate-700/60 shadow-sm transition"\n        >\n          Nous contacter\n        </a>\n      </div>\n\n      <div class="pt-6 flex items-center justify-center gap-6 text-xs text-slate-500 dark:text-slate-400">\n        <div class="flex items-center gap-1.5">\n          <span class="text-indigo-500 dark:text-indigo-400">⚡</span> Svelte 5 Runes\n        </div>\n        <div class="flex items-center gap-1.5">\n          <span class="text-emerald-500 dark:text-emerald-400">💾</span> Bun SQLite (/data/app.db)\n        </div>\n        <div class="flex items-center gap-1.5">\n          <span class="text-sky-500 dark:text-sky-400">👀</span> {data?.viewCount || 1} visites\n        </div>\n      </div>\n    </section>\n\n    <section id="features" class="max-w-6xl mx-auto px-4 sm:px-6 py-12 border-t border-slate-200 dark:border-slate-900">\n      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">\n        <div class="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none transition">\n          <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 text-lg">⚡</div>\n          <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Performances Bun</h2>\n          <p class="text-sm text-slate-600 dark:text-slate-400">Temps de réponse instantanés grâce au moteur d'exécution Bun natif et à Vite dev HMR.</p>\n        </div>\n        <div class="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none transition">\n          <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 text-lg">🔒</div>\n          <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Base de données SQLite</h2>\n          <p class="text-sm text-slate-600 dark:text-slate-400">Stockage persistant sur disque isolé par tenant (/data/app.db) avec requêtes typées à haute vitesse.</p>\n        </div>\n        <div class="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none transition">\n          <div class="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-4 text-lg">🎨</div>\n          <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Tailwind CSS & Runes</h2>\n          <p class="text-sm text-slate-600 dark:text-slate-400">Styles modernes précompilés avec Tailwind 3, Dark Mode réactif et la syntaxe Runes de Svelte 5.</p>\n        </div>\n      </div>\n    </section>\n\n    <section id="contact" class="max-w-3xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-200 dark:border-slate-900">\n      <div class="text-center mb-8">\n        <h2 class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Contactez-nous</h2>\n        <p class="text-sm text-slate-600 dark:text-slate-400 mt-2">Envoyez-nous un message directement sauvegardé dans la base SQLite locale.</p>\n      </div>\n\n      <div class="p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xl">\n        {#if form?.success}\n          <div class="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-3">\n            <span>✅</span>\n            <span>{form.message}</span>\n          </div>\n        {:else if form?.error}\n          <div class="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm flex items-center gap-3">\n            <span>⚠️</span>\n            <span>{form.error}</span>\n          </div>\n        {/if}\n\n        <form method="POST" class="space-y-4">\n          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">\n            <div>\n              <label for="name" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nom complet</label>\n              <input\n                type="text"\n                id="name"\n                name="name"\n                required\n                placeholder="Jean Dupont"\n                class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm"\n              />\n            </div>\n            <div>\n              <label for="email" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Adresse e-mail</label>\n              <input\n                type="email"\n                id="email"\n                name="email"\n                required\n                placeholder="jean@exemple.fr"\n                class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm"\n              />\n            </div>\n          </div>\n          <div>\n            <label for="message" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Message</label>\n            <textarea\n              id="message"\n              name="message"\n              rows="4"\n              required\n              placeholder="Votre message ici..."\n              class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm"\n            ></textarea>\n          </div>\n          <button\n            type="submit"\n            class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/30 transition cursor-pointer text-sm"\n          >\n            Envoyer le message\n          </button>\n        </form>\n      </div>\n    </section>\n  </main>\n\n  <footer class="border-t border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950 py-8 text-center text-xs text-slate-500">\n    <div class="max-w-6xl mx-auto px-4 space-y-2">\n      <p>© ${new Date().getFullYear()} ${tenantSlug}. Tous droits réservés.</p>\n      <p class="text-slate-500">Hébergé et géré via Ether Platform · ${tenantSlug}.ether.paris</p>\n    </div>\n  </footer>\n</div>\n`,
    );
  } else {
    try {
      const existingContent = readFileSync(pageSvelte, "utf-8");
      if (
        existingContent.includes('{isDark ? "🌙" : "☀️"}') ||
        existingContent.includes("{isDark ? '🌙' : '☀️'}")
      ) {
        const fixedContent = existingContent
          .replace(
            '{isDark ? "🌙" : "☀️"}',
            '<span class="hidden dark:inline">🌙</span><span class="inline dark:hidden">☀️</span>',
          )
          .replace(
            "{isDark ? '🌙' : '☀️'}",
            '<span class="hidden dark:inline">🌙</span><span class="inline dark:hidden">☀️</span>',
          );
        writeFileSync(pageSvelte, fixedContent);
      }
    } catch {}
  }

  const tenantUser = ensureTenantSystemUser(tenantSlug);
  if (isLinuxRoot()) {
    Bun.spawnSync(["chown", "-R", `${tenantUser}:${tenantUser}`, codeDir]);
  }

  // Ensure .gitignore is present and committed
  const gitIgnore = join(codeDir, ".gitignore");
  if (!existsSync(gitIgnore)) {
    writeFileSync(
      gitIgnore,
      `node_modules/\n.svelte-kit/\nbuild/\napp.db*\n*.sqlite*\n.env*\n`,
    );
    try {
      runTenantGit(tenantSlug, ["add", ".gitignore"]);
      runTenantGit(tenantSlug, ["commit", "-m", "Add .gitignore"]);
    } catch {}
  }

  // Ensure shared dependencies are linked
  const nodeModulesKit = join(codeDir, "node_modules", "@sveltejs", "kit");
  if (!existsSync(nodeModulesKit)) {
    ensureTenantSharedDependencies(codeDir, tenantUser);
  }

  // Ensure initial commit exists so HEAD always resolves for diffs & reverts
  try {
    const headCheck = runTenantGit(tenantSlug, ["rev-parse", "HEAD"]);
    if (headCheck.exitCode !== 0) {
      runTenantGit(tenantSlug, ["add", "-A"]);
      runTenantGit(tenantSlug, [
        "commit",
        "-m",
        "Initial commit: Site template",
      ]);
    }
  } catch {}

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

// Active Tenant Turn Management (for instant Stop/Abort)
interface ActiveTenantTurn {
  proc: any;
  tenantSlug: string;
  startedAt: number;
}
const activeTenantTurns = new Map<string, ActiveTenantTurn>();

function killTenantTurn(tenantSlug: string): boolean {
  let stopped = false;
  const active = activeTenantTurns.get(tenantSlug);
  if (active) {
    try {
      active.proc.kill(9);
      stopped = true;
    } catch {}
    activeTenantTurns.delete(tenantSlug);
  }
  if (isLinuxRoot()) {
    try {
      const tenantUser = ensureTenantSystemUser(tenantSlug);
      Bun.spawnSync(["pkill", "-9", "-u", tenantUser, "-f", "agy"]);
      stopped = true;
    } catch {}
  }
  return stopped;
}

async function getOrLaunchTenantDevServer(
  slug: string,
  gitRepoUrl?: string,
  gitToken?: string,
): Promise<number> {
  const codeDir = join(DATA_DIR, "tenants", slug, "code");
  const viteUpdated = existsSync(codeDir) ? ensureTenantViteConfig(codeDir) : false;

  const existing = tenantDevServers.get(slug);
  if (existing && existing.proc.exitCode === null && !existing.proc.killed) {
    if (viteUpdated) {
      try {
        existing.proc.kill();
      } catch {}
      tenantDevServers.delete(slug);
    } else {
      existing.lastActive = Date.now();
      return existing.port;
    }
  }
  if (existing) {
    try {
      existing.proc.kill();
    } catch {}
    tenantDevServers.delete(slug);
  }

  await ensureTenantCodebase(slug, gitRepoUrl, gitToken);
  ensureTenantViteConfig(codeDir);
  const tenantUser = ensureTenantSystemUser(slug);
  const isRoot = isLinuxRoot();
  if (isRoot) {
    try {
      Bun.spawnSync(["pkill", "-9", "-u", tenantUser, "-f", "vite"]);
    } catch {}
  }
  const port = nextAvailablePort++;

  const dbPath = join(DATA_DIR, "tenants", slug, "app.db");

  const viteBin = existsSync(join(codeDir, "node_modules", ".bin", "vite"))
    ? "./node_modules/.bin/vite"
    : "vite";

  // Spawn vite dev server under unprivileged tenant user with Bun runtime
  const spawnCmd = isRoot
    ? [
        "runuser",
        "-u",
        tenantUser,
        "--",
        "env",
        `PORT=${port}`,
        "HOST=0.0.0.0",
        `DB_PATH=${dbPath}`,
        "bun",
        "--bun",
        viteBin,
        "dev",
        "--host",
        "0.0.0.0",
        "--port",
        String(port),
      ]
    : [
        "bun",
        "--bun",
        viteBin,
        "dev",
        "--host",
        "0.0.0.0",
        "--port",
        String(port),
      ];

  const proc = Bun.spawn(spawnCmd, {
    cwd: codeDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "0.0.0.0",
      DB_PATH: dbPath,
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  const instance: DevServerInstance = {
    proc,
    port,
    ready: false,
    lastActive: Date.now(),
  };
  tenantDevServers.set(slug, instance);

  // Poll for ready state
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const ping = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { "accept-encoding": "identity" },
        signal: AbortSignal.timeout(1000),
      });
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

  const codeDir = await ensureTenantCodebase(slug);
  const tenantUser = ensureTenantSystemUser(slug);
  const isRoot = isLinuxRoot();
  const port = nextAvailableProdPort++;
  const dbPath = join(DATA_DIR, "tenants", slug, "app.db");

  const buildIndex = join(codeDir, "build", "index.js");
  if (!existsSync(buildIndex)) {
    const buildCmd = isRoot
      ? [
          "runuser",
          "-u",
          tenantUser,
          "--",
          "env",
          `DB_PATH=${dbPath}`,
          "bun",
          "run",
          "build",
        ]
      : ["bun", "run", "build"];
    const buildProc = Bun.spawn(buildCmd, {
      cwd: codeDir,
      env: {
        ...process.env,
        DB_PATH: dbPath,
        NODE_ENV: "production",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    await buildProc.exited;
  }

  const proc = existsSync(buildIndex)
    ? Bun.spawn(
        isRoot
          ? [
              "runuser",
              "-u",
              tenantUser,
              "--",
              "env",
              `PORT=${port}`,
              "HOST=0.0.0.0",
              `DB_PATH=${dbPath}`,
              "bun",
              "./build/index.js",
            ]
          : ["bun", "./build/index.js"],
        {
          cwd: codeDir,
          env: {
            ...process.env,
            PORT: String(port),
            HOST: "0.0.0.0",
            DB_PATH: dbPath,
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
              "env",
              `PORT=${port}`,
              "HOST=0.0.0.0",
              `DB_PATH=${dbPath}`,
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
            HOST: "0.0.0.0",
            DB_PATH: dbPath,
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
  async fetch(req, srv) {
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

    // Tenant Dev Server Routing:
    // 1. Check Host header (e.g. preview-tester.ether.paris or tester.preview.ether.paris from Cloudflare Tunnel)
    const rawHost = (
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      ""
    )
      .toLowerCase()
      .split(":")[0];
    let hostTenantSlug: string | null = null;
    if (rawHost.startsWith("preview-") && rawHost.endsWith(".ether.paris")) {
      const candidate = rawHost.slice(8).replace(".ether.paris", "");
      if (candidate.length > 0) hostTenantSlug = candidate;
    } else if (rawHost.endsWith(".preview.ether.paris")) {
      const candidate = rawHost.replace(".preview.ether.paris", "");
      if (candidate.length > 0) hostTenantSlug = candidate;
    }

    // 2. Check path: /dev/:slug or /preview/:slug
    const devMatch = path.match(/^\/(?:dev|preview)\/([a-zA-Z0-9_-]+)(\/.*)?$/);

    if (hostTenantSlug || devMatch) {
      const tenantSlug = devMatch ? devMatch[1] : hostTenantSlug!;
      const subPath = (devMatch ? devMatch[2] || "/" : path) + url.search;

      // Serve user uploads from persistent directory outside git (/data/tenants/{tenant}/uploads/)
      if (subPath.startsWith("/uploads/")) {
        const uploadFileName = subPath
          .replace(/^\/uploads\//, "")
          .split("?")[0];
        const uploadFilePath = join(
          DATA_DIR,
          "tenants",
          tenantSlug,
          "uploads",
          uploadFileName,
        );
        if (existsSync(uploadFilePath)) {
          const fileBuffer = readFileSync(uploadFilePath);
          const mime = getImageMime(uploadFileName);
          return new Response(fileBuffer, {
            headers: {
              "Content-Type": mime,
              "Cache-Control": "public, max-age=3600",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      }

      try {
        const gitRepoUrl = req.headers.get("x-git-repo-url") || undefined;
        const gitToken = req.headers.get("x-git-token") || undefined;
        const devPort = await getOrLaunchTenantDevServer(
          tenantSlug,
          gitRepoUrl,
          gitToken,
        );

        // Check for WebSocket Upgrade request (Vite HMR)
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const protocol =
            req.headers.get("sec-websocket-protocol") || "vite-hmr";
          const cleanWsPath =
            subPath.replace(/^\/(?:dev|prod|preview)\/[^/?]+/, "") || "/";
          const finalWsPath = cleanWsPath.startsWith("/")
            ? cleanWsPath
            : "/" + cleanWsPath;
          const upgraded = srv.upgrade(req, {
            data: { tenantSlug, devPort, subPath: finalWsPath, protocol },
            headers: { "Sec-WebSocket-Protocol": protocol },
          });
          if (upgraded) return undefined;
        }

        const targetUrl = `http://127.0.0.1:${devPort}${subPath}`;

        const reqHeaders = new Headers(req.headers);
        reqHeaders.set("host", `127.0.0.1:${devPort}`);
        reqHeaders.set("accept-encoding", "identity");

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
        resHeaders.delete("content-encoding");
        resHeaders.delete("content-length");
        resHeaders.set(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, max-age=0",
        );
        resHeaders.set("Pragma", "no-cache");

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
        reqHeaders.set("accept-encoding", "identity");

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
        resHeaders.delete("content-encoding");
        resHeaders.delete("content-length");
        const contentType = resHeaders.get("content-type") || "";
        if (contentType.includes("text/html")) {
          resHeaders.set(
            "Cache-Control",
            "no-cache, no-store, must-revalidate",
          );
        }

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
      const gitRepoUrl = req.headers.get("x-git-repo-url") || undefined;
      const gitToken = req.headers.get("x-git-token") || undefined;
      const codeDir = await ensureTenantCodebase(
        tenantSlug,
        gitRepoUrl,
        gitToken,
      );

      const ignoredDirs = new Set([
        "node_modules",
        ".svelte-kit",
        ".git",
        ".gemini",
        ".gemini-sandbox",
        "dist",
        "build",
        "uploads",
        ".local-data",
        ".github",
        ".gitlab",
        "k8s",
        "kubernetes",
        "helm",
        "deploy",
        "deployments",
        ".docker",
      ]);
      const ignoredFiles = new Set([
        "dockerfile",
        ".dockerignore",
        "docker-compose.yml",
        "docker-compose.yaml",
        "compose.yml",
        "compose.yaml",
        "app.db",
        "bun.lock",
        "bun.lockb",
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        ".ds_store",
        "thumbs.db",
      ]);

      function isProtectedFile(filePath: string): boolean {
        const norm = filePath.replace(/\\/g, "/").toLowerCase();
        const basename = norm.split("/").pop() || "";
        if (ignoredFiles.has(basename)) return true;
        if (basename.startsWith("dockerfile")) return true;
        if (basename.startsWith(".env")) return true;
        if (
          basename.endsWith(".db") ||
          basename.endsWith(".sqlite") ||
          basename.endsWith(".sqlite3") ||
          basename.endsWith(".db-shm") ||
          basename.endsWith(".db-wal")
        ) {
          return true;
        }
        if (
          !norm.includes("/") &&
          (basename.endsWith(".yaml") || basename.endsWith(".yml"))
        ) {
          return true;
        }
        const segments = norm.split("/");
        for (const seg of segments) {
          if (ignoredDirs.has(seg)) return true;
        }
        return false;
      }

      if (req.method === "GET") {
        const files: Record<string, any> = {};

        function scan(dir: string) {
          if (!existsSync(dir)) return;
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              if (
                !ignoredDirs.has(entry.name.toLowerCase()) &&
                !entry.name.startsWith(".")
              ) {
                scan(fullPath);
              }
            } else if (entry.isFile()) {
              const rel = relative(codeDir, fullPath).replace(/\\/g, "/");
              if (
                isProtectedFile(entry.name) ||
                isProtectedFile(rel) ||
                entry.name.startsWith(".")
              ) {
                continue;
              }
              const category = getFileCategory(entry.name);
              let lang = "html";
              if (
                rel.endsWith(".ts") ||
                rel.endsWith(".js") ||
                rel.endsWith(".mjs")
              )
                lang = "typescript";
              else if (rel.endsWith(".json")) lang = "json";
              else if (rel.endsWith(".css")) lang = "css";

              try {
                const stat = statSync(fullPath);
                if (category === "image") {
                  let dataUrl: string | undefined;
                  let content = "";
                  try {
                    if (entry.name.toLowerCase().endsWith(".svg")) {
                      content = readFileSync(fullPath, "utf-8");
                      dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(content)}`;
                    } else if (stat.size <= 2 * 1024 * 1024) {
                      const buffer = readFileSync(fullPath);
                      dataUrl = `data:${getImageMime(entry.name)};base64,${buffer.toString("base64")}`;
                    }
                  } catch {}

                  files[rel] = {
                    name: entry.name,
                    path: rel,
                    lang: "html",
                    content,
                    size: stat.size,
                    category: "image",
                    isBinary: true,
                    dataUrl,
                  };
                  continue;
                }

                if (category === "media" || category === "binary") {
                  files[rel] = {
                    name: entry.name,
                    path: rel,
                    lang: "html",
                    content: "",
                    size: stat.size,
                    category,
                    isBinary: true,
                  };
                  continue;
                }

                if (stat.size <= 500 * 1024) {
                  files[rel] = {
                    name: entry.name,
                    path: rel,
                    lang,
                    content: readFileSync(fullPath, "utf-8"),
                    size: stat.size,
                    category: "code",
                    isBinary: false,
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

          if (isProtectedFile(relPath)) {
            return Response.json(
              {
                success: false,
                error:
                  "Modification interdite : les fichiers d'infrastructure, de déploiement et de base de données ne peuvent pas être modifiés directement.",
              },
              { status: 403, headers: corsHeaders },
            );
          }

          if (isBinaryFile(relPath)) {
            return Response.json(
              {
                success: false,
                error:
                  "Impossible d'écraser un fichier binaire avec du texte brut.",
              },
              { status: 400, headers: corsHeaders },
            );
          }

          const resolvedCodeDir = resolve(codeDir);
          const fullPath = resolve(codeDir, relPath);
          if (
            !fullPath.startsWith(resolvedCodeDir + "/") &&
            fullPath !== resolvedCodeDir
          ) {
            return Response.json(
              {
                success: false,
                error:
                  "Accès refusé : chemin en dehors de l'espace de travail du site",
              },
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

    // SQLite Database Inspector & Runner Endpoint
    const sqliteMatch = path.match(/^\/sqlite\/([a-zA-Z0-9_-]+)$/);
    if (sqliteMatch && req.method === "POST") {
      const tenantSlug = sqliteMatch[1];
      const codeDir = await ensureTenantCodebase(tenantSlug);

      try {
        const body = (await req.json().catch(() => ({}))) as any;
        const dbRelPath = (body.dbPath || "data.db").trim().replace(/^\/+/, "");
        const action = body.action || "schema"; // "schema" | "query"

        const resolvedCodeDir = resolve(codeDir);
        const fullDbPath = resolve(codeDir, dbRelPath);
        if (
          !fullDbPath.startsWith(resolvedCodeDir + "/") &&
          fullDbPath !== resolvedCodeDir
        ) {
          return Response.json(
            {
              success: false,
              error: "Accès refusé : chemin en dehors de l'espace de travail",
            },
            { status: 403, headers: corsHeaders },
          );
        }

        if (!existsSync(fullDbPath)) {
          return Response.json(
            {
              success: false,
              error: `Base de données introuvable : ${dbRelPath}`,
            },
            { status: 404, headers: corsHeaders },
          );
        }

        if (action === "schema") {
          const db = new Database(fullDbPath, { readonly: true });
          try {
            const rawTables = db
              .query(
                `SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`,
              )
              .all() as Array<{ name: string; type: string; sql: string }>;

            const tables = rawTables.map((t) => {
              let columns: any[] = [];
              let rowCount = 0;
              try {
                columns = db
                  .query(`PRAGMA table_info("${t.name.replace(/"/g, '""')}")`)
                  .all();
              } catch {}
              try {
                const countRes = db
                  .query(
                    `SELECT COUNT(*) as count FROM "${t.name.replace(/"/g, '""')}"`,
                  )
                  .get() as any;
                rowCount = countRes ? countRes.count : 0;
              } catch {}
              return {
                name: t.name,
                type: t.type,
                sql: t.sql,
                columns,
                rowCount,
              };
            });

            return Response.json(
              {
                success: true,
                projectSlug: tenantSlug,
                dbPath: dbRelPath,
                tables,
              },
              { headers: corsHeaders },
            );
          } finally {
            db.close();
          }
        }

        if (action === "query") {
          const sqlQuery = (body.sql || "").trim();
          if (!sqlQuery) {
            return Response.json(
              { success: false, error: "Requête SQL requise" },
              { status: 400, headers: corsHeaders },
            );
          }

          const isReadOnly = /^\s*(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(
            sqlQuery,
          );
          const db = new Database(fullDbPath, { readonly: isReadOnly });
          try {
            const startTime = performance.now();
            if (isReadOnly) {
              let finalQuery = sqlQuery;
              if (
                /^\s*SELECT\b/i.test(finalQuery) &&
                !/\bLIMIT\b/i.test(finalQuery)
              ) {
                finalQuery += " LIMIT 100";
              }
              const stmt = db.query(finalQuery);
              const rows = stmt.all() as Record<string, any>[];
              const columns =
                rows.length > 0 ? Object.keys(rows[0]) : stmt.columnNames || [];
              const executionTimeMs =
                Math.round((performance.now() - startTime) * 100) / 100;
              return Response.json(
                {
                  success: true,
                  columns,
                  rows,
                  rowCount: rows.length,
                  executionTimeMs,
                  readonly: true,
                },
                { headers: corsHeaders },
              );
            } else {
              const stmt = db.query(sqlQuery);
              const result = stmt.run();
              const executionTimeMs =
                Math.round((performance.now() - startTime) * 100) / 100;
              return Response.json(
                {
                  success: true,
                  columns: [],
                  rows: [],
                  changes: result.changes,
                  lastInsertRowid: result.lastInsertRowid,
                  executionTimeMs,
                  readonly: false,
                },
                { headers: corsHeaders },
              );
            }
          } finally {
            db.close();
          }
        }

        return Response.json(
          { success: false, error: `Action inconnue : ${action}` },
          { status: 400, headers: corsHeaders },
        );
      } catch (err: any) {
        return Response.json(
          {
            success: false,
            error: err.message || "Erreur de base de données",
          },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    // Git Commit and Push Endpoint
    const gitPushMatch = path.match(
      /^\/git\/commit-and-push\/([a-zA-Z0-9_-]+)$/,
    );
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

    // Git Revert / Undo Endpoint
    const gitRevertMatch = path.match(/^\/(?:git\/)?revert\/([a-zA-Z0-9_-]+)$/);
    if (gitRevertMatch && req.method === "POST") {
      const tenantSlug = gitRevertMatch[1];
      const codeDir = join(DATA_DIR, "tenants", tenantSlug, "code");

      if (!existsSync(codeDir) || !existsSync(join(codeDir, ".git"))) {
        return Response.json(
          { success: false, error: "Dépôt Git non initialisé pour ce site" },
          { status: 400, headers: corsHeaders },
        );
      }

      try {
        const body = (await req.json().catch(() => ({}))) as any;
        let target = (body.commitHash || "").trim();
        const stepsBack =
          typeof body.stepsBack === "number" ? body.stepsBack : 1;

        const curHeadProc = runTenantGit(tenantSlug, ["rev-parse", "HEAD"]);
        const curHead = curHeadProc.exitCode === 0 ? curHeadProc.stdout : "";

        // If no target commit was specified, OR if targetCommit is identical to current HEAD,
        // we MUST step back to previous commit so we don't no-op on the current commit!
        if (!target || target === curHead) {
          target = `HEAD~${stepsBack}`;
        }

        // Validate that target exists in git
        const checkProc = runTenantGit(tenantSlug, ["cat-file", "-t", target]);
        if (checkProc.exitCode !== 0 || checkProc.stdout !== "commit") {
          // If the specified commit doesn't resolve, fallback safely to HEAD~stepsBack
          if (target !== `HEAD~${stepsBack}`) {
            target = `HEAD~${stepsBack}`;
            const fbCheck = runTenantGit(tenantSlug, ["cat-file", "-t", target]);
            if (fbCheck.exitCode !== 0 || fbCheck.stdout !== "commit") {
              return Response.json(
                {
                  success: false,
                  error: `Aucune révision précédente disponible à restaurer.`,
                },
                { status: 400, headers: corsHeaders },
              );
            }
          }
        }

        // Reset hard and clean untracked files
        const resetProc = runTenantGit(tenantSlug, ["reset", "--hard", target]);
        if (resetProc.exitCode !== 0) {
          return Response.json(
            {
              success: false,
              error: `Erreur lors du git reset: ${resetProc.stderr || resetProc.stdout}`,
            },
            { status: 500, headers: corsHeaders },
          );
        }

        runTenantGit(tenantSlug, [
          "clean",
          "-fd",
          "-e",
          "node_modules",
          "-e",
          ".svelte-kit",
          "-e",
          "app.db",
          "-e",
          ".env*",
          "-e",
          ".gitignore",
        ]);

        if (isLinuxRoot()) {
          const tenantUser = ensureTenantSystemUser(tenantSlug);
          Bun.spawnSync([
            "chown",
            "-R",
            `${tenantUser}:${tenantUser}`,
            codeDir,
          ]);
        }

        // Ensure critical dependencies are still intact after revert
        const nodeModulesKit = join(codeDir, "node_modules", "@sveltejs", "kit");
        if (!existsSync(nodeModulesKit)) {
          console.log(
            `[Runner] Re-linking dependencies for ${tenantSlug} after revert...`,
          );
          const tenantUser = ensureTenantSystemUser(tenantSlug);
          ensureTenantSharedDependencies(codeDir, tenantUser);
        }

        // Re-sync SvelteKit route types / generated code so Vite doesn't serve stale routes
        const tenantUser = ensureTenantSystemUser(tenantSlug);
        const syncCmd = isLinuxRoot()
          ? [
              "runuser",
              "-u",
              tenantUser,
              "--",
              "bun",
              "--bun",
              "./node_modules/.bin/svelte-kit",
              "sync",
            ]
          : ["bun", "--bun", "./node_modules/.bin/svelte-kit", "sync"];
        Bun.spawnSync(syncCmd, { cwd: codeDir });

        // Restart Vite dev server and WAIT for it to be ready so preview iframe never crashes on 502/broken pipe
        const existingDev = tenantDevServers.get(tenantSlug);
        if (existingDev) {
          try {
            existingDev.proc.kill();
          } catch {}
          tenantDevServers.delete(tenantSlug);
        }

        try {
          await getOrLaunchTenantDevServer(tenantSlug);
        } catch (launchErr: any) {
          console.error(
            `[Runner] Failed to relaunch dev server for ${tenantSlug} after revert:`,
            launchErr.message,
          );
        }

        // Get new HEAD
        const headProc = runTenantGit(tenantSlug, ["rev-parse", "HEAD"]);
        const newHead = headProc.stdout;

        console.log(
          `[Runner] Reverted ${tenantSlug} to ${target} (new HEAD: ${newHead})`,
        );

        return Response.json(
          {
            success: true,
            target,
            newHead,
            message: `Version restaurée avec succès à ${newHead}`,
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

    // Tenant File/Git Diff Endpoint
    const diffMatch = path.match(/^\/diff\/([a-zA-Z0-9_-]+)$/);
    if (diffMatch && (req.method === "GET" || req.method === "POST")) {
      const tenantSlug = diffMatch[1];
      const targetFile = (url.searchParams.get("path") || "").trim();
      try {
        let original = "";
        let current = "";
        const codeDir = join(DATA_DIR, "tenants", tenantSlug, "code");

        if (targetFile) {
          const absTarget = join(codeDir, targetFile);
          if (existsSync(absTarget)) {
            current = readFileSync(absTarget, "utf-8");
          }

          const headPrevProc = runTenantGit(tenantSlug, [
            "show",
            `HEAD~1:${targetFile}`,
          ]);
          if (headPrevProc.exitCode === 0) {
            original = headPrevProc.stdout;
          } else {
            const headProc = runTenantGit(tenantSlug, [
              "show",
              `HEAD:${targetFile}`,
            ]);
            original = headProc.exitCode === 0 ? headProc.stdout : "";
          }

          const diffProc = runTenantGit(tenantSlug, [
            "diff",
            "HEAD~1",
            "--",
            targetFile,
          ]);
          const diffOutput = diffProc.exitCode === 0 ? diffProc.stdout : "";

          return Response.json(
            {
              success: true,
              path: targetFile,
              original,
              current,
              diff: diffOutput,
            },
            { headers: corsHeaders },
          );
        }

        const fullDiffProc = runTenantGit(tenantSlug, ["diff", "HEAD~1"]);
        return Response.json(
          {
            success: true,
            diff: fullDiffProc.exitCode === 0 ? fullDiffProc.stdout : "",
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

    // Tenant Agent Turn Stop/Abort Endpoint
    const stopMatch = path.match(/^\/stop\/([a-zA-Z0-9_-]+)$/);
    if (stopMatch && req.method === "POST") {
      const tenantSlug = stopMatch[1];
      const stopped = killTenantTurn(tenantSlug);
      return Response.json(
        {
          success: true,
          stopped,
          message: stopped
            ? `Turn arrêté avec succès pour ${tenantSlug}`
            : `Aucun turn en cours pour ${tenantSlug}`,
        },
        { headers: corsHeaders },
      );
    }

    // Tenant Production Build Endpoint (Triggered when user clicks "Publier")
    const buildMatch = path.match(/^\/build\/([a-zA-Z0-9_-]+)$/);
    if (buildMatch && req.method === "POST") {
      const tenantSlug = buildMatch[1];
      const codeDir = await ensureTenantCodebase(tenantSlug);
      const tenantUser = ensureTenantSystemUser(tenantSlug);
      const isRoot = isLinuxRoot();
      const dbPath = join(DATA_DIR, "tenants", tenantSlug, "app.db");

      try {
        const buildCmd = isRoot
          ? [
              "runuser",
              "-u",
              tenantUser,
              "--",
              "env",
              `DB_PATH=${dbPath}`,
              "bun",
              "run",
              "build",
            ]
          : ["bun", "run", "build"];

        const buildProc = Bun.spawn(buildCmd, {
          cwd: codeDir,
          env: {
            ...process.env,
            DB_PATH: dbPath,
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
      return Response.json(
        { success: true, tenant: tenantSlug, ...info },
        { headers: corsHeaders },
      );
    }

    const tmuxCaptureMatch = path.match(/^\/tmux\/capture\/([a-zA-Z0-9_-]+)$/);
    if (tmuxCaptureMatch && req.method === "GET") {
      const tenantSlug = tmuxCaptureMatch[1];
      const username = ensureTenantSystemUser(tenantSlug);
      const socketPath = join(DATA_DIR, "tenants", tenantSlug, "tmux.sock");
      ensureTenantTmuxSession(tenantSlug);

      const isRoot = isLinuxRoot();
      const captureCmd = isRoot
        ? [
            "runuser",
            "-u",
            username,
            "--",
            "tmux",
            "-S",
            socketPath,
            "capture-pane",
            "-p",
            "-t",
            "studio",
          ]
        : ["tmux", "-S", socketPath, "capture-pane", "-p", "-t", "studio"];

      const proc = Bun.spawnSync(captureCmd);
      const output = proc.stdout ? proc.stdout.toString() : "";
      return Response.json(
        { success: true, tenant: tenantSlug, output },
        { headers: corsHeaders },
      );
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
        return Response.json(
          { success: false, error: "Command required" },
          { status: 400, headers: corsHeaders },
        );
      }

      const isRoot = isLinuxRoot();
      const sendCmd = isRoot
        ? [
            "runuser",
            "-u",
            username,
            "--",
            "tmux",
            "-S",
            socketPath,
            "send-keys",
            "-t",
            "studio",
            command,
            "C-m",
          ]
        : [
            "tmux",
            "-S",
            socketPath,
            "send-keys",
            "-t",
            "studio",
            command,
            "C-m",
          ];

      const sendProc = Bun.spawnSync(sendCmd);
      await new Promise((r) => setTimeout(r, 400));

      const captureCmd = isRoot
        ? [
            "runuser",
            "-u",
            username,
            "--",
            "tmux",
            "-S",
            socketPath,
            "capture-pane",
            "-p",
            "-t",
            "studio",
          ]
        : ["tmux", "-S", socketPath, "capture-pane", "-p", "-t", "studio"];

      const capProc = Bun.spawnSync(captureCmd);
      const output = capProc.stdout ? capProc.stdout.toString() : "";

      return Response.json(
        {
          success: sendProc.exitCode === 0,
          tenant: tenantSlug,
          output,
        },
        { headers: corsHeaders },
      );
    }

    // Tenant Resource Deletion & Cleanup Endpoint
    const tenantDeleteMatch = path.match(/^\/tenant\/([a-zA-Z0-9_-]+)$/);
    if (
      tenantDeleteMatch &&
      (req.method === "DELETE" || req.method === "POST")
    ) {
      const tenantSlug = tenantDeleteMatch[1];
      console.log(
        `[Cleanup] Terminating and cleaning resources for tenant: ${tenantSlug}`,
      );

      // 1. Kill and remove active Vite dev server
      const devInst = tenantDevServers.get(tenantSlug);
      if (devInst) {
        try {
          devInst.proc.kill();
        } catch {}
        tenantDevServers.delete(tenantSlug);
      }

      // 2. Kill and remove active Production server
      const prodInst = tenantProdServers.get(tenantSlug);
      if (prodInst) {
        try {
          prodInst.proc.kill();
        } catch {}
        tenantProdServers.delete(tenantSlug);
      }

      // 3. Kill tmux session if running
      try {
        const tenantUser = `tenant_${tenantSlug.toLowerCase().replace(/[^a-z0-9_-]/g, "")}`;
        Bun.spawnSync([
          "runuser",
          "-u",
          tenantUser,
          "--",
          "tmux",
          "-S",
          `/data/tenants/${tenantSlug}/tmux.sock`,
          "kill-server",
        ]);
      } catch {}

      // 4. Remove /data/tenants/<slug> directory
      const tenantDir = join(DATA_DIR, "tenants", tenantSlug);
      if (existsSync(tenantDir)) {
        try {
          rmSync(tenantDir, { recursive: true, force: true });
        } catch (err: any) {
          console.warn(`[Cleanup] Failed to remove ${tenantDir}:`, err.message);
        }
      }

      return Response.json(
        {
          success: true,
          message: `Tenant ${tenantSlug} resources cleaned up on runner`,
        },
        { headers: corsHeaders },
      );
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

        const tenantCodeDir = await ensureTenantCodebase(project);
        const triedProfiles: string[] = [];

        // If an image was attached, decode and save it into static/uploads/
        let savedImagePath = "";
        let savedImageUrl = "";
        if (image && image.base64) {
          try {
            const uploadsDir = join(DATA_DIR, "tenants", project, "uploads");
            mkdirSync(uploadsDir, { recursive: true });
            if (isLinuxRoot()) {
              const tenantUser = ensureTenantSystemUser(project);
              Bun.spawnSync([
                "chown",
                "-R",
                `${tenantUser}:${tenantUser}`,
                uploadsDir,
              ]);
            }

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
          ``,
          `[DYNAMIC NEXT ACTIONS SUGGESTION]`,
          `At the very end of your final response to the user, always propose exactly 3 concrete, relevant next action suggestions that would improve or extend the site based on what you just did. Format them strictly as a hidden HTML comment at the end:`,
          `<!-- SUGGESTIONS: ["Suggestion 1", "Suggestion 2", "Suggestion 3"] -->`,
          `[END DYNAMIC NEXT ACTIONS SUGGESTION]`,
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

                  // Capture initial HEAD commit BEFORE any agent commands or modifications run
                  const initialHeadProc = runTenantGit(project, [
                    "rev-parse",
                    "HEAD",
                  ]);
                  const initialHead =
                    initialHeadProc.exitCode === 0
                      ? initialHeadProc.stdout
                      : undefined;

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
                      Bun.spawnSync([
                        "chown",
                        "-R",
                        `${tenantUser}:${tenantUser}`,
                        join(DATA_DIR, "tenants", project),
                      ]);
                      Bun.spawnSync([
                        "chmod",
                        "700",
                        join(DATA_DIR, "tenants", project),
                      ]);
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
                    activeTenantTurns.set(project, {
                      proc,
                      tenantSlug: project,
                      startedAt: Date.now(),
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
                    let cliResultError = "";

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
                              if (
                                parsed.result?.status === "ERROR" ||
                                parsed.result?.error
                              ) {
                                cliResultError =
                                  parsed.result.error ||
                                  "CLI returned error status";
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
                      activeTenantTurns.delete(project);
                    }

                    const stderrText = await new Response(proc.stderr).text();
                    await proc.exited;

                    const combinedOutput = `${fullOutput} ${stderrText} ${cliResultError}`;
                    const quotaHit = isQuotaError(combinedOutput);

                    if (quotaHit) {
                      console.warn(
                        `[Runner] Quota limit detected on profile [${activeProfile}]. Auto-failing over...`,
                      );
                      markProfileThrottled(activeProfile, 60 * 60 * 1000);

                      const nextProfile = getNextHealthyProfile(
                        DATA_DIR,
                        undefined,
                        triedProfiles,
                      );
                      if (nextProfile) {
                        sendEvent("chunk", {
                          text: `\n🔄 *Quota Google atteint sur le profil [${activeProfile}]. Basculement automatique vers le profil sain [${nextProfile}]...*\n\n`,
                        });
                        activeProfile = nextProfile;
                        continue; // Retry with next profile
                      }
                    }

                    success =
                      proc.exitCode === 0 && !cliResultError && !quotaHit;
                    if (success) {
                      incrementProfileTurnCount(activeProfile);
                    } else if (!fullOutput) {
                      const errMessage =
                        cliResultError ||
                        stderrText.trim() ||
                        (quotaHit
                          ? "Toutes les clés de quota Google configurées ont été atteintes."
                          : "Une erreur est survenue lors de l'exécution.");
                      sendEvent("chunk", {
                        text: `\n⚠️ Erreur: ${errMessage}`,
                      });
                    }

                    // Auto-commit Git modifications if turn succeeded
                    let commitHash: string | undefined;
                    let prevCommitHash: string | undefined = initialHead;
                    if (success) {
                      try {
                        const statusRes = runTenantGit(project, [
                          "status",
                          "--porcelain",
                        ]);
                        if (statusRes.stdout.length > 0) {
                          runTenantGit(project, ["add", "-A"]);
                          const cleanPrompt = prompt
                            .replace(/[\r\n]+/g, " ")
                            .slice(0, 60)
                            .trim();
                          const commitMsg = `Agent: ${cleanPrompt || "Mise à jour du site"}`;
                          const commitRes = runTenantGit(project, [
                            "commit",
                            "-m",
                            commitMsg,
                          ]);
                          if (commitRes.exitCode === 0) {
                            const newHeadRes = runTenantGit(project, [
                              "rev-parse",
                              "HEAD",
                            ]);
                            commitHash =
                              newHeadRes.exitCode === 0
                                ? newHeadRes.stdout
                                : undefined;
                            console.log(
                              `[Runner] Auto-committed turn for ${project}: ${commitHash} (prev: ${prevCommitHash})`,
                            );
                          }
                        } else {
                          // No uncommitted working-tree changes: check current HEAD (agent may have committed with git tool)
                          const curHeadRes = runTenantGit(project, [
                            "rev-parse",
                            "HEAD",
                          ]);
                          commitHash =
                            curHeadRes.exitCode === 0
                              ? curHeadRes.stdout
                              : prevCommitHash;
                        }
                      } catch (gitErr: any) {
                        console.error(
                          `[Runner] Failed to auto-commit turn for ${project}:`,
                          gitErr.message,
                        );
                      }
                    }

                    sendEvent("done", {
                      success,
                      profileUsed: activeProfile,
                      conversationId:
                        capturedConvId ||
                        conversationId ||
                        `conv_${Date.now()}`,
                      exitCode: success ? 0 : proc.exitCode || 1,
                      savedImageUrl: savedImageUrl || undefined,
                      commitHash,
                      prevCommitHash,
                    });
                  }
                });
              } catch (turnErr: any) {
                sendEvent("error", { error: turnErr.message });
              } finally {
                controller.close();
              }
            },
            cancel(reason) {
              console.log(
                `[Runner] SSE stream cancelled by client for [${project}], reason:`,
                reason,
              );
              killTenantTurn(project);
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

            // Capture initial HEAD commit BEFORE any agent commands or modifications run
            const initialHeadProc = runTenantGit(project, [
              "rev-parse",
              "HEAD",
            ]);
            const initialHead =
              initialHeadProc.exitCode === 0
                ? initialHeadProc.stdout
                : undefined;

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
                Bun.spawnSync([
                  "chown",
                  "-R",
                  `${tenantUser}:${tenantUser}`,
                  join(DATA_DIR, "tenants", project),
                ]);
                Bun.spawnSync([
                  "chmod",
                  "700",
                  join(DATA_DIR, "tenants", project),
                ]);
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
              activeTenantTurns.set(project, {
                proc,
                tenantSlug: project,
                startedAt: Date.now(),
              });

              let stdout = "";
              let stderr = "";
              try {
                const [outText, errText] = await Promise.all([
                  new Response(proc.stdout).text(),
                  new Response(proc.stderr).text(),
                ]);
                stdout = outText;
                stderr = errText;
                await proc.exited;
              } finally {
                activeTenantTurns.delete(project);
              }

              const combinedOutput = `${stdout} ${stderr}`;
              const quotaHit = isQuotaError(combinedOutput);

              if (quotaHit) {
                console.warn(
                  `[Runner] Quota limit detected on profile [${activeProfile}]. Auto-failing over...`,
                );
                markProfileThrottled(activeProfile, 60 * 60 * 1000);

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

              const success = proc.exitCode === 0 && !quotaHit;
              if (success) {
                incrementProfileTurnCount(activeProfile);
              }

              // Auto-commit Git modifications if turn succeeded
              let commitHash: string | undefined;
              let prevCommitHash: string | undefined = initialHead;
              if (success) {
                try {
                  const statusRes = runTenantGit(project, [
                    "status",
                    "--porcelain",
                  ]);
                  if (statusRes.stdout.length > 0) {
                    runTenantGit(project, ["add", "-A"]);
                    const cleanPrompt = prompt
                      .replace(/[\r\n]+/g, " ")
                      .slice(0, 60)
                      .trim();
                    const commitMsg = `Agent: ${cleanPrompt || "Mise à jour du site"}`;
                    const commitRes = runTenantGit(project, [
                      "commit",
                      "-m",
                      commitMsg,
                    ]);
                    if (commitRes.exitCode === 0) {
                      const newHeadRes = runTenantGit(project, [
                        "rev-parse",
                        "HEAD",
                      ]);
                      commitHash =
                        newHeadRes.exitCode === 0
                          ? newHeadRes.stdout
                          : undefined;
                      console.log(
                        `[Runner] Auto-committed non-stream turn for ${project}: ${commitHash} (prev: ${prevCommitHash})`,
                      );
                    }
                  } else {
                    // No uncommitted working-tree changes: check current HEAD (agent may have committed with git tool)
                    const curHeadRes = runTenantGit(project, [
                      "rev-parse",
                      "HEAD",
                    ]);
                    commitHash =
                      curHeadRes.exitCode === 0
                        ? curHeadRes.stdout
                        : prevCommitHash;
                  }
                } catch (gitErr: any) {
                  console.error(
                    `[Runner] Failed to auto-commit non-stream turn for ${project}:`,
                    gitErr.message,
                  );
                }
              }

              return {
                success,
                response: stdout || stderr,
                profileUsed: activeProfile,
                conversationId: conversationId || `conv_${Date.now()}`,
                exitCode: success ? 0 : proc.exitCode || 1,
                savedImageUrl: savedImageUrl || undefined,
                commitHash,
                prevCommitHash,
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
  websocket: {
    open(ws: any) {
      const devPort = ws.data?.devPort;
      const protocol = ws.data?.protocol || "vite-hmr";
      const rawSubPath = ws.data?.subPath || "/";
      const cleanSubPath =
        rawSubPath.replace(/^\/(?:dev|prod|preview)\/[^/?]+/, "") || "/";
      const subPath = cleanSubPath.startsWith("/")
        ? cleanSubPath
        : "/" + cleanSubPath;
      try {
        const queue: any[] = [];
        ws.data.queue = queue;

        const targetWs = new WebSocket(
          `ws://127.0.0.1:${devPort}${subPath}`,
          protocol,
        );
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
            `[Vite WS Proxy] Backend error for ${ws.data?.tenantSlug}:`,
            err.message,
          );
        };
      } catch (err: any) {
        console.error(
          `[Vite WS Proxy] Failed to connect to Vite on port ${devPort}:`,
          err.message,
        );
        try {
          ws.close(1011, "Backend dev server unreachable");
        } catch {}
      }
    },
    message(ws: any, message: any) {
      if (ws.data?.targetWs && ws.data.targetWs.readyState === WebSocket.OPEN) {
        try {
          ws.data.targetWs.send(message);
        } catch {}
      } else if (ws.data?.queue) {
        ws.data.queue.push(message);
      }
    },
    close(ws: any, code: number, reason: string) {
      if (ws.data?.targetWs) {
        try {
          ws.data.targetWs.close(code, reason);
        } catch {}
      }
    },
  },
});

/**
 * Automatically prunes node_modules for tenants that have been inactive for > 14 days.
 * Source code, git history, and SQLite data remain completely safe.
 */
function pruneInactiveTenants() {
  const tenantsDir = join(DATA_DIR, "tenants");
  if (!existsSync(tenantsDir)) return;
  const now = Date.now();
  const maxInactiveMs = 14 * 24 * 60 * 60 * 1000;
  for (const slug of readdirSync(tenantsDir)) {
    if (tenantDevServers.has(slug)) continue;
    const nodeModules = join(tenantsDir, slug, "code", "node_modules");
    if (!existsSync(nodeModules)) continue;
    try {
      const stat = statSync(join(tenantsDir, slug, "code"));
      if (now - stat.mtimeMs > maxInactiveMs) {
        console.log(`[prune] Pruning inactive tenant node_modules: ${slug}`);
        rmSync(nodeModules, { recursive: true, force: true });
      }
    } catch {}
  }
}

setTimeout(pruneInactiveTenants, 60000);
setInterval(pruneInactiveTenants, 24 * 60 * 60 * 1000);

console.log(`🤖 Ether Agent Runner Server started on port ${PORT}`);
