import { env } from "$env/dynamic/private";

const GITEA_API_URL =
  env.GITEA_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "http://gitea-http.git.svc.cluster.local:3000/api/v1"
    : "https://git.ether.paris/api/v1");
const GITEA_ADMIN_TOKEN =
  env.GITEA_ADMIN_TOKEN ||
  "6ef87fd9ad70970b5ab87bfe0c5dad0abdea75fe";

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
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite dev --host 0.0.0.0",
        build: "vite build",
        preview: "vite preview",
        start: "bun ./build/index.js",
      },
      dependencies: {
        "@sveltejs/adapter-node": "^5.2.0",
        "@tailwindcss/vite": "^4.0.0",
        tailwindcss: "^4.0.0",
      },
      devDependencies: {
        "@sveltejs/kit": "^2.16.0",
        "@sveltejs/vite-plugin-svelte": "^5.0.0",
        svelte: "^5.0.0",
        vite: "^6.0.0",
      },
    },
    null,
    2,
  );

  const svelteConfig = `import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ out: 'build' })
	}
};

export default config;
`;

  const viteConfig = `import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		watch: {
			usePolling: true,
			interval: 100
		},
		hmr: {
			clientPort: 443
		}
	}
});
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

const DB_PATH = process.env.DB_PATH || "/data/app.db";
export const db = new Database(DB_PATH, { create: true });

// Initialize database schema
db.run(\`
  CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
\`);
`;

  const pageSvelte = `<script lang="ts">
  let count = $state(0);
  const brandName = "${site.brandName.replace(/"/g, '\\"')}";
  const domain = "${site.domain}";
</script>

<svelte:head>
  <title>{brandName}</title>
</svelte:head>

<main class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col items-center justify-center p-6">
  <div class="max-w-2xl w-full text-center space-y-6">
    <div class="inline-block px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-indigo-400 text-xs font-mono tracking-wider">
      {domain}
    </div>
    
    <h1 class="text-5xl font-extrabold tracking-tight sm:text-6xl bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-300">
      {brandName}
    </h1>
    
    <p class="text-lg text-slate-300">
      Propulsé par Ether Studio · SvelteKit 5 Runes & Bun Runtime
    </p>

    <div class="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl shadow-xl flex items-center justify-center gap-4">
      <button 
        onclick={() => count++}
        class="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
      >
        Compteur interactif : {count}
      </button>
    </div>

    <p class="text-xs text-slate-500">
      Base de données persistante SQLite connectée sur <code>/data/app.db</code>
    </p>
  </div>
</main>
`;

  const readme = `# ${site.brandName}

Website created with **Ether Studio**.

- **URL:** https://${site.domain}
- **Framework:** SvelteKit 5 (Runes) + Bun
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
    "svelte.config.js",
    svelteConfig,
    "Add svelte.config.js",
  );
  await commitGiteaFile(
    username,
    repoName,
    "vite.config.ts",
    viteConfig,
    "Add vite.config.ts",
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
    "src/lib/server/db.ts",
    dbHelper,
    "Add Bun SQLite helper",
  );
  await commitGiteaFile(
    username,
    repoName,
    "src/routes/+page.svelte",
    pageSvelte,
    "Add initial home page",
  );
}
