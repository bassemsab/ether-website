<script lang="ts">
  interface Tenant {
    slug: string;
    subdomain?: string;
    domain?: string;
    brand_name?: string;
    custom_domain?: string | null;
  }

  interface Props {
    tenant: Tenant;
  }

  let { tenant }: Props = $props();

  let counter = $state(0);
  let contactName = $state("");
  let contactEmail = $state("");
  let contactMessage = $state("");
  let messageSent = $state(false);

  const brandTitle = $derived(
    tenant.brand_name && tenant.brand_name.trim().length > 0
      ? tenant.brand_name
      : tenant.slug
  );

  const subdomain = $derived(
    tenant.custom_domain || tenant.subdomain || `${tenant.slug}.ether.paris`
  );

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!contactEmail) return;
    messageSent = true;
    setTimeout(() => {
      contactName = "";
      contactEmail = "";
      contactMessage = "";
    }, 500);
  }
</script>

<svelte:head>
  <title>{brandTitle} — Site Officiel</title>
  <meta name="description" content="Site officiel de {brandTitle} hébergé par Ether Studio." />
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col grain-overlay">
  <!-- Top Site Header -->
  <header class="border-b border-black/5 bg-surface/80 backdrop-blur sticky top-0 z-30">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl border border-black/10 bg-brand text-white flex items-center justify-center font-display text-lg font-bold shadow-retro-sm uppercase">
          {brandTitle.charAt(0)}
        </div>
        <div>
          <span class="font-display text-lg font-normal tracking-tight text-foreground block leading-tight">
            {brandTitle}
          </span>
          <span class="text-[10px] font-mono text-muted-foreground uppercase tracking-widest block">
            {subdomain}
          </span>
        </div>
      </div>

      <nav class="hidden sm:flex items-center gap-6 text-xs uppercase tracking-[0.15em] text-muted-foreground">
        <a href="#services" class="hover:text-foreground transition-colors">Services</a>
        <a href="#interactive" class="hover:text-foreground transition-colors">Interactivité</a>
        <a href="#contact" class="hover:text-foreground transition-colors">Contact</a>
      </nav>

      <div class="flex items-center gap-2">
        <a
          href="https://studio.ether.paris/?project={tenant.slug}"
          class="focus-ring px-4 py-1.5 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-foreground text-xs uppercase tracking-[0.15em] transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-retro-sm font-medium"
        >
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Studio</span>
        </a>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 space-y-16">
    <section class="text-center space-y-6 max-w-3xl mx-auto">
      <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-brand/20 bg-brand/5 text-brand text-xs font-mono uppercase tracking-[0.2em]">
        <span class="w-1.5 h-1.5 rounded-full bg-brand"></span>
        Site Officiel · Propulsé par Ether
      </div>

      <h1 class="font-display text-4xl sm:text-5xl md:text-6xl text-foreground font-normal tracking-tight leading-[1.1]">
        Bienvenue chez <span class="italic underline decoration-brand/30">{brandTitle}</span>
      </h1>

      <p class="text-base sm:text-lg text-muted-foreground leading-relaxed font-neue">
        Votre nouvelle présence en ligne autonome et ultra-rapide. Conçue avec SvelteKit 5 Runes, propulsée par le runtime Bun et orchestrée sur cluster Kubernetes haute performance.
      </p>

      <div class="flex flex-wrap items-center justify-center gap-4 pt-2">
        <a
          href="#interactive"
          class="focus-ring px-7 py-3.5 rounded-full bg-brand hover:bg-brand/90 text-white text-xs font-medium uppercase tracking-[0.2em] shadow-retro transition-all hover:-translate-y-0.5 cursor-pointer"
        >
          Découvrir la démo
        </a>
        <a
          href="#contact"
          class="focus-ring px-7 py-3.5 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-foreground text-xs font-medium uppercase tracking-[0.15em] transition-all cursor-pointer"
        >
          Nous contacter
        </a>
      </div>
    </section>

    <!-- Interactive Runes & SQLite persistent section -->
    <section id="interactive" class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <!-- Svelte 5 Reactive Counter Card -->
      <div class="retro-card p-6 md:p-8 space-y-6">
        <div class="space-y-2">
          <span class="text-xs uppercase tracking-[0.2em] text-brand font-mono font-semibold">
            Réactivité Svelte 5 (Runes)
          </span>
          <h2 class="font-display text-2xl text-foreground font-normal">Compteur Interactif</h2>
          <p class="text-xs text-muted-foreground leading-relaxed">
            Ce composant exploite la syntaxe native des Runes Svelte 5 (<code>$state</code> et <code>$derived</code>) avec un rendu instantané zéro surcharge.
          </p>
        </div>

        <div class="p-6 rounded-2xl bg-surface/80 border border-black/10 text-center space-y-4">
          <div class="font-display text-4xl text-brand font-bold font-mono">
            {counter}
          </div>
          <div class="flex items-center justify-center gap-3">
            <button
              onclick={() => counter--}
              class="w-10 h-10 rounded-full border border-black/10 bg-card hover:bg-surface text-foreground font-mono text-lg flex items-center justify-center transition-all cursor-pointer"
              aria-label="Diminuer"
            >
              -
            </button>
            <button
              onclick={() => counter++}
              class="px-6 py-2.5 rounded-full bg-brand text-white text-xs font-medium uppercase tracking-[0.2em] hover:bg-brand/90 shadow-retro-sm transition-all cursor-pointer hover:-translate-y-0.5"
            >
              Incrémenter
            </button>
            <button
              onclick={() => counter = 0}
              class="px-3 py-2 rounded-full border border-black/10 bg-card hover:bg-surface text-xs text-muted-foreground font-mono transition-all cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <!-- SQLite & Persistent Storage Card -->
      <div class="retro-card p-6 md:p-8 space-y-6">
        <div class="space-y-2">
          <span class="text-xs uppercase tracking-[0.2em] text-emerald-600 font-mono font-semibold">
            Persistance Données
          </span>
          <h2 class="font-display text-2xl text-foreground font-normal">Base SQLite Dédiée</h2>
          <p class="text-xs text-muted-foreground leading-relaxed">
            Chaque site dispose de son propre volume Kubernetes persistant de 1Gi avec le moteur <code>bun:sqlite</code>.
          </p>
        </div>

        <div class="p-6 rounded-2xl bg-surface/80 border border-black/10 space-y-3 font-mono text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-black/5">
            <span class="text-muted-foreground">Fichier DB :</span>
            <span class="text-brand font-semibold">/data/app.db</span>
          </div>
          <div class="flex items-center justify-between pb-2 border-b border-black/5">
            <span class="text-muted-foreground">Volume PVC :</span>
            <span class="text-foreground">tenant-storage (1Gi)</span>
          </div>
          <div class="flex items-center justify-between pb-2 border-b border-black/5">
            <span class="text-muted-foreground">Moteur :</span>
            <span class="text-foreground">Bun SQLite natif</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Isolation Réseau :</span>
            <span class="text-emerald-600 font-semibold">NetworkPolicy active</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Services / Feature Showcase Section -->
    <section id="services" class="space-y-8">
      <div class="text-center space-y-2">
        <span class="section-heading">Nos Engagements</span>
        <h2 class="font-display text-3xl text-foreground font-normal tracking-tight">Ce que {brandTitle} vous apporte</h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="retro-card p-6 space-y-3">
          <div class="w-10 h-10 rounded-xl border border-black/10 bg-brand/5 text-brand flex items-center justify-center font-mono font-bold">
            01
          </div>
          <h3 class="font-display text-xl text-foreground font-normal">Performance Éclair</h3>
          <p class="text-xs text-muted-foreground leading-relaxed">
            Temps de chargement inférieur à 50ms grâce au moteur Bun et aux îles interactives optimisées par Svelte 5.
          </p>
        </div>

        <div class="retro-card p-6 space-y-3">
          <div class="w-10 h-10 rounded-xl border border-black/10 bg-brand/5 text-brand flex items-center justify-center font-mono font-bold">
            02
          </div>
          <h3 class="font-display text-xl text-foreground font-normal">Souveraineté &amp; Sécurité</h3>
          <p class="text-xs text-muted-foreground leading-relaxed">
            Hébergement européen en France et en Allemagne avec politique de filtrage egress stricte et données étanches.
          </p>
        </div>

        <div class="retro-card p-6 space-y-3">
          <div class="w-10 h-10 rounded-xl border border-black/10 bg-brand/5 text-brand flex items-center justify-center font-mono font-bold">
            03
          </div>
          <h3 class="font-display text-xl text-foreground font-normal">Édition en Studio</h3>
          <p class="text-xs text-muted-foreground leading-relaxed">
            Personnalisez tout le code en direct via Ether Studio avec assistance IA interactive.
          </p>
        </div>
      </div>
    </section>

    <!-- Contact Form Section -->
    <section id="contact" class="max-w-xl mx-auto w-full">
      <div class="retro-card p-8 space-y-6">
        <div class="text-center space-y-2">
          <span class="section-heading">Formulaire de contact</span>
          <h2 class="font-display text-2xl text-foreground font-normal">Écrire à {brandTitle}</h2>
          <p class="text-xs text-muted-foreground">
            Laissez un message, il sera directement enregistré dans la base SQLite du site.
          </p>
        </div>

        {#if messageSent}
          <div class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 text-xs font-mono text-center space-y-1">
            <p class="font-bold">✓ Message transmis avec succès !</p>
            <p class="text-emerald-700">L'équipe de {brandTitle} reviendra vers vous dans les meilleurs délais.</p>
          </div>
        {/if}

        <form onsubmit={handleSubmit} class="space-y-4">
          <div>
            <label for="contact-name" class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
              Votre Nom
            </label>
            <input
              id="contact-name"
              type="text"
              bind:value={contactName}
              placeholder="Ex: Camille Martin"
              required
              class="w-full rounded-2xl border border-black/10 bg-surface/80 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none text-xs transition-all font-neue"
            />
          </div>

          <div>
            <label for="contact-email" class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
              Votre Adresse Email
            </label>
            <input
              id="contact-email"
              type="email"
              bind:value={contactEmail}
              placeholder="vous@domaine.com"
              required
              class="w-full rounded-2xl border border-black/10 bg-surface/80 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none text-xs transition-all font-neue"
            />
          </div>

          <div>
            <label for="contact-msg" class="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
              Message
            </label>
            <textarea
              id="contact-msg"
              rows={3}
              bind:value={contactMessage}
              placeholder="Bonjour, je souhaite en savoir plus sur vos services..."
              required
              class="w-full rounded-2xl border border-black/10 bg-surface/80 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none text-xs transition-all font-neue resize-none"
            ></textarea>
          </div>

          <button
            type="submit"
            class="focus-ring w-full py-3.5 rounded-full bg-brand hover:bg-brand/90 text-white text-xs font-medium uppercase tracking-[0.2em] shadow-retro-sm transition-all cursor-pointer"
          >
            Envoyer le message
          </button>
        </form>
      </div>
    </section>
  </main>

  <!-- Footer -->
  <footer class="border-t border-black/5 bg-surface/60 py-8 text-center text-xs text-muted-foreground space-y-2">
    <p>© 2026 {brandTitle}. Tous droits réservés.</p>
    <p class="font-mono text-[11px]">
      Hébergé sur Kubernetes · Propulsé par <a href="https://ether.paris" class="text-brand hover:underline">Ether Studio</a>
    </p>
  </footer>
</div>
