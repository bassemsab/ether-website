<script lang="ts">
  import { onMount } from "svelte";

  interface TenantInfo {
    id: number;
    slug: string;
    brand_name?: string | null;
    domain?: string;
    subdomain?: string | null;
    custom_domain?: string | null;
  }

  interface Props {
    isOpen: boolean;
    tenant: TenantInfo;
    onclose: () => void;
    onconnected?: (domain: string) => void;
    onunlinked?: () => void;
  }

  let { isOpen, tenant, onclose, onconnected, onunlinked }: Props = $props();

  // Active Tab
  let activeTab = $state<"buy" | "connect">("buy");

  // Buy Tab state
  let searchQuery = $state("");
  let searchLoading = $state(false);
  let searchResults = $state<any[]>([]);
  let buyLoading = $state(false);

  // Connect Tab state
  let existingDomainInput = $state("");
  let connectLoading = $state(false);
  let connectStep = $state<string | null>(null);
  let connectError = $state<string | null>(null);
  let connectSuccess = $state<string | null>(null);

  // Unlink state
  let unlinkLoading = $state(false);

  const defaultSubdomain = $derived(
    tenant.subdomain || `${tenant.slug}.ether.paris`
  );
  const currentDomain = $derived(tenant.custom_domain || null);

  // Auto-search domain suggestions on modal open
  $effect(() => {
    if (isOpen && searchResults.length === 0 && !searchLoading) {
      searchQuery = tenant.slug || "";
      handleSearch(tenant.slug);
    }
  });

  async function handleSearch(term?: string) {
    const q = (term ?? searchQuery).trim();
    if (!q || q.length < 2) return;

    searchLoading = true;
    searchResults = [];
    connectError = null;

    try {
      const res = await fetch(`/api/domains/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success) {
        searchResults = json.results || [];
      }
    } catch (err: any) {
      console.error("Search domains error:", err);
    } finally {
      searchLoading = false;
    }
  }

  async function handleBuy(item: any) {
    if (item.isOwnedByAccount) {
      await handleConnectExisting(item.domain);
      return;
    }

    buyLoading = true;
    connectError = null;

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          domain: item.domain,
          provider: item.provider,
          priceCents: item.priceAnnualCents,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success || !json.url) {
        throw new Error(json.error || "Impossible d'initier la commande");
      }

      window.location.href = json.url;
    } catch (err: any) {
      connectError = err.message;
    } finally {
      buyLoading = false;
    }
  }

  async function handleConnectExisting(customDomain?: string) {
    const targetDomain = (customDomain || existingDomainInput).trim();
    if (!targetDomain) return;

    connectLoading = true;
    connectError = null;
    connectSuccess = null;
    connectStep = "1/3 : Configuration DNS Cloudflare (A: 135.181.95.61)...";

    try {
      setTimeout(() => {
        if (connectLoading) {
          connectStep = "2/3 : Routage Kubernetes Ingress & Certificat SSL Let's Encrypt...";
        }
      }, 1500);

      const res = await fetch("/api/tenant/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          slug: tenant.slug,
          domain: targetDomain,
          action: "link",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Impossible de relier ce domaine");
      }

      connectStep = null;
      connectSuccess = `✓ Le domaine ${json.domain} est maintenant relié et actif !`;
      if (onconnected) onconnected(json.domain);
    } catch (err: any) {
      connectError = err.message;
      connectStep = null;
    } finally {
      connectLoading = false;
    }
  }

  async function handleUnlink() {
    if (!confirm(`Détacher le domaine ${currentDomain} de ce site ?`)) return;

    unlinkLoading = true;
    connectError = null;

    try {
      const res = await fetch("/api/tenant/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          slug: tenant.slug,
          action: "unlink",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Impossible de détacher le domaine");
      }

      connectSuccess = "Domaine personnalisé détaché avec succès.";
      if (onunlinked) onunlinked();
    } catch (err: any) {
      connectError = err.message;
    } finally {
      unlinkLoading = false;
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
    onclick={onclose}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="retro-card bg-card text-foreground rounded-2xl shadow-2xl border border-black/15 dark:border-white/10 max-w-2xl w-full p-6 sm:p-8 cursor-default relative overflow-hidden space-y-6"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="font-display text-xl sm:text-2xl text-foreground font-normal tracking-tight">
            Nom de domaine personnalisé
          </h2>
          <p class="text-xs uppercase tracking-[0.15em] text-muted-foreground mt-0.5">
            Pour le site {tenant.brand_name || tenant.slug}
          </p>
        </div>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground text-sm font-mono cursor-pointer p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          onclick={onclose}
        >
          ✕
        </button>
      </div>

      <!-- Current Domain Status Banner -->
      <div class="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-surface/80 dark:bg-white/[0.03] space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono uppercase tracking-wider text-muted-foreground">Adresse actuelle</span>
          {#if currentDomain}
            <span class="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Domaine personnalisé actif
            </span>
          {:else}
            <span class="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-muted-foreground border border-black/10 dark:border-white/10">
              Sous-domaine Ether par défaut
            </span>
          {/if}
        </div>

        <div class="flex items-center justify-between gap-3 pt-1">
          <div class="font-mono text-base font-semibold truncate text-foreground">
            {#if currentDomain}
              https://{currentDomain}
            {:else}
              https://{defaultSubdomain}
            {/if}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            {#if currentDomain}
              <a
                href="https://{currentDomain}"
                target="_blank"
                rel="noopener"
                class="px-3 py-1 text-xs font-mono rounded-lg bg-brand/10 hover:bg-brand/20 text-brand font-medium transition-colors inline-flex items-center gap-1.5"
              >
                <span>Tester</span>
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <button
                type="button"
                onclick={handleUnlink}
                disabled={unlinkLoading}
                class="px-3 py-1 text-xs font-mono rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                {unlinkLoading ? '...' : 'Détacher'}
              </button>
            {:else}
              <a
                href="https://{defaultSubdomain}"
                target="_blank"
                rel="noopener"
                class="px-3 py-1 text-xs font-mono rounded-lg bg-surface border border-black/10 dark:border-white/10 hover:bg-surface/80 text-foreground transition-colors inline-flex items-center gap-1.5"
              >
                <span>Ouvrir</span>
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            {/if}
          </div>
        </div>
      </div>

      <!-- Navigation Tabs: Buy vs Connect -->
      <div class="flex items-center gap-2 border-b border-black/10 dark:border-white/10 pb-2">
        <button
          type="button"
          onclick={() => activeTab = "buy"}
          class="px-4 py-2 rounded-xl text-xs font-medium uppercase tracking-[0.15em] transition-all cursor-pointer {activeTab === 'buy' ? 'bg-brand text-white shadow-retro-sm' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'}"
        >
          Acheter un nom de domaine
        </button>
        <button
          type="button"
          onclick={() => activeTab = "connect"}
          class="px-4 py-2 rounded-xl text-xs font-medium uppercase tracking-[0.15em] transition-all cursor-pointer {activeTab === 'connect' ? 'bg-brand text-white shadow-retro-sm' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'}"
        >
          Lier un domaine existant
        </button>
      </div>

      <!-- TAB 1: BUY A NEW DOMAIN -->
      {#if activeTab === "buy"}
        <div class="space-y-4">
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Rechercher un nom (ex: {tenant.slug})"
              onkeydown={(e) => { if (e.key === "Enter") handleSearch(); }}
              class="flex-1 rounded-2xl border border-black/10 dark:border-white/10 bg-surface/80 dark:bg-white/[0.04] px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none text-sm font-neue"
            />
            <button
              type="button"
              onclick={() => handleSearch()}
              disabled={searchLoading}
              class="focus-ring px-6 py-2.5 rounded-full bg-brand hover:bg-brand/90 text-white text-xs font-medium uppercase tracking-[0.2em] shadow-retro-sm transition-all cursor-pointer disabled:opacity-50 hover:-translate-y-0.5 shrink-0"
            >
              {searchLoading ? 'Recherche...' : 'Vérifier'}
            </button>
          </div>

          {#if searchLoading}
            <div class="py-8 text-center text-xs font-mono text-muted-foreground flex items-center justify-center gap-2">
              <div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
              <span>Vérification de la disponibilité et des prix en direct...</span>
            </div>
          {:else if searchResults.length > 0}
            <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
              {#each searchResults as item}
                <div class="p-3.5 bg-surface dark:bg-white/[0.02] border border-black/10 dark:border-white/10 rounded-2xl flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span class="font-mono text-sm font-semibold text-foreground">{item.domain}</span>
                    {#if item.isOwnedByAccount}
                      <span class="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                        Votre Cloudflare
                      </span>
                    {:else}
                      <span class="text-xs font-mono px-2.5 py-0.5 rounded-full {item.available ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' : 'bg-surface border border-black/10 text-muted-foreground'}">
                        {item.available ? 'Disponible' : 'Pris'}
                      </span>
                    {/if}
                    <span class="text-xs px-2 py-0.5 rounded-full bg-surface/90 dark:bg-white/5 border border-black/10 dark:border-white/10 text-muted-foreground uppercase font-mono">
                      {item.provider}
                    </span>
                  </div>

                  <div class="flex items-center gap-3">
                    <span class="text-sm font-mono font-medium text-foreground">{item.formattedPrice}</span>
                    {#if item.isOwnedByAccount}
                      <button
                        type="button"
                        onclick={() => handleBuy(item)}
                        disabled={connectLoading}
                        class="focus-ring px-4 py-1.5 text-xs uppercase tracking-[0.15em] font-medium rounded-full bg-brand hover:bg-brand/90 text-white shadow-retro-sm transition-all cursor-pointer disabled:opacity-50"
                      >
                        Lier
                      </button>
                    {:else if item.available}
                      <button
                        type="button"
                        onclick={() => handleBuy(item)}
                        disabled={buyLoading}
                        class="focus-ring px-4 py-1.5 text-xs uppercase tracking-[0.15em] font-medium rounded-full bg-brand hover:bg-brand/90 text-white shadow-retro-sm transition-all cursor-pointer disabled:opacity-50"
                      >
                        Acheter
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <p class="text-xs text-muted-foreground leading-relaxed pt-1">
            Inclus : Enregistrement annuel officiel, routage DNS Cloudflare Edge, certificat SSL Let's Encrypt automatique et redirection email <code class="font-mono">contact@{searchQuery || 'votredomaine.com'}</code>.
          </p>
        </div>
      {/if}

      <!-- TAB 2: CONNECT EXISTING DOMAIN -->
      {#if activeTab === "connect"}
        <div class="space-y-4">
          <p class="text-xs text-muted-foreground leading-relaxed">
            Vous avez déjà acheté votre nom de domaine chez <b>OVH</b>, <b>Cloudflare</b>, <b>GoDaddy</b> ou un autre bureau d'enregistrement ? Connectez-le directement à votre site Ether.
          </p>

          <div class="flex gap-2">
            <input
              type="text"
              bind:value={existingDomainInput}
              placeholder="ex: miaw.ovh ou monentreprise.com"
              onkeydown={(e) => { if (e.key === "Enter") handleConnectExisting(); }}
              class="flex-1 rounded-2xl border border-black/10 dark:border-white/10 bg-surface/80 dark:bg-white/[0.04] px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none text-sm font-mono"
            />
            <button
              type="button"
              onclick={() => handleConnectExisting()}
              disabled={connectLoading || !existingDomainInput.trim()}
              class="focus-ring px-6 py-2.5 rounded-full bg-brand hover:bg-brand/90 text-white text-xs font-medium uppercase tracking-[0.2em] shadow-retro-sm transition-all cursor-pointer disabled:opacity-50 hover:-translate-y-0.5 shrink-0 inline-flex items-center gap-2"
            >
              {#if connectLoading}
                <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Connexion...</span>
              {:else}
                <span>Connecter</span>
              {/if}
            </button>
          </div>

          <!-- DNS Records Guide for External Registrars -->
          <div class="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-surface/40 dark:bg-white/[0.02] space-y-2.5">
            <div class="text-xs font-semibold uppercase tracking-wider text-foreground">
              Configuration DNS chez votre registrar
            </div>
            <p class="text-xs text-muted-foreground leading-relaxed">
              Si votre domaine est géré hors de Cloudflare, ajoutez simplement ces 2 enregistrements dans votre zone DNS :
            </p>
            <div class="space-y-1.5 font-mono text-xs">
              <div class="p-2 bg-surface dark:bg-black/20 rounded-lg border border-black/5 dark:border-white/5 flex items-center justify-between">
                <span><b class="text-brand">Type A</b> : @ (racine)</span>
                <span class="text-foreground font-semibold">135.181.95.61</span>
              </div>
              <div class="p-2 bg-surface dark:bg-black/20 rounded-lg border border-black/5 dark:border-white/5 flex items-center justify-between">
                <span><b class="text-brand">Type CNAME</b> : www</span>
                <span class="text-foreground font-semibold">{defaultSubdomain}</span>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Step-by-Step Live Feedback & Error Notifications -->
      {#if connectLoading && connectStep}
        <div class="p-3.5 rounded-xl bg-brand/10 border border-brand/20 text-brand text-xs font-mono flex items-center gap-2.5 animate-pulse">
          <div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0"></div>
          <span>{connectStep}</span>
        </div>
      {/if}

      {#if connectError}
        <div class="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-mono flex items-center justify-between">
          <span>{connectError}</span>
          <button type="button" onclick={() => connectError = null} class="text-red-500 hover:text-red-700">✕</button>
        </div>
      {/if}

      {#if connectSuccess}
        <div class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-mono flex items-center justify-between">
          <span>{connectSuccess}</span>
          <button type="button" onclick={() => connectSuccess = null} class="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      {/if}
    </div>
  </div>
{/if}
