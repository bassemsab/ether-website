<script lang="ts">
  import BrandMark from "$lib/components/brand-mark.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tenant = $derived(data.tenant);
  const projectSlug = $derived(data.projectSlug || "tester");
  const liveUrl = $derived(tenant.custom_domain ? `https://${tenant.custom_domain}` : `https://${projectSlug}.ether.paris`);

  // Chat State
  let messages = $state([
    {
      role: "assistant",
      content: `Bonjour ! Je suis l'agent IA Ether Studio propulsé par l'agy CLI. Votre site **${tenant.brand_name || projectSlug}** tourne sur Kubernetes avec SvelteKit 5 Runes, Bun et une base de données SQLite isolée sur volume persistant.\n\nQue souhaitez-vous ajouter ou modifier sur votre site ?`,
      profile: "primary",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  let promptInput = $state("");
  let isThinking = $state(false);
  let activeProfile = $state<"primary" | "secondary">("primary");
  let publishLoading = $state(false);
  let publishStatus = $state<string | null>(null);

  // Editor State
  let activeFile = $state("src/routes/+page.svelte");
  let codeContent = $state(data.defaultCode || "");
  let editorSaved = $state(false);

  // Preview State
  let viewportMode = $state<"desktop" | "tablet" | "mobile">("desktop");
  let previewKey = $state(0);

  async function handleSendPrompt(e?: Event) {
    if (e) e.preventDefault();
    const text = promptInput.trim();
    if (!text || isThinking) return;

    promptInput = "";
    messages.push({
      role: "user",
      content: text,
      profile: activeProfile,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });

    isThinking = true;

    try {
      const res = await fetch("/api/studio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          projectSlug,
        }),
      });

      const resData = await res.json();
      if (resData.success) {
        messages.push({
          role: "assistant",
          content: resData.response,
          profile: resData.profileUsed || "primary",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        // Auto-refresh live preview
        previewKey++;
      } else {
        messages.push({
          role: "assistant",
          content: `⚠️ Note : ${resData.error || "Impossible d'exécuter la commande."}`,
          profile: "secondary",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
      }
    } catch (err: any) {
      messages.push({
        role: "assistant",
        content: `Erreur de connexion avec le runner agy : ${err.message}`,
        profile: "secondary",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    } finally {
      isThinking = false;
    }
  }

  async function handlePublish() {
    publishLoading = true;
    publishStatus = null;

    try {
      const res = await fetch("/api/tenant/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id || 1 }),
      });
      const resData = await res.json();
      if (resData.success) {
        publishStatus = "✓ Site publié et actif sur Kubernetes !";
        previewKey++;
      } else {
        publishStatus = `Erreur : ${resData.error}`;
      }
    } catch (err: any) {
      publishStatus = `Erreur : ${err.message}`;
    } finally {
      publishLoading = false;
      setTimeout(() => {
        publishStatus = null;
      }, 5000);
    }
  }

  function handleSaveCode() {
    editorSaved = true;
    previewKey++;
    setTimeout(() => {
      editorSaved = false;
    }, 2500);
  }
</script>

<svelte:head>
  <title>Ether Studio · {tenant.brand_name || projectSlug}</title>
</svelte:head>

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden grain-overlay">
  <!-- Studio Top Navigation -->
  <header class="h-14 border-b border-black/10 bg-surface/90 backdrop-blur px-4 flex items-center justify-between shrink-0 z-30">
    <div class="flex items-center gap-3">
      <a href="/dashboard" class="transition-opacity hover:opacity-80 flex items-center gap-2">
        <BrandMark class="h-7 w-auto" />
      </a>
      <span class="text-black/20">/</span>
      <div class="flex items-center gap-2">
        <span class="font-display font-medium text-sm text-foreground">{tenant.brand_name || projectSlug}</span>
        <span class="text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-black/10 bg-card text-muted-foreground uppercase tracking-widest">
          {projectSlug}.ether.paris
        </span>
      </div>
    </div>

    <!-- Cluster & Runner Badges -->
    <div class="hidden md:flex items-center gap-4 text-xs font-mono">
      <div class="flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-700">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>K8s Pod 1/1 Running</span>
      </div>
      <div class="flex items-center gap-1.5 px-3 py-1 rounded-full border border-black/10 bg-surface text-muted-foreground">
        <span class="w-1.5 h-1.5 rounded-full bg-brand"></span>
        <span>agy daemon (Gemini 2.5)</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2.5">
      <a
        href={liveUrl}
        target="_blank"
        rel="noopener"
        class="focus-ring px-3.5 py-1.5 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-foreground text-xs uppercase tracking-wider transition-all inline-flex items-center gap-1.5 font-medium cursor-pointer"
      >
        <span>Voir en direct</span>
        <svg class="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>

      <button
        onclick={handlePublish}
        disabled={publishLoading}
        class="focus-ring px-4 py-1.5 rounded-full bg-brand hover:bg-brand/90 text-white text-xs font-medium uppercase tracking-[0.15em] shadow-retro-sm transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 hover:-translate-y-0.5"
      >
        {#if publishLoading}
          <div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          <span>Publication...</span>
        {:else}
          <span>Publier</span>
        {/if}
      </button>

      <a
        href="/dashboard"
        class="text-xs text-muted-foreground hover:text-foreground px-2 py-1 transition-colors uppercase tracking-wider font-mono"
        title="Retour au tableau de bord"
      >
        ✕
      </a>
    </div>
  </header>

  {#if publishStatus}
    <div class="bg-brand text-white px-4 py-1.5 text-xs text-center font-mono tracking-wider flex items-center justify-between">
      <span class="mx-auto">{publishStatus}</span>
      <button onclick={() => publishStatus = null} class="text-white/80 hover:text-white">✕</button>
    </div>
  {/if}

  <!-- Main Studio Workspace (3 Columns) -->
  <div class="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
    <!-- Left Column: AI Prompt & Chat (4 cols) -->
    <div class="lg:col-span-4 border-r border-black/10 bg-surface/40 flex flex-col h-full overflow-hidden">
      <div class="p-3 border-b border-black/10 bg-surface/80 flex items-center justify-between text-xs font-mono">
        <span class="font-semibold text-foreground uppercase tracking-widest flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Assistant IA (agy CLI)
        </span>
        <span class="text-[10px] text-muted-foreground uppercase">Svelte 5 Runes Mode</span>
      </div>

      <!-- Messages Stream -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-neue">
        {#each messages as msg}
          <div class="space-y-1 {msg.role === 'user' ? 'text-right' : ''}">
            <div class="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground {msg.role === 'user' ? 'justify-end' : ''}">
              <span class="font-semibold text-foreground">{msg.role === 'user' ? 'Vous' : 'Ether Agent'}</span>
              <span>·</span>
              <span>{msg.time}</span>
              {#if msg.profile}
                <span class="text-[9px] px-1.5 py-0.2 rounded bg-black/5 uppercase">
                  {msg.profile}
                </span>
              {/if}
            </div>
            <div class="inline-block text-left p-3.5 rounded-2xl max-w-[90%] leading-relaxed {msg.role === 'user' ? 'bg-brand text-white shadow-retro-sm' : 'retro-card bg-card text-foreground'}">
              <div class="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        {/each}

        {#if isThinking}
          <div class="flex items-center gap-2 p-3 text-xs text-muted-foreground font-mono">
            <div class="w-2 h-2 rounded-full bg-brand animate-ping"></div>
            <span>L'agent agy modifie le code en direct...</span>
          </div>
        {/if}
      </div>

      <!-- Quick Suggestion Chips -->
      <div class="px-3 py-2 border-t border-black/5 bg-surface/30 flex items-center gap-1.5 overflow-x-auto text-[11px]">
        <button
          onclick={() => { promptInput = "Ajoute une section Témoignages clients avec 3 cartes modernes"; }}
          class="shrink-0 px-2.5 py-1 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
        >
          + Témoignages
        </button>
        <button
          onclick={() => { promptInput = "Crée un formulaire de réservation avec enregistrement dans SQLite"; }}
          class="shrink-0 px-2.5 py-1 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
        >
          + Formulaire SQLite
        </button>
        <button
          onclick={() => { promptInput = "Ajoute un sélecteur de langue Fr / En avec réactivité Svelte 5"; }}
          class="shrink-0 px-2.5 py-1 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
        >
          + Langues
        </button>
      </div>

      <!-- Prompt Input -->
      <form onsubmit={handleSendPrompt} class="p-3 border-t border-black/10 bg-surface/80 flex items-center gap-2">
        <input
          type="text"
          bind:value={promptInput}
          placeholder="Demandez une modification à l'agent..."
          disabled={isThinking}
          class="flex-1 rounded-full border border-black/10 bg-card px-4 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all"
        />
        <button
          type="submit"
          disabled={!promptInput.trim() || isThinking}
          class="focus-ring px-4 py-2 rounded-full bg-brand text-white text-xs font-medium uppercase tracking-wider hover:bg-brand/90 transition-all cursor-pointer disabled:opacity-40"
        >
          Envoyer
        </button>
      </form>
    </div>

    <!-- Center Column: Code Editor (4 cols) -->
    <div class="hidden lg:flex lg:col-span-4 border-r border-black/10 bg-card flex-col h-full overflow-hidden">
      <!-- File Tabs -->
      <div class="h-10 border-b border-black/10 bg-surface/60 flex items-center justify-between px-2 text-xs font-mono">
        <div class="flex items-center gap-1">
          <button
            onclick={() => activeFile = "src/routes/+page.svelte"}
            class="px-3 py-1.5 rounded-t border-b-2 font-medium transition-all {activeFile === 'src/routes/+page.svelte' ? 'border-brand text-brand bg-card font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}"
          >
            +page.svelte
          </button>
          <button
            onclick={() => activeFile = "src/lib/server/db.ts"}
            class="px-3 py-1.5 rounded-t border-b-2 font-medium transition-all {activeFile === 'src/lib/server/db.ts' ? 'border-brand text-brand bg-card font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}"
          >
            db.ts
          </button>
          <button
            onclick={() => activeFile = "package.json"}
            class="px-3 py-1.5 rounded-t border-b-2 font-medium transition-all {activeFile === 'package.json' ? 'border-brand text-brand bg-card font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}"
          >
            package.json
          </button>
        </div>

        <button
          onclick={handleSaveCode}
          class="px-3 py-1 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-[11px] text-foreground uppercase tracking-wider transition-all cursor-pointer"
        >
          {editorSaved ? "✓ Sauvegardé" : "Sauvegarder"}
        </button>
      </div>

      <!-- Code Area -->
      <div class="flex-1 p-4 font-mono text-xs overflow-auto bg-surface/20">
        <textarea
          bind:value={codeContent}
          class="w-full h-full bg-transparent text-foreground outline-none resize-none font-mono text-xs leading-relaxed"
          spellcheck="false"
        ></textarea>
      </div>
    </div>

    <!-- Right Column: Live Preview (4 cols) -->
    <div class="lg:col-span-4 bg-surface/30 flex flex-col h-full overflow-hidden">
      <!-- Preview Toolbar -->
      <div class="h-10 border-b border-black/10 bg-surface/60 flex items-center justify-between px-3 text-xs font-mono">
        <div class="flex items-center gap-1.5">
          <button
            onclick={() => viewportMode = "desktop"}
            class="px-2 py-1 rounded {viewportMode === 'desktop' ? 'bg-black/10 text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}"
            title="Bureau"
          >
            🖥
          </button>
          <button
            onclick={() => viewportMode = "tablet"}
            class="px-2 py-1 rounded {viewportMode === 'tablet' ? 'bg-black/10 text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}"
            title="Tablette"
          >
            📱
          </button>
          <button
            onclick={() => viewportMode = "mobile"}
            class="px-2 py-1 rounded {viewportMode === 'mobile' ? 'bg-black/10 text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}"
            title="Mobile"
          >
            📲
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            onclick={() => previewKey++}
            class="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Rafraîchir l'aperçu"
          >
            ↻
          </button>
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener"
            class="text-[11px] text-brand hover:underline font-mono inline-flex items-center gap-1"
          >
            Ouvrir ↗
          </a>
        </div>
      </div>

      <!-- Iframe Container -->
      <div class="flex-1 flex items-center justify-center p-3 overflow-hidden bg-black/5">
        <div
          class="h-full bg-card rounded-xl shadow-retro border border-black/10 overflow-hidden transition-all duration-300"
          style="width: {viewportMode === 'mobile' ? '375px' : viewportMode === 'tablet' ? '640px' : '100%'};"
        >
          {#key previewKey}
            <iframe
              src={liveUrl}
              title="Aperçu en direct de {projectSlug}"
              class="w-full h-full border-0 bg-background"
            ></iframe>
          {/key}
        </div>
      </div>
    </div>
  </div>
</div>
