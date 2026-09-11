<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";

  const errorParam = $page.url.searchParams.get("error");

  const errorMessages: Record<string, string> = {
    github_denied: "Vous avez refusé l'accès à votre compte GitHub.",
    invalid_state: "État de session invalide. Veuillez réessayer.",
    no_code: "Code d'autorisation manquant. Veuillez réessayer.",
    auth_failed: "Échec de l'authentification. Veuillez réessayer.",
    oauth_init_failed: "Impossible d'initialiser l'authentification.",
  };

  let email = $state("");
  let code = $state("");
  let step = $state<"email" | "code">("email");
  let loading = $state(false);
  let statusMessage = $state<string | null>(null);
  let errorMessage = $state<string | null>(errorParam ? errorMessages[errorParam] || "Une erreur est survenue." : null);

  async function handleRequestCode(e: Event) {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      errorMessage = "Veuillez entrer une adresse email valide.";
      return;
    }

    loading = true;
    errorMessage = null;
    statusMessage = null;

    try {
      const res = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Échec lors de l'envoi du code.");
      }

      step = "code";
      statusMessage = data.message || `Code à 6 chiffres envoyé à ${email}`;
    } catch (err: any) {
      errorMessage = err.message;
    } finally {
      loading = false;
    }
  }

  async function handleVerifyCode(e: Event) {
    e.preventDefault();
    if (!code || code.trim().length !== 6) {
      errorMessage = "Veuillez saisir le code à 6 chiffres.";
      return;
    }

    loading = true;
    errorMessage = null;
    statusMessage = null;

    try {
      const res = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: code.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Code invalide.");
      }

      window.location.href = data.redirect || "/dashboard";
    } catch (err: any) {
      errorMessage = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Connexion & Accès Studio | Ether</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-[#07090e] text-slate-100 px-4 py-12">
  <div class="w-full max-w-md p-8 bg-[#0d121f] border border-slate-800/80 rounded-2xl shadow-2xl space-y-6">
    <div class="text-center space-y-2">
      <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 mb-2">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-white">Connexion à Ether</h1>
      <p class="text-sm text-slate-400">Accédez à votre studio IA et gérez vos sites web</p>
    </div>

    {#if errorMessage}
      <div class="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-2.5">
        <svg class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{errorMessage}</span>
      </div>
    {/if}

    {#if statusMessage}
      <div class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-start gap-2.5">
        <svg class="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span>{statusMessage}</span>
      </div>
    {/if}

    {#if step === "email"}
      <form onsubmit={handleRequestCode} class="space-y-4">
        <div>
          <label for="email" class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Adresse email
          </label>
          <input
            id="email"
            type="email"
            bind:value={email}
            placeholder="vous@exemple.com"
            required
            class="w-full px-4 py-3 bg-[#07090e] border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <p class="mt-1.5 text-xs text-slate-500">
            Un code temporaire à 6 chiffres vous sera envoyé par email. Aucun mot de passe requis.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if loading}
            <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            <span>Envoi en cours...</span>
          {:else}
            <span>Recevoir mon code d'accès</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          {/if}
        </button>
      </form>
    {:else}
      <form onsubmit={handleVerifyCode} class="space-y-4">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="code" class="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Code de vérification
            </label>
            <button
              type="button"
              onclick={() => { step = "email"; code = ""; }}
              class="text-xs text-blue-400 hover:underline cursor-pointer"
            >
              Changer d'email
            </button>
          </div>
          <input
            id="code"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="6"
            bind:value={code}
            placeholder="123456"
            required
            class="w-full px-4 py-3 bg-[#07090e] border border-slate-700/80 rounded-xl text-center font-mono text-2xl tracking-[0.3em] text-blue-400 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if loading}
            <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            <span>Vérification...</span>
          {:else}
            <span>Valider et accéder à mon espace</span>
          {/if}
        </button>

        <button
          type="button"
          disabled={loading}
          onclick={handleRequestCode}
          class="w-full py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors text-center cursor-pointer"
        >
          Renvoyer un nouveau code
        </button>
      </form>
    {/if}

    <div class="relative py-2">
      <div class="absolute inset-0 flex items-center">
        <div class="w-full border-t border-slate-800"></div>
      </div>
      <div class="relative flex justify-center text-xs uppercase">
        <span class="bg-[#0d121f] px-2 text-slate-500">Ou via GitHub</span>
      </div>
    </div>

    <a
      href="/auth/github"
      class="flex items-center justify-center w-full gap-3 px-4 py-3 text-sm font-medium text-slate-300 bg-slate-800/60 border border-slate-700/60 rounded-xl hover:bg-slate-800 hover:text-white transition-colors"
    >
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill-rule="evenodd"
          d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
          clip-rule="evenodd"
        />
      </svg>
      Continuer avec GitHub
    </a>

    <div class="text-center">
      <a href="/" class="text-xs text-slate-500 hover:text-slate-300 transition-colors">← Retour à l'accueil</a>
    </div>
  </div>
</div>
