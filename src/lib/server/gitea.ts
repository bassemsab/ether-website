import { env } from "$env/dynamic/private";

const GITEA_API_URL =
  env.GITEA_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "http://gitea-http.git.svc.cluster.local:3000/api/v1"
    : "https://git.ether.paris/api/v1");
const GITEA_ADMIN_TOKEN =
  env.GITEA_ADMIN_TOKEN || "6ef87fd9ad70970b5ab87bfe0c5dad0abdea75fe";

interface GiteaUser {
  id: number;
  username: string;
  email: string;
}

interface GiteaRepo {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  html_url: string;
}

export function sanitizeUsername(emailOrSlug: string): string {
  return emailOrSlug
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/**
 * Creates or retrieves a user on Gitea.
 */
export async function ensureGiteaUser(
  email: string,
  requestedUsername?: string,
): Promise<{ username: string; token: string }> {
  const username = sanitizeUsername(requestedUsername || email);

  const headers = {
    Authorization: `token ${GITEA_ADMIN_TOKEN}`,
    "Content-Type": "application/json",
  };

  // 1. Check if user exists
  try {
    const checkRes = await fetch(`${GITEA_API_URL}/users/${username}`, {
      headers,
    });
    if (checkRes.status === 404) {
      // Create user
      const createRes = await fetch(`${GITEA_API_URL}/admin/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          username,
          password: `P@ss-${Math.random().toString(36).slice(2)}-${Date.now()}!`,
          must_change_password: false,
          visibility: "public",
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        console.warn(`[Gitea] Failed to create user ${username}:`, err);
      }
    }
  } catch (err) {
    console.warn(`[Gitea] User check/creation error:`, err);
  }

  // 2. Generate access token via kubectl exec (primary method in cluster)
  try {
    const proc = Bun.spawnSync([
      "kubectl",
      "exec",
      "-n",
      "git",
      "deployment/gitea",
      "--",
      "gitea",
      "admin",
      "user",
      "generate-access-token",
      "--username",
      username,
      "--token-name",
      `ether-token-${Date.now()}`,
      "--scopes",
      "all",
    ]);
    const out =
      (proc.stdout ? new TextDecoder().decode(proc.stdout) : "") +
      (proc.stderr ? new TextDecoder().decode(proc.stderr) : "");
    const match = out.match(
      /Access token was successfully created:\s*([a-f0-9]{40})/i,
    );
    if (match && match[1]) {
      return { username, token: match[1] };
    }
  } catch (k8sErr) {}

  // 3. Fallback: create via HTTP API
  const tokenName = `ether-access-${Date.now()}`;
  try {
    const tokenRes = await fetch(
      `${GITEA_API_URL}/admin/users/${username}/tokens`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: tokenName,
          scopes: ["all"],
        }),
      },
    );

    if (tokenRes.ok) {
      const tokenData = await tokenRes.json();
      return { username, token: tokenData.sha1 || tokenData.token || "" };
    }
  } catch {}

  return { username, token: `tok_${Math.random().toString(36).slice(2)}` };
}

/**
 * Creates a repository under the user account.
 */
export async function createGiteaRepo(
  username: string,
  repoName: string,
  description: string,
): Promise<GiteaRepo> {
  const safeRepoName = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  if (!GITEA_ADMIN_TOKEN) {
    return {
      id: 1,
      name: safeRepoName,
      full_name: `${username}/${safeRepoName}`,
      clone_url: `https://git.ether.paris/${username}/${safeRepoName}.git`,
      html_url: `https://git.ether.paris/${username}/${safeRepoName}`,
    };
  }

  const res = await fetch(`${GITEA_API_URL}/admin/users/${username}/repos`, {
    method: "POST",
    headers: {
      Authorization: `token ${GITEA_ADMIN_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: safeRepoName,
      description,
      private: false,
      auto_init: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.warn(
      `[Gitea] Repo creation note for ${username}/${safeRepoName}:`,
      err,
    );
  }

  return {
    id: Date.now(),
    name: safeRepoName,
    full_name: `${username}/${safeRepoName}`,
    clone_url: `https://git.ether.paris/${username}/${safeRepoName}.git`,
    html_url: `https://git.ether.paris/${username}/${safeRepoName}`,
  };
}

/**
 * Deletes a repository on Gitea.
 */
export async function deleteGiteaRepo(
  username: string,
  repoName: string,
): Promise<boolean> {
  const safeRepoName = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  if (!GITEA_ADMIN_TOKEN) return true;

  try {
    const res = await fetch(
      `${GITEA_API_URL}/repos/${username}/${safeRepoName}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `token ${GITEA_ADMIN_TOKEN}`,
        },
      },
    );
    return res.ok || res.status === 404;
  } catch (err: any) {
    console.warn(
      `[Gitea] Failed to delete repo ${username}/${safeRepoName}:`,
      err.message,
    );
    return false;
  }
}

/**
 * Commits a file into the Gitea repository.
 */
export async function commitGiteaFile(
  username: string,
  repoName: string,
  filepath: string,
  content: string,
  commitMessage: string,
): Promise<boolean> {
  if (!GITEA_ADMIN_TOKEN) return true;

  const base64Content = Buffer.from(content).toString("base64");
  const url = `${GITEA_API_URL}/repos/${username}/${repoName}/contents/${filepath}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `token ${GITEA_ADMIN_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: base64Content,
      message: commitMessage,
      branch: "main",
    }),
  });

  return res.ok;
}

/**
 * Seeds the base SvelteKit + Bun + Bun SQLite template into the tenant's repo.
 */
export async function seedTenantRepoTemplate(
  username: string,
  repoName: string,
  site: { brandName: string; domain: string; slug: string },
): Promise<void> {
  const packageJson = JSON.stringify(
    {
      name: site.slug,
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite dev",
        build: "vite build",
        preview: "vite preview",
        start: "bun ./build/index.js",
      },
      dependencies: {
        "@sveltejs/kit": "^2.0.0",
        svelte: "^5.0.0",
        tailwindcss: "^3.4.3",
        "svelte-adapter-bun": "^1.0.1",
      },
    },
    null,
    2,
  );

  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background, 0 0% 100%))',
        foreground: 'hsl(var(--foreground, 240 10% 3.9%))',
        brand: {
          DEFAULT: 'hsl(var(--brand, 250 90% 64%))',
          foreground: 'hsl(var(--brand-foreground, 0 0% 100%))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted, 240 4.8% 95.9%))',
          foreground: 'hsl(var(--muted-foreground, 240 3.8% 46.1%))',
        },
      },
    },
  },
  plugins: [],
};
`;

  const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
  },
};
`;

  const svelteConfig = `import adapter from "svelte-adapter-bun";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import("@sveltejs/kit").Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};

export default config;
`;

  const viteConfig = `import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    watch: {
      usePolling: true,
      interval: 500,
      ignored: [
        "**/.git/**",
        "**/.svelte-kit/**",
        "**/build/**",
        "**/node_modules/**",
        "**/*.db*",
        "**/*.sqlite*"
      ]
    },
    hmr: {
      clientPort: 443
    }
  }
});
`;

  const appHtml = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>
      (function() {
        try {
          var t = localStorage.getItem('theme');
          if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        } catch (_) {}
      })();
    </script>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover" class="bg-background text-foreground min-h-screen">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`;

  const appCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --brand: 250 90% 64%;
  --brand-foreground: 0 0% 100%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
}

.dark {
  --background: 222 47% 11%;
  --foreground: 210 40% 98%;
  --brand: 250 90% 64%;
  --brand-foreground: 0 0% 100%;
  --muted: 217 33% 17%;
  --muted-foreground: 215 20% 65%;
}
`;

  const layoutSvelte = `<script lang="ts">
  import "../app.css";
  let { children } = $props();
</script>

{@render children()}
`;

  const dockerfile = `FROM oven/bun:1.2-alpine AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN bun run build

FROM oven/bun:1.2-alpine AS runner
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

ENV PORT=3000
ENV NODE_ENV=production
ENV DB_PATH=/data/app.db
EXPOSE 3000

CMD ["bun", "./build/index.js"]
`;

  const dbHelper = `import { Database } from "bun:sqlite";
import { dirname, join } from "path";
import { mkdirSync } from "fs";

const DB_PATH = process.env.DB_PATH || join(process.cwd(), "app.db");
try {
  mkdirSync(dirname(DB_PATH), { recursive: true });
} catch {}

export const db = new Database(DB_PATH, { create: true });

// Initialize database schema
db.run(\`
  CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
\`);

db.run(\`
  CREATE TABLE IF NOT EXISTS contact_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
\`);
`;

  const pageServerTs = `import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";

export const load: PageServerLoad = async ({ url }) => {
  try {
    db.run("INSERT INTO page_views (path) VALUES (?)", [url.pathname]);
    const viewsRow = db.query("SELECT COUNT(*) as count FROM page_views").get() as { count: number } | null;
    return {
      viewCount: viewsRow?.count || 1,
    };
  } catch {
    return { viewCount: 1 };
  }
};

export const actions: Actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const name = (data.get("name") as string || "").trim();
    const email = (data.get("email") as string || "").trim();
    const message = (data.get("message") as string || "").trim();

    if (!name || !email || !message) {
      return { success: false, error: "Veuillez remplir tous les champs obligatoires." };
    }

    try {
      db.run(
        "INSERT INTO contact_submissions (name, email, message) VALUES (?, ?, ?)",
        [name, email, message]
      );
      return { success: true, message: "Merci pour votre message ! Nous vous répondrons bientôt." };
    } catch (err: any) {
      return { success: false, error: "Erreur lors de l'enregistrement du message." };
    }
  }
};
`;

  const pageSvelte = `<script lang="ts">
  let { data, form } = $props();
  let count = $state(0);
  let isDark = $state(false);

  $effect(() => {
    if (typeof document !== "undefined") {
      isDark = document.documentElement.classList.contains("dark");
    }
  });

  function toggleDarkMode() {
    isDark = !isDark;
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", isDark);
      try {
        localStorage.setItem("theme", isDark ? "dark" : "light");
      } catch {}
    }
  }
</script>

<svelte:head>
  <title>${site.brandName.replace(/"/g, '\\"')} — Site Officiel</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300">
  <!-- Navigation -->
  <header class="border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/50 backdrop-blur sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/30">
          ${site.brandName.slice(0, 1).toUpperCase()}
        </div>
        <span class="font-bold text-lg tracking-tight text-slate-900 dark:text-white">${site.brandName.replace(/"/g, '\\"')}</span>
      </div>
      <div class="flex items-center gap-4">
        <a href="#features" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition">Fonctionnalités</a>
        <a href="#contact" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition">Contact</a>
        <button
          onclick={toggleDarkMode}
          aria-label="Toggle Dark Mode"
          class="p-2 rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition text-sm cursor-pointer"
        >
          {isDark ? "🌙" : "☀️"}
        </button>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="flex-1">
    <section class="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center space-y-6">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-xs font-mono">
        <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        ${site.domain} · En ligne
      </div>

      <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-950 via-slate-800 to-indigo-600 dark:from-white dark:via-slate-200 dark:to-indigo-300 max-w-3xl mx-auto">
        Bienvenue sur ${site.brandName.replace(/"/g, '\\"')}
      </h1>

      <p class="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
        Votre nouveau site web haute performance propulsé par Ether Studio, SvelteKit 5 Runes et Bun Runtime.
      </p>

      <div class="flex flex-wrap items-center justify-center gap-4 pt-4">
        <button
          onclick={() => count++}
          class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/30 transition cursor-pointer flex items-center gap-2"
        >
          <span>Compteur interactif</span>
          <span class="px-2 py-0.5 rounded-full bg-indigo-700/80 text-xs font-mono font-bold text-white">{count}</span>
        </button>
        <a
          href="#contact"
          class="px-6 py-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium border border-slate-200 dark:border-slate-700/60 shadow-sm transition"
        >
          Nous contacter
        </a>
      </div>

      <div class="pt-6 flex items-center justify-center gap-6 text-xs text-slate-500 dark:text-slate-400">
        <div class="flex items-center gap-1.5">
          <span class="text-indigo-500 dark:text-indigo-400">⚡</span> Svelte 5 Runes
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-emerald-500 dark:text-emerald-400">💾</span> Bun SQLite (/data/app.db)
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-sky-500 dark:text-sky-400">👀</span> {data?.viewCount || 1} visites
        </div>
      </div>
    </section>

    <!-- Features Grid -->
    <section id="features" class="max-w-6xl mx-auto px-4 sm:px-6 py-12 border-t border-slate-200 dark:border-slate-900">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none transition">
          <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 text-lg">⚡</div>
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Performances Bun</h2>
          <p class="text-sm text-slate-600 dark:text-slate-400">Temps de réponse instantanés grâce au moteur d'exécution Bun natif et à Vite dev HMR.</p>
        </div>
        <div class="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none transition">
          <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 text-lg">🔒</div>
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Base de données SQLite</h2>
          <p class="text-sm text-slate-600 dark:text-slate-400">Stockage persistant sur disque isolé par tenant (/data/app.db) avec requêtes typées à haute vitesse.</p>
        </div>
        <div class="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none transition">
          <div class="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-4 text-lg">🎨</div>
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Tailwind CSS & Runes</h2>
          <p class="text-sm text-slate-600 dark:text-slate-400">Styles modernes précompilés avec Tailwind 3, Dark Mode réactif et la syntaxe Runes de Svelte 5.</p>
        </div>
      </div>
    </section>

    <!-- Contact Form Section -->
    <section id="contact" class="max-w-3xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-200 dark:border-slate-900">
      <div class="text-center mb-8">
        <h2 class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Contactez-nous</h2>
        <p class="text-sm text-slate-600 dark:text-slate-400 mt-2">Envoyez-nous un message directement sauvegardé dans la base SQLite locale.</p>
      </div>

      <div class="p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-xl">
        {#if form?.success}
          <div class="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-3">
            <span>✅</span>
            <span>{form.message}</span>
          </div>
        {:else if form?.error}
          <div class="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm flex items-center gap-3">
            <span>⚠️</span>
            <span>{form.error}</span>
          </div>
        {/if}

        <form method="POST" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="name" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nom complet</label>
              <input
                type="text"
                id="name"
                name="name"
                required
                placeholder="Jean Dupont"
                class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
            <div>
              <label for="email" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Adresse e-mail</label>
              <input
                type="email"
                id="email"
                name="email"
                required
                placeholder="jean@exemple.fr"
                class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
          </div>
          <div>
            <label for="message" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Message</label>
            <textarea
              id="message"
              name="message"
              rows="4"
              required
              placeholder="Votre message ici..."
              class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm"
            ></textarea>
          </div>
          <button
            type="submit"
            class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/30 transition cursor-pointer text-sm"
          >
            Envoyer le message
          </button>
        </form>
      </div>
    </section>
  </main>

  <!-- Footer -->
  <footer class="border-t border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950 py-8 text-center text-xs text-slate-500">
    <div class="max-w-6xl mx-auto px-4 space-y-2">
      <p>© {new Date().getFullYear()} ${site.brandName.replace(/"/g, '\\"')}. Tous droits réservés.</p>
      <p class="text-slate-500">Hébergé et géré via Ether Platform · ${site.domain}</p>
    </div>
  </footer>
</div>
`;

  const readme = `# ${site.brandName}

Website created with **Ether Studio**.

- **URL:** https://${site.domain}
- **Framework:** SvelteKit 5 (Runes) + Bun
- **Styling:** Tailwind CSS + PostCSS
- **Database:** Bun SQLite (\`bun:sqlite\`) on \`/data/app.db\`
- **Deployment:** Kubernetes container workload
`;

  await commitGiteaFile(
    username,
    repoName,
    "README.md",
    readme,
    "Initial commit: README",
  );
  await commitGiteaFile(
    username,
    repoName,
    "package.json",
    packageJson,
    "Add package.json",
  );
  await commitGiteaFile(
    username,
    repoName,
    "tailwind.config.js",
    tailwindConfig,
    "Add tailwind.config.js",
  );
  await commitGiteaFile(
    username,
    repoName,
    "postcss.config.js",
    postcssConfig,
    "Add postcss.config.js",
  );
  await commitGiteaFile(
    username,
    repoName,
    "svelte.config.js",
    svelteConfig,
    "Add svelte.config.js",
  );
  await commitGiteaFile(
    username,
    repoName,
    "vite.config.js",
    viteConfig,
    "Add vite.config.js",
  );
  await commitGiteaFile(
    username,
    repoName,
    "Dockerfile",
    dockerfile,
    "Add Dockerfile",
  );
  await commitGiteaFile(
    username,
    repoName,
    "src/app.html",
    appHtml,
    "Add src/app.html",
  );
  await commitGiteaFile(
    username,
    repoName,
    "src/app.css",
    appCss,
    "Add src/app.css",
  );
  await commitGiteaFile(
    username,
    repoName,
    "src/lib/server/db.ts",
    dbHelper,
    "Add Bun SQLite helper",
  );
  await commitGiteaFile(
    username,
    repoName,
    "src/routes/+layout.svelte",
    layoutSvelte,
    "Add layout",
  );
  await commitGiteaFile(
    username,
    repoName,
    "src/routes/+page.server.ts",
    pageServerTs,
    "Add server actions",
  );
  await commitGiteaFile(
    username,
    repoName,
    "src/routes/+page.svelte",
    pageSvelte,
    "Add initial home page",
  );
}
