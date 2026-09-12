<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import BrandMark from "$lib/components/brand-mark.svelte";

  const errorParam = $page.url.searchParams.get("error");

  const errorMessages: Record<string, string> = {
    auth_failed: "Échec de l'authentification. Veuillez réessayer.",
    invalid_state: "Session expirée. Veuillez redemander un code.",
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
      const redirectParam = $page.url.searchParams.get("redirect");
      const res = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: code.trim(),
          redirect: redirectParam || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Code invalide.");
      }

      if (data.sessionToken) {
        try {
          localStorage.setItem("ether_session_token", data.sessionToken);
          localStorage.setItem("ether_user_email", email);
        } catch {}
      }

      window.location.href = redirectParam || data.redirect || "/dashboard";
    } catch (err: any) {
      errorMessage = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    try {
      const savedToken = localStorage.getItem("ether_session_token");
      if (savedToken) {
        const res = await fetch("/api/auth/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: savedToken }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            const redirectParam = $page.url.searchParams.get("redirect");
            window.location.href = redirectParam || "/studio";
          }
        }
      }
    } catch {}
  });
</script>

<svelte:head>
  <title>Connexion Studio | Ether</title>
</svelte:head>

<div class="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4 py-12 grain-overlay">
  <!-- Brand logo header -->
  <div class="mb-8 text-center">
    <a href="/" class="transition-opacity hover:opacity-80 inline-block">
      <BrandMark class="h-16 w-16" />
    </a>
  </div>

  <div class="retro-card w-full max-w-md p-8 md:p-10 space-y-6">
    <div class="text-center space-y-2">
      <h1 class="font-display text-2xl md:text-3xl text-foreground font-normal tracking-tight">Connexion Studio</h1>
      <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Accédez à votre espace &amp; vos sites</p>
    </div>

    {#if errorMessage}
      <div class="p-3.5 rounded-2xl bg-accent-soft/80 border border-accent/40 text-foreground text-sm flex items-start gap-2.5 font-neue">
        <svg class="w-5 h-5 text-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{errorMessage}</span>
      </div>
    {/if}

    {#if statusMessage}
      <div class="p-3.5 rounded-2xl bg-surface border border-brand/20 text-brand text-sm flex items-start gap-2.5 font-neue">
        <svg class="w-5 h-5 text-brand shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span>{statusMessage}</span>
      </div>
    {/if}

    {#if step === "email"}
      <form onsubmit={handleRequestCode} class="space-y-4">
        <div>
          <label for="email" class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Adresse email
          </label>
          <input
            id="email"
            type="email"
            bind:value={email}
            placeholder="vous@domaine.com"
            required
            class="w-full rounded-2xl border border-black/10 bg-surface/80 px-4 py-3.5 text-foreground placeholder:text-muted-foreground/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all font-neue text-sm"
          />
          <p class="mt-2 text-xs text-muted-foreground leading-relaxed">
            Un code temporaire à 6 chiffres vous sera envoyé par email. Aucun mot de passe requis.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          class="focus-ring inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-white shadow-retro transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0 cursor-pointer disabled:opacity-50"
        >
          {#if loading}
            <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
            <span>Envoi en cours...</span>
          {:else}
            <span>Recevoir mon code d'accès</span>
          {/if}
        </button>
      </form>
    {:else}
      <form onsubmit={handleVerifyCode} class="space-y-4">
        <div>
          <div class="flex items-center justify-between mb-2">
            <label for="code" class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Code de vérification
            </label>
            <button
              type="button"
              onclick={() => { step = "email"; code = ""; }}
              class="text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-brand underline cursor-pointer"
            >
              Changer
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
            class="w-full rounded-2xl border-2 border-brand bg-surface px-4 py-3.5 text-center font-mono text-3xl font-bold tracking-[0.35em] text-brand placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-brand shadow-retro-sm transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          class="focus-ring inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-white shadow-retro transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0 cursor-pointer disabled:opacity-50"
        >
          {#if loading}
            <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
            <span>Vérification...</span>
          {:else}
            <span>Valider et accéder</span>
          {/if}
        </button>

        <button
          type="button"
          disabled={loading}
          onclick={handleRequestCode}
          class="w-full py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors text-center cursor-pointer"
        >
          Renvoyer un code
        </button>
      </form>
    {/if}

    <div class="text-center pt-4 border-t border-black/5">
      <a href="/" class="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors">
        ← Retour à l'accueil
      </a>
    </div>
  </div>
</div>
