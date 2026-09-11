<script lang="ts">
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let user = $derived(data.user);
  let tenants = $derived(data.tenants || []);

  // UI state
  let isCreateModalOpen = $state(false);
  let isDomainModalOpen = $state(false);
  let isGitModalOpen = $state(false);
  let isSupportModalOpen = $state(false);
  let selectedTenant = $state<any>(null);

  // New site creation form
  let newSiteBrand = $state("");
  let newSiteSlug = $state("");
  let createLoading = $state(false);
  let createError = $state<string | null>(null);

  // Domain search form
  let domainQuery = $state("");
  let searchLoading = $state(false);
  let searchResults = $state<any[]>([]);
  let domainBuyLoading = $state(false);

  // Support inquiry form
  let supportSubject = $state("Demande d'infrastructure dédiée");
  let supportMessage = $state("");
  let supportLoading = $state(false);
  let supportSuccess = $state(false);

  // Notifications
  let actionMessage = $state<string | null>(null);

  function autoSlug(val: string) {
    newSiteBrand = val;
    newSiteSlug = val.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  }

  async function handleCreateSite(e: Event) {
    e.preventDefault();
    if (!newSiteSlug) return;

    createLoading = true;
    createError = null;

    try {
      const res = await fetch("/api/tenant/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSiteSlug, brandName: newSiteBrand }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Impossible de créer le site");
      }

      actionMessage = `Site ${newSiteSlug}.ether.paris initialisé avec succès !`;
      isCreateModalOpen = false;
      newSiteBrand = "";
      newSiteSlug = "";
      window.location.reload();
    } catch (err: any) {
      createError = err.message;
    } finally {
      createLoading = false;
    }
  }

  async function handleSearchDomains() {
    if (!domainQuery || domainQuery.trim().length < 2) return;
    searchLoading = true;
    searchResults = [];

    try {
      const res = await fetch(`/api/domains/search?q=${encodeURIComponent(domainQuery.trim())}`);
      const json = await res.json();
      if (json.success) {
        searchResults = json.results || [];
      }
    } catch (err) {
      console.error(err);
    } finally {
      searchLoading = false;
    }
  }

  async function handleBuyDomain(domainItem: any) {
    if (!selectedTenant) return;
    domainBuyLoading = true;

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          domain: domainItem.domain,
          provider: domainItem.provider,
          priceCents: domainItem.priceAnnualCents,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.success || !json.url) {
        throw new Error(json.error || "Erreur lors de la redirection paiement");
      }

      window.location.href = json.url;
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      domainBuyLoading = false;
    }
  }

  async function handlePublishSite(tenant: any) {
    if (!confirm(`Publier les dernières modifications pour ${tenant.domain || tenant.slug} ?`)) return;

    try {
      const res = await fetch("/api/tenant/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id }),
      });
      const json = await res.json();
      if (json.success) {
        actionMessage = json.message;
      } else {
        alert(json.error || "Erreur lors de la publication");
      }
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  }

  async function handleSendSupport(e: Event) {
    e.preventDefault();
    supportLoading = true;

    try {
      const res = await fetch("/api/tenant/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenant?.id,
          subject: supportSubject,
          message: supportMessage,
        }),
      });
      const json = await res.json();
      if (json.success) {
        supportSuccess = true;
        setTimeout(() => {
          isSupportModalOpen = false;
          supportSuccess = false;
          supportMessage = "";
        }, 2000);
      } else {
        alert(json.error || "Erreur lors de l'envoi");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      supportLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Tableau de bord · Ether Studio</title>
</svelte:head>

<div class="min-h-screen bg-[#07090e] text-slate-100 flex flex-col">
  <!-- Top Navigation -->
  <header class="border-b border-slate-800/80 bg-[#0d121f]/90 backdrop-blur sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center gap-6">
        <a href="/" class="flex items-center gap-2.5 font-bold tracking-wider text-lg text-white">
          <span class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-mono text-sm">E</span>
          <span>ETHER</span>
        </a>
        <span class="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
          Studio & Multi-Tenant
        </span>
      </div>

      <div class="flex items-center gap-4">
        {#if user}
          <div class="flex items-center gap-2 text-sm text-slate-300">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>{user.email || user.github_username}</span>
          </div>
        {/if}
        <form method="POST" action="/logout">
          <button type="submit" class="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer">
            Déconnexion
          </button>
        </form>
      </div>
    </div>
  </header>

  <!-- Main View -->
  <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    <!-- Header Banner -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 bg-gradient-to-r from-blue-900/20 via-indigo-900/10 to-slate-900/40 border border-blue-500/20 rounded-2xl shadow-xl">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold text-white tracking-tight">Vos Sites & Applications Web</h1>
        <p class="text-sm text-slate-400">
          Chaque site tourne sur Kubernetes avec SvelteKit 5 Runes, Bun runtime et sa propre base SQLite isolée.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <button
          onclick={() => { selectedTenant = null; isSupportModalOpen = true; }}
          class="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-sm font-medium transition-colors cursor-pointer"
        >
          Infra sur-mesure
        </button>
        <button
          onclick={() => { isCreateModalOpen = true; }}
          class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium shadow-lg shadow-blue-600/25 transition-all flex items-center gap-2 cursor-pointer"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Créer un site
        </button>
      </div>
    </div>

    {#if actionMessage}
      <div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-center justify-between">
        <span>{actionMessage}</span>
        <button onclick={() => actionMessage = null} class="text-emerald-400 hover:text-emerald-200">✕</button>
      </div>
    {/if}

    <!-- Websites Grid -->
    {#if tenants.length > 0}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {#each tenants as tenant}
          {@const liveDomain = tenant.custom_domain || tenant.subdomain || tenant.domain}
          <div class="p-6 bg-[#0d121f] border border-slate-800/80 rounded-2xl shadow-xl space-y-5 hover:border-slate-700/80 transition-all flex flex-col justify-between">
            <div>
              <!-- Title & Status -->
              <div class="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 class="text-xl font-bold text-white tracking-tight">{tenant.brand_name || tenant.slug}</h3>
                  <a
                    href="https://{liveDomain}"
                    target="_blank"
                    rel="noopener"
                    class="text-sm text-blue-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                  >
                    https://{liveDomain}
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                  </a>
                </div>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {tenant.status || 'actif'}
                </span>
              </div>

              <!-- Tech Pills -->
              <div class="flex flex-wrap gap-2 py-2">
                <span class="text-xs px-2.5 py-1 bg-slate-800/80 text-slate-300 rounded-lg border border-slate-700/50">
                  SvelteKit 5 + Bun
                </span>
                <span class="text-xs px-2.5 py-1 bg-slate-800/80 text-slate-300 rounded-lg border border-slate-700/50">
                  SQLite (1Gi PVC)
                </span>
                {#if tenant.custom_domain}
                  <span class="text-xs px-2.5 py-1 bg-purple-500/10 text-purple-300 rounded-lg border border-purple-500/30">
                    Domaine : {tenant.custom_domain}
                  </span>
                {/if}
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <a
                href="https://studio.ether.paris/?project={tenant.slug || tenant.domain}"
                target="_blank"
                rel="noopener"
                class="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 transition-all text-center"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                </svg>
                Studio
              </a>

              <button
                onclick={() => handlePublishSite(tenant)}
                class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Publier
              </button>

              <button
                onclick={() => { selectedTenant = tenant; isDomainModalOpen = true; }}
                class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Domaine
              </button>

              <button
                onclick={() => { selectedTenant = tenant; isGitModalOpen = true; }}
                class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Git & DB
              </button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- Empty State -->
      <div class="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-[#0d121f]/50 space-y-4">
        <div class="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 mx-auto flex items-center justify-center">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
        </div>
        <h3 class="text-lg font-bold text-white">Vous n'avez pas encore de site</h3>
        <p class="text-sm text-slate-400 max-w-md mx-auto">
          Démarrez en quelques secondes avec un sous-domaine gratuit <code>.ether.paris</code> et accédez directement à Ether Studio.
        </p>
        <button
          onclick={() => { isCreateModalOpen = true; }}
          class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
        >
          Créer mon premier site
        </button>
      </div>
    {/if}
  </main>

  <!-- Modal 1: Create Site -->
  {#if isCreateModalOpen}
    <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="w-full max-w-lg bg-[#0d121f] border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-white">Créer un nouveau site</h2>
          <button onclick={() => isCreateModalOpen = false} class="text-slate-400 hover:text-white">✕</button>
        </div>

        {#if createError}
          <div class="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm rounded-xl">
            {createError}
          </div>
        {/if}

        <form onsubmit={handleCreateSite} class="space-y-4">
          <div>
            <label for="create-brand" class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Nom du projet / Marque
            </label>
            <input
              id="create-brand"
              type="text"
              placeholder="Ex: Mon Café Parisien"
              value={newSiteBrand}
              oninput={(e) => autoSlug((e.target as HTMLInputElement).value)}
              required
              class="w-full px-4 py-2.5 bg-[#07090e] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label for="create-slug" class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Sous-domaine gratuit
            </label>
            <div class="flex items-center">
              <input
                id="create-slug"
                type="text"
                bind:value={newSiteSlug}
                placeholder="mon-cafe"
                required
                class="w-full px-4 py-2.5 bg-[#07090e] border border-slate-700 rounded-l-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span class="px-3 py-2.5 bg-slate-800 border border-l-0 border-slate-700 rounded-r-xl text-slate-400 text-sm font-mono">
                .ether.paris
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-1">Vous pourrez ajouter un nom de domaine personnalisé plus tard.</p>
          </div>

          <div class="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onclick={() => isCreateModalOpen = false}
              class="px-4 py-2 text-sm text-slate-400 hover:text-white"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={createLoading}
              class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium shadow-lg shadow-blue-600/25 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {#if createLoading}
                <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Création en cours...</span>
              {:else}
                <span>Générer et déployer</span>
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- Modal 2: Domain Search & Buy -->
  {#if isDomainModalOpen && selectedTenant}
    <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="w-full max-w-2xl bg-[#0d121f] border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold text-white">Réserver un nom de domaine</h2>
            <p class="text-xs text-slate-400">Pour le site {selectedTenant.brand_name || selectedTenant.slug}</p>
          </div>
          <button onclick={() => isDomainModalOpen = false} class="text-slate-400 hover:text-white">✕</button>
        </div>

        <div class="flex gap-2">
          <input
            type="text"
            bind:value={domainQuery}
            placeholder="Rechercher un nom (ex: {selectedTenant.slug})"
            class="flex-1 px-4 py-2.5 bg-[#07090e] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            onclick={handleSearchDomains}
            disabled={searchLoading}
            class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all cursor-pointer disabled:opacity-50"
          >
            {searchLoading ? 'Recherche...' : 'Vérifier'}
          </button>
        </div>

        {#if searchResults.length > 0}
          <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
            {#each searchResults as item}
              <div class="p-3 bg-[#07090e] border border-slate-800 rounded-xl flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="font-mono text-sm font-semibold text-white">{item.domain}</span>
                  <span class="text-xs px-2 py-0.5 rounded-full {item.available ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'}">
                    {item.available ? 'Disponible' : 'Pris'}
                  </span>
                  <span class="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase font-mono">
                    {item.provider}
                  </span>
                </div>

                <div class="flex items-center gap-3">
                  <span class="text-sm font-medium text-slate-200">{item.formattedPrice}</span>
                  {#if item.available}
                    <button
                      onclick={() => handleBuyDomain(item)}
                      disabled={domainBuyLoading}
                      class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Acheter
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <p class="text-xs text-slate-500">
          Inclus : Abonnement annuel renouvelable automatiquement, DNS haute performance Cloudflare, certificat SSL Let's Encrypt et redirection email <code>contact@{domainQuery || 'votredomaine.com'}</code>.
        </p>
      </div>
    </div>
  {/if}

  <!-- Modal 3: Git & Database Info -->
  {#if isGitModalOpen && selectedTenant}
    <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="w-full max-w-xl bg-[#0d121f] border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-white">Accès Git & Données SQLite</h2>
          <button onclick={() => isGitModalOpen = false} class="text-slate-400 hover:text-white">✕</button>
        </div>

        <div class="space-y-4 text-sm">
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Dépôt Git hébergé
            </label>
            <div class="p-3 bg-[#07090e] border border-slate-800 rounded-xl font-mono text-xs text-blue-400 break-all select-all">
              {selectedTenant.git_repo_url || `https://git.ether.paris/${user?.email?.split('@')[0] || 'user'}/${selectedTenant.slug}.git`}
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Jeton d'accès personnel Git (PAT)
            </label>
            <div class="p-3 bg-[#07090e] border border-slate-800 rounded-xl font-mono text-xs text-slate-300 select-all">
              {selectedTenant.git_access_token || user?.gitea_token || 'Généré automatiquement lors de la création'}
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Base de données SQLite (Bun:sqlite)
            </label>
            <div class="p-3 bg-[#07090e] border border-slate-800 rounded-xl space-y-1 text-xs text-slate-300">
              <p>Emplacement persistant : <code class="text-blue-400">/data/app.db</code></p>
              <p>Volume Kubernetes : <code class="text-indigo-400">tenant-storage (1Gi PVC)</code></p>
              <p class="text-slate-500 mt-2">Votre application SvelteKit accède directement à Bun SQLite sans configuration réseau requise.</p>
            </div>
          </div>
        </div>

        <div class="pt-2 flex justify-end">
          <button onclick={() => isGitModalOpen = false} class="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm">
            Fermer
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Modal 4: Custom Infrastructure / Support -->
  {#if isSupportModalOpen}
    <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="w-full max-w-lg bg-[#0d121f] border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-white">Infrastructure sur-mesure & Support</h2>
          <button onclick={() => isSupportModalOpen = false} class="text-slate-400 hover:text-white">✕</button>
        </div>

        {#if supportSuccess}
          <div class="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm rounded-xl">
            Demande envoyée avec succès ! Notre équipe d'infrastructure vous répondra sous 24h.
          </div>
        {:else}
          <form onsubmit={handleSendSupport} class="space-y-4">
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Sujet</label>
              <select
                bind:value={supportSubject}
                class="w-full px-4 py-2.5 bg-[#07090e] border border-slate-700 rounded-xl text-white outline-none"
              >
                <option value="Base de données dédiée (PostgreSQL/Redis)">Base de données dédiée (PostgreSQL/Redis)</option>
                <option value="Augmentation des quotas CPU/RAM">Augmentation des quotas CPU/RAM</option>
                <option value="Accompagnement ingénieur IA / Custom Studio">Accompagnement ingénieur IA / Custom Studio</option>
                <option value="Autre demande infrastructure">Autre demande infrastructure</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Description de votre besoin</label>
              <textarea
                bind:value={supportMessage}
                rows="4"
                required
                placeholder="Détaillez vos besoins d'infrastructure ou vos questions..."
                class="w-full px-4 py-2.5 bg-[#07090e] border border-slate-700 rounded-xl text-white outline-none text-sm placeholder-slate-500"
              ></textarea>
            </div>

            <div class="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onclick={() => isSupportModalOpen = false}
                class="px-4 py-2 text-sm text-slate-400 hover:text-white"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={supportLoading}
                class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all cursor-pointer disabled:opacity-50"
              >
                {supportLoading ? 'Envoi...' : 'Transmettre la demande'}
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>
  {/if}
</div>
