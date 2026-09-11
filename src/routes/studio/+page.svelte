<script lang="ts">
  import { onMount } from "svelte";
  import BrandMark from "$lib/components/brand-mark.svelte";
  import type { PageData } from "./$types";

  // CodeMirror imports
  import { EditorView, basicSetup } from "codemirror";
  import { html } from "@codemirror/lang-html";
  import { javascript } from "@codemirror/lang-javascript";
  import { EditorState, Compartment } from "@codemirror/state";
  import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

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
      content: `Bonjour ! Je suis l'agent IA Ether Studio. Votre site **${tenant.brand_name || projectSlug}** tourne sur Kubernetes avec SvelteKit 5 Runes, Bun et une base de données SQLite isolée sur volume persistant.\n\nQue souhaitez-vous ajouter ou modifier sur votre site ?`,
      profile: "primary",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  let promptInput = $state("");
  let isThinking = $state(false);
  let activeProfile = $state<"primary" | "secondary">("primary");
  let publishLoading = $state(false);
  let publishStatus = $state<string | null>(null);

  // Dockable & Resizable Panels State
  let showChat = $state(true);
  let showEditor = $state(true);
  let showPreview = $state(true);
  let previousPanelState = $state({ chat: true, editor: true });

  let chatWidth = $state(360);
  let editorWidth = $state(480);
  let isResizing = $state(false);

  function togglePanel(panel: "chat" | "editor" | "preview") {
    if (panel === "chat") {
      if (showChat && !showEditor && !showPreview) return;
      showChat = !showChat;
    } else if (panel === "editor") {
      if (showEditor && !showChat && !showPreview) return;
      showEditor = !showEditor;
    } else if (panel === "preview") {
      if (showPreview && !showChat && !showEditor) return;
      showPreview = !showPreview;
    }
  }

  function togglePreviewFullscreen() {
    if (showChat || showEditor) {
      previousPanelState = { chat: showChat, editor: showEditor };
      showChat = false;
      showEditor = false;
      showPreview = true;
    } else {
      showChat = previousPanelState.chat;
      showEditor = previousPanelState.editor;
      showPreview = true;
    }
  }

  function startResizeChat(e: MouseEvent) {
    e.preventDefault();
    isResizing = true;
    const startX = e.clientX;
    const startWidth = chatWidth;

    function onMouseMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX;
      const maxChat = Math.max(260, window.innerWidth - 450);
      chatWidth = Math.max(260, Math.min(maxChat, startWidth + delta));
    }

    function onMouseUp() {
      isResizing = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function startResizeEditor(e: MouseEvent) {
    e.preventDefault();
    isResizing = true;
    const startX = e.clientX;
    const startWidth = editorWidth;

    function onMouseMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX;
      const chatOffset = showChat ? chatWidth : 0;
      const maxEditor = Math.max(280, window.innerWidth - chatOffset - 320);
      editorWidth = Math.max(280, Math.min(maxEditor, startWidth + delta));
    }

    function onMouseUp() {
      isResizing = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  // Multi-file Code Editor State
  type SupportedLang = "html" | "typescript" | "json";
  interface FileItem {
    name: string;
    path: string;
    lang: SupportedLang;
    content: string;
  }

  let files = $state<Record<string, FileItem>>({
    "src/routes/+page.svelte": {
      name: "+page.svelte",
      path: "src/routes/+page.svelte",
      lang: "html",
      content: data.defaultCode || "",
    },
    "src/lib/server/db.ts": {
      name: "db.ts",
      path: "src/lib/server/db.ts",
      lang: "typescript",
      content: `import { Database } from "bun:sqlite";

// Base de données persistante SQLite pour ${tenant.brand_name || projectSlug}
const db = new Database(process.env.DB_PATH || "data.sqlite");

// Schéma des tables
db.run(\`
  CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    path TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
\`);

export function getRecentVisitors() {
  return db.query("SELECT * FROM visitors ORDER BY timestamp DESC LIMIT 20").all();
}

export function logVisitor(ip: string, path: string, userAgent: string) {
  return db.query("INSERT INTO visitors (ip, path, user_agent) VALUES (?, ?, ?)").run(ip, path, userAgent);
}
`,
    },
    "package.json": {
      name: "package.json",
      path: "package.json",
      lang: "json",
      content: JSON.stringify(
        {
          name: projectSlug,
          version: "1.0.0",
          private: true,
          scripts: {
            dev: "bun --bun vite dev",
            build: "bun --bun vite build",
            preview: "vite preview",
          },
          dependencies: {
            "@sveltejs/kit": "^2.0.0",
            svelte: "^5.0.0",
            tailwindcss: "^3.4.3",
          },
        },
        null,
        2
      ),
    },
  });

  let activeFile = $state("src/routes/+page.svelte");
  let editorSaved = $state(false);
  let editorContainer = $state<HTMLDivElement | null>(null);
  let editorView = $state<EditorView | null>(null);
  const languageCompartment = new Compartment();

  function getLangExtension(lang: SupportedLang) {
    if (lang === "typescript") {
      return javascript({ typescript: true });
    } else if (lang === "json") {
      return javascript();
    }
    return html();
  }

  const retroEditorTheme = EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "12px",
      fontFamily: "'Space Grotesk', SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      backgroundColor: "transparent",
      color: "#1E1B39",
    },
    ".cm-content": {
      padding: "16px 0",
      caretColor: "#1E1B39",
      lineHeight: "1.6",
    },
    ".cm-cursor": {
      borderLeftColor: "#1E1B39",
      borderLeftWidth: "2px",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "#A8A29E",
      border: "none",
      paddingRight: "12px",
      userSelect: "none",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      paddingLeft: "12px",
      minWidth: "28px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(30, 27, 57, 0.06)",
      color: "#1E1B39",
      fontWeight: "bold",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(30, 27, 57, 0.03)",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "inherit",
    },
    "&.cm-focused": {
      outline: "none",
    },
  });

  onMount(() => {
    if (!editorContainer) return;

    const initialFile = files[activeFile];
    const state = EditorState.create({
      doc: initialFile.content,
      extensions: [
        basicSetup,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        retroEditorTheme,
        languageCompartment.of(getLangExtension(initialFile.lang)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            files[activeFile].content = update.state.doc.toString();
          }
        }),
      ],
    });

    editorView = new EditorView({
      state,
      parent: editorContainer,
    });

    return () => {
      editorView?.destroy();
    };
  });

  function switchFile(filePath: string) {
    if (filePath === activeFile) return;

    // Persist current file content before switching
    if (editorView) {
      files[activeFile].content = editorView.state.doc.toString();
    }

    activeFile = filePath;
    const target = files[filePath];

    if (editorView && target) {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: target.content },
        effects: languageCompartment.reconfigure(getLangExtension(target.lang)),
      });
    }
  }

  // Preview State (Desktop or Mobile only)
  let viewportMode = $state<"desktop" | "mobile">("desktop");
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
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          prompt: text,
          projectSlug,
          profile: activeProfile,
          stream: true,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && res.body) {
        // Real-time SSE streaming from runner
        const assistantMsgIndex = messages.length;
        messages.push({
          role: "assistant",
          content: "",
          profile: activeProfile,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            const dataMatch = trimmed.match(/data:\s*(.*)/);
            if (dataMatch) {
              try {
                const data = JSON.parse(dataMatch[1]);
                if (data.text) {
                  messages[assistantMsgIndex].content += data.text;
                }
                if (data.profileUsed) {
                  messages[assistantMsgIndex].profile = data.profileUsed;
                }
              } catch (e) {}
            }
          }
        }
        previewKey++;
      } else {
        // Fallback standard JSON
        const resData = await res.json();
        if (resData.success) {
          messages.push({
            role: "assistant",
            content: resData.response,
            profile: resData.profileUsed || activeProfile,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          });
          previewKey++;
        } else {
          messages.push({
            role: "assistant",
            content: `⚠️ Note : ${resData.error || "Impossible d'exécuter la commande."}`,
            profile: "secondary",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          });
        }
      }
    } catch (err: any) {
      messages.push({
        role: "assistant",
        content: `Erreur de connexion avec l'agent Studio : ${err.message}`,
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
    if (editorView) {
      files[activeFile].content = editorView.state.doc.toString();
    }
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

    <!-- Center: Panel Docking Controls & Status -->
    <div class="flex items-center gap-3">
      <div class="flex items-center rounded-full border border-black/10 bg-surface/90 p-0.5 text-xs font-mono shadow-retro-sm">
        <button
          onclick={() => togglePanel("chat")}
          class="px-3 py-1 rounded-full transition-all flex items-center gap-1.5 cursor-pointer {showChat ? 'bg-brand text-white font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
          title={showChat ? "Masquer le chat IA" : "Afficher le chat IA"}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span class="hidden sm:inline">Chat</span>
        </button>
        <button
          onclick={() => togglePanel("editor")}
          class="px-3 py-1 rounded-full transition-all flex items-center gap-1.5 cursor-pointer {showEditor ? 'bg-brand text-white font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
          title={showEditor ? "Masquer l'éditeur de code" : "Afficher l'éditeur de code"}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span class="hidden sm:inline">Code</span>
        </button>
        <button
          onclick={() => togglePanel("preview")}
          class="px-3 py-1 rounded-full transition-all flex items-center gap-1.5 cursor-pointer {showPreview ? 'bg-brand text-white font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
          title={showPreview ? "Masquer l'aperçu du site" : "Afficher l'aperçu du site"}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span class="hidden sm:inline">Aperçu</span>
        </button>
      </div>

      <div class="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-700 text-xs font-mono">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>K8s Live</span>
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

  <!-- Main Studio Workspace (Dockable 3 Panels) -->
  <div class="flex-1 flex flex-col lg:flex-row overflow-hidden relative {isResizing ? 'select-none cursor-col-resize' : ''}">
    <!-- Docked Left Strip: Reopen Chat -->
    {#if !showChat}
      <button
        onclick={() => showChat = true}
        class="hidden lg:flex w-9 h-full border-r border-black/10 bg-surface/60 hover:bg-surface flex-col items-center justify-start py-4 gap-3 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer group"
        title="Déplier le chat IA"
      >
        <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <span class="[writing-mode:vertical-lr] rotate-180 uppercase tracking-widest text-[10px] font-medium group-hover:text-brand transition-colors">Chat IA</span>
      </button>
    {/if}

    <!-- Left Panel: AI Prompt & Chat -->
    {#if showChat}
      <div
        class="border-r border-black/10 bg-surface/40 flex flex-col h-full overflow-hidden shrink-0 w-full lg:w-auto"
        style="width: {chatWidth}px;"
      >
        <div class="p-3 border-b border-black/10 bg-surface/80 flex items-center justify-between text-xs font-mono">
          <span class="font-semibold text-foreground uppercase tracking-widest flex items-center gap-2">
            <svg class="w-3.5 h-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Assistant Studio
          </span>
          <div class="flex items-center gap-1.5">
            <select
              bind:value={activeProfile}
              class="text-[10px] font-mono bg-surface border border-black/10 rounded px-2 py-0.5 text-foreground cursor-pointer outline-none hover:border-brand transition-colors"
              title="Sélectionner le profil Google actif"
            >
              <option value="primary">Google : Primary</option>
              <option value="secondary">Google : Secondary</option>
            </select>
            <button
              onclick={() => showChat = false}
              class="p-1 rounded hover:bg-black/5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Masquer le chat IA"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
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
              <span>L'agent modifie le code en direct...</span>
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
            onclick={() => { promptInput = "Crée un formulaire de contact avec sauvegarde dans SQLite"; }}
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
    {/if}

    <!-- Divider 1: Drag to resize Chat -->
    {#if showChat && (showEditor || showPreview)}
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        role="separator"
        tabindex="0"
        aria-label="Redimensionner le panneau de discussion"
        onmousedown={startResizeChat}
        class="hidden lg:flex w-2 -mx-1 relative z-20 cursor-col-resize items-center justify-center hover:bg-brand/15 active:bg-brand/30 transition-colors group select-none shrink-0"
      >
        <div class="w-[3px] h-10 rounded-full bg-black/15 group-hover:bg-brand transition-colors"></div>
      </div>
    {/if}

    <!-- Docked Middle Strip: Reopen Editor -->
    {#if !showEditor}
      <button
        onclick={() => showEditor = true}
        class="hidden lg:flex w-9 h-full border-r border-black/10 bg-surface/60 hover:bg-surface flex-col items-center justify-start py-4 gap-3 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer group"
        title="Déplier l'éditeur de code"
      >
        <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <span class="[writing-mode:vertical-lr] rotate-180 uppercase tracking-widest text-[10px] font-medium group-hover:text-brand transition-colors">Code</span>
      </button>
    {/if}

    <!-- Center Panel: Code Editor (Kept mounted for CodeMirror persistence) -->
    <div
      class="{showEditor ? 'flex' : 'hidden'} flex-col h-full overflow-hidden border-r border-black/10 bg-card {showPreview ? 'shrink-0' : 'flex-1 w-full min-w-0'}"
      style={showPreview ? `width: ${editorWidth}px; max-width: calc(100% - 320px); min-width: 280px;` : ''}
    >
      <!-- File Tabs -->
      <div class="h-10 border-b border-black/10 bg-surface/60 flex items-center justify-between px-2 text-xs font-mono shrink-0">
        <div class="flex items-center gap-1 overflow-x-auto">
          {#each Object.entries(files) as [path, file]}
            <button
              onclick={() => switchFile(path)}
              class="px-3 py-1.5 rounded-t border-b-2 font-medium transition-all {activeFile === path ? 'border-brand text-brand bg-card font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}"
            >
              {file.name}
            </button>
          {/each}
        </div>

        <div class="flex items-center gap-1.5">
          <button
            onclick={handleSaveCode}
            class="px-3 py-1 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-[11px] text-foreground uppercase tracking-wider transition-all cursor-pointer"
          >
            {editorSaved ? "✓ Sauvegardé" : "Sauvegarder"}
          </button>
          <button
            onclick={() => showEditor = false}
            class="p-1 rounded hover:bg-black/5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Masquer l'éditeur de code"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- CodeMirror Editor Container -->
      <div class="flex-1 overflow-hidden bg-surface/20" bind:this={editorContainer}></div>
    </div>

    <!-- Divider 2: Drag to resize Editor & Preview -->
    {#if showEditor && showPreview}
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        role="separator"
        tabindex="0"
        aria-label="Redimensionner l'éditeur et l'aperçu"
        onmousedown={startResizeEditor}
        class="hidden lg:flex w-2 -mx-1 relative z-20 cursor-col-resize items-center justify-center hover:bg-brand/15 active:bg-brand/30 transition-colors group select-none shrink-0"
      >
        <div class="w-[3px] h-10 rounded-full bg-black/15 group-hover:bg-brand transition-colors"></div>
      </div>
    {/if}

    <!-- Docked Right Strip: Reopen Preview -->
    {#if !showPreview}
      <button
        onclick={() => showPreview = true}
        class="hidden lg:flex w-9 h-full border-l border-black/10 bg-surface/60 hover:bg-surface flex-col items-center justify-start py-4 gap-3 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer group"
        title="Déplier l'aperçu"
      >
        <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span class="[writing-mode:vertical-lr] rotate-180 uppercase tracking-widest text-[10px] font-medium group-hover:text-brand transition-colors">Aperçu</span>
      </button>
    {/if}

    <!-- Right Panel: Live Preview (Kept mounted for iframe persistence) -->
    <div
      class="{showPreview ? 'flex' : 'hidden'} flex-col h-full overflow-hidden bg-surface/30 flex-1 w-full min-w-0"
    >
      <!-- Preview Toolbar -->
      <div class="h-10 border-b border-black/10 bg-surface/60 flex items-center justify-between px-3 text-xs font-mono shrink-0">
        <!-- Viewport Switcher: ONLY Desktop or Mobile -->
        <div class="flex items-center gap-1 bg-surface/80 p-0.5 rounded-lg border border-black/10">
          <button
            onclick={() => viewportMode = "desktop"}
            class="px-2.5 py-1 rounded flex items-center gap-1.5 transition-all cursor-pointer {viewportMode === 'desktop' ? 'bg-brand text-white font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
            title="Vue Bureau"
          >
            <span>🖥</span>
            <span class="text-[11px]">Bureau</span>
          </button>
          <button
            onclick={() => viewportMode = "mobile"}
            class="px-2.5 py-1 rounded flex items-center gap-1.5 transition-all cursor-pointer {viewportMode === 'mobile' ? 'bg-brand text-white font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
            title="Vue Mobile"
          >
            <span>📱</span>
            <span class="text-[11px]">Mobile</span>
          </button>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2">
          <!-- Fullscreen / Expand preview toggle -->
          <button
            onclick={togglePreviewFullscreen}
            class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors cursor-pointer"
            title={!showChat && !showEditor ? "Restaurer les volets" : "Agrandir l'aperçu"}
          >
            {#if !showChat && !showEditor}
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9L4 4m0 0l5 0M4 4l0 5m11-5l5 0m0 0l0 5m0-5l-5 5m5 11l-5 0m5 0l0-5m0 5l-5-5M4 20l5 0m-5 0l0-5m0 5l5-5" />
              </svg>
            {:else}
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            {/if}
          </button>

          <button
            onclick={() => previewKey++}
            class="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-black/5 cursor-pointer"
            title="Rafraîchir l'aperçu"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <a
            href={liveUrl}
            target="_blank"
            rel="noopener"
            class="text-[11px] text-brand hover:underline font-mono inline-flex items-center gap-1"
          >
            Ouvrir ↗
          </a>

          <button
            onclick={() => showPreview = false}
            class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors cursor-pointer"
            title="Masquer l'aperçu"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Iframe Container -->
      <div class="flex-1 flex items-center justify-center p-3 overflow-hidden bg-black/5 w-full h-full min-w-0">
        {#if viewportMode === 'desktop'}
          <div class="w-full h-full bg-card rounded-xl shadow-retro border border-black/10 overflow-hidden flex flex-col">
            {#key previewKey}
              <iframe
                src={liveUrl}
                title="Aperçu en direct de {projectSlug}"
                class="w-full h-full border-0 bg-background {isResizing ? 'pointer-events-none' : ''}"
              ></iframe>
            {/key}
          </div>
        {:else}
          <div
            class="h-full max-h-[760px] w-[375px] max-w-full bg-card rounded-3xl shadow-retro border-4 border-black/20 overflow-hidden flex flex-col transition-all duration-300 relative"
          >
            <!-- Mobile Phone Speaker Indicator -->
            <div class="h-4 bg-surface flex items-center justify-center border-b border-black/10 shrink-0">
              <div class="w-12 h-1 bg-black/20 rounded-full"></div>
            </div>
            {#key previewKey}
              <iframe
                src={liveUrl}
                title="Aperçu mobile de {projectSlug}"
                class="w-full flex-1 border-0 bg-background {isResizing ? 'pointer-events-none' : ''}"
              ></iframe>
            {/key}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
