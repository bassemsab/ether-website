<script lang="ts">
  import BrandMark from "$lib/components/brand-mark.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let profiles = $state(data.profiles || []);
  let activeAuthProfile = $state<string | null>(null);
  let authUrl = $state<string | null>(null);
  let authCode = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let successMsg = $state<string | null>(null);

  async function handleStartAuth(profileName: string) {
    activeAuthProfile = profileName;
    authUrl = null;
    authCode = "";
    error = null;
    successMsg = null;
    loading = true;

    try {
      const res = await fetch("/api/admin/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_auth", profile: profileName }),
      });
      const resData = await res.json();
      if (resData.success) {
        authUrl = resData.authUrl;
      } else {
        error = resData.error || "Impossible de générer le lien de connexion.";
      }
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function handleFinishAuth() {
    if (!authCode.trim() || !activeAuthProfile) return;
    loading = true;
    error = null;

    try {
      const res = await fetch("/api/admin/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finish_auth",
          profile: activeAuthProfile,
          code: authCode.trim(),
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        successMsg = `Profil [${activeAuthProfile}] connecté avec succès (${resData.email}) !`;
        // Refresh profiles list
        const refreshRes = await fetch("/api/admin/profiles");
        const refreshData = await refreshRes.json();
        if (refreshData.success) {
          profiles = refreshData.profiles;
        }
        activeAuthProfile = null;
        authUrl = null;
        authCode = "";
      } else {
        error = resData.error || "Code d'autorisation invalide.";
      }
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Gestion des Profils Google IA · Ether Admin</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground font-neue grain-overlay flex flex-col">
  <!-- Top Navigation Header -->
  <header class="h-16 border-b border-black/10 bg-surface/80 backdrop-blur px-6 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="/admin" class="hover:opacity-80 transition-opacity">
        <BrandMark class="h-8 w-auto" />
      </a>
      <span class="text-black/20">/</span>
      <span class="font-display font-medium text-sm">Profils Google & Runner IA</span>
    </div>

    <div class="flex items-center gap-3 text-xs font-mono">
      <a
        href="/admin"
        class="px-3 py-1.5 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-muted-foreground hover:text-foreground transition-all"
      >
        Console SQL
      </a>
      <a
        href="/studio"
        class="px-3.5 py-1.5 rounded-full bg-brand text-white font-medium shadow-retro-sm hover:bg-brand/90 transition-all"
      >
        Ouvrir Studio ↗
      </a>
    </div>
  </header>

  <!-- Main Content -->
  <main class="flex-1 max-w-5xl w-full mx-auto p-6 md:p-10 space-y-8">
    <!-- Intro Header -->
    <div class="space-y-2">
      <h1 class="font-display text-3xl font-normal tracking-tight text-foreground">
        Profils Google & Sessions Multi-Tenants
      </h1>
      <p class="text-sm text-muted-foreground leading-relaxed max-w-2xl">
        Gérez les comptes Google connectés sur le runner Kubernetes. Chaque projet bénéficie d'un bac à sable isolé
        sur le volume persistant (<code class="font-mono text-xs bg-black/5 px-1 py-0.5 rounded">/data/tenants/&lt;slug&gt;</code>)
        sans risque de collision d'historique.
      </p>
    </div>

    {#if successMsg}
      <div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 text-xs font-mono flex items-center justify-between">
        <span>✓ {successMsg}</span>
        <button onclick={() => (successMsg = null)} class="hover:opacity-70">✕</button>
      </div>
    {/if}

    {#if error}
      <div class="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-800 text-xs font-mono flex items-center justify-between">
        <span>⚠️ {error}</span>
        <button onclick={() => (error = null)} class="hover:opacity-70">✕</button>
      </div>
    {/if}

    <!-- Profiles Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      {#each ["primary", "secondary"] as profileName}
        {@const profile = profiles.find((p: any) => p.name === profileName)}
        <div class="retro-card p-6 bg-card rounded-2xl flex flex-col justify-between space-y-6">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="font-display text-lg capitalize font-medium text-foreground">
                Profil {profileName}
              </span>
              {#if profile?.hasToken && !profile.isExpired}
                <span class="px-2.5 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 text-[11px] font-mono flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Connecté
                </span>
              {:else if profile?.isExpired}
                <span class="px-2.5 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-700 text-[11px] font-mono flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Expiré
                </span>
              {:else}
                <span class="px-2.5 py-0.5 rounded-full border border-black/10 bg-surface text-muted-foreground text-[11px] font-mono">
                  Non configuré
                </span>
              {/if}
            </div>

            <div class="space-y-1 text-xs">
              <div class="text-muted-foreground font-mono">Compte Google :</div>
              <div class="font-medium text-foreground font-mono truncate">
                {profile?.email || "Aucun compte associé"}
              </div>
            </div>

            <p class="text-xs text-muted-foreground leading-relaxed">
              {profileName === "primary"
                ? "Profil principal utilisé par défaut pour les générations de code et les projets Studio."
                : "Profil de secours pour basculer automatiquement en cas de limitation de quota Google."}
            </p>
          </div>

          <div class="pt-4 border-t border-black/10 flex items-center justify-between">
            <button
              onclick={() => handleStartAuth(profileName)}
              disabled={loading}
              class="px-4 py-2 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-xs font-mono font-medium transition-all cursor-pointer disabled:opacity-50"
            >
              {profile?.hasToken ? "Reconnecter le compte" : "Connecter Google"}
            </button>

            <span class="text-[10px] font-mono text-muted-foreground">
              Volume: /data/profiles/{profileName}
            </span>
          </div>
        </div>
      {/each}
    </div>

    <!-- Active OAuth Modal / Section -->
    {#if activeAuthProfile}
      <div class="retro-card p-6 md:p-8 bg-surface/80 rounded-2xl space-y-6 border-2 border-brand/30">
        <div class="flex items-center justify-between border-b border-black/10 pb-4">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-brand animate-pulse"></span>
            <h2 class="font-display text-lg font-medium">
              Connexion Google pour le profil [{activeAuthProfile}]
            </h2>
          </div>
          <button
            onclick={() => (activeAuthProfile = null)}
            class="text-muted-foreground hover:text-foreground text-sm font-mono"
          >
            Annuler ✕
          </button>
        </div>

        {#if loading && !authUrl}
          <div class="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <div class="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
            <span>Génération du lien de connexion Google...</span>
          </div>
        {:else if authUrl}
          <div class="space-y-4 text-xs font-mono">
            <div class="p-4 rounded-xl bg-card border border-black/10 space-y-2">
              <div class="font-semibold text-foreground">Étape 1 : Ouvrez le lien d'autorisation Google</div>
              <p class="text-muted-foreground">
                Connectez-vous au compte Google souhaité et autorisez l'accès à Google Cloud / Gemini.
              </p>
              <a
                href={authUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand text-white font-medium shadow-retro-sm hover:bg-brand/90 transition-all text-xs"
              >
                <span>Ouvrir Google Login ↗</span>
              </a>
            </div>

            <div class="p-4 rounded-xl bg-card border border-black/10 space-y-3">
              <div class="font-semibold text-foreground">Étape 2 : Collez le code d'autorisation</div>
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  bind:value={authCode}
                  placeholder="Collez le code Google (4/0A...)"
                  class="flex-1 px-4 py-2 rounded-lg border border-black/15 bg-surface text-foreground placeholder:text-muted-foreground/50 focus:border-brand outline-none"
                />
                <button
                  onclick={handleFinishAuth}
                  disabled={!authCode.trim() || loading}
                  class="px-5 py-2 rounded-lg bg-brand text-white font-medium hover:bg-brand/90 transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? "Validation..." : "Valider"}
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- CLI Instructions Callout -->
    <div class="p-6 rounded-2xl bg-surface/50 border border-black/10 space-y-3 text-xs font-mono">
      <div class="flex items-center gap-2 font-semibold text-foreground">
        <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <span>Alternative en ligne de commande (Terminal CLI)</span>
      </div>
      <p class="text-muted-foreground leading-relaxed">
        Vous pouvez également authentifier directement les profils depuis votre terminal avec le script fourni :
      </p>
      <div class="p-3 rounded-lg bg-card border border-black/10 select-all overflow-x-auto text-[11px]">
        <code>./scripts/auth_cluster_profile.sh primary</code>
      </div>
      <div class="p-3 rounded-lg bg-card border border-black/10 select-all overflow-x-auto text-[11px]">
        <code>./scripts/auth_cluster_profile.sh secondary --import-local</code>
      </div>
    </div>
  </main>
</div>
