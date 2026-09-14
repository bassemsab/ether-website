<script lang="ts">
  import { fade, scale } from "svelte/transition";

  interface Tenant {
    slug: string;
    brand_name?: string | null;
    domain?: string | null;
    subdomain?: string | null;
    custom_domain?: string | null;
    git_repo_url?: string | null;
    k8s_namespace?: string | null;
  }

  interface Props {
    tenant: Tenant | null;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (slug: string) => void;
    onError: (step: string, error: string) => void;
  }

  let { tenant, isOpen, onClose, onSuccess, onError }: Props = $props();

  let confirmInput = $state("");
  let isDeleting = $state(false);
  let currentStepIndex = $state(0);

  interface StepState {
    id: "git" | "runner" | "k8s" | "db";
    label: string;
    description: string;
    status: "pending" | "running" | "done" | "error";
    error?: string;
  }

  let steps = $state<StepState[]>([
    {
      id: "git",
      label: "Dépôt Gitea",
      description: "Suppression du code source et des commits distants",
      status: "pending",
    },
    {
      id: "runner",
      label: "Serveur & Fichiers Runner",
      description: "Arrêt des processus Vite, sessions tmux et volume local",
      status: "pending",
    },
    {
      id: "k8s",
      label: "Espace Cloud Kubernetes",
      description: "Libération du namespace, des conteneurs et du stockage PVC 1Gi",
      status: "pending",
    },
    {
      id: "db",
      label: "Enregistrement Plateforme",
      description: "Désenregistrement du site (sessions comptables conservées)",
      status: "pending",
    },
  ]);

  let isSlugMatched = $derived(
    Boolean(tenant && confirmInput.trim().toLowerCase() === tenant.slug.trim().toLowerCase()),
  );

  let progressPercent = $derived.by(() => {
    if (!isDeleting) return 0;
    const completedCount = steps.filter((s) => s.status === "done").length;
    const runningCount = steps.filter((s) => s.status === "running").length;
    return Math.round(((completedCount + runningCount * 0.5) / steps.length) * 100);
  });

  function resetModal() {
    confirmInput = "";
    isDeleting = false;
    currentStepIndex = 0;
    steps = steps.map((s) => ({ ...s, status: "pending", error: undefined }));
  }

  function handleCancel() {
    if (isDeleting) return; // Prevent cancelling mid-flight
    resetModal();
    onClose();
  }

  async function startDeletion() {
    if (!tenant || !isSlugMatched || isDeleting) return;

    isDeleting = true;

    for (let i = 0; i < steps.length; i++) {
      currentStepIndex = i;
      steps[i].status = "running";

      try {
        const res = await fetch("/api/tenant/delete/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: tenant.slug, step: steps[i].id }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          const errMsg = data.error || `Échec lors de l'étape ${steps[i].label}`;
          steps[i].status = "error";
          steps[i].error = errMsg;
          isDeleting = false;

          // Per design alignment: close modal and report error to dashboard toast
          setTimeout(() => {
            resetModal();
            onError(steps[i].id, errMsg);
          }, 800);
          return;
        }

        steps[i].status = "done";
        // Brief pause for visual feedback
        await new Promise((r) => setTimeout(r, 200));
      } catch (err: any) {
        const errMsg = err.message || "Erreur de connexion";
        steps[i].status = "error";
        steps[i].error = errMsg;
        isDeleting = false;

        setTimeout(() => {
          resetModal();
          onError(steps[i].id, errMsg);
        }, 800);
        return;
      }
    }

    // All steps completed successfully
    await new Promise((r) => setTimeout(r, 350));
    const deletedSlug = tenant.slug;
    resetModal();
    onSuccess(deletedSlug);
  }
</script>

{#if isOpen && tenant}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="relative w-full max-w-lg bg-surface border border-black/10 rounded-3xl shadow-2xl overflow-hidden"
      transition:scale={{ start: 0.95, duration: 200 }}
    >
      <!-- Modal Header -->
      <div class="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 border-b border-black/5 flex items-start justify-between">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 text-xs font-bold">
              ✕
            </span>
            <h3 class="font-display text-xl sm:text-2xl text-foreground font-normal">
              Suppression de site
            </h3>
          </div>
          <p class="text-xs text-muted-foreground font-mono">
            {tenant.brand_name || tenant.slug} ({tenant.slug}.ether.paris)
          </p>
        </div>

        {#if !isDeleting}
          <button
            onclick={handleCancel}
            class="text-muted-foreground hover:text-foreground text-sm font-mono p-1 transition cursor-pointer"
            aria-label="Fermer"
          >
            ✕
          </button>
        {/if}
      </div>

      <!-- Modal Body -->
      <div class="p-6 sm:p-8 space-y-6">
        {#if !isDeleting}
          <!-- Phase 1: Confirmation & Safety Warning -->
          <div class="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-2 text-xs text-foreground/80 leading-relaxed">
            <p class="font-medium text-rose-700 dark:text-rose-400">
              ⚠️ Attention : cette action est irréversible.
            </p>
            <ul class="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Le dépôt Gitea et son historique Git seront purgés.</li>
              <li>L'espace de développement et de preview sera détruit.</li>
              <li>Les conteneurs Kubernetes et le stockage persistant seront supprimés.</li>
            </ul>
            <div class="pt-2 border-t border-rose-500/10 text-[11px] text-muted-foreground">
              ℹ️ <strong>Conservation légale :</strong> les sessions d'utilisation et métriques de prompts sont archivées pour votre suivi comptable.
            </div>
          </div>

          <div class="space-y-2">
            <label for="confirm-slug" class="block text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Veuillez taper <span class="font-mono text-rose-600 font-bold">{tenant.slug}</span> pour confirmer :
            </label>
            <input
              id="confirm-slug"
              type="text"
              bind:value={confirmInput}
              placeholder={tenant.slug}
              autocomplete="off"
              class="w-full px-4 py-3 rounded-xl border border-black/10 bg-surface/50 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition"
            />
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onclick={handleCancel}
              class="px-5 py-2.5 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-foreground text-xs uppercase tracking-[0.15em] transition cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={!isSlugMatched}
              onclick={startDeletion}
              class="px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-xs font-medium uppercase tracking-[0.15em] shadow-retro-sm transition cursor-pointer"
            >
              Supprimer définitivement
            </button>
          </div>
        {:else}
          <!-- Phase 2: Execution & Progress Bar -->
          <div class="space-y-6">
            <!-- Progress Bar -->
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs font-mono text-muted-foreground">
                <span>Progression du nettoyage</span>
                <span class="font-bold text-foreground">{progressPercent}%</span>
              </div>
              <div class="w-full h-2 rounded-full bg-black/10 overflow-hidden relative">
                <div
                  class="h-full bg-rose-600 rounded-full transition-all duration-300 ease-out"
                  style="width: {progressPercent}%;"
                ></div>
              </div>
            </div>

            <!-- Steps Checklist -->
            <div class="space-y-3">
              {#each steps as step, i}
                <div class="flex items-start gap-3.5 p-3 rounded-2xl border transition-all {
                  step.status === 'running'
                    ? 'border-brand/30 bg-brand/5'
                    : step.status === 'done'
                      ? 'border-emerald-500/20 bg-emerald-500/5'
                      : step.status === 'error'
                        ? 'border-rose-500/30 bg-rose-500/5'
                        : 'border-black/5 bg-surface/30 opacity-60'
                }">
                  <!-- Status Icon -->
                  <div class="shrink-0 mt-0.5">
                    {#if step.status === 'running'}
                      <svg class="animate-spin h-4 w-4 text-brand" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                    {:else if step.status === 'done'}
                      <span class="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                        ✓
                      </span>
                    {:else if step.status === 'error'}
                      <span class="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold">
                        ✕
                      </span>
                    {:else}
                      <span class="flex h-4 w-4 items-center justify-center rounded-full border border-black/20 text-muted-foreground text-[10px]">
                        {i + 1}
                      </span>
                    {/if}
                  </div>

                  <!-- Step Details -->
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-medium text-foreground leading-snug">
                      {step.label}
                    </p>
                    <p class="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                      {step.description}
                    </p>
                    {#if step.error}
                      <p class="text-[11px] text-rose-600 font-mono mt-1">
                        Erreur : {step.error}
                      </p>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>

            <p class="text-center text-[11px] text-muted-foreground font-mono animate-pulse">
              Veuillez patienter pendant que les ressources cloud sont libérées...
            </p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
