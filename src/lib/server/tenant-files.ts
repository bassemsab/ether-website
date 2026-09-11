import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, normalize, relative, resolve } from "path";

export type SupportedEditorLang = "html" | "typescript" | "json";

export interface TenantFileSummary {
  name: string;
  path: string;
  lang: SupportedEditorLang;
  content: string;
  size: number;
}

const IGNORED_DIRS = new Set([
  "node_modules",
  ".svelte-kit",
  ".git",
  ".gemini-sandbox",
  ".gemini",
  "dist",
  "build",
  ".local-data",
]);

const IGNORED_FILES = new Set([
  "bun.lock",
  "package-lock.json",
  "yarn.lock",
  ".DS_Store",
  "thumbs.db",
]);

/**
 * Returns the absolute directory path where tenant code is stored.
 */
export function getTenantCodeDir(slug: string): string {
  const dataDir =
    process.env.DATA_DIR ||
    (process.platform === "darwin"
      ? join(process.cwd(), ".local-data")
      : "/data");
  const codeDir = join(dataDir, "tenants", slug, "code");
  if (!existsSync(codeDir)) {
    mkdirSync(codeDir, { recursive: true });
  }
  return codeDir;
}

/**
 * Maps a file extension to a CodeMirror-supported language.
 */
export function detectFileLang(filename: string): SupportedEditorLang {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "typescript";
  return "html";
}

/**
 * Recursively scans the tenant code directory and returns all editable source files.
 */
export function listTenantFiles(
  slug: string,
): Record<string, TenantFileSummary> {
  const rootDir = getTenantCodeDir(slug);
  const result: Record<string, TenantFileSummary> = {};

  function scan(currentDir: string) {
    if (!existsSync(currentDir)) return;
    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryName = entry.name;
      const fullPath = join(currentDir, entryName);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entryName)) {
          scan(fullPath);
        }
      } else if (entry.isFile()) {
        if (IGNORED_FILES.has(entryName) || entryName.startsWith(".")) {
          continue;
        }

        const stat = statSync(fullPath);
        // Exclude files larger than 500KB (e.g. bundle outputs or media)
        if (stat.size > 500 * 1024) continue;

        const relPath = relative(rootDir, fullPath).replace(/\\/g, "/");
        const lang = detectFileLang(entryName);

        try {
          const content = readFileSync(fullPath, "utf-8");
          result[relPath] = {
            name: entryName,
            path: relPath,
            lang,
            content,
            size: stat.size,
          };
        } catch {
          // Binary or non-UTF8 file, skip
        }
      }
    }
  }

  scan(rootDir);

  // If the directory is completely empty, create a minimal initial template
  if (Object.keys(result).length === 0) {
    const defaultPagePath = "src/routes/+page.svelte";
    const defaultPageCode = `<script lang="ts">
  let count = $state(0);
</script>

<svelte:head>
  <title>${slug} — Site Officiel</title>
</svelte:head>

<main class="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
  <div class="max-w-2xl w-full text-center space-y-6">
    <span class="inline-block px-3 py-1 rounded-full border border-brand/20 bg-brand/5 text-brand text-xs font-mono">
      ${slug}.ether.paris
    </span>
    <h1 class="font-display text-5xl text-foreground font-normal tracking-tight">
      Bienvenue sur ${slug}
    </h1>
    <p class="text-muted-foreground text-sm leading-relaxed">
      Propulsé par Ether Studio · SvelteKit 5 Runes & Bun Runtime
    </p>
    <div class="p-6 rounded-2xl bg-surface/80 border border-black/10 flex items-center justify-center gap-4">
      <button onclick={() => count++} class="px-6 py-3 rounded-full bg-brand text-white text-xs font-medium uppercase tracking-[0.2em]">
        Compteur : {count}
      </button>
    </div>
  </div>
</main>`;

    saveTenantFile(slug, defaultPagePath, defaultPageCode);
    result[defaultPagePath] = {
      name: "+page.svelte",
      path: defaultPagePath,
      lang: "html",
      content: defaultPageCode,
      size: defaultPageCode.length,
    };
  }

  return result;
}

/**
 * Saves or updates a tenant file on disk with strict path containment check.
 */
export function saveTenantFile(
  slug: string,
  relPath: string,
  content: string,
): boolean {
  const rootDir = resolve(getTenantCodeDir(slug));
  const targetPath = resolve(rootDir, relPath);

  // Path traversal security check
  if (!targetPath.startsWith(rootDir + "/") && targetPath !== rootDir) {
    throw new Error(
      "Tentative d'accès non autorisé en dehors de l'espace de travail du site.",
    );
  }

  // Ensure parent directory exists
  const parentDir = join(targetPath, "..");
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  writeFileSync(targetPath, content, "utf-8");
  return true;
}
