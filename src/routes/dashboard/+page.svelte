<script lang="ts">
  import type { PageData } from "./$types";
  import BrandMark from "$lib/components/brand-mark.svelte";
  import DomainModal from "$lib/components/domain-modal.svelte";
  import DeleteTenantModal from "$lib/components/delete-tenant-modal.svelte";
  import { toast } from "$lib/stores/toast";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let user = $derived(data.user);

  let localTenants = $state<any[] | null>(null);
  let tenants = $derived(localTenants !== null ? localTenants : (data.tenants || []));
  let tenantErrors = $state<Record<string, { step: string; error: string }>>({});

  // UI state
  let isCreateModalOpen = $state(false);
  let isDomainModalOpen = $state(false);
  let isGitModalOpen = $state(false);
  let isSupportModalOpen = $state(false);
  let isDeleteModalOpen = $state(false);
  let selectedTenant = $state<any>(null);
  let tenantToDelete = $state<any>(null);
  let showGitModalPassword = $state(false);
  let copiedGitField = $state<string | null>(null);

  function copyGitText(text: string, fieldId: string) {
    try {
      navigator.clipboard.writeText(text);
      copiedGitField = fieldId;
      setTimeout(() => { if (copiedGitField === fieldId) copiedGitField = null; }, 2000);
    } catch {}
  }

  // New site creation form
  let newSiteBrand = $state("");
  let newSiteSlug = $state("");
  let createLoading = $state(false);
  let createStatusText = $state("Génération et déploiement...");
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
    createStatusText = "Initialisation de l'infrastructure...";

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

      const createdSlug = newSiteSlug;
      createStatusText = "Compilation et mise en ligne du site...";

      // Poll readiness endpoint until site responds HTTP 200 (max 45s)
      let isReady = false;
      const maxAttempts = 30; // 30 * 1.5s = 45s
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const checkRes = await fetch(`/api/tenant/ready?slug=${encodeURIComponent(createdSlug)}`);
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.ready) {
              isReady = true;
              break;
            }
            if (checkData.message) {
              createStatusText = checkData.message;
            }
          }
        } catch {}
      }

      createStatusText = isReady ? "Site en ligne ! Finalisation..." : "Finalisation...";
      await new Promise((r) => setTimeout(r, 600));

      actionMessage = `Site ${createdSlug}.ether.paris initialisé et en ligne avec succès !`;
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

  async function handleDirectLinkDomain(domainStr?: string) {
    if (!selectedTenant) return;
    const targetDomain = (domainStr || domainQuery).trim();
    if (!targetDomain) return;

    domainBuyLoading = true;
    try {
      const res = await fetch("/api/tenant/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          domain: targetDomain,
          action: "link",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Impossible de relier le domaine");
      }
      actionMessage = `Domaine ${json.domain} relié avec succès !`;
      isDomainModalOpen = false;
      window.location.reload();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      domainBuyLoading = false;
    }
  }

  async function handleBuyDomain(domainItem: any) {
    if (!selectedTenant) return;
    if (domainItem.isOwnedByAccount) {
      await handleDirectLinkDomain(domainItem.domain);
      return;
    }
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

  async function handleOpenStudio(slug?: string) {
    if (slug) {
      try {
        await fetch("/api/studio/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
      } catch (err) {
        console.error("Failed to switch workspace:", err);
      }
    }
    window.location.href = "/studio";
  }

  function handleDeleteSite(tenant: any) {
    tenantToDelete = tenant;
    isDeleteModalOpen = true;
  }

  function handleDeleteSuccess(slug: string) {
    isDeleteModalOpen = false;
    tenantToDelete = null;
    delete tenantErrors[slug];
    localTenants = tenants.filter((t: any) => (t.slug || t.domain) !== slug);
    toast.success(`Le site '${slug}' a été entièrement supprimé du système.`);
  }

  function handleDeleteError(step: string, error: string) {
    const slug = tenantToDelete?.slug || tenantToDelete?.domain;
    isDeleteModalOpen = false;
    if (slug) {
      tenantErrors[slug] = { step, error };
    }
    toast.error(`Échec lors du nettoyage (${step}) : ${error}`);
  }
</script>

<svelte:head>
  <title>Tableau de bord · Ether Studio</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col grain-overlay">
  <!-- Top Navigation -->
  <header class="border-b border-black/5 bg-surface/80 backdrop-blur sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <a href="/" class="transition-opacity hover:opacity-80">
          <BrandMark class="h-9 w-9" />
        </a>
        <span class="hidden sm:inline-block text-xs px-3 py-1 rounded-full border border-black/10 bg-surface uppercase tracking-[0.2em] font-mono text-muted-foreground">
          Studio &amp; Sites
        </span>
      </div>

      <div class="flex items-center gap-4">
        {#if user}
          <div class="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>{user.email || user.github_username}</span>
          </div>
        {/if}
        <form
          method="POST"
          action="/logout"
          onsubmit={() => {
            try {
              localStorage.removeItem("ether_session_token");
              localStorage.removeItem("ether_user_email");
            } catch {}
          }}
        >
          <button type="submit" class="focus-ring text-xs uppercase tracking-[0.15em] px-4 py-1.5 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-foreground transition-all cursor-pointer">
            Déconnexion
          </button>
        </form>
      </div>
    </div>
  </header>

  <!-- Main View -->
  <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    <!-- Header Banner in retro style -->
    <div class="retro-card flex flex-col md:flex-row md:items-center md:justify-between gap-6 p-6 md:p-8">
      <div class="space-y-2">
        <span class="section-heading">Plateforme &amp; Déploiement</span>
        <h1 class="font-display text-2xl md:text-3xl text-foreground font-normal tracking-tight">Vos Sites &amp; Applications Web</h1>
        <p class="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Chaque site tourne sur Kubernetes avec SvelteKit 5 Runes, Bun runtime et sa propre base SQLite isolée sur volume persistant.
        </p>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <button
          onclick={() => { isCreateModalOpen = true; }}
          class="focus-ring px-6 py-2.5 rounded-full bg-brand hover:bg-brand/90 text-white text-xs font-medium uppercase tracking-[0.2em] shadow-retro-sm transition-all flex items-center gap-2 cursor-pointer hover:-translate-y-0.5"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Créer un site
        </button>
      </div>
    </div>

    {#if actionMessage}
      <div class="p-4 rounded-2xl bg-surface border border-brand/20 text-brand text-sm flex items-center justify-between">
        <span>{actionMessage}</span>
        <button onclick={() => actionMessage = null} class="text-muted-foreground hover:text-foreground">✕</button>
      </div>
    {/if}

    <!-- Websites Grid -->
    {#if tenants.length > 0}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {#each tenants as tenant}
          {@const liveDomain = tenant.custom_domain || tenant.subdomain || tenant.domain}
          <div class="retro-card p-6 space-y-5 flex flex-col justify-between">
            <div>
              <!-- Title & Status -->
              <div class="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 class="font-display text-xl text-foreground font-normal tracking-tight">{tenant.brand_name || tenant.slug}</h3>
                  <a
                    href="https://{liveDomain}"
                    target="_blank"
                    rel="noopener"
                    class="text-xs font-mono text-brand hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    https://{liveDomain}
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                  </a>
                </div>
                {#if tenantErrors[tenant.slug]}
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-mono uppercase tracking-wider bg-rose-500/10 text-rose-600 border border-rose-500/20">
                    Suppression incomplète
                  </span>
                {:else}
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                    {tenant.status || 'actif'}
                  </span>
                {/if}
              </div>

              <!-- Tech Pills -->
              <div class="flex flex-wrap gap-2 py-2">
                <span class="text-xs font-mono px-3 py-1 bg-surface rounded-full border border-black/10 text-muted-foreground">
                  SvelteKit 5 + Bun
                </span>
                <span class="text-xs font-mono px-3 py-1 bg-surface rounded-full border border-black/10 text-muted-foreground">
                  SQLite (1Gi PVC)
                </span>
                {#if tenant.custom_domain}
                  <span class="text-xs font-mono px-3 py-1 bg-accent-soft text-foreground rounded-full border border-accent/20">
                    Domaine : {tenant.custom_domain}
                  </span>
                {/if}
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="pt-4 border-t border-black/5 grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
              <button
                onclick={() => handleOpenStudio(tenant.slug || tenant.domain)}
                class="h-9 px-2.5 rounded-full bg-brand text-white text-xs font-medium uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-retro-sm hover:-translate-y-0.5 transition-all text-center cursor-pointer whitespace-nowrap"
              >
                Studio
              </button>

              <button
                onclick={() => { selectedTenant = tenant; isDomainModalOpen = true; }}
                class="h-9 px-2.5 rounded-full border border-black/10 bg-surface/80 hover:bg-surface text-foreground text-xs uppercase tracking-wider transition-all cursor-pointer text-center flex items-center justify-center whitespace-nowrap"
              >
                Domaine
              </button>

              <button
                onclick={() => { selectedTenant = tenant; isGitModalOpen = true; }}
                class="h-9 px-2.5 rounded-full border border-black/10 bg-surface/80 hover:bg-surface text-foreground text-xs uppercase tracking-wider transition-all cursor-pointer text-center flex items-center justify-center whitespace-nowrap"
                title="Accès Git &amp; SQLite"
              >
                <span class="hidden xl:inline">Git &amp; DB</span>
                <span class="xl:hidden">Git</span>
              </button>

              <button
                onclick={() => handleDeleteSite(tenant)}
                class="h-9 px-2.5 rounded-full border transition-all cursor-pointer text-center text-xs uppercase tracking-wider flex items-center justify-center whitespace-nowrap {
                  tenantErrors[tenant.slug]
                    ? 'border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-400 font-semibold'
                    : 'border-black/10 bg-surface/80 hover:bg-red-500/10 hover:border-red-500/30 text-red-600 hover:text-red-700'
                }"
                title={tenantErrors[tenant.slug] ? "Reprendre la suppression de ce site" : "Supprimer ce site du système"}
              >
                {tenantErrors[tenant.slug] ? "Reprendre" : "Supprimer"}
              </button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Custom Infrastructure & Support section (shown only after user has created their website) -->
      <div class="retro-card p-6 md:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 border border-black/5 bg-surface/60 mt-8">
        <div class="space-y-1">
          <span class="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Évolution &amp; Sur-mesure</span>
          <h3 class="font-display text-xl text-foreground font-normal">Besoin d'une infrastructure dédiée ou sur-mesure ?</h3>
          <p class="text-xs text-muted-foreground max-w-xl leading-relaxed">
            Volumes de stockage étendus, cluster privé isolé, connecteurs externes (Firebase, CRM, PostgreSQL dédié) ou montée en charge garantie.
          </p>
        </div>
        <button
          onclick={() => { selectedTenant = tenants[0]; isSupportModalOpen = true; }}
          class="focus-ring px-6 py-3 rounded-full border border-black/15 bg-surface hover:bg-surface/80 text-foreground text-xs font-medium uppercase tracking-[0.2em] transition-all cursor-pointer shrink-0 shadow-retro-sm"
        >
          Demander une infrastructure
        </button>
      </div>
    {:else}
      <!-- Empty State -->
      <div class="retro-card p-12 text-center space-y-4">
        <div class="w-12 h-12 rounded-2xl border border-black/10 bg-surface text-brand mx-auto flex items-center justify-center">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
        </div>
        <h3 class="font-display text-xl text-foreground font-normal">Vous n'avez pas encore de site</h3>
        <p class="text-sm text-muted-foreground max-w-md mx-auto">
          Démarrez en quelques secondes avec un sous-domaine gratuit <code class="font-mono text-brand">.ether.paris</code> et accédez directement à Ether Studio.
        </p>
        <button
          onclick={() => { isCreateModalOpen = true; }}
          class="focus-ring px-6 py-3 rounded-full bg-brand hover:bg-brand/90 text-white text-xs font-medium uppercase tracking-[0.2em] shadow-retro-sm transition-all cursor-pointer hover:-translate-y-0.5"
        >
          Créer mon premier site
        </button>
      </div>
    {/if}
  </main>

  <!-- Modal 1: Create Site -->
  {#if isCreateModalOpen}
    <div class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="retro-card w-full max-w-lg p-6 md:p-8 space-y-6 bg-card">
        <div class="flex items-center justify-between">
          <h2 class="font-display text-xl text-foreground font-normal tracking-tight">Créer un nouveau site</h2>
          <button
            disabled={createLoading}
            onclick={() => isCreateModalOpen = false}
            class="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            ✕
          </button>
        </div>

        {#if createError}
          <div class="p-3.5 rounded-2xl bg-accent-soft/80 border border-accent/40 text-foreground text-sm font-neue">
            {createError}
          </div>
        {/if}

        <form onsubmit={handleCreateSite} class="space-y-4">
          <div>
            <label for="create-brand" class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Nom du projet / Marque
            </label>
            <input
              id="create-brand"
              type="text"
              placeholder="Ex: Mon Café Parisien"
              value={newSiteBrand}
              oninput={(e) => autoSlug((e.target as HTMLInputElement).value)}
              required
              disabled={createLoading}
              class="w-full rounded-2xl border border-black/10 bg-surface/80 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none text-sm transition-all font-neue disabled:opacity-60"
            />
          </div>

          <div>
            <label for="create-slug" class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Sous-domaine gratuit
            </label>
            <div class="flex items-center">
              <input
                id="create-slug"
                type="text"
                bind:value={newSiteSlug}
                placeholder="mon-cafe"
                required
                disabled={createLoading}
                class="w-full rounded-l-2xl border border-black/10 bg-surface/80 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none text-sm font-mono transition-all disabled:opacity-60"
              />
              <span class="px-4 py-3 bg-surface border border-l-0 border-black/10 rounded-r-2xl text-muted-foreground text-sm font-mono">
                .ether.paris
              </span>
            </div>
            <p class="text-xs text-muted-foreground mt-2 leading-relaxed">Vous pourrez rattacher un nom de domaine personnalisé ultérieurement.</p>
          </div>

          <div class="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={createLoading}
              onclick={() => isCreateModalOpen = false}
              class="px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-30"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={createLoading}
              class="focus-ring px-6 py-2.5 rounded-full bg-brand hover:bg-brand/90 text-white text-xs font-medium uppercase tracking-[0.2em] shadow-retro-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 hover:-translate-y-0.5"
            >
              {#if createLoading}
                <span class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>{createStatusText}</span>
              {:else}
                <span>Générer et déployer</span>
              {/if}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- Modal 2: Domain Management (Search, Buy & Connect) -->
  {#if isDomainModalOpen && selectedTenant}
    <DomainModal
      isOpen={isDomainModalOpen}
      tenant={selectedTenant}
      onclose={() => isDomainModalOpen = false}
      onconnected={(domain) => {
        selectedTenant.custom_domain = domain;
        actionMessage = `Domaine ${domain} relié avec succès au site ${selectedTenant.brand_name || selectedTenant.slug} !`;
      }}
      onunlinked={() => {
        selectedTenant.custom_domain = null;
        actionMessage = "Domaine détaché. Le site utilise son sous-domaine par défaut.";
      }}
    />
  {/if}

  <!-- Modal 3: Git & Database Info -->
  {#if isGitModalOpen && selectedTenant}
    {@const giteaUser = user?.gitea_username || user?.email?.split('@')[0] || 'user'}
    {@const tenantGitPwd = selectedTenant.git_password || selectedTenant.git_access_token || user?.gitea_token || 'Généré automatiquement'}
    {@const cloneCmd = `git clone https://${giteaUser}:${tenantGitPwd}@git.ether.paris/${giteaUser}/${selectedTenant.slug}.git`}
    <div class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="retro-card w-full max-w-xl p-6 md:p-8 space-y-5 bg-card">
        <div class="flex items-center justify-between">
          <h2 class="font-display text-xl text-foreground font-normal tracking-tight">Accès Git &amp; Données SQLite</h2>
          <button onclick={() => isGitModalOpen = false} class="text-muted-foreground hover:text-foreground cursor-pointer">✕</button>
        </div>

        <div class="space-y-4 text-sm font-neue">
          <div>
            <label class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
              Identifiant Git (Username)
            </label>
            <div class="p-3 bg-surface border border-black/10 rounded-2xl font-mono text-xs text-foreground flex items-center justify-between">
              <span>{giteaUser}</span>
              <button
                onclick={() => copyGitText(giteaUser, 'user')}
                class="text-[10px] uppercase font-mono text-brand hover:underline cursor-pointer"
              >
                {copiedGitField === 'user' ? 'Copié !' : 'Copier'}
              </button>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
              Mot de passe Git pour ce site
            </label>
            <div class="p-3 bg-surface border border-black/10 rounded-2xl font-mono text-xs text-foreground flex items-center justify-between">
              <span class="truncate mr-2 font-mono">
                {showGitModalPassword ? tenantGitPwd : '••••••••••••••••••••••••'}
              </span>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onclick={() => showGitModalPassword = !showGitModalPassword}
                  class="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center"
                  title={showGitModalPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {#if showGitModalPassword}
                    <!-- Eye-slash SVG (Hide) -->
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  {:else}
                    <!-- Eye SVG (Show) -->
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  {/if}
                </button>
                <button
                  onclick={() => copyGitText(tenantGitPwd, 'pwd')}
                  class="text-[10px] uppercase font-mono text-brand hover:underline cursor-pointer"
                >
                  {copiedGitField === 'pwd' ? 'Copié !' : 'Copier'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
              Commande de clonage rapide
            </label>
            <div class="p-3 bg-surface border border-black/10 rounded-2xl font-mono text-xs text-brand break-all select-all flex items-center justify-between gap-2">
              <span class="break-all">{cloneCmd}</span>
              <button
                onclick={() => copyGitText(cloneCmd, 'clone')}
                class="px-2.5 py-1 rounded-lg bg-brand text-white text-[10px] font-mono shrink-0 hover:bg-brand/90 cursor-pointer"
              >
                {copiedGitField === 'clone' ? 'Copié !' : 'Copier'}
              </button>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
              Base de données SQLite (Bun:sqlite)
            </label>
            <div class="p-3 bg-surface border border-black/10 rounded-2xl space-y-1.5 text-xs text-muted-foreground font-mono">
              <p>Emplacement persistant : <code class="text-foreground font-bold">/data/app.db</code></p>
              <p>Volume Kubernetes : <code class="text-foreground">tenant-storage (1Gi PVC)</code></p>
              <p class="text-muted-foreground mt-2 font-neue">Votre application SvelteKit accède directement à Bun SQLite sans configuration réseau requise.</p>
            </div>
          </div>
        </div>

        <div class="pt-2 flex justify-end">
          <button onclick={() => isGitModalOpen = false} class="focus-ring px-5 py-2 rounded-full border border-black/10 bg-surface text-foreground text-xs uppercase tracking-[0.2em] hover:bg-surface/80 cursor-pointer">
            Fermer
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Modal 4: Custom Infrastructure / Support -->
  {#if isSupportModalOpen}
    <div class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="retro-card w-full max-w-lg p-6 md:p-8 space-y-5 bg-card">
        <div class="flex items-center justify-between">
          <h2 class="font-display text-xl text-foreground font-normal tracking-tight">Infrastructure sur-mesure</h2>
          <button onclick={() => isSupportModalOpen = false} class="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {#if supportSuccess}
          <div class="p-4 bg-surface border border-brand/20 text-brand text-sm rounded-2xl font-neue">
            Demande envoyée avec succès ! Notre équipe d'infrastructure vous répondra sous 24h.
          </div>
        {:else}
          <form onsubmit={handleSendSupport} class="space-y-4">
            <div>
              <label class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Sujet</label>
              <select
                bind:value={supportSubject}
                class="w-full rounded-2xl border border-black/10 bg-surface/80 px-4 py-3 text-foreground outline-none text-sm font-neue focus:border-brand"
              >
                <option value="Base de données dédiée (PostgreSQL/Redis)">Base de données dédiée (PostgreSQL/Redis)</option>
                <option value="Augmentation des quotas CPU/RAM">Augmentation des quotas CPU/RAM</option>
                <option value="Accompagnement ingénieur IA / Custom Studio">Accompagnement ingénieur IA / Custom Studio</option>
                <option value="Autre demande infrastructure">Autre demande infrastructure</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Description de votre besoin</label>
              <textarea
                bind:value={supportMessage}
                rows="4"
                required
                placeholder="Détaillez vos besoins d'infrastructure ou vos questions..."
                class="w-full rounded-2xl border border-black/10 bg-surface/80 px-4 py-3 text-foreground outline-none text-sm placeholder:text-muted-foreground/50 font-neue focus:border-brand"
              ></textarea>
            </div>

            <div class="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onclick={() => isSupportModalOpen = false}
                class="px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={supportLoading}
                class="focus-ring px-6 py-2.5 rounded-full bg-brand hover:bg-brand/90 text-white text-xs font-medium uppercase tracking-[0.2em] shadow-retro-sm transition-all cursor-pointer disabled:opacity-50 hover:-translate-y-0.5"
              >
                {supportLoading ? 'Envoi...' : 'Transmettre la demande'}
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Modal: Delete Tenant Confirmation & Multi-Step Progress -->
  <DeleteTenantModal
    tenant={tenantToDelete}
    isOpen={isDeleteModalOpen}
    onClose={() => { isDeleteModalOpen = false; tenantToDelete = null; }}
    onSuccess={handleDeleteSuccess}
    onError={handleDeleteError}
  />
</div>
