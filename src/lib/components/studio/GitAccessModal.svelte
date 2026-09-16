<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    isOpen: boolean;
    projectSlug: string;
    onClose: () => void;
  }

  let { isOpen, projectSlug, onClose }: Props = $props();

  let activeTab = $state<"password" | "ssh">("password");
  let loading = $state(true);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);

  // Data from API
  let username = $state("");
  let gitPassword = $state("");
  let gitRepoUrl = $state("");
  let sshUrl = $state("");
  let isPrivate = $state(true);
  let sshKeys = $state<Array<{ id: number; title: string; fingerprint: string; created_at: string }>>([]);

  // UI state
  let showPassword = $state(false);
  let copiedField = $state<string | null>(null);
  let regenerating = $state(false);

  // Add SSH Key Form
  let newKeyTitle = $state("");
  let newKeyContent = $state("");
  let addingKey = $state(false);
  let addKeyError = $state<string | null>(null);
  let deletingKeyId = $state<number | null>(null);

  $effect(() => {
    if (isOpen && projectSlug) {
      loadGitCredentials();
    }
  });

  async function loadGitCredentials() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/studio/git?slug=${encodeURIComponent(projectSlug)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossible de charger les accès Git.");
      }
      username = data.username;
      gitPassword = data.gitPassword;
      gitRepoUrl = data.gitRepoUrl;
      sshUrl = data.sshUrl;
      isPrivate = data.isPrivate;
      sshKeys = data.sshKeys || [];
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function copyText(text: string, fieldId: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedField = fieldId;
      setTimeout(() => {
        if (copiedField === fieldId) copiedField = null;
      }, 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      copiedField = fieldId;
      setTimeout(() => {
        if (copiedField === fieldId) copiedField = null;
      }, 2000);
    }
  }

  async function handleRegeneratePassword() {
    if (
      !confirm(
        "Êtes-vous sûr de vouloir régénérer le mot de passe Git pour ce site ? Vos clones locaux devront utiliser le nouveau mot de passe.",
      )
    ) {
      return;
    }

    regenerating = true;
    error = null;
    successMessage = null;

    try {
      const res = await fetch("/api/studio/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "regenerate-password",
          slug: projectSlug,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Échec de la régénération du mot de passe.");
      }
      gitPassword = data.gitPassword;
      successMessage = "Nouveau mot de passe généré et enregistré avec succès !";
      setTimeout(() => {
        successMessage = null;
      }, 3000);
    } catch (err: any) {
      error = err.message;
    } finally {
      regenerating = false;
    }
  }

  async function handleAddSshKey(e: Event) {
    e.preventDefault();
    if (!newKeyContent.trim()) return;

    addingKey = true;
    addKeyError = null;

    try {
      const res = await fetch("/api/studio/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-ssh-key",
          slug: projectSlug,
          title: newKeyTitle.trim() || "Clé locale",
          key: newKeyContent.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossible d'ajouter la clé SSH.");
      }
      sshKeys = data.sshKeys || [];
      newKeyTitle = "";
      newKeyContent = "";
      successMessage = "Clé SSH enregistrée avec succès !";
      setTimeout(() => {
        successMessage = null;
      }, 3000);
    } catch (err: any) {
      addKeyError = err.message;
    } finally {
      addingKey = false;
    }
  }

  async function handleDeleteSshKey(keyId: number) {
    if (!confirm("Voulez-vous supprimer cette clé SSH ?")) return;

    deletingKeyId = keyId;
    try {
      const res = await fetch("/api/studio/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-ssh-key",
          slug: projectSlug,
          keyId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossible de supprimer la clé.");
      }
      sshKeys = data.sshKeys || [];
    } catch (err: any) {
      alert(err.message);
    } finally {
      deletingKeyId = null;
    }
  }

  // Pre-authenticated clone command
  let authedCloneCmd = $derived(
    gitPassword && username
      ? `git clone https://${username}:${gitPassword}@git.ether.paris/${username}/${projectSlug}.git`
      : `git clone https://git.ether.paris/${username || 'user'}/${projectSlug}.git`
  );

  let standardCloneCmd = $derived(
    `git clone https://git.ether.paris/${username || 'user'}/${projectSlug}.git`
  );
</script>

{#if isOpen}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
    <div
      class="retro-card w-full max-w-2xl bg-card border border-black/10 dark:border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]"
    >
      <!-- Modal Header -->
      <div class="px-5 sm:px-6 py-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0 bg-surface/50 dark:bg-white/[0.02]">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-brand/10 dark:bg-brand/20 border border-brand/30 text-brand flex items-center justify-center font-bold">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="font-display text-lg text-foreground font-medium tracking-tight">Accès Git &amp; Clone Local</h2>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                🔒 Privé
              </span>
            </div>
            <p class="text-xs text-muted-foreground font-mono mt-0.5">
              Projet : <span class="text-foreground font-medium">{projectSlug}</span>
            </p>
          </div>
        </div>
        <button
          onclick={onClose}
          class="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          title="Fermer"
        >
          ✕
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="px-5 sm:px-6 pt-3 border-b border-black/5 dark:border-white/5 flex gap-2 shrink-0 bg-surface/30">
        <button
          onclick={() => (activeTab = "password")}
          class="px-4 py-2.5 text-xs font-mono uppercase tracking-[0.15em] border-b-2 transition-all cursor-pointer flex items-center gap-2 {activeTab === 'password' ? 'border-brand text-brand font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span>Mot de passe Git</span>
          <span class="px-1.5 py-0.2 rounded text-[9px] bg-brand/10 text-brand font-bold">Simple</span>
        </button>

        <button
          onclick={() => (activeTab = "ssh")}
          class="px-4 py-2.5 text-xs font-mono uppercase tracking-[0.15em] border-b-2 transition-all cursor-pointer flex items-center gap-2 {activeTab === 'ssh' ? 'border-brand text-brand font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Clés SSH</span>
          <span class="px-1.5 py-0.2 rounded text-[9px] bg-black/5 dark:bg-white/10 text-muted-foreground">
            {sshKeys.length}
          </span>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 font-neue">
        {#if loading}
          <div class="py-12 text-center space-y-3">
            <div class="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-xs font-mono text-muted-foreground">Chargement des identifiants sécurisés...</p>
          </div>
        {:else if error}
          <div class="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onclick={loadGitCredentials} class="text-xs font-mono underline hover:no-underline">Réessayer</button>
          </div>
        {:else}
          {#if successMessage}
            <div class="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-mono flex items-center gap-2">
              <span>✅</span>
              <span>{successMessage}</span>
            </div>
          {/if}

          <!-- TAB 1: Password & HTTPS -->
          {#if activeTab === "password"}
            <!-- Isolation banner -->
            <div class="p-3.5 rounded-2xl bg-brand/5 dark:bg-brand/[0.07] border border-brand/15 text-xs text-muted-foreground flex items-start gap-3">
              <span class="text-brand text-base leading-none">🛡️</span>
              <div class="space-y-1 leading-relaxed">
                <span class="text-foreground font-medium">Sécurité et isolation stricte</span>
                <p>
                  Ce dépôt est privé. Seuls vous pouvez le cloner avec votre mot de passe ou vos clés SSH. Aucun autre utilisateur ne peut y accéder.
                </p>
              </div>
            </div>

            <!-- Credentials Box -->
            <div class="space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <!-- Username -->
                <div>
                  <label class="block text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Identifiant Git (Username)
                  </label>
                  <div class="flex items-center gap-2">
                    <div class="flex-1 p-2.5 bg-surface dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl font-mono text-xs text-foreground truncate select-all">
                      {username}
                    </div>
                    <button
                      onclick={() => copyText(username, "username")}
                      class="px-3 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-card dark:bg-white/[0.04] hover:bg-surface text-xs font-mono transition-colors cursor-pointer shrink-0"
                      title="Copier l'identifiant"
                    >
                      {copiedField === "username" ? "Copié !" : "Copier"}
                    </button>
                  </div>
                </div>

                <!-- Password -->
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <label class="block text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                      Mot de passe Git pour ce site
                    </label>
                    <button
                      onclick={handleRegeneratePassword}
                      disabled={regenerating}
                      class="text-[10px] font-mono text-brand hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      {regenerating ? "Génération..." : "Régénérer"}
                    </button>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="flex-1 p-2.5 bg-surface dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl font-mono text-xs text-foreground truncate select-all">
                      {#if showPassword}
                        {gitPassword}
                      {:else}
                        ••••••••••••••••••••••••
                      {/if}
                    </div>
                    <button
                      onclick={() => (showPassword = !showPassword)}
                      class="p-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-card dark:bg-white/[0.04] hover:bg-surface text-xs transition-colors cursor-pointer shrink-0"
                      title={showPassword ? "Masquer" : "Afficher"}
                    >
                      {showPassword ? "🙈" : "👁️"}
                    </button>
                    <button
                      onclick={() => copyText(gitPassword, "password")}
                      class="px-3 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-card dark:bg-white/[0.04] hover:bg-surface text-xs font-mono transition-colors cursor-pointer shrink-0"
                      title="Copier le mot de passe"
                    >
                      {copiedField === "password" ? "Copié !" : "Copier"}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Clone Command Card 1: 1-click Pre-authenticated -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                    Commande de clonage rapide (identifiants inclus)
                  </span>
                  <span class="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">Prêt à coller</span>
                </div>
                <div class="p-3 bg-surface dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3">
                  <code class="font-mono text-xs text-brand break-all select-all flex-1">
                    {authedCloneCmd}
                  </code>
                  <button
                    onclick={() => copyText(authedCloneCmd, "authed-clone")}
                    class="focus-ring px-3.5 py-1.5 rounded-xl bg-brand text-white text-xs font-mono font-medium shadow-sm hover:bg-brand/90 transition-all cursor-pointer shrink-0"
                  >
                    {copiedField === "authed-clone" ? "Copié !" : "Copier"}
                  </button>
                </div>
              </div>

              <!-- Clone Command Card 2: Standard HTTPS -->
              <div class="space-y-1.5">
                <span class="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                  Commande standard (Git vous demandera l'identifiant et mot de passe)
                </span>
                <div class="p-3 bg-surface dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3">
                  <code class="font-mono text-xs text-foreground/80 break-all select-all flex-1">
                    {standardCloneCmd}
                  </code>
                  <button
                    onclick={() => copyText(standardCloneCmd, "standard-clone")}
                    class="px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/10 bg-card hover:bg-surface text-xs font-mono transition-colors cursor-pointer shrink-0"
                  >
                    {copiedField === "standard-clone" ? "Copié !" : "Copier"}
                  </button>
                </div>
              </div>

              <!-- Dev Quickstart Guide -->
              <div class="pt-2 border-t border-black/5 dark:border-white/5 space-y-2 text-xs text-muted-foreground">
                <div class="font-mono text-foreground text-[11px] uppercase tracking-wider">
                  Démarrage en local après clonage :
                </div>
                <div class="p-3 bg-surface/50 dark:bg-black/20 rounded-xl font-mono text-[11px] space-y-1">
                  <p class="text-muted-foreground">cd {projectSlug}</p>
                  <p class="text-muted-foreground">bun install</p>
                  <p class="text-foreground">bun run dev</p>
                </div>
                <p class="text-[11px] leading-relaxed">
                  Lorsque vous effectuez un <code class="font-mono text-foreground font-bold">git push origin main</code> depuis votre machine, les changements sont instantanément disponibles dans Ether Studio.
                </p>
              </div>
            </div>
          {/if}

          <!-- TAB 2: SSH Keys -->
          {#if activeTab === "ssh"}
            <div class="space-y-5">
              <!-- SSH info banner -->
              <div class="p-3.5 rounded-2xl bg-brand/5 dark:bg-brand/[0.07] border border-brand/15 text-xs text-muted-foreground flex items-start gap-3">
                <span class="text-brand text-base leading-none">🔑</span>
                <div class="space-y-1 leading-relaxed">
                  <span class="text-foreground font-medium">Authentification par clé publique SSH</span>
                  <p>
                    Ajoutez la clé publique de votre machine locale (<code class="font-mono text-foreground">~/.ssh/id_ed25519.pub</code>). Seule votre machine possédant la clé privée correspondante pourra cloner vos dépôts.
                  </p>
                </div>
              </div>

              <!-- Existing Keys List -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                    Clés SSH enregistrées ({sshKeys.length})
                  </span>
                </div>

                {#if sshKeys.length === 0}
                  <div class="p-4 rounded-xl border border-dashed border-black/10 dark:border-white/10 text-center text-xs text-muted-foreground">
                    Aucune clé SSH enregistrée pour ce compte. Vous pouvez en ajouter une ci-dessous.
                  </div>
                {:else}
                  <div class="space-y-2">
                    {#each sshKeys as key}
                      <div class="p-3 bg-surface dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl flex items-center justify-between gap-3">
                        <div class="min-w-0 space-y-0.5">
                          <div class="flex items-center gap-2">
                            <span class="font-medium text-xs text-foreground truncate">{key.title}</span>
                            <span class="text-[10px] font-mono text-muted-foreground">
                              {new Date(key.created_at).toLocaleDateString("fr-FR")}
                            </span>
                          </div>
                          <div class="font-mono text-[10px] text-muted-foreground truncate select-all">
                            {key.fingerprint}
                          </div>
                        </div>
                        <button
                          onclick={() => handleDeleteSshKey(key.id)}
                          disabled={deletingKeyId === key.id}
                          class="px-2.5 py-1 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                          title="Supprimer cette clé"
                        >
                          {deletingKeyId === key.id ? "..." : "Supprimer"}
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Add Key Form -->
              <form onsubmit={handleAddSshKey} class="space-y-3 pt-3 border-t border-black/5 dark:border-white/5">
                <span class="block text-[11px] font-mono font-semibold uppercase tracking-wider text-foreground">
                  Ajouter une nouvelle clé publique SSH
                </span>

                {#if addKeyError}
                  <div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-mono">
                    {addKeyError}
                  </div>
                {/if}

                <div>
                  <input
                    type="text"
                    bind:value={newKeyTitle}
                    placeholder="Nom de la machine (ex: MacBook Pro, PC Bureau)"
                    class="w-full px-3.5 py-2 rounded-xl bg-surface dark:bg-black/20 border border-black/10 dark:border-white/10 text-foreground placeholder:text-muted-foreground/50 text-xs outline-none focus:border-brand"
                  />
                </div>

                <div>
                  <textarea
                    bind:value={newKeyContent}
                    rows="3"
                    required
                    placeholder="Collez ici le contenu de votre clé publique (commence par ssh-ed25519 ou ssh-rsa)..."
                    class="w-full px-3.5 py-2 rounded-xl bg-surface dark:bg-black/20 border border-black/10 dark:border-white/10 text-foreground placeholder:text-muted-foreground/50 text-xs font-mono outline-none focus:border-brand"
                  ></textarea>
                </div>

                <div class="flex items-center justify-between pt-1">
                  <span class="text-[10px] text-muted-foreground font-mono">
                    Générer : <code>ssh-keygen -t ed25519</code>
                  </span>
                  <button
                    type="submit"
                    disabled={addingKey || !newKeyContent.trim()}
                    class="focus-ring px-4 py-2 rounded-full bg-brand hover:bg-brand/90 text-white text-xs font-mono font-medium shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    {addingKey ? "Enregistrement..." : "Enregistrer la clé SSH"}
                  </button>
                </div>
              </form>
            </div>
          {/if}
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="px-5 sm:px-6 py-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between shrink-0 bg-surface/30">
        <span class="text-[11px] font-mono text-muted-foreground">
          Serveur Git Ether : <code class="text-brand">git.ether.paris</code>
        </span>
        <button
          onclick={onClose}
          class="focus-ring px-5 py-2 rounded-full border border-black/10 dark:border-white/10 bg-card dark:bg-white/[0.04] text-foreground text-xs uppercase tracking-[0.15em] font-mono hover:bg-surface transition-all cursor-pointer"
        >
          Fermer
        </button>
      </div>
    </div>
  </div>
{/if}
