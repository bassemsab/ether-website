import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getTenantBySlug, checkTenantPromptLimit } from "$lib/server/db";
import { getRunnerProfiles } from "$lib/server/agent-bridge";

export const load: PageServerLoad = async ({ url, locals }) => {
  if (!locals.user) {
    const returnUrl = url.pathname + url.search;
    throw redirect(302, `/login?redirect=${encodeURIComponent(returnUrl)}`);
  }

  const projectSlug = url.searchParams.get("project") || "tester";
  let tenant = await getTenantBySlug(projectSlug);

  const tenantData = tenant || {
    id: 0,
    slug: projectSlug,
    subdomain: `${projectSlug}.ether.paris`,
    brand_name: projectSlug,
    domain: `${projectSlug}.ether.paris`,
    custom_domain: null,
    k8s_namespace: `tenant-${projectSlug}`,
    git_repo_url: `https://git.ether.paris/${projectSlug}/${projectSlug}.git`,
    plan: "demo",
    status: "active",
  };

  const brandName = tenantData.brand_name || tenantData.slug || projectSlug;
  const subdomain = tenantData.subdomain || `${projectSlug}.ether.paris`;

  const plan = tenant?.plan || "demo";
  const promptQuota = checkTenantPromptLimit(projectSlug, plan);

  let availableProfiles: string[] = ["primary", "secondary"];
  try {
    const runnerProfiles = await getRunnerProfiles();
    if (runnerProfiles && runnerProfiles.length > 0) {
      availableProfiles = runnerProfiles.map((p) => p.name);
    }
  } catch (e) {}

  // Initial code template preview for the code editor
  const defaultPageCode = `<script lang="ts">
  let count = $state(0);
  const brandName = "${brandName}";
</script>

<svelte:head>
  <title>{brandName} — Site Officiel</title>
</svelte:head>

<main class="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
  <div class="max-w-2xl w-full text-center space-y-6">
    <span class="inline-block px-3 py-1 rounded-full border border-brand/20 bg-brand/5 text-brand text-xs font-mono">
      ${subdomain}
    </span>
    <h1 class="font-display text-5xl text-foreground font-normal tracking-tight">
      {brandName}
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

  return {
    tenant: tenantData,
    projectSlug,
    defaultCode: defaultPageCode,
    user: locals.user,
    promptQuota: {
      ...promptQuota,
      plan,
    },
    availableProfiles,
  };
};
