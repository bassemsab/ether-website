<script lang="ts">
  import { onMount } from "svelte";
  import BrandMark from "$lib/components/brand-mark.svelte";
  import type { PageData } from "./$types";
  import { marked } from "marked";

  // CodeMirror imports
  import { EditorView, basicSetup } from "codemirror";
  import { keymap } from "@codemirror/view";
  import { html } from "@codemirror/lang-html";
  import { javascript } from "@codemirror/lang-javascript";
  import { EditorState, Compartment } from "@codemirror/state";
  import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

  function isFilePath(str: string): boolean {
    if (!str || typeof str !== "string") return false;
    const clean = str.trim().replace(/^[📄\s`"']+|[`"']+$/g, "").replace(/^file:\/\//, "");
    if (clean.includes("\n") || clean.length > 100) return false;
    return (
      /\.(svelte|ts|js|mjs|json|html|css|md|yaml|yml|sql)$/i.test(clean) ||
      clean.startsWith("src/") ||
      clean.startsWith("/src/") ||
      clean.startsWith("+") ||
      (clean.includes("/") && /\.[a-z0-9]+$/i.test(clean))
    );
  }

  const customRenderer = new marked.Renderer();
  customRenderer.link = ({ href, text }) => {
    const isFile = isFilePath(href) || isFilePath(text);
    if (isFile) {
      const rawPath = isFilePath(href) ? href : text;
      const path = rawPath.replace(/^[📄\s`"']+|[`"']+$/g, "").replace(/^file:\/\//, "");
      const displayText = (text || path).replace(/^[📄\s`"']+|[`"']+$/g, "").replace(/^file:\/\//, "");
      return `<button type="button" data-studio-file="${path}" class="studio-file-link inline-flex items-center gap-1 font-mono text-[11px] bg-brand/10 hover:bg-brand/20 text-brand px-2 py-0.5 rounded-md border border-brand/20 font-medium transition-all shadow-sm my-0.5 cursor-pointer align-baseline" title="Ouvrir ${path} dans l'éditeur">📄 <span>${displayText}</span></button>`;
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-brand hover:underline font-medium">${text}</a>`;
  };

  customRenderer.codespan = ({ text }) => {
    if (isFilePath(text)) {
      const path = text.replace(/^[📄\s`"']+|[`"']+$/g, "").replace(/^file:\/\//, "");
      return `<button type="button" data-studio-file="${path}" class="studio-file-link inline-flex items-center gap-1 font-mono text-[11px] bg-brand/10 hover:bg-brand/20 text-brand px-2 py-0.5 rounded-md border border-brand/20 font-medium transition-all shadow-sm my-0.5 cursor-pointer align-baseline" title="Ouvrir ${path} dans l'éditeur">📄 <span>${path}</span></button>`;
    }
    return `<code class="text-foreground bg-black/5 px-1 py-0.5 rounded font-mono text-[11px]">${text}</code>`;
  };

  marked.use({
    breaks: true,
    gfm: true,
    renderer: customRenderer,
  });

  function renderMarkdown(content: string): string {
    if (!content) return "";
    try {
      // Normalize occurrences like `📄 [path](...)` or `📄 \npath` or `📄 `path`` or `📄 src/...`
      const preprocessed = content.replace(
        /📄\s*(?:\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|([a-zA-Z0-9_./+-]+\.(?:svelte|ts|js|json|html|css)|src\/[a-zA-Z0-9_./+-]+))/g,
        (match, linkText, linkHref, codeText, plainPath) => {
          const raw = linkHref || linkText || codeText || plainPath || "";
          const filePath = raw.replace(/^[📄\s`"']+|[`"']+$/g, "").replace(/^file:\/\//, "").trim();
          const displayText = (linkText || codeText || plainPath || filePath).replace(/^[📄\s`"']+|[`"']+$/g, "").replace(/^file:\/\//, "").trim();
          if (isFilePath(filePath)) {
            return `<button type="button" data-studio-file="${filePath}" class="studio-file-link inline-flex items-center gap-1 font-mono text-[11px] bg-brand/10 hover:bg-brand/20 text-brand px-2 py-0.5 rounded-md border border-brand/20 font-medium transition-all shadow-sm my-0.5 cursor-pointer align-baseline" title="Ouvrir ${filePath} dans l'éditeur">📄 <span>${displayText}</span></button>`;
          }
          return match;
        }
      );
      return marked.parse(preprocessed) as string;
    } catch {
      return content;
    }
  }

  interface Props {
    data: PageData;
  }

  interface ChatStep {
    id: number | string;
    name: string;
    state: "running" | "completed";
  }

  interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    profile: string;
    time: string;
    steps?: ChatStep[];
  }

  let { data }: Props = $props();

  const tenant = $derived(data.tenant);
  const projectSlug = $derived(data.projectSlug || "tester");
  const liveUrl = $derived(
    tenant.custom_domain
      ? `https://${tenant.custom_domain}`
      : `https://${projectSlug}.ether.paris`
  );
  const previewUrl = $derived(
    typeof window !== "undefined" && window.location.hostname.includes("localhost")
      ? `/api/studio/preview/${projectSlug}/`
      : `https://preview-${projectSlug}.ether.paris`
  );

  const isAdmin = $derived(Boolean(data.isAdmin));

  // Chat State
  const availableProfiles = $derived(
    data.availableProfiles || [
      { name: "primary", label: "Agent 1" },
      { name: "secondary", label: "Agent 2" },
    ]
  );

  function getProfileLabel(profileName?: string): string {
    if (!profileName || profileName === "auto") return "Auto";
    const found = availableProfiles.find((p) => p.name === profileName);
    if (found?.label) return found.label;
    if (profileName === "primary") return "Agent 1";
    if (profileName === "secondary") return "Agent 2";
    if (profileName.startsWith("profile-")) {
      return `Agent ${profileName.replace("profile-", "")}`;
    }
    return `Agent ${profileName}`;
  }

  // Profile Custom Dropdown State
  let profileMenuOpen = $state(false);
  let profileMenuContainer = $state<HTMLDivElement | null>(null);

  function handleWindowClick(event: MouseEvent) {
    if (profileMenuOpen && profileMenuContainer && !profileMenuContainer.contains(event.target as Node)) {
      profileMenuOpen = false;
    }
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && profileMenuOpen) {
      profileMenuOpen = false;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      handleSaveCode();
    }
  }

  let conversationId = $state<string | null>(data.lastConversationId || null);

  let messages = $state<ChatMessage[]>(
    data.chatHistory && data.chatHistory.length > 0
      ? (data.chatHistory as ChatMessage[])
      : [
          {
            role: "assistant",
            content: `Bonjour ! Je suis votre assistant Ether Studio pour **${tenant.brand_name || projectSlug}**.\n\nDites-moi simplement ce que vous souhaitez ajouter ou modifier sur votre site et je m'en occupe !`,
            profile: "primary",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]
  );

  async function handleClearChat() {
    if (confirm("Voulez-vous vraiment réinitialiser la conversation ?")) {
      try {
        await fetch("/api/studio/chat/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectSlug }),
        });
      } catch {}
      conversationId = null;
      messages = [
        {
          role: "assistant",
          content: `Bonjour ! Je suis votre assistant Ether Studio pour **${tenant.brand_name || projectSlug}**.\n\nDites-moi simplement ce que vous souhaitez ajouter ou modifier sur votre site et je m'en occupe !`,
          profile: "primary",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ];
    }
  }

  let promptInput = $state("");
  let isThinking = $state(false);
  let activeProfile = $state<string>("auto");
  let promptQuota = $state(
    data.promptQuota || { allowed: true, current: 0, limit: 25, remaining: 25, plan: "demo" }
  );
  let publishLoading = $state(false);
  let publishStatus = $state<string | null>(null);

  // Chat scroll container
  let chatContainer = $state<HTMLDivElement | null>(null);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    if (chatContainer) {
      requestAnimationFrame(() => {
        chatContainer?.scrollTo({
          top: chatContainer.scrollHeight,
          behavior,
        });
      });
    }
  }

  $effect(() => {
    // Keep chat scrolled to bottom when new messages arrive or while thinking
    if (messages.length || isThinking) {
      scrollToBottom();
    }
  });

  // Dockable & Resizable Panels State
  let showChat = $state(true);
  let showEditor = $state(true);
  let showPreview = $state(true);
  let previousPanelState = $state({ chat: true, editor: true });

  let chatWidth = $state(360);
  let editorWidth = $state(580);
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

  let files = $state<Record<string, FileItem>>(
    data.initialFiles && Object.keys(data.initialFiles).length > 0
      ? (data.initialFiles as Record<string, FileItem>)
      : {
          "src/routes/+page.svelte": {
            name: "+page.svelte",
            path: "src/routes/+page.svelte",
            lang: "html",
            content: data.defaultCode || "",
          },
        }
  );

  interface TreeNode {
    name: string;
    path: string;
    isFolder: boolean;
    children: TreeNode[];
    file?: FileItem;
    depth: number;
  }

  function buildFileTree(fileMap: Record<string, FileItem>, searchQuery: string): TreeNode[] {
    const root: Record<string, any> = {};
    const q = searchQuery.trim().toLowerCase();

    for (const [filePath, file] of Object.entries(fileMap)) {
      if (q && !filePath.toLowerCase().includes(q) && !file.name.toLowerCase().includes(q)) {
        continue;
      }

      const parts = filePath.split("/").filter(Boolean);
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join("/");

        if (!current[part]) {
          current[part] = {
            name: part,
            path: currentPath,
            isFolder: !isFile,
            children: {},
            file: isFile ? file : undefined,
          };
        }
        current = current[part].children;
      }
    }

    function toSortedArray(obj: Record<string, any>, depth = 0): TreeNode[] {
      const items: TreeNode[] = Object.values(obj).map((node) => ({
        name: node.name,
        path: node.path,
        isFolder: node.isFolder,
        depth,
        children: toSortedArray(node.children, depth + 1),
        file: node.file,
      }));

      return items.sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });
    }

    return toSortedArray(root, 0);
  }

  let activeFile = $state(
    Object.keys(files)[0] || "src/routes/+page.svelte"
  );
  let openTabs = $state<string[]>([
    Object.keys(files)[0] || "src/routes/+page.svelte"
  ]);
  let collapsedFolders = $state<Record<string, boolean>>({});
  let showExplorer = $state(true);
  let fileSearchQuery = $state("");
  let saveToast = $state<string | null>(null);

  const fileTree = $derived(buildFileTree(files, fileSearchQuery));

  function toggleFolder(folderPath: string) {
    collapsedFolders[folderPath] = !collapsedFolders[folderPath];
  }

  function selectAndOpenFile(filePath: string) {
    if (!openTabs.includes(filePath)) {
      openTabs = [...openTabs, filePath];
    }
    switchFile(filePath);
  }

  function closeTab(e: MouseEvent, filePath: string) {
    e.stopPropagation();
    const remaining = openTabs.filter((p) => p !== filePath);
    if (remaining.length === 0) {
      const allKeys = Object.keys(files);
      const fallback = allKeys.find((k) => k !== filePath) || allKeys[0];
      if (fallback) {
        openTabs = [fallback];
        switchFile(fallback);
      }
      return;
    }
    openTabs = remaining;
    if (activeFile === filePath) {
      const next = remaining[remaining.length - 1];
      switchFile(next);
    }
  }

  const filteredFiles = $derived(
    Object.entries(files).filter(([path, file]) => {
      if (!fileSearchQuery.trim()) return true;
      const q = fileSearchQuery.trim().toLowerCase();
      return path.toLowerCase().includes(q) || file.name.toLowerCase().includes(q);
    })
  );

  let editorSaved = $state(false);
  let editorContainer = $state<HTMLDivElement | null>(null);
  let editorView = $state<EditorView | null>(null);
  const languageCompartment = new Compartment();

  async function loadTenantFiles() {
    try {
      const res = await fetch(`/api/studio/files?project=${projectSlug}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.files) {
          files = json.files;
          if (!files[activeFile]) {
            activeFile = Object.keys(files)[0] || "src/routes/+page.svelte";
          }
          if (editorView && files[activeFile]) {
            const currentDoc = editorView.state.doc.toString();
            const newDoc = files[activeFile].content;
            if (currentDoc !== newDoc) {
              editorView.dispatch({
                changes: { from: 0, to: currentDoc.length, insert: newDoc },
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load tenant files:", err);
    }
  }

  async function openFileFromPath(targetPath: string) {
    if (!targetPath) return;

    let cleanPath = targetPath
      .trim()
      .replace(/^[`"']+|[`"']+$/g, "")
      .replace(/^[📄\s]+/, "")
      .replace(/^file:\/\//, "")
      .replace(/^[./\\]+/, "")
      .replace(/^https?:\/\/[^/]+\//, "")
      .replace(/\?.*$/, "");

    // 1. Direct match
    let matchedKey = Object.keys(files).find(
      (k) => k === cleanPath || k.toLowerCase() === cleanPath.toLowerCase(),
    );

    // 2. Suffix match
    if (!matchedKey) {
      matchedKey = Object.keys(files).find(
        (k) => k.endsWith(cleanPath) || cleanPath.endsWith(k),
      );
    }

    // 3. Basename match
    if (!matchedKey) {
      const baseName = cleanPath.split("/").pop()?.toLowerCase();
      if (baseName) {
        matchedKey = Object.keys(files).find(
          (k) => k.split("/").pop()?.toLowerCase() === baseName,
        );
      }
    }

    // 4. Try refreshing from server if newly created
    if (!matchedKey) {
      await loadTenantFiles();
      matchedKey = Object.keys(files).find(
        (k) =>
          k === cleanPath ||
          k.toLowerCase() === cleanPath.toLowerCase() ||
          k.endsWith(cleanPath) ||
          cleanPath.endsWith(k),
      );
      if (!matchedKey) {
        const baseName = cleanPath.split("/").pop()?.toLowerCase();
        if (baseName) {
          matchedKey = Object.keys(files).find(
            (k) => k.split("/").pop()?.toLowerCase() === baseName,
          );
        }
      }
    }

    if (matchedKey) {
      showEditor = true;
      if (typeof window !== "undefined" && window.innerWidth < 900) {
        showChat = false;
      }
      selectAndOpenFile(matchedKey);
      if (editorView) {
        editorView.focus();
      }
    } else {
      console.warn("Fichier non trouvé dans le projet:", targetPath);
    }
  }

  function handleChatContainerClick(e: MouseEvent) {
    const target = (e.target as HTMLElement)?.closest(
      "[data-studio-file], a, code",
    ) as HTMLElement | null;
    if (!target) return;

    const fileAttr = target.getAttribute("data-studio-file");
    if (fileAttr) {
      e.preventDefault();
      e.stopPropagation();
      openFileFromPath(fileAttr);
      return;
    }

    if (target.tagName.toLowerCase() === "a") {
      const href = target.getAttribute("href") || "";
      const text = target.textContent?.trim() || "";
      if (isFilePath(href)) {
        e.preventDefault();
        e.stopPropagation();
        openFileFromPath(href);
      } else if (isFilePath(text)) {
        e.preventDefault();
        e.stopPropagation();
        openFileFromPath(text);
      }
    } else if (target.tagName.toLowerCase() === "code") {
      const text = target.textContent?.trim() || "";
      if (isFilePath(text)) {
        e.preventDefault();
        e.stopPropagation();
        openFileFromPath(text);
      }
    }
  }

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
      backgroundColor: "hsl(var(--card))",
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
      backgroundColor: "#F2EFE8",
      color: "#99938B",
      borderRight: "1px solid rgba(30, 27, 57, 0.12)",
      borderLeft: "none",
      borderTop: "none",
      borderBottom: "none",
      paddingRight: "6px",
      userSelect: "none",
      zIndex: "5",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      paddingLeft: "10px",
      paddingRight: "8px",
      minWidth: "32px",
      textAlign: "right",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(30, 27, 57, 0.08)",
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
    if (typeof window !== "undefined" && data.sessionToken) {
      try {
        localStorage.setItem("ether_session_token", data.sessionToken);
      } catch {}
    }

    if (!editorContainer) return;

    const initialFile = files[activeFile] || { content: "", lang: "html" as SupportedLang };
    const state = EditorState.create({
      doc: initialFile.content,
      extensions: [
        basicSetup,
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              handleSaveCode();
              return true;
            },
          },
          {
            key: "Ctrl-s",
            preventDefault: true,
            run: () => {
              handleSaveCode();
              return true;
            },
          },
        ]),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        retroEditorTheme,
        languageCompartment.of(getLangExtension(initialFile.lang)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && files[activeFile]) {
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
    if (filePath === activeFile) {
      if (editorView) {
        editorView.focus();
      }
      return;
    }

    // Persist current file content before switching
    if (editorView && files[activeFile]) {
      files[activeFile].content = editorView.state.doc.toString();
    }

    activeFile = filePath;
    const target = files[filePath];

    if (editorView && target) {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: target.content },
        effects: languageCompartment.reconfigure(getLangExtension(target.lang)),
      });
      editorView.focus();
    }
  }

  // Preview State (Desktop or Mobile only)
  let viewportMode = $state<"desktop" | "mobile">("desktop");
  let previewIframe = $state<HTMLIFrameElement | null>(null);

  function refreshPreview() {
    if (previewIframe) {
      try {
        previewIframe.contentWindow?.location.reload();
      } catch {
        previewIframe.src = previewUrl;
      }
    }
  }

  async function handleSendPrompt(e?: Event) {
    if (e) e.preventDefault();
    const text = promptInput.trim();
    if (!text || isThinking) return;

    if (promptQuota.remaining <= 0) {
      messages.push({
        role: "assistant",
        content: `⚠️ Quota quotidien atteint (${promptQuota.limit} prompts/jour pour l'offre ${promptQuota.plan}). Réinitialisation automatique à minuit.`,
        profile: "secondary",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      return;
    }

    // Optimistically update quota
    promptQuota.current++;
    promptQuota.remaining = Math.max(0, promptQuota.remaining - 1);
    if (promptQuota.remaining <= 0) {
      promptQuota.allowed = false;
    }

    promptInput = "";
    messages.push({
      role: "user",
      content: text,
      profile: activeProfile,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });

    const assistantMsgIndex = messages.length;
    messages.push({
      role: "assistant",
      content: "",
      profile: activeProfile,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      steps: [],
    });

    isThinking = true;
    scrollToBottom();

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
          conversationId,
          stream: true,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && res.body) {
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
            // Ignore keepalive comments
            if (trimmed.startsWith(":")) continue;

            const dataMatch = trimmed.match(/data:\s*(.*)/);
            if (dataMatch) {
              try {
                const data = JSON.parse(dataMatch[1]);
                if (data.quotaExceeded) {
                  promptQuota.remaining = 0;
                  promptQuota.allowed = false;
                }
                if (data.conversationId) {
                  conversationId = data.conversationId;
                }
                if (data.error) {
                  messages[assistantMsgIndex].content += `\n⚠️ Erreur: ${data.error}\n`;
                  scrollToBottom("auto");
                }
                if (data.text) {
                  messages[assistantMsgIndex].content += data.text;
                  scrollToBottom("auto");
                }
                if (data.profileUsed) {
                  messages[assistantMsgIndex].profile = data.profileUsed;
                }
                // Handle live thinking / tool execution steps
                if (data.id !== undefined && data.name) {
                  if (!messages[assistantMsgIndex].steps) {
                    messages[assistantMsgIndex].steps = [];
                  }
                  const existing = messages[assistantMsgIndex].steps.find((s) => s.id === data.id);
                  if (existing) {
                    existing.state = data.state;
                  } else {
                    messages[assistantMsgIndex].steps.push({
                      id: data.id,
                      name: data.name,
                      state: data.state || "running",
                    });
                  }
                  scrollToBottom("auto");
                } else if (data.id !== undefined && data.state === "completed") {
                  const existing = messages[assistantMsgIndex].steps?.find((s) => s.id === data.id);
                  if (existing) {
                    existing.state = "completed";
                  }
                  scrollToBottom("auto");
                }
              } catch (e) {}
            }
          }
        }
        scrollToBottom();
      } else {
        // Fallback standard JSON
        const resData = await res.json();
        if (resData.quotaRemaining !== undefined) {
          promptQuota.remaining = resData.quotaRemaining;
        }
        if (resData.conversationId) {
          conversationId = resData.conversationId;
        }
        if (!resData.success && resData.quotaExceeded) {
          promptQuota.remaining = 0;
          promptQuota.allowed = false;
        }

        if (resData.success) {
          messages.push({
            role: "assistant",
            content: resData.response,
            profile: resData.profileUsed || activeProfile,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          });
        } else {
          messages.push({
            role: "assistant",
            content: `⚠️ Note : ${resData.error || "Impossible d'exécuter la commande."}`,
            profile: resData.profileUsed || activeProfile,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          });
        }
      }
    } catch (err: any) {
      if (assistantMsgIndex !== undefined && messages[assistantMsgIndex]) {
        messages[assistantMsgIndex].content += `\n⚠️ Erreur de connexion avec l'agent : ${err.message}`;
      } else {
        messages.push({
          role: "assistant",
          content: `Erreur de connexion avec l'agent : ${err.message}`,
          profile: activeProfile,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
      }
    } finally {
      isThinking = false;
      await loadTenantFiles();
      refreshPreview();
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
        refreshPreview();
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

  async function handleSaveCode() {
    if (editorView && files[activeFile]) {
      files[activeFile].content = editorView.state.doc.toString();
    }

    try {
      const res = await fetch("/api/studio/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug,
          path: activeFile,
          content: files[activeFile]?.content || "",
        }),
      });

      if (res.ok) {
        editorSaved = true;
        refreshPreview();
        setTimeout(() => {
          editorSaved = false;
        }, 2500);
      }
    } catch (err) {
      console.error("Save code error:", err);
    }
  }
</script>

<svelte:head>
  <title>Ether Studio · {tenant.brand_name || projectSlug}</title>
</svelte:head>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

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

    <!-- Center: Panel Docking Controls -->
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-[2px] rounded-full border border-black/10 bg-surface/90 p-[2px] text-xs font-mono shadow-retro-sm">
        <button
          onclick={() => togglePanel("chat")}
          class="px-2 py-0.5 rounded-full transition-all flex items-center gap-1 cursor-pointer {showChat ? 'bg-brand text-white font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
          title={showChat ? "Masquer le chat IA" : "Afficher le chat IA"}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span class="hidden sm:inline">Chat</span>
        </button>
        <button
          onclick={() => togglePanel("editor")}
          class="px-2 py-0.5 rounded-full transition-all flex items-center gap-1 cursor-pointer {showEditor ? 'bg-brand text-white font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
          title={showEditor ? "Masquer l'éditeur de code" : "Afficher l'éditeur de code"}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span class="hidden sm:inline">Code</span>
        </button>
        <button
          onclick={() => togglePanel("preview")}
          class="px-2 py-0.5 rounded-full transition-all flex items-center gap-1 cursor-pointer {showPreview ? 'bg-brand text-white font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
          title={showPreview ? "Masquer l'aperçu du site" : "Afficher l'aperçu du site"}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span class="hidden sm:inline">Aperçu</span>
        </button>
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
            <!-- New Chat / Reset Conversation Button -->
            <button
              type="button"
              onclick={handleClearChat}
              class="text-[11px] font-mono bg-card hover:bg-surface border border-black/10 hover:border-black/20 rounded-md px-2 py-1 text-muted-foreground hover:text-foreground cursor-pointer outline-none transition-all flex items-center gap-1 shadow-retro-sm"
              title="Nouvelle conversation (réinitialise le contexte de discussion)"
            >
              <svg class="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              <span class="hidden xl:inline">Nouveau</span>
            </button>

            <!-- Custom Styled Agent Dropdown Menu -->
            <div bind:this={profileMenuContainer} class="relative">
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  profileMenuOpen = !profileMenuOpen;
                }}
                class="text-[11px] font-mono bg-card hover:bg-surface border border-black/10 hover:border-black/20 rounded-md px-2.5 py-1 text-foreground cursor-pointer outline-none transition-all flex items-center gap-1.5 shadow-retro-sm"
                title="Sélectionner l'agent actif"
                aria-expanded={profileMenuOpen}
                aria-haspopup="listbox"
              >
                {#if activeProfile === 'auto'}
                  <span class="text-amber-500 font-medium">⚡</span>
                  <span class="font-medium">Auto</span>
                {:else}
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span class="font-medium">{getProfileLabel(activeProfile)}</span>
                {/if}
                <svg
                  class="w-3 h-3 text-muted-foreground transition-transform duration-200 {profileMenuOpen ? 'rotate-180' : ''}"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {#if profileMenuOpen}
                <div
                  class="absolute right-0 top-full mt-1.5 w-44 bg-card border border-black/10 rounded-2xl shadow-retro p-1.5 text-xs font-mono z-50 divide-y divide-black/5"
                  role="listbox"
                >
                  <div class="p-0.5">
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeProfile === 'auto'}
                      onclick={() => {
                        activeProfile = 'auto';
                        profileMenuOpen = false;
                      }}
                      class="w-full flex items-center justify-between px-3 py-1.5 rounded-full hover:bg-black/5 transition-colors cursor-pointer text-left {activeProfile === 'auto' ? 'bg-black/5 font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}"
                    >
                      <div class="flex items-center gap-2">
                        <span class="text-amber-500">⚡</span>
                        <span>Auto</span>
                      </div>
                      {#if activeProfile === 'auto'}
                        <svg class="w-3.5 h-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                      {/if}
                    </button>
                  </div>

                  <div class="p-0.5 space-y-0.5">
                    {#each availableProfiles as prof, idx}
                      <button
                        type="button"
                        role="option"
                        aria-selected={activeProfile === prof.name}
                        onclick={() => {
                          activeProfile = prof.name;
                          profileMenuOpen = false;
                        }}
                        class="w-full flex items-center justify-between px-3 py-1.5 rounded-full hover:bg-black/5 transition-colors cursor-pointer text-left {activeProfile === prof.name ? 'bg-black/5 font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}"
                      >
                        <div class="flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full {activeProfile === prof.name ? 'bg-emerald-500' : 'bg-black/20'}"></span>
                          <span>{prof.label || `Agent ${idx + 1}`}</span>
                        </div>
                        {#if activeProfile === prof.name}
                          <svg class="w-3.5 h-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                        {/if}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

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
        <div
          bind:this={chatContainer}
          onclick={handleChatContainerClick}
          class="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-neue"
        >
          {#each messages as msg}
            <div class="space-y-1 {msg.role === 'user' ? 'text-right' : ''}">
              <div class="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground {msg.role === 'user' ? 'justify-end' : ''}">
                <span class="font-semibold text-foreground">{msg.role === 'user' ? 'Vous' : 'Ether Agent'}</span>
                <span>·</span>
                <span>{msg.time}</span>
                {#if msg.role === 'assistant' && msg.profile}
                  <span class="text-[9px] px-1.5 py-0.2 rounded bg-black/5 font-mono uppercase">
                    {getProfileLabel(msg.profile)}
                  </span>
                {/if}
              </div>
              <div class="inline-block text-left p-3.5 rounded-lg max-w-[90%] leading-relaxed {msg.role === 'user' ? 'bg-brand text-white shadow-retro-sm' : 'retro-card bg-card text-foreground'}">
                {#if msg.role === 'assistant' && !msg.content && (!msg.steps || msg.steps.length === 0)}
                  <div class="flex items-center gap-2 py-1 text-xs text-muted-foreground font-mono">
                    <div class="flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style="animation-delay: 0ms"></span>
                      <span class="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style="animation-delay: 150ms"></span>
                      <span class="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style="animation-delay: 300ms"></span>
                    </div>
                    <span class="text-[11px] text-muted-foreground">L'assistant analyse votre demande...</span>
                  </div>
                {/if}

                {#if msg.role === 'assistant' && msg.steps && msg.steps.length > 0}
                  <details
                    class="mb-3 rounded-lg bg-black/[0.03] border border-black/5 text-[11px] font-mono overflow-hidden group"
                    open={Boolean(isThinking && msg === messages[messages.length - 1])}
                  >
                    <summary class="flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-black/[0.02] transition-colors text-muted-foreground font-medium">
                      <div class="flex items-center gap-2">
                        {#if isThinking && msg === messages[messages.length - 1]}
                          <svg class="animate-spin h-3 w-3 text-brand" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                          </svg>
                          <span class="text-foreground font-semibold">Actions en cours ({msg.steps.length})</span>
                        {:else}
                          <span class="text-green-600 font-bold text-[10px]">✓</span>
                          <span>{msg.steps.length} action{msg.steps.length > 1 ? 's' : ''} exécutée{msg.steps.length > 1 ? 's' : ''}</span>
                        {/if}
                      </div>
                      <svg class="w-3.5 h-3.5 text-muted-foreground/70 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div class="px-3 pb-2.5 pt-1 space-y-1 max-h-48 overflow-y-auto border-t border-black/5">
                      {#each msg.steps as step}
                        <div class="flex items-center gap-2">
                          {#if step.state === 'running'}
                            <svg class="animate-spin h-3 w-3 text-brand shrink-0" fill="none" viewBox="0 0 24 24">
                              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                            </svg>
                          {:else}
                            <span class="text-green-600 font-bold shrink-0 text-[10px]">✓</span>
                          {/if}
                          <span class="truncate {step.state === 'running' ? 'text-foreground font-medium' : 'text-muted-foreground'}">{step.name}</span>
                        </div>
                      {/each}
                    </div>
                  </details>
                {/if}

                {#if msg.role === 'user'}
                  <div class="whitespace-pre-wrap">{msg.content}</div>
                {:else if msg.content}
                  <div class="prose prose-sm max-w-none text-foreground leading-relaxed prose-headings:font-display prose-headings:text-foreground prose-a:text-brand prose-code:text-foreground prose-code:bg-black/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                    {@html renderMarkdown(msg.content)}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <!-- Quick Suggestion Chips -->
        <div class="px-3 py-2 border-t border-black/5 bg-surface/30 flex items-center gap-1.5 overflow-x-auto text-[11px]">
          <button
            onclick={() => { promptInput = "Ajoute une section Témoignages clients moderne avec 3 avis"; }}
            class="shrink-0 px-2.5 py-1 rounded-md border border-black/10 bg-surface hover:bg-surface/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          >
            + Témoignages
          </button>
          <button
            onclick={() => { promptInput = "Ajoute un formulaire de contact avec nom, email et message"; }}
            class="shrink-0 px-2.5 py-1 rounded-md border border-black/10 bg-surface hover:bg-surface/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          >
            + Formulaire de contact
          </button>
          <button
            onclick={() => { promptInput = "Ajoute une belle galerie d'images pour présenter nos réalisations"; }}
            class="shrink-0 px-2.5 py-1 rounded-md border border-black/10 bg-surface hover:bg-surface/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          >
            + Galerie photos
          </button>
        </div>

        <!-- Quota Warning if limit reached -->
        {#if promptQuota.remaining <= 0}
          <div class="px-3 py-2 bg-amber-500/10 border-t border-amber-500/20 text-amber-800 text-[11px] font-mono flex items-center justify-between">
            <span>⚠️ Quota quotidien atteint ({promptQuota.limit} prompts/jour).</span>
            <span class="text-[10px] opacity-75">Reset à minuit</span>
          </div>
        {/if}

        <!-- Prompt Input -->
        <form onsubmit={handleSendPrompt} class="p-3 border-t border-black/10 bg-surface/80 flex items-center gap-2">
          <input
            type="text"
            bind:value={promptInput}
            placeholder={promptQuota.remaining > 0 ? "Demandez une modification à l'agent..." : "Quota quotidien atteint pour aujourd'hui"}
            disabled={isThinking || promptQuota.remaining <= 0}
            class="flex-1 rounded-lg border border-black/10 bg-card px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!promptInput.trim() || isThinking || promptQuota.remaining <= 0}
            class="focus-ring px-4 py-2 rounded-lg bg-brand text-white text-xs font-medium uppercase tracking-wider hover:bg-brand/90 transition-all cursor-pointer disabled:opacity-40 shrink-0"
          >
            Envoyer
          </button>
        </form>

        <!-- Quota Status Bar -->
        <div class="px-3 py-1.5 border-t border-black/5 bg-surface/30 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full {promptQuota.remaining > 0 ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
            <span>Quota Quotidien ({promptQuota.plan}) :</span>
          </div>
          <span class="font-semibold {promptQuota.remaining > 0 ? 'text-foreground' : 'text-amber-600'}">
            {promptQuota.remaining} / {promptQuota.limit} prompts restants
          </span>
        </div>
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
      <!-- File Tabs & Editor Controls -->
      <div class="h-10 border-b border-black/10 bg-surface/60 flex items-center justify-between px-2 text-xs font-mono shrink-0 gap-2">
        <button
          onclick={() => showExplorer = !showExplorer}
          class="p-1.5 rounded hover:bg-black/5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 {showExplorer ? 'bg-black/5 text-brand' : ''}"
          title={showExplorer ? "Masquer l'explorateur de fichiers" : "Afficher l'explorateur de fichiers"}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </button>

        <!-- Horizontally Scrollable Tab Strip with Close Buttons -->
        <div
          class="flex-1 flex items-center gap-1 overflow-x-auto min-w-0 py-1 select-none"
          onwheel={(e) => {
            if (e.deltaY !== 0) {
              e.preventDefault();
              (e.currentTarget as HTMLElement).scrollLeft += e.deltaY;
            }
          }}
        >
          {#each openTabs as path}
            {@const file = files[path] || { name: path.split('/').pop() || path, path }}
            <div
              class="group flex items-center gap-1.5 px-2.5 py-1 rounded-t border-b-2 transition-all shrink-0 cursor-pointer text-xs {activeFile === path ? 'border-brand text-brand bg-card font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-black/5'}"
              role="tab"
              aria-selected={activeFile === path}
              tabindex="0"
              onclick={() => switchFile(path)}
              onkeydown={(e) => e.key === 'Enter' && switchFile(path)}
              title={path}
            >
              {#if path.endsWith('.svelte')}
                <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-orange-500/15 text-orange-600 shrink-0">S</span>
              {:else if path.endsWith('.ts')}
                <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-blue-500/15 text-blue-600 shrink-0">TS</span>
              {:else if path.endsWith('.js') || path.endsWith('.mjs')}
                <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-amber-500/15 text-amber-600 shrink-0">JS</span>
              {:else if path.endsWith('.json')}
                <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-emerald-500/15 text-emerald-600 shrink-0">{"{}"}</span>
              {:else if path.endsWith('.html')}
                <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-rose-500/15 text-rose-600 shrink-0">&lt;&gt;</span>
              {:else if path.endsWith('.css')}
                <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-purple-500/15 text-purple-600 shrink-0">#</span>
              {:else}
                <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-black/10 text-muted-foreground shrink-0">📄</span>
              {/if}

              <span class="truncate max-w-[130px]">{file.name}</span>

              <!-- Close Tab Button -->
              <button
                type="button"
                onclick={(e) => closeTab(e, path)}
                class="p-0.5 rounded hover:bg-black/10 text-muted-foreground hover:text-foreground opacity-50 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                title="Fermer l'onglet"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          {/each}
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <button
            onclick={handleSaveCode}
            class="px-2.5 py-1 rounded-full border border-black/10 bg-surface hover:bg-surface/80 text-[11px] text-foreground uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
            title="Sauvegarder les modifications (Cmd+S ou Ctrl+S)"
          >
            {#if editorSaved}
              <span class="text-emerald-600 font-bold">✓</span>
              <span>Sauvegardé</span>
            {:else}
              <span>Sauvegarder</span>
              <kbd class="text-[9px] bg-black/5 px-1 py-0.2 rounded text-muted-foreground font-mono">⌘S</kbd>
            {/if}
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

      <!-- Main Editor Area with Tree-based Explorer Sidebar -->
      <div class="flex-1 flex overflow-hidden min-h-0">
        <!-- File Explorer Sidebar -->
        {#if showExplorer}
          <div class="w-52 sm:w-56 border-r border-black/10 bg-surface/40 flex flex-col shrink-0 overflow-hidden select-none">
            <!-- Explorer Header & Filter -->
            <div class="p-2 border-b border-black/10 space-y-1.5 shrink-0 bg-surface/60">
              <div class="flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                <span class="flex items-center gap-1.5 font-semibold text-foreground/80">
                  <svg class="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span>Explorateur</span>
                </span>
                <div class="flex items-center gap-1">
                  <span class="text-[10px] text-muted-foreground">({Object.keys(files).length})</span>
                  <button
                    onclick={loadTenantFiles}
                    class="p-0.5 rounded hover:bg-black/5 hover:text-foreground transition-colors cursor-pointer"
                    title="Recharger l'arborescence"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="relative">
                <input
                  type="text"
                  bind:value={fileSearchQuery}
                  placeholder="Filtrer les fichiers..."
                  class="w-full bg-card border border-black/10 rounded px-2 py-1 text-[11px] font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:border-brand"
                />
                {#if fileSearchQuery}
                  <button
                    onclick={() => fileSearchQuery = ""}
                    class="absolute right-1 top-1 text-muted-foreground hover:text-foreground text-[10px] px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                {/if}
              </div>
            </div>

            <!-- Recursive Tree Snippet -->
            {#snippet renderTreeNode(node: TreeNode)}
              {#if node.isFolder}
                {@const isCollapsed = Boolean(collapsedFolders[node.path]) && !fileSearchQuery.trim()}
                <div>
                  <button
                    type="button"
                    onclick={() => toggleFolder(node.path)}
                    class="w-full text-left py-1 px-1 rounded flex items-center gap-1.5 hover:bg-black/5 transition-colors cursor-pointer text-xs group select-none"
                    style="padding-left: {node.depth * 14 + 6}px"
                    title={node.path}
                  >
                    <svg class="w-3 h-3 text-muted-foreground/80 transition-transform duration-150 {isCollapsed ? '' : 'rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
                    </svg>

                    {#if isCollapsed}
                      <svg class="w-3.5 h-3.5 text-amber-600/85 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                    {:else}
                      <svg class="w-3.5 h-3.5 text-amber-600/85 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v4.5A1.5 1.5 0 013.5 18H4a2 2 0 01-2-2V6z" clip-rule="evenodd" />
                        <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H8a2 2 0 01-2-2v-2z" />
                      </svg>
                    {/if}

                    <span class="truncate font-medium text-foreground text-[11px]">{node.name}</span>
                  </button>

                  {#if !isCollapsed}
                    <div class="space-y-0.5">
                      {#each node.children as child}
                        {@render renderTreeNode(child)}
                      {/each}
                    </div>
                  {/if}
                </div>
              {:else}
                <button
                  type="button"
                  onclick={() => selectAndOpenFile(node.path)}
                  class="w-full text-left py-1 px-1 rounded flex items-center gap-1.5 transition-colors cursor-pointer text-xs group {activeFile === node.path ? 'bg-brand/10 text-brand font-medium' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}"
                  style="padding-left: {node.depth * 14 + 18}px"
                  title={node.path}
                >
                  {#if node.path.endsWith('.svelte')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-orange-500/15 text-orange-600 shrink-0">S</span>
                  {:else if node.path.endsWith('.ts')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-blue-500/15 text-blue-600 shrink-0">TS</span>
                  {:else if node.path.endsWith('.js') || node.path.endsWith('.mjs')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-amber-500/15 text-amber-600 shrink-0">JS</span>
                  {:else if node.path.endsWith('.json')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-emerald-500/15 text-emerald-600 shrink-0">{"{}"}</span>
                  {:else if node.path.endsWith('.html')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-rose-500/15 text-rose-600 shrink-0">&lt;&gt;</span>
                  {:else if node.path.endsWith('.css')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-purple-500/15 text-purple-600 shrink-0">#</span>
                  {:else}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-black/10 text-muted-foreground shrink-0">📄</span>
                  {/if}

                  <span class="truncate text-[11px] {activeFile === node.path ? 'font-semibold' : ''}">{node.name}</span>
                </button>
              {/if}
            {/snippet}

            <!-- Tree View Nodes -->
            <div class="flex-1 overflow-y-auto p-1 font-mono text-xs space-y-0.5">
              {#if fileTree.length === 0}
                <div class="p-4 text-[11px] text-muted-foreground text-center">
                  Aucun fichier trouvé
                </div>
              {:else}
                {#each fileTree as node}
                  {@render renderTreeNode(node)}
                {/each}
              {/if}
            </div>
          </div>
        {/if}

        <!-- CodeMirror Editor Container -->
        <div class="flex-1 overflow-hidden bg-card relative" bind:this={editorContainer}>
          {#if editorSaved}
            <div class="absolute bottom-3 right-3 bg-foreground text-background text-[11px] font-mono px-3 py-1.5 rounded-full shadow-retro z-20 pointer-events-none flex items-center gap-1.5">
              <span>✓ Sauvegardé</span>
            </div>
          {/if}
        </div>
      </div>
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
        <!-- Viewport & Environment Switchers -->
        <div class="flex items-center gap-2">
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
            onclick={refreshPreview}
            class="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-black/5 cursor-pointer"
            title="Rafraîchir l'aperçu"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <a
            href={previewUrl}
            target="_blank"
            rel="noopener"
            class="text-[11px] text-brand hover:underline font-mono inline-flex items-center gap-1"
            title="Ouvrir l'aperçu du code dans un nouvel onglet"
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
      <div class="flex-1 flex items-center justify-center {viewportMode === 'desktop' ? 'p-0 bg-background' : 'p-4 bg-black/5'} overflow-hidden w-full h-full min-w-0">
        {#if viewportMode === 'desktop'}
          <div class="w-full h-full bg-background overflow-hidden flex flex-col">
            <iframe
              bind:this={previewIframe}
              src={previewUrl}
              title="Aperçu du code en cours de {projectSlug}"
              class="w-full h-full border-0 bg-background {isResizing ? 'pointer-events-none' : ''}"
            ></iframe>
          </div>
        {:else}
          <div
            class="h-full max-h-[760px] w-[375px] max-w-full bg-card rounded-2xl shadow-retro border-2 border-black/20 overflow-hidden flex flex-col transition-all duration-300 relative"
          >
            <!-- Mobile Phone Speaker Indicator -->
            <div class="h-4 bg-surface flex items-center justify-center border-b border-black/10 shrink-0">
              <div class="w-12 h-1 bg-black/20 rounded-full"></div>
            </div>
            <iframe
              src={previewUrl}
              title="Aperçu mobile du code de {projectSlug}"
              class="w-full flex-1 border-0 bg-background {isResizing ? 'pointer-events-none' : ''}"
            ></iframe>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
