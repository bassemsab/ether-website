<script lang="ts">
  import { onMount } from "svelte";
  import InfoBox from "$lib/components/info-box.svelte";

  interface TenantInfo {
    id: number;
    slug: string;
    email?: string;
    brand_name?: string | null;
    domain?: string;
    subdomain?: string | null;
    custom_domain?: string | null;
    stalwart_username?: string | null;
    stalwart_password?: string | null;
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
  let activeTab = $state<"buy" | "connect" | "email">("buy");

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

  // Owned Domains state
  let ownedDomains = $state<any[]>([]);
  let ownedLoading = $state(false);

  async function loadOwnedDomains() {
    if (!tenant?.id && !tenant?.slug) return;
    ownedLoading = true;
    try {
      const res = await fetch(`/api/tenant/custom-domain?tenantId=${tenant.id}&slug=${encodeURIComponent(tenant.slug)}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.ownedDomains)) {
        ownedDomains = json.ownedDomains;
      }
    } catch (err) {
      console.warn("Failed to load owned domains:", err);
    } finally {
      ownedLoading = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      loadOwnedDomains();
    }
  });

  // Email & SMTP state
  let smtpInfo = $state<{
    host: string;
    port: number;
    security?: string;
    username: string;
    password: string;
  } | null>(null);

  let showPassword = $state(false);
  let copiedField = $state<string | null>(null);

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    copiedField = field;
    setTimeout(() => {
      if (copiedField === field) copiedField = null;
    }, 2000);
  }

  // DNS check state
  let dnsCheckLoading = $state(false);
  let dnsCheckResult = $state<{ propagated: boolean; message: string } | null>(null);

  async function handleCheckDns() {
    const domain = (existingDomainInput || currentDomain || "").trim();
    if (!domain) return;

    dnsCheckLoading = true;
    dnsCheckResult = null;
    try {
      const res = await fetch(`/api/domains/check-dns?domain=${encodeURIComponent(domain)}`);
      const json = await res.json();
      dnsCheckResult = {
        propagated: !!json.propagated,
        message: json.message || (json.propagated ? "DNS actif !" : "En attente de propagation"),
      };
    } catch {
      dnsCheckResult = { propagated: false, message: "Impossible de vérifier le DNS pour le moment." };
    } finally {
      dnsCheckLoading = false;
    }
  }

  // Unlink state
  let unlinkLoading = $state(false);

  const defaultSubdomain = $derived(
    tenant.subdomain || `${tenant.slug}.ether.paris`
  );
  const currentDomain = $derived(tenant.custom_domain || null);

  $effect(() => {
    if (tenant.stalwart_username && tenant.stalwart_password && !smtpInfo) {
      smtpInfo = {
        host: "mail.ether.paris",
        port: 587,
        security: "STARTTLS",
        username: tenant.stalwart_username,
        password: tenant.stalwart_password,
      };
    }
  });

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
    connectStep = "1/2 : Vérification DNS (A pointant vers 135.181.95.61)...";

    try {
      setTimeout(() => {
        if (connectLoading) {
          connectStep = "2/2 : Routage Kubernetes Ingress & Certificat SSL Let's Encrypt...";
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

      if (json.smtp) {
        smtpInfo = json.smtp;
      }
      connectStep = null;
      connectSuccess = `✓ Le domaine ${json.domain} est maintenant relié ! Redirection email et SMTP Gmail configurés.`;
      if (onconnected) onconnected(json.domain);
      loadOwnedDomains();
      activeTab = "email";
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
      loadOwnedDomains();
    } catch (err: any) {
      connectError = err.message;
    } finally {
      unlinkLoading = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (isOpen && e.key === "Escape") onclose(); }} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto cursor-pointer"
    onclick={onclose}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="retro-card bg-card text-foreground rounded-2xl shadow-2xl border border-black/15 dark:border-white/10 max-w-2xl w-full max-h-[90vh] flex flex-col cursor-default relative overflow-hidden my-auto"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Pinned Header & Navigation Tabs -->
      <div class="p-5 sm:p-6 pb-3 border-b border-black/10 dark:border-white/10 shrink-0 space-y-4 bg-card">
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
            title="Fermer (Esc)"
          >
            ✕
          </button>
        </div>

        <!-- Navigation Tabs: Buy vs Connect vs Email -->
        <div class="flex items-center gap-2 overflow-x-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pt-0.5">
          <button
            type="button"
            onclick={() => { activeTab = "buy"; connectError = null; connectSuccess = null; }}
            class="px-3.5 py-1.5 rounded-xl text-xs font-medium uppercase tracking-[0.15em] transition-all cursor-pointer shrink-0 {activeTab === 'buy' ? 'bg-brand text-white shadow-retro-sm' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'}"
          >
            Acheter un domaine
          </button>
          <button
            type="button"
            onclick={() => { activeTab = "connect"; connectError = null; connectSuccess = null; }}
            class="px-3.5 py-1.5 rounded-xl text-xs font-medium uppercase tracking-[0.15em] transition-all cursor-pointer shrink-0 {activeTab === 'connect' ? 'bg-brand text-white shadow-retro-sm' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'}"
          >
            Lier un domaine
          </button>
          <button
            type="button"
            onclick={() => { activeTab = "email"; connectError = null; connectSuccess = null; }}
            class="px-3.5 py-1.5 rounded-xl text-xs font-medium uppercase tracking-[0.15em] transition-all cursor-pointer shrink-0 {activeTab === 'email' ? 'bg-brand text-white shadow-retro-sm' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'} inline-flex items-center gap-1.5"
          >
            <span>Messagerie &amp; Gmail</span>
            {#if currentDomain}
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            {/if}
          </button>
        </div>
      </div>

      <!-- Scrollable Tab Content Body -->
      <div class="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
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
                    <span class="text-xs font-mono px-2.5 py-0.5 rounded-full {item.available ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' : 'bg-surface border border-black/10 text-muted-foreground'}">
                      {item.available ? 'Disponible' : 'Pris'}
                    </span>
                    <span class="text-xs px-2 py-0.5 rounded-full bg-surface/90 dark:bg-white/5 border border-black/10 dark:border-white/10 text-muted-foreground uppercase font-mono">
                      {item.provider}
                    </span>
                  </div>

                  <div class="flex items-center gap-3">
                    <span class="text-sm font-mono font-medium text-foreground">{item.formattedPrice}</span>
                    {#if item.available}
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
        <div class="space-y-5">
          <!-- SECTION 1: VOS DOMAINES SUR ETHER -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                <span>Vos domaines sur Ether</span>
                {#if ownedDomains.length > 0}
                  <span class="px-2 py-0.5 text-[10px] font-mono rounded-full bg-brand/10 text-brand">
                    {ownedDomains.length}
                  </span>
                {/if}
              </span>
              <button
                type="button"
                onclick={loadOwnedDomains}
                disabled={ownedLoading}
                class="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Actualiser"
              >
                {ownedLoading ? '...' : '↻ Actualiser'}
              </button>
            </div>

            {#if ownedLoading && ownedDomains.length === 0}
              <div class="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-surface/50 text-center text-xs font-mono text-muted-foreground flex items-center justify-center gap-2">
                <div class="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
                <span>Chargement de vos domaines...</span>
              </div>
            {:else if ownedDomains.length > 0}
              <div class="space-y-2">
                {#each ownedDomains as item}
                  <div class="p-3.5 bg-surface dark:bg-white/[0.02] border border-black/10 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <span class="text-base shrink-0">🌐</span>
                      <div class="truncate">
                        <div class="font-mono text-sm font-semibold text-foreground truncate">{item.domain}</div>
                        <div class="text-[10px] uppercase font-mono text-muted-foreground mt-0.5">
                          {item.provider} · Domaine Ether
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      {#if currentDomain?.toLowerCase() === item.domain.toLowerCase()}
                        <span class="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Relié à ce site
                        </span>
                      {:else}
                        <button
                          type="button"
                          onclick={() => handleConnectExisting(item.domain)}
                          disabled={connectLoading}
                          class="focus-ring px-4 py-1.5 text-xs uppercase tracking-[0.15em] font-medium rounded-full bg-brand hover:bg-brand/90 text-white shadow-retro-sm transition-all cursor-pointer disabled:opacity-50"
                        >
                          Relier à ce site &rarr;
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="p-4 rounded-xl border border-dashed border-black/15 dark:border-white/15 bg-surface/30 text-xs text-muted-foreground text-center space-y-1">
                <p>Aucun nom de domaine actif enregistré sur ce compte.</p>
                <button
                  type="button"
                  onclick={() => { activeTab = "buy"; connectError = null; connectSuccess = null; }}
                  class="text-brand hover:underline font-medium cursor-pointer"
                >
                  Acheter un domaine disponible &rarr;
                </button>
              </div>
            {/if}
          </div>

          <!-- SECTION 2: LIER UN DOMAINE EXTERNE -->
          <div class="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-surface/40 dark:bg-white/[0.02] space-y-3">
            <div class="text-xs font-semibold uppercase tracking-wider text-foreground">
              Lier un domaine externe (autre registrar)
            </div>
            <p class="text-xs text-muted-foreground leading-relaxed">
              Vous possédez un nom de domaine chez un autre bureau d'enregistrement (Gandi, GoDaddy, etc.) ? Entrez-le ci-dessous :
            </p>

            <div class="flex gap-2">
              <input
                type="text"
                bind:value={existingDomainInput}
                placeholder="ex: mondomaine.com"
                onkeydown={(e) => { if (e.key === "Enter") handleConnectExisting(); }}
                class="flex-1 rounded-2xl border border-black/10 dark:border-white/10 bg-surface/80 dark:bg-white/[0.04] px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none text-sm font-mono"
              />
              <button
                type="button"
                onclick={() => handleConnectExisting()}
                disabled={connectLoading || !existingDomainInput.trim()}
                class="focus-ring px-5 py-2 rounded-full bg-brand hover:bg-brand/90 text-white text-xs font-medium uppercase tracking-[0.2em] shadow-retro-sm transition-all cursor-pointer disabled:opacity-50 hover:-translate-y-0.5 shrink-0 inline-flex items-center gap-2"
              >
                {#if connectLoading}
                  <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Connexion...</span>
                {:else}
                  <span>Connecter</span>
                {/if}
              </button>
            </div>

            <!-- DNS Guide for External Registrars -->
            <div class="pt-2 border-t border-black/5 dark:border-white/5 space-y-2.5">
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                Configurez ces 2 enregistrements DNS chez votre registrar externe avant de relier :
              </p>
              <div class="space-y-2 font-mono text-xs">
                <InfoBox
                  badge="Type A"
                  label="@ (racine)"
                  value="135.181.95.61"
                  copyable
                />
                <InfoBox
                  badge="Type CNAME"
                  label="www"
                  value="{tenant.slug}.ether.paris"
                  copyable
                />
              </div>

              <!-- Propagation Test Button -->
              <div class="pt-1 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onclick={handleCheckDns}
                  disabled={dnsCheckLoading || (!existingDomainInput.trim() && !currentDomain)}
                  class="px-3.5 py-1.5 text-xs font-mono rounded-lg bg-surface border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer inline-flex items-center gap-2"
                >
                  {#if dnsCheckLoading}
                    <div class="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
                    <span>Test en cours...</span>
                  {:else}
                    <span>🔍 Tester la propagation DNS</span>
                  {/if}
                </button>

                {#if dnsCheckResult}
                  <span class="text-xs font-mono {dnsCheckResult.propagated ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} font-medium">
                    {dnsCheckResult.message}
                  </span>
                {/if}
              </div>
            </div>
          </div>

          <!-- Live Feedback & Error Notifications strictly scoped inside Connect tab -->
          {#if connectLoading && connectStep}
            <div class="p-3.5 rounded-xl bg-brand/10 border border-brand/20 text-brand text-xs font-mono flex items-center gap-2.5 animate-pulse">
              <div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0"></div>
              <span>{connectStep}</span>
            </div>
          {/if}

          {#if connectError}
            <div class="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-mono flex items-center justify-between gap-2">
              <span>{connectError}</span>
              <button type="button" onclick={() => connectError = null} class="text-red-500 hover:text-red-700 shrink-0 cursor-pointer">✕</button>
            </div>
          {/if}

          {#if connectSuccess}
            <div class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-mono flex items-center justify-between gap-2">
              <span>{connectSuccess}</span>
              <button type="button" onclick={() => connectSuccess = null} class="text-emerald-500 hover:text-emerald-700 shrink-0 cursor-pointer">✕</button>
            </div>
          {/if}
        </div>
      {/if}

      <!-- TAB 3: MESSAGERIE & GMAIL ALIAS CONFIGURATION -->
      {#if activeTab === "email"}
        <div class="space-y-4">
          <!-- Inbound Forwarding Card -->
          <div class="p-4 sm:p-5 rounded-2xl border border-black/10 dark:border-white/10 bg-surface dark:bg-white/[0.02] space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                Redirection entrante automatique
              </span>
              <span class="text-[11px] font-mono px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                Cloudflare Email Routing
              </span>
            </div>
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 font-mono text-xs">
              <div class="flex-1 px-4 py-3 bg-black/5 dark:bg-white/5 rounded-xl text-foreground font-medium border border-black/5 dark:border-white/5 flex items-center justify-between">
                <span>contact@{currentDomain || tenant.slug + '.com'}</span>
                <span class="text-[10px] text-muted-foreground uppercase">Alias public</span>
              </div>
              <span class="text-brand font-bold text-base text-center rotate-90 sm:rotate-0">➔</span>
              <div class="flex-1 px-4 py-3 bg-black/5 dark:bg-white/5 rounded-xl text-foreground font-medium border border-black/5 dark:border-white/5 flex items-center justify-between">
                <span class="truncate">{tenant.email || 'Votre adresse e-mail'}</span>
                <span class="text-[10px] text-muted-foreground uppercase">Boîte perso</span>
              </div>
            </div>
            <p class="text-[11px] text-muted-foreground leading-relaxed pt-1">
              Tous les emails envoyés à <code class="font-mono text-foreground font-semibold">contact@{currentDomain || tenant.slug + '.com'}</code> sont automatiquement transmis vers votre boîte personnelle en temps réel.
            </p>
          </div>

          <!-- Outbound SMTP Options Card -->
          <div class="p-4 sm:p-5 rounded-2xl border border-black/10 dark:border-white/10 bg-surface dark:bg-white/[0.02] space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Envoi d'e-mails depuis Gmail (Deux méthodes possibles)
                </div>
                <p class="text-[11px] text-muted-foreground mt-0.5">
                  Pour répondre avec l'adresse <code class="font-mono text-foreground">contact@{currentDomain || tenant.slug + '.com'}</code> dans Gmail.
                </p>
              </div>
            </div>

            <!-- Option A: smtp.gmail.com (as in screenshot) -->
            <div class="p-4 sm:p-4.5 bg-black/5 dark:bg-white/[0.03] rounded-2xl border border-black/5 dark:border-white/5 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-foreground">
                  Méthode 1 : Via les serveurs Google (<code class="font-mono text-brand font-bold">smtp.gmail.com</code>)
                </span>
                <span class="text-[10px] uppercase font-mono px-2.5 py-1 rounded-full bg-brand/10 text-brand font-medium">
                  Recommandé Google
                </span>
              </div>
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                Google relaie directement vos messages. Nécessite un <b>Mot de passe d'application</b> (16 caractères) généré sur votre compte Google :
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono pt-1">
                <InfoBox
                  label="Serveur SMTP"
                  value="smtp.gmail.com:587"
                  copyable
                />
                <InfoBox
                  label="Utilisateur"
                  value={tenant.email || 'votre@gmail.com'}
                  copyable
                />
                <InfoBox
                  class="col-span-1 sm:col-span-2"
                  label="Mot de passe"
                  value="Mot de passe d'application Google"
                />
              </div>
              <p class="text-[11px] text-muted-foreground pt-1">
                ➔ Générez votre mot de passe d'application sur <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" class="text-brand underline font-medium">myaccount.google.com/apppasswords</a>.
              </p>
            </div>

            <!-- Option B: mail.ether.paris (via Maddy) -->
            <div class="p-4 sm:p-4.5 bg-black/5 dark:bg-white/[0.03] rounded-2xl border border-black/5 dark:border-white/5 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-foreground">
                  Méthode 2 : Via le serveur SMTP Ether (<code class="font-mono text-brand font-bold">mail.ether.paris</code>)
                </span>
                <span class="text-[10px] uppercase font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                  Clé-en-main Ether
                </span>
              </div>
              <p class="text-[11px] text-muted-foreground leading-relaxed">
                Pas besoin de configurer de compte Google supplémentaire. Utilisez directement ces identifiants :
              </p>
              <div class="space-y-2.5 font-mono text-xs">
                <InfoBox
                  label="Serveur SMTP"
                  value="mail.ether.paris:587"
                  copyable
                />
                <InfoBox
                  label="Utilisateur"
                  value={smtpInfo?.username || `contact@${currentDomain || tenant.slug + '.com'}`}
                  copyable
                />
                <InfoBox
                  label="Mot de passe"
                  value={smtpInfo?.password || ''}
                  placeholder="Généré lors de la liaison"
                  secret
                  copyable={!!smtpInfo?.password}
                />
              </div>
            </div>
          </div>

          <!-- Step-by-Step Gmail Setup Instructions -->
          <div class="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-surface/60 dark:bg-white/[0.01] space-y-2.5">
            <div class="text-xs font-semibold uppercase tracking-wider text-foreground">
              Guide d'installation dans Gmail (3 minutes) :
            </div>
            <ol class="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside leading-relaxed font-neue">
              <li>Dans <b>Gmail</b>, cliquez sur l'icône <b>Paramètres ⚙️</b> ➔ <b>Voir tous les paramètres</b> ➔ onglet <b>Comptes et importation</b>.</li>
              <li>Dans la section <i>« Envoyer des e-mails en tant que »</i>, cliquez sur <b>« Ajouter une autre adresse e-mail »</b>.</li>
              <li>Entrez votre nom et <code class="font-mono text-foreground">contact@{currentDomain || tenant.slug + '.com'}</code> (gardez <i>« Traiter comme un alias »</i> coché).</li>
              <li>Sélectionnez l'une des deux méthodes ci-dessus (<code class="font-mono">smtp.gmail.com</code> ou <code class="font-mono">mail.ether.paris</code>) avec port <code class="font-mono">587</code> et vos identifiants.</li>
              <li>Cliquez sur <b>Ajouter un compte</b> : Gmail envoie un code de vérification qui atterrit directement dans votre boîte Gmail grâce à la redirection Cloudflare !</li>
              <li>Copiez le code pour valider : vous pouvez désormais envoyer des emails avec votre adresse de marque !</li>
            </ol>
          </div>
        </div>
      {/if}
      </div>
    </div>
  </div>
{/if}
