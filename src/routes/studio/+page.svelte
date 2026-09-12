<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import BrandMark from "$lib/components/brand-mark.svelte";
  import type { PageData } from "./$types";
  import { marked } from "marked";

  // CodeMirror imports
  import { EditorView, basicSetup } from "codemirror";
  import { keymap } from "@codemirror/view";
  import { html } from "@codemirror/lang-html";
  import { javascript } from "@codemirror/lang-javascript";
  import { css } from "@codemirror/lang-css";
  import { EditorState, Compartment } from "@codemirror/state";
  import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
  import SqliteInspector from "$lib/components/studio/SqliteInspector.svelte";
  import ImagePreviewer from "$lib/components/studio/ImagePreviewer.svelte";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";
  import DomainModal from "$lib/components/domain-modal.svelte";
  import { theme } from "$lib/stores/theme";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { getFileCategory, isBinaryFile } from "$lib/utils/file-types";

  function isFilePath(str: string): boolean {
    if (!str || typeof str !== "string") return false;
    const clean = str.trim().replace(/^[📄\s`"']+|[`"']+$/g, "").replace(/^file:\/\//, "");
    if (clean.includes("\n") || clean.length > 100) return false;
    return (
      /\.(svelte|ts|js|mjs|json|html|css|md|yaml|yml|sql|db|sqlite|sqlite3|png|jpg|jpeg|gif|webp|svg|ico)$/i.test(clean) ||
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
      return `<button type="button" data-studio-file="${path}" class="studio-file-link inline-flex items-center gap-1 font-mono text-[11px] bg-brand/10 hover:bg-brand/20 text-brand dark:text-indigo-300 dark:bg-indigo-500/15 px-2 py-0.5 rounded-lg border border-brand/20 dark:border-indigo-400/20 font-medium transition-all shadow-sm my-0.5 cursor-pointer align-baseline" title="Ouvrir ${path} dans l'éditeur">📄 <span>${path}</span></button>`;
    }
    return `<code class="text-foreground dark:text-neutral-100 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded-md font-mono text-[11px]">${text}</code>`;
  };

  marked.use({
    breaks: true,
    gfm: true,
    renderer: customRenderer,
  });

  function renderMarkdown(content: string): string {
    if (!content) return "";
    try {
      // Strip hidden suggestion comments
      const cleaned = content.replace(/<!--\s*SUGGESTIONS:[\s\S]*?-->/gi, "").trim();
      // Normalize occurrences like `📄 [path](...)` or `📄 \npath` or `📄 `path`` or `📄 src/...`
      const preprocessed = cleaned.replace(
        /📄\s*(?:\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|([a-zA-Z0-9_./+-]+\.(?:svelte|ts|js|json|html|css)|src\/[a-zA-Z0-9_./+-]+))/g,
        (match, linkText, linkHref, codeText, plainPath) => {
          const raw = linkHref || linkText || codeText || plainPath || "";
          const filePath = raw.replace(/^[📄\s`"']+|[`"']+$/g, "").replace(/^file:\/\//, "").trim();
          const displayText = (linkText || codeText || plainPath || filePath).replace(/^[📄\s`"']+|[`"']+$/g, "").replace(/^file:\/\//, "").trim();
          if (isFilePath(filePath)) {
            return `<button type="button" data-studio-file="${filePath}" class="studio-file-link inline-flex items-center gap-1 font-mono text-[11px] bg-brand/10 hover:bg-brand/20 text-brand px-2 py-0.5 rounded-lg border border-brand/20 font-medium transition-all shadow-sm my-0.5 cursor-pointer align-baseline" title="Ouvrir ${filePath} dans l'éditeur">📄 <span>${displayText}</span></button>`;
          }
          return match;
        }
      );
      return marked.parse(preprocessed) as string;
    } catch {
      return content.replace(/<!--\s*SUGGESTIONS:[\s\S]*?-->/gi, "").trim();
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
    imageUrl?: string | null;
  }

  interface AttachedImageState {
    file: File;
    name: string;
    size: number;
    type: string;
    dataUrl: string;
    base64: string;
  }

  let { data }: Props = $props();

  const tenant = $derived(data.tenant);
  const projectSlug = $derived(data.projectSlug || "tester");
  let currentCustomDomain = $state(data.tenant?.custom_domain || null);
  const liveUrl = $derived(
    currentCustomDomain
      ? `https://${currentCustomDomain}`
      : `https://${projectSlug}.ether.paris`
  );

  // Domain Management Modal States
  let isDomainModalOpen = $state(false);
  let domainInput = $state("miaw.ovh");
  let domainLinkLoading = $state(false);
  let domainLinkStatus = $state<string | null>(null);
  let domainLinkError = $state<string | null>(null);
  let domainLinkSuccess = $state<string | null>(null);
  let domainSearchQuery = $state("");
  let domainSearchLoading = $state(false);
  let domainSearchResults = $state<any[]>([]);
  let domainBuyLoading = $state(false);
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

  // Conversations History Dropdown State
  let historyMenuOpen = $state(false);
  let historyMenuContainer = $state<HTMLDivElement | null>(null);
  let conversations = $state<any[]>(data.conversations || []);

  function handleWindowClick(event: MouseEvent) {
    if (historyMenuOpen && historyMenuContainer && !historyMenuContainer.contains(event.target as Node)) {
      historyMenuOpen = false;
    }
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && historyMenuOpen) {
      historyMenuOpen = false;
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

  function handleStartNewChat() {
    conversationId = null;
    messages = [
      {
        role: "assistant",
        content: `Bonjour ! Je suis votre assistant Ether Studio pour **${tenant.brand_name || projectSlug}**.\n\nDites-moi simplement ce que vous souhaitez ajouter ou modifier sur votre site et je m'en occupe !`,
        profile: "primary",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ];
    historyMenuOpen = false;
  }

  async function selectConversation(convId: string) {
    try {
      const res = await fetch(`/api/studio/chat?project=${projectSlug}&conversationId=${encodeURIComponent(convId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.history) {
          messages = json.history;
          conversationId = convId === "default" ? null : convId;
        }
      }
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
    historyMenuOpen = false;
  }

  async function handleDeleteConversation(convId: string, event: MouseEvent) {
    event.stopPropagation();
    if (!confirm("Supprimer cette conversation de l'historique ?")) return;
    try {
      await fetch("/api/studio/chat/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug, conversationId: convId }),
      });
      conversations = conversations.filter((c) => c.conversationId !== convId);
      if (conversationId === convId || (convId === "default" && !conversationId)) {
        handleStartNewChat();
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  }

  async function refreshConversations() {
    try {
      const res = await fetch(`/api/studio/chat?project=${projectSlug}&conversations=true`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.conversations) {
          conversations = json.conversations;
        }
      }
    } catch {}
  }

  function formatConversationDate(isoString?: string): string {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "";
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  }

  let promptInput = $state("");
  let promptTextareaRef = $state<HTMLTextAreaElement | null>(null);

  function adjustPromptTextareaHeight() {
    if (!promptTextareaRef) return;
    promptTextareaRef.style.height = "auto";
    const maxHeight = 160;
    const scrollHeight = promptTextareaRef.scrollHeight;
    if (scrollHeight > maxHeight) {
      promptTextareaRef.style.height = `${maxHeight}px`;
      promptTextareaRef.style.overflowY = "auto";
    } else {
      promptTextareaRef.style.height = `${Math.max(38, scrollHeight)}px`;
      promptTextareaRef.style.overflowY = "hidden";
    }
  }

  function handlePromptKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSendPrompt();
    }
  }

  $effect(() => {
    if (promptInput !== undefined) {
      queueMicrotask(() => {
        adjustPromptTextareaHeight();
      });
    }
  });

  let isThinking = $state(false);
  let activeProfile = $state<string>("auto");
  let promptQuota = $state(
    data.promptQuota || {
      allowed: true,
      current: 0,
      limit: 3,
      dailyRemaining: 3,
      extraPrompts: 0,
      remaining: 3,
      plan: "demo",
    }
  );
  let publishLoading = $state(false);
  let publishStatus = $state<string | null>(null);

  // Top-up & Stripe State
  let showTopupModal = $state(false);
  let topupLoading = $state<string | null>(null);
  let topupError = $state<string | null>(null);
  let topupSuccessMessage = $state<string | null>(null);

  // Attached Image & Multimodal Chat State
  let attachedImage = $state<AttachedImageState | null>(null);
  let fileInputRef = $state<HTMLInputElement | null>(null);
  let isDraggingOver = $state(false);
  let previewImageModal = $state<string | null>(null);

  function resolveImageUrl(url: string | null | undefined): string {
    if (!url) return "";
    if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    const cleanPath = url.replace(/^\/+/, "");
    return `/api/studio/preview/${projectSlug}/${cleanPath}`;
  }

  const defaultSuggestions = [
    "Ajoute une section Témoignages clients avec 3 avis",
    "Ajoute un formulaire de contact avec nom et email",
    "Améliore la mise en page et les animations",
  ];

  let dynamicSuggestions = $derived.by(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.content) {
        const match = msg.content.match(/<!--\s*SUGGESTIONS:\s*(\[[\s\S]*?\])\s*-->/i);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed.map((s: string) => String(s).trim()).filter(Boolean);
            }
          } catch {}
        }
      }
    }
    return defaultSuggestions;
  });

  async function handleTopup(packId: "starter" | "creator" | "agency") {
    topupLoading = packId;
    topupError = null;
    try {
      const res = await fetch("/api/stripe/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug: projectSlug, packId }),
      });
      const resData = await res.json();
      if (resData.success && resData.url) {
        window.location.href = resData.url;
      } else {
        topupError = resData.error || "Impossible d'initier le paiement Stripe.";
      }
    } catch (err: any) {
      topupError = err.message || "Erreur de connexion.";
    } finally {
      topupLoading = null;
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " o";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
    return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
  }

  function processSelectedImage(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("Veuillez sélectionner un fichier image valide (PNG, JPG, WebP, SVG, GIF).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("L'image est trop volumineuse (maximum 5 Mo).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1] || "";
      attachedImage = {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl,
        base64,
      };
    };
    reader.readAsDataURL(file);
  }

  function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      processSelectedImage(input.files[0]);
    }
    input.value = "";
  }

  function removeAttachedImage() {
    attachedImage = null;
    if (fileInputRef) fileInputRef.value = "";
  }

  function handleChatPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          processSelectedImage(file);
          e.preventDefault();
          break;
        }
      }
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.types.includes("Files")) {
      isDraggingOver = true;
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
    const files = e.dataTransfer?.files;
    if (files && files[0] && files[0].type.startsWith("image/")) {
      processSelectedImage(files[0]);
    }
  }

  // Chat scroll container
  let chatContainer = $state<HTMLDivElement | null>(null);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    if (chatContainer) {
      requestAnimationFrame(() => {
        if (!chatContainer) return;
        chatContainer.scrollTo({
          top: chatContainer.scrollHeight,
          behavior,
        });
        requestAnimationFrame(() => {
          if (!chatContainer) return;
          chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: "auto",
          });
        });
      });
    }
  }

  /**
   * Svelte action to auto-scroll the actions / steps container to the bottom
   * whenever a new step is added or its state updates.
   */
  function autoScrollSteps(node: HTMLElement, _dep?: any) {
    const scroll = (behavior: ScrollBehavior = "smooth") => {
      node.scrollTo({
        top: node.scrollHeight,
        behavior,
      });
    };

    // Immediate scroll on initial mount
    requestAnimationFrame(() => scroll("auto"));

    // MutationObserver to catch every newly added action step DOM element
    const mutationObserver = new MutationObserver(() => {
      requestAnimationFrame(() => scroll("smooth"));
    });
    mutationObserver.observe(node, { childList: true, subtree: true, characterData: true });

    // ResizeObserver to handle container height expansion or details toggling
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => scroll("auto"));
      });
      resizeObserver.observe(node);
    }

    return {
      update(_newDep?: any) {
        requestAnimationFrame(() => scroll("smooth"));
      },
      destroy() {
        mutationObserver.disconnect();
        resizeObserver?.disconnect();
      },
    };
  }

  /**
   * Svelte action to auto-scroll the main chat container to the bottom
   * whenever new messages, text chunks, or action steps are incoming.
   */
  function autoScrollChat(node: HTMLElement) {
    let userScrolledUp = false;

    const onScroll = () => {
      const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      userScrolledUp = distanceToBottom > 120;
    };

    node.addEventListener("scroll", onScroll, { passive: true });

    const scroll = (behavior: ScrollBehavior = "smooth") => {
      node.scrollTo({
        top: node.scrollHeight,
        behavior,
      });
    };

    const mutationObserver = new MutationObserver(() => {
      if (!userScrolledUp || isThinking) {
        requestAnimationFrame(() => scroll("auto"));
      }
    });
    mutationObserver.observe(node, { childList: true, subtree: true, characterData: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        if (!userScrolledUp || isThinking) {
          requestAnimationFrame(() => scroll("auto"));
        }
      });
      resizeObserver.observe(node);
    }

    return {
      destroy() {
        node.removeEventListener("scroll", onScroll);
        mutationObserver.disconnect();
        resizeObserver?.disconnect();
      },
    };
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
      if (showEditor && openTabs.length === 0) {
        showExplorer = true;
      }
    } else if (panel === "preview") {
      if (showPreview && !showChat && !showEditor) return;
      const willOpen = !showPreview;
      showPreview = willOpen;
      if (willOpen && showChat && showEditor && typeof window !== "undefined" && window.innerWidth < 1440) {
        showExplorer = false;
      }
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
  type SupportedLang = "html" | "typescript" | "json" | "css";
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
  const activeFileCategory = $derived(getFileCategory(activeFile));
  const isCurrentFileBinary = $derived(isBinaryFile(activeFile));
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
      openTabs = [];
      activeFile = "";
      showExplorer = true;
      showEditor = false;
      showPreview = true;
      showChat = true;
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
          if (openTabs.length > 0 && !files[activeFile]) {
            activeFile = openTabs[0] || Object.keys(files)[0] || "";
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
    } else if (lang === "css") {
      return css();
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

  const darkEditorTheme = EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "12px",
      fontFamily: "'Space Grotesk', SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      backgroundColor: "hsl(var(--card))",
      color: "hsl(var(--foreground))",
    },
    ".cm-content": {
      padding: "16px 0",
      caretColor: "hsl(var(--brand))",
      lineHeight: "1.6",
    },
    ".cm-cursor": {
      borderLeftColor: "hsl(var(--brand))",
      borderLeftWidth: "2px",
    },
    ".cm-gutters": {
      backgroundColor: "hsl(var(--surface))",
      color: "hsl(var(--muted-foreground))",
      borderRight: "1px solid rgba(255, 255, 255, 0.08)",
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
      backgroundColor: "rgba(255, 255, 255, 0.06)",
      color: "#ffffff",
      fontWeight: "bold",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.03)",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "inherit",
    },
    "&.cm-focused": {
      outline: "none",
    },
  });

  const themeCompartment = new Compartment();

  function getEditorThemeExtensions(isDark: boolean) {
    if (isDark) {
      return [oneDark, darkEditorTheme];
    }
    return [
      retroEditorTheme,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true })
    ];
  }

  onDestroy(() => {
    if (browser) {
      document.documentElement.classList.remove("dark");
    }
  });

  onMount(() => {
    theme.init();
    if (typeof window !== "undefined") {
      if (data.sessionToken) {
        try {
          localStorage.setItem("ether_session_token", data.sessionToken);
        } catch {}
      }
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("topup_success") === "true") {
        topupSuccessMessage = "Paiement validé ! Vos prompts supplémentaires ont été crédités sur votre compte.";
        urlParams.delete("topup_success");
        const newSearch = urlParams.toString() ? `?${urlParams.toString()}` : window.location.pathname;
        window.history.replaceState({}, "", newSearch);
        setTimeout(() => {
          topupSuccessMessage = null;
        }, 8000);
      }
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
        themeCompartment.of(getEditorThemeExtensions($theme === "dark")),
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

  $effect(() => {
    const isDark = $theme === "dark";
    if (editorView) {
      editorView.dispatch({
        effects: themeCompartment.reconfigure(getEditorThemeExtensions(isDark)),
      });
    }
  });

  function switchFile(filePath: string) {
    if (!filePath) return;
    if (filePath === activeFile) {
      if (editorView && !isBinaryFile(filePath)) {
        editorView.focus();
      }
      return;
    }

    // Persist current file content before switching if it was editable text
    if (editorView && files[activeFile] && !isBinaryFile(activeFile)) {
      files[activeFile].content = editorView.state.doc.toString();
    }

    activeFile = filePath;
    const target = files[filePath];

    if (editorView && target && !isBinaryFile(filePath)) {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: target.content },
        effects: languageCompartment.reconfigure(getLangExtension(target.lang)),
      });
      requestAnimationFrame(() => {
        editorView?.requestMeasure();
        editorView?.focus();
      });
    }
  }

  // Preview State (Desktop or Mobile only)
  let viewportMode = $state<"desktop" | "mobile">("desktop");
  let previewIframe = $state<HTMLIFrameElement | null>(null);

  function refreshPreview() {
    if (previewIframe) {
      const sep = previewUrl.includes("?") ? "&" : "?";
      previewIframe.src = `${previewUrl}${sep}_t=${Date.now()}`;
    }
  }

  async function handleSendPrompt(e?: Event) {
    if (e) e.preventDefault();
    const text = promptInput.trim();
    const currentAttachedImage = attachedImage;
    if ((!text && !currentAttachedImage) || isThinking) return;

    if (promptQuota.remaining <= 0) {
      messages.push({
        role: "assistant",
        content: `⚠️ Quota quotidien atteint (${promptQuota.limit} prompts/jour pour l'offre ${promptQuota.plan}). Rechargez des prompts pour continuer immédiatement sans attendre demain.`,
        profile: "secondary",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      showTopupModal = true;
      scrollToBottom();
      return;
    }

    // Optimistically update quota
    promptQuota.current++;
    if (promptQuota.dailyRemaining !== undefined && promptQuota.dailyRemaining > 0) {
      promptQuota.dailyRemaining--;
    } else if (promptQuota.extraPrompts !== undefined && promptQuota.extraPrompts > 0) {
      promptQuota.extraPrompts--;
    }
    promptQuota.remaining = Math.max(0, promptQuota.remaining - 1);
    if (promptQuota.remaining <= 0) {
      promptQuota.allowed = false;
    }

    promptInput = "";
    attachedImage = null;
    if (fileInputRef) fileInputRef.value = "";
    if (promptTextareaRef) {
      promptTextareaRef.style.height = "38px";
      promptTextareaRef.style.overflowY = "hidden";
    }

    messages.push({
      role: "user",
      content: text,
      imageUrl: currentAttachedImage ? currentAttachedImage.dataUrl : null,
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

    if (!conversationId) {
      conversationId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `conv_${Date.now()}`;
    }

    try {
      const res = await fetch("/api/studio/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          prompt: text,
          image: currentAttachedImage
            ? {
                name: currentAttachedImage.name,
                type: currentAttachedImage.type,
                base64: currentAttachedImage.base64,
              }
            : undefined,
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
                  showTopupModal = true;
                }
                if (data.quota) {
                  promptQuota.remaining = data.quota.remaining ?? promptQuota.remaining;
                  if (data.quota.extraPrompts !== undefined) {
                    promptQuota.extraPrompts = data.quota.extraPrompts;
                  }
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
                if (data.savedImageUrl && messages[assistantMsgIndex - 1]) {
                  if (!messages[assistantMsgIndex - 1].imageUrl || !messages[assistantMsgIndex - 1].imageUrl?.startsWith("data:")) {
                    messages[assistantMsgIndex - 1].imageUrl = data.savedImageUrl;
                  }
                }
                // Handle live thinking / tool execution steps
                if (data.id !== undefined && data.name) {
                  if (!messages[assistantMsgIndex].steps) {
                    messages[assistantMsgIndex].steps = [];
                  }
                  const existing = messages[assistantMsgIndex].steps.find((s) => s.id === data.id);
                  if (existing) {
                    existing.state = data.state;
                    messages[assistantMsgIndex].steps = [...messages[assistantMsgIndex].steps];
                  } else {
                    messages[assistantMsgIndex].steps = [
                      ...messages[assistantMsgIndex].steps,
                      {
                        id: data.id,
                        name: data.name,
                        state: data.state || "running",
                      },
                    ];
                  }
                  scrollToBottom("auto");
                } else if (data.id !== undefined && data.state === "completed") {
                  const existing = messages[assistantMsgIndex].steps?.find((s) => s.id === data.id);
                  if (existing) {
                    existing.state = "completed";
                    messages[assistantMsgIndex].steps = [...messages[assistantMsgIndex].steps];
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
          showTopupModal = true;
        }

        if (resData.savedImageUrl && messages[assistantMsgIndex - 1]) {
          if (!messages[assistantMsgIndex - 1].imageUrl || !messages[assistantMsgIndex - 1].imageUrl?.startsWith("data:")) {
            messages[assistantMsgIndex - 1].imageUrl = resData.savedImageUrl;
          }
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
      await refreshConversations();
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
    if (!files[activeFile] || isCurrentFileBinary) return;

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

  async function handleConnectDomain(customDomainToConnect?: string) {
    const targetDomain = (customDomainToConnect || domainInput).trim();
    if (!targetDomain) return;

    domainLinkLoading = true;
    domainLinkError = null;
    domainLinkSuccess = null;
    domainLinkStatus = "Étape 1/3 : Configuration DNS Cloudflare (A: 135.181.95.61)...";

    try {
      setTimeout(() => {
        if (domainLinkLoading) {
          domainLinkStatus = "Étape 2/3 : Routage Ingress Kubernetes & Certificat SSL Let's Encrypt...";
        }
      }, 1800);

      const res = await fetch("/api/tenant/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: projectSlug,
          tenantId: tenant.id || 1,
          domain: targetDomain,
          action: "link",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Impossible de relier ce domaine");
      }

      currentCustomDomain = json.domain;
      domainLinkStatus = null;
      domainLinkSuccess = `✓ Le domaine ${json.domain} est maintenant relié et actif ! Accessible sur https://${json.domain}`;
    } catch (err: any) {
      domainLinkError = err.message;
      domainLinkStatus = null;
    } finally {
      domainLinkLoading = false;
    }
  }

  async function handleDisconnectDomain() {
    if (!confirm(`Détacher le domaine personnalisé ${currentCustomDomain} de ce site ?`)) return;

    domainLinkLoading = true;
    domainLinkError = null;
    domainLinkSuccess = null;
    domainLinkStatus = "Détachement du domaine en cours...";

    try {
      const res = await fetch("/api/tenant/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: projectSlug,
          tenantId: tenant.id || 1,
          action: "unlink",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Impossible de détacher le domaine");
      }

      currentCustomDomain = null;
      domainLinkSuccess = "Domaine personnalisé détaché. Le site utilise à nouveau son sous-domaine ether.paris.";
    } catch (err: any) {
      domainLinkError = err.message;
    } finally {
      domainLinkLoading = false;
      domainLinkStatus = null;
    }
  }

  async function handleSearchStudioDomains() {
    const q = (domainSearchQuery || domainInput).trim();
    if (!q || q.length < 2) return;

    domainSearchLoading = true;
    domainSearchResults = [];
    domainLinkError = null;

    try {
      const res = await fetch(`/api/domains/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success) {
        domainSearchResults = json.results || [];
      }
    } catch (err: any) {
      domainLinkError = "Erreur lors de la recherche du domaine";
    } finally {
      domainSearchLoading = false;
    }
  }

  async function handleBuyStudioDomain(item: any) {
    if (item.isOwnedByAccount) {
      await handleConnectDomain(item.domain);
      return;
    }

    domainBuyLoading = true;
    domainLinkError = null;

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id || 1,
          domain: item.domain,
          provider: item.provider,
          priceCents: item.priceAnnualCents,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success || !json.url) {
        throw new Error(json.error || "Erreur lors de la redirection paiement");
      }

      window.location.href = json.url;
    } catch (err: any) {
      domainLinkError = err.message;
    } finally {
      domainBuyLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Ether Studio · {tenant.brand_name || projectSlug}</title>
</svelte:head>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden grain-overlay">
  <!-- Studio Top Navigation -->
  <header class="h-14 border-b border-black/10 dark:border-white/10 bg-surface/90 dark:bg-background/90 backdrop-blur px-4 sm:px-6 flex items-center justify-between shrink-0 z-30 gap-4">
    <div class="flex items-center gap-3 sm:gap-4 min-w-0">
      <a href="/dashboard" class="transition-opacity hover:opacity-80 flex items-center gap-2 shrink-0">
        <BrandMark class="h-8 w-8" />
      </a>
      <span class="text-muted-foreground/30 select-none">/</span>
      <div class="flex items-center gap-2 sm:gap-3 min-w-0">
        <span class="font-display font-medium text-sm text-foreground truncate">{tenant.brand_name || projectSlug}</span>
        <div class="flex items-center gap-1">
          <button
            onclick={() => {
              isDomainModalOpen = true;
              domainLinkStatus = null;
              domainLinkError = null;
            }}
            class="text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-black/10 dark:border-white/10 bg-card dark:bg-white/[0.04] hover:bg-surface dark:hover:bg-white/10 text-muted-foreground hover:text-foreground dark:hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
            title="Gérer le domaine personnalisé"
          >
            {#if currentCustomDomain}
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            {/if}
            <span>{currentCustomDomain || `${projectSlug}.ether.paris`}</span>
          </button>
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener"
            class="p-1 rounded-full text-muted-foreground/60 hover:text-foreground dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
            title="Ouvrir le site en direct (nouvel onglet)"
          >
            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>

    <!-- Center: Panel Docking Controls -->
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-[2px] rounded-full border border-black/10 dark:border-white/10 bg-surface/90 dark:bg-[#16161c] p-[2px] text-xs font-mono shadow-retro-sm dark:shadow-none">
        <button
          onclick={() => togglePanel("chat")}
          class="px-2.5 py-1 rounded-full transition-all flex items-center gap-1.5 cursor-pointer {showChat ? 'bg-brand text-white font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground dark:hover:text-white'}"
          title={showChat ? "Masquer le chat IA" : "Afficher le chat IA"}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span class="hidden sm:inline">Chat</span>
        </button>
        <button
          onclick={() => togglePanel("editor")}
          class="px-2.5 py-1 rounded-full transition-all flex items-center gap-1.5 cursor-pointer {showEditor ? 'bg-brand text-white font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground dark:hover:text-white'}"
          title={showEditor ? "Masquer l'éditeur de code" : "Afficher l'éditeur de code"}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span class="hidden sm:inline">Code</span>
        </button>
        <button
          onclick={() => togglePanel("preview")}
          class="px-2.5 py-1 rounded-full transition-all flex items-center gap-1.5 cursor-pointer {showPreview ? 'bg-brand text-white font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground dark:hover:text-white'}"
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
    <div class="flex items-center gap-2 sm:gap-3 shrink-0">
      <!-- Domain Modal Trigger -->
      <button
        onclick={() => {
          isDomainModalOpen = true;
          domainLinkStatus = null;
          domainLinkError = null;
        }}
        class="focus-ring px-3 py-1.5 rounded-full border border-black/10 dark:border-white/10 bg-card dark:bg-white/[0.04] hover:bg-surface dark:hover:bg-white/10 text-foreground dark:text-white text-xs font-medium uppercase tracking-[0.15em] shadow-retro-sm transition-all inline-flex items-center gap-1.5 cursor-pointer hover:-translate-y-0.5"
        title="Gérer le domaine personnalisé (ex: miaw.ovh)"
      >
        <svg class="w-3.5 h-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
        <span class="hidden sm:inline">{currentCustomDomain ? 'Domaine' : 'Lier un Domaine'}</span>
        <span class="sm:hidden">Domaine</span>
        {#if currentCustomDomain}
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        {/if}
      </button>

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

      <div class="flex items-center">
        <ThemeToggle />
      </div>

      <a
        href="/dashboard"
        class="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        title="Retour au tableau de bord"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
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
        class="border-r border-black/10 dark:border-white/10 bg-surface/40 dark:bg-background flex flex-col h-full overflow-hidden shrink-0 w-full lg:w-auto"
        style="width: {chatWidth}px;"
      >
        <div class="p-3 border-b border-black/10 dark:border-white/10 bg-surface/80 dark:bg-background/90 flex items-center justify-between text-xs font-mono">
          <span class="font-semibold text-foreground dark:text-white uppercase tracking-widest flex items-center gap-2">
            <svg class="w-3.5 h-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Assistant Studio
          </span>
          <div class="flex items-center gap-1.5">
            <!-- New Conversation Button -->
            <button
              type="button"
              onclick={handleStartNewChat}
              class="text-[11px] font-mono bg-card dark:bg-white/[0.05] hover:bg-surface dark:hover:bg-white/10 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 rounded-md px-2 py-1 text-muted-foreground hover:text-foreground dark:hover:text-white cursor-pointer outline-none transition-all flex items-center gap-1 shadow-retro-sm dark:shadow-none"
              title="Nouvelle conversation"
            >
              <svg class="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              <span class="hidden xl:inline">Nouveau</span>
            </button>

            <!-- Conversations History Dropdown Menu -->
            <div bind:this={historyMenuContainer} class="relative">
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  historyMenuOpen = !historyMenuOpen;
                }}
                class="text-[11px] font-mono bg-card dark:bg-white/[0.05] hover:bg-surface dark:hover:bg-white/10 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 rounded-md px-2.5 py-1 text-foreground dark:text-white cursor-pointer outline-none transition-all flex items-center gap-1.5 shadow-retro-sm dark:shadow-none"
                title="Historique des conversations"
                aria-expanded={historyMenuOpen}
              >
                <svg class="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="font-medium">Historique</span>
                {#if conversations.length > 0}
                  <span class="text-[10px] px-1.5 py-0.2 bg-black/5 dark:bg-white/10 rounded-full text-muted-foreground font-mono">
                    {conversations.length}
                  </span>
                {/if}
                <svg
                  class="w-3 h-3 text-muted-foreground transition-transform duration-200 {historyMenuOpen ? 'rotate-180' : ''}"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {#if historyMenuOpen}
                <div
                  class="absolute right-0 top-full mt-1.5 w-72 bg-card dark:bg-[#18181f] border border-black/10 dark:border-white/10 rounded-xl shadow-retro-sm dark:shadow-xl p-1.5 text-xs font-mono z-50 flex flex-col gap-1 max-h-[360px] overflow-hidden"
                >
                  <div class="px-2.5 py-1.5 flex items-center justify-between border-b border-black/5 dark:border-white/10 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                    <span>Conversations</span>
                    <button
                      type="button"
                      onclick={handleStartNewChat}
                      class="text-brand hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      <span>+ Nouveau</span>
                    </button>
                  </div>

                  <div class="overflow-y-auto flex-1 space-y-0.5 py-0.5 pr-0.5">
                    {#if conversations.length === 0}
                      <div class="px-3 py-4 text-center text-muted-foreground text-xs">
                        Aucun historique pour le moment.
                      </div>
                    {:else}
                      {#each conversations as conv}
                        {@const isActive = (conversationId === conv.conversationId) || (!conversationId && conv.conversationId === 'default')}
                        <div
                          role="button"
                          tabindex="0"
                          onclick={() => selectConversation(conv.conversationId)}
                          onkeydown={(e) => { if (e.key === 'Enter') selectConversation(conv.conversationId); }}
                          class="group w-full flex items-start justify-between gap-2 px-2.5 py-2 rounded-md last:rounded-b-xl transition-colors cursor-pointer text-left {isActive ? 'bg-black/5 dark:bg-white/10 text-foreground dark:text-white' : 'hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground dark:hover:text-white'}"
                        >
                          <div class="flex-1 min-w-0">
                            <div class="font-medium {isActive ? 'text-foreground dark:text-white font-semibold' : 'text-foreground/90 dark:text-neutral-200'} truncate text-[12px] leading-snug">
                              {conv.title || 'Discussion sans titre'}
                            </div>
                            <div class="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                              <span>{formatConversationDate(conv.lastMessageAt || conv.createdAt)}</span>
                              <span>•</span>
                              <span>{conv.messageCount} msg{conv.messageCount > 1 ? 's' : ''}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onclick={(e) => handleDeleteConversation(conv.conversationId, e)}
                            class="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 rounded transition-opacity cursor-pointer shrink-0"
                            title="Supprimer la conversation"
                          >
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      {/each}
                    {/if}
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
          use:autoScrollChat
          onclick={handleChatContainerClick}
          class="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-neue relative scroll-smooth"
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          ondrop={handleDrop}
          role="region"
          aria-label="Zone de discussion et dépôt d'images"
        >
          {#if isDraggingOver}
            <div class="absolute inset-0 z-20 bg-brand/10 border-2 border-dashed border-brand backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none rounded-lg m-2">
              <div class="p-3 bg-card rounded-xl shadow-retro border border-black/10 flex items-center gap-2 text-brand font-medium text-xs">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Déposez votre image ici</span>
              </div>
            </div>
          {/if}

          {#each messages as msg}
            <div class="space-y-1.5 {msg.role === 'user' ? 'text-right' : 'text-left'}">
              <div class="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground {msg.role === 'user' ? 'justify-end' : 'justify-start'} px-1">
                <span class="font-semibold text-foreground dark:text-neutral-200">{msg.role === 'user' ? 'Vous' : 'Ether Agent'}</span>
                <span>·</span>
                <span>{msg.time}</span>
                {#if msg.role === 'assistant' && msg.profile}
                  <span class="text-[9px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono uppercase text-muted-foreground dark:text-neutral-300">
                    {getProfileLabel(msg.profile)}
                  </span>
                {/if}
              </div>

              {#if msg.role === 'user'}
                <div class="inline-block text-left px-5 py-3 rounded-3xl max-w-[90%] sm:max-w-[85%] leading-relaxed bg-brand text-white shadow-retro-sm dark:shadow-none break-words">
                  {#if msg.imageUrl}
                    <div class="mb-2">
                      <button
                        type="button"
                        class="cursor-pointer group relative block overflow-hidden rounded-lg border border-white/20 max-w-[260px] max-h-[180px] bg-black/10 hover:opacity-95 transition-all text-left shadow-sm"
                        onclick={() => previewImageModal = resolveImageUrl(msg.imageUrl)}
                        title="Cliquer pour agrandir"
                      >
                        <img
                          src={resolveImageUrl(msg.imageUrl)}
                          alt="Image jointe"
                          class="object-cover w-full h-full max-h-[180px] rounded-lg transition-transform duration-200 group-hover:scale-105"
                        />
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <span class="bg-black/80 text-white text-[10px] px-2.5 py-1 rounded font-mono shadow">🔍 Agrandir</span>
                        </div>
                      </button>
                    </div>
                  {/if}
                  {#if msg.content}
                    <div class="whitespace-pre-wrap">{msg.content}</div>
                  {/if}
                </div>
              {:else}
                <div class="w-full text-left px-3.5 py-5 sm:px-4 sm:py-6 rounded-3xl leading-relaxed border border-black/10 dark:border-white/10 bg-card dark:bg-[#1a1a24] text-foreground dark:text-neutral-100 shadow-retro-sm dark:shadow-none">
                  {#if msg.imageUrl}
                    <div class="mb-2 px-1">
                      <button
                        type="button"
                        class="cursor-pointer group relative block overflow-hidden rounded-lg border border-black/10 dark:border-white/10 max-w-[260px] max-h-[180px] bg-black/5 hover:opacity-95 transition-all text-left shadow-sm"
                        onclick={() => previewImageModal = resolveImageUrl(msg.imageUrl)}
                        title="Cliquer pour agrandir"
                      >
                        <img
                          src={resolveImageUrl(msg.imageUrl)}
                          alt="Image jointe"
                          class="object-cover w-full h-full max-h-[180px] rounded-lg transition-transform duration-200 group-hover:scale-105"
                        />
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <span class="bg-black/80 text-white text-[10px] px-2.5 py-1 rounded font-mono shadow">🔍 Agrandir</span>
                        </div>
                      </button>
                    </div>
                  {/if}

                  {#if !msg.content && (!msg.steps || msg.steps.length === 0)}
                    <div class="flex items-center gap-2 py-1 px-2 text-xs text-muted-foreground font-mono">
                      <div class="flex items-center gap-1">
                        <span class="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style="animation-delay: 0ms"></span>
                        <span class="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style="animation-delay: 150ms"></span>
                        <span class="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style="animation-delay: 300ms"></span>
                      </div>
                      <span class="text-[11px] text-muted-foreground dark:text-neutral-300">L'assistant analyse votre demande...</span>
                    </div>
                  {/if}

                  {#if msg.steps && msg.steps.length > 0}
                    <details
                      class="mb-4 sm:mb-5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/10 text-[11px] font-mono overflow-hidden group"
                      open={Boolean(isThinking && msg === messages[messages.length - 1])}
                    >
                      <summary class="flex items-center justify-between p-3 cursor-pointer select-none hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors text-muted-foreground font-medium">
                        <div class="flex items-center gap-2">
                          {#if isThinking && msg === messages[messages.length - 1]}
                            <svg class="animate-spin h-3 w-3 text-brand shrink-0" fill="none" viewBox="0 0 24 24">
                              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                            </svg>
                            <span class="text-foreground dark:text-white font-semibold">Actions en cours ({msg.steps.length})</span>
                          {:else}
                            <span class="text-green-600 dark:text-emerald-400 font-bold text-[10px]">✓</span>
                            <span class="text-foreground/80 dark:text-neutral-300">{msg.steps.length} action{msg.steps.length > 1 ? 's' : ''} exécutée{msg.steps.length > 1 ? 's' : ''}</span>
                          {/if}
                        </div>
                        <svg class="w-3.5 h-3.5 text-muted-foreground/70 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>
                      <div
                        use:autoScrollSteps={msg.steps.length}
                        class="px-3 pb-2.5 pt-1 space-y-1 max-h-48 overflow-y-auto border-t border-black/5 dark:border-white/10 scroll-smooth"
                      >
                        {#each msg.steps as step}
                          <div class="flex items-center gap-2">
                            {#if step.state === 'running'}
                              <svg class="animate-spin h-3 w-3 text-brand shrink-0" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                              </svg>
                            {:else}
                              <span class="text-green-600 dark:text-emerald-400 font-bold shrink-0 text-[10px]">✓</span>
                            {/if}
                            <span class="truncate {step.state === 'running' ? 'text-foreground dark:text-white font-medium' : 'text-muted-foreground dark:text-neutral-400'}">{step.name}</span>
                          </div>
                        {/each}
                      </div>
                    </details>
                  {/if}

                  {#if msg.content}
                    <div class="prose prose-sm dark:prose-invert max-w-none text-foreground dark:text-neutral-100 leading-relaxed px-2 sm:px-2.5 py-1 sm:py-1.5
                      prose-headings:font-display prose-headings:text-foreground dark:prose-headings:text-white
                      prose-strong:text-foreground dark:prose-strong:text-white
                      prose-a:text-brand dark:prose-a:text-indigo-400
                      prose-code:text-foreground dark:prose-code:text-white prose-code:bg-black/5 dark:prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md
                      dark:prose-counters:text-neutral-300 dark:prose-bullets:text-neutral-400 dark:prose-li:text-neutral-200">
                      {@html renderMarkdown(msg.content)}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Dynamic AI Suggestion Chips -->
        <div class="px-3 py-2 border-t border-black/5 dark:border-white/10 bg-surface/30 dark:bg-background/90 flex items-center gap-1.5 overflow-x-auto text-[11px] no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <span class="text-[10px] text-muted-foreground font-mono shrink-0 mr-0.5 select-none">✨ Suggestions :</span>
          {#each dynamicSuggestions as suggestion}
            <button
              type="button"
              onclick={() => { promptInput = suggestion; }}
              class="shrink-0 px-2.5 py-1 rounded-md border border-black/10 dark:border-white/10 bg-surface dark:bg-white/[0.04] hover:bg-brand/10 dark:hover:bg-brand/20 hover:border-brand/30 dark:hover:border-brand/40 text-muted-foreground hover:text-brand dark:hover:text-indigo-300 transition-all cursor-pointer truncate max-w-[280px]"
              title={suggestion}
            >
              + {suggestion.replace(/^\+\s*/, '')}
            </button>
          {/each}
        </div>

        <!-- Quota Warning if limit reached -->
        {#if promptQuota.remaining <= 0}
          <div class="px-3 py-2 bg-amber-500/10 border-t border-amber-500/20 text-amber-800 text-[11px] font-mono flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span>⚠️ Quota quotidien atteint ({promptQuota.limit} prompts/jour).</span>
            </div>
            <button
              type="button"
              onclick={() => showTopupModal = true}
              class="font-semibold underline hover:text-amber-950 cursor-pointer flex items-center gap-1"
            >
              ⚡ Recharger des prompts
            </button>
          </div>
        {/if}

        <!-- Attached Image Preview Chip -->
        {#if attachedImage}
          <div class="px-3 py-2 border-t border-black/10 bg-surface/60 flex items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="relative w-10 h-10 rounded-lg border border-black/15 overflow-hidden bg-black/5 shrink-0 shadow-sm">
                <img src={attachedImage.dataUrl} alt={attachedImage.name} class="w-full h-full object-cover" />
              </div>
              <div class="min-w-0">
                <div class="text-[11px] font-medium text-foreground truncate max-w-[190px]">{attachedImage.name}</div>
                <div class="text-[10px] text-muted-foreground font-mono">{formatFileSize(attachedImage.size)}</div>
              </div>
            </div>
            <button
              type="button"
              onclick={removeAttachedImage}
              class="p-1 rounded hover:bg-black/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Supprimer l'image"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/if}

        <!-- Prompt Input Form -->
        <form
          onsubmit={handleSendPrompt}
          class="p-3 border-t border-black/10 dark:border-white/10 bg-surface/80 dark:bg-background/90 flex items-end gap-2 relative {isDraggingOver ? 'ring-2 ring-brand bg-brand/5' : ''}"
        >
          <!-- Hidden file input -->
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            class="hidden"
            bind:this={fileInputRef}
            onchange={handleFileInputChange}
          />

          <!-- Attachment button -->
          <button
            type="button"
            onclick={() => fileInputRef?.click()}
            disabled={isThinking || promptQuota.remaining <= 0}
            class="h-[38px] w-[38px] flex items-center justify-center rounded-lg border border-black/10 dark:border-white/10 bg-card dark:bg-white/[0.04] hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground dark:hover:text-white transition-all cursor-pointer disabled:opacity-40 shrink-0 self-end"
            title="Joindre une image (PNG, JPG, WebP, SVG, max 5Mo)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          <textarea
            bind:this={promptTextareaRef}
            bind:value={promptInput}
            oninput={adjustPromptTextareaHeight}
            onkeydown={handlePromptKeydown}
            onpaste={handleChatPaste}
            rows="1"
            placeholder={attachedImage ? "Ajoutez des instructions pour cette image..." : (promptQuota.remaining > 0 ? "Demandez une modification ou collez une image..." : "Quota quotidien atteint — Cliquez sur Recharger")}
            disabled={isThinking || promptQuota.remaining <= 0}
            class="flex-1 rounded-lg border border-black/10 dark:border-white/10 bg-card dark:bg-white/[0.04] px-3.5 py-2 text-xs text-foreground dark:text-white placeholder:text-muted-foreground/50 focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-[border-color,box-shadow] disabled:opacity-50 resize-none min-h-[38px] max-h-[160px] leading-relaxed select-text"
          ></textarea>
          <button
            type="submit"
            disabled={(!promptInput.trim() && !attachedImage) || isThinking || promptQuota.remaining <= 0}
            class="focus-ring h-[38px] px-4 rounded-lg bg-brand text-white text-xs font-medium uppercase tracking-wider hover:bg-brand/90 transition-all cursor-pointer disabled:opacity-40 shrink-0 self-end flex items-center justify-center"
          >
            Envoyer
          </button>
        </form>

        <!-- Quota Status Bar -->
        <div class="px-3 py-1.5 border-t border-black/5 dark:border-white/10 bg-surface/30 dark:bg-background flex items-center justify-between text-[10px] font-mono text-muted-foreground">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full {promptQuota.remaining > 0 ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
            <span>Prompts ({promptQuota.plan}) :</span>
            <span class="font-semibold {promptQuota.remaining > 0 ? 'text-foreground dark:text-neutral-200' : 'text-amber-600'}">
              {promptQuota.remaining} restant{promptQuota.remaining > 1 ? 's' : ''}
              {#if promptQuota.extraPrompts && promptQuota.extraPrompts > 0}
                <span class="text-brand dark:text-indigo-400 font-normal">({promptQuota.extraPrompts} extra)</span>
              {/if}
            </span>
          </div>
          <button
            type="button"
            onclick={() => showTopupModal = true}
            class="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand/10 hover:bg-brand/20 text-brand font-medium transition-colors border border-brand/20"
          >
            ⚡ Recharger
          </button>
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
        onclick={() => {
          showEditor = true;
          if (openTabs.length === 0) {
            showExplorer = true;
          }
        }}
        class="hidden lg:flex w-9 h-full border-r border-black/10 bg-surface/60 hover:bg-surface flex-col items-center justify-start py-4 gap-3 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer group"
        title={openTabs.length === 0 ? "Déplier l'explorateur de fichiers" : "Déplier l'éditeur de code"}
      >
        <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {#if openTabs.length === 0}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          {/if}
        </svg>
        <span class="[writing-mode:vertical-lr] rotate-180 uppercase tracking-widest text-[10px] font-medium group-hover:text-brand transition-colors">
          {openTabs.length === 0 ? "Fichiers" : "Code"}
        </span>
      </button>
    {/if}

    <!-- Center Panel: Code Editor (Kept mounted for CodeMirror persistence) -->
    <div
      class="{showEditor ? 'flex' : 'hidden'} flex-col h-full overflow-hidden border-r border-black/10 dark:border-white/10 bg-surface/30 dark:bg-[#121217] {showPreview ? 'shrink-0' : 'flex-1 w-full min-w-0'}"
      style={showPreview ? `width: ${editorWidth}px; max-width: calc(100% - 320px); min-width: 320px;` : ''}
    >
      <!-- File Tabs & Editor Controls -->
      <div class="h-10 border-b border-black/10 dark:border-white/10 bg-surface/60 dark:bg-[#16161c] flex items-center justify-between px-2 text-xs font-mono shrink-0 gap-2">
        {#if openTabs.length === 0}
          <div class="flex items-center gap-2 px-1 text-foreground font-medium text-xs">
            <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span class="font-semibold text-xs text-foreground/90 dark:text-neutral-200">Explorateur de fichiers</span>
            <span class="text-[10px] text-muted-foreground">({Object.keys(files).length} fichiers)</span>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button
              onclick={loadTenantFiles}
              class="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground dark:hover:text-white transition-colors cursor-pointer"
              title="Recharger l'arborescence"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onclick={() => showEditor = false}
              class="p-1 rounded hover:bg-black/5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Masquer l'explorateur de fichiers"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {:else}
          <button
            onclick={() => showExplorer = !showExplorer}
            class="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground dark:hover:text-white transition-colors cursor-pointer shrink-0 {showExplorer ? 'bg-black/5 dark:bg-white/10 text-brand dark:text-white' : ''}"
            title={showExplorer ? "Masquer l'explorateur de fichiers" : "Afficher l'explorateur de fichiers"}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>

          <!-- Horizontally Scrollable Tab Strip with Close Buttons -->
          <div
            class="flex-1 flex items-center gap-1 overflow-x-auto min-w-0 py-1 select-none no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
                class="group flex items-center gap-1.5 px-2.5 py-1 rounded-t border-b-2 transition-all shrink-0 cursor-pointer text-xs {activeFile === path ? 'border-brand text-brand dark:text-white dark:border-brand bg-card dark:bg-[#1a1a22] font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'}"
                role="tab"
                aria-selected={activeFile === path}
                tabindex="0"
                onclick={() => switchFile(path)}
                onkeydown={(e) => e.key === 'Enter' && switchFile(path)}
                title={path}
              >
                {#if path.endsWith('.svelte')}
                  <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-orange-500/15 text-orange-600 dark:bg-orange-500/25 dark:text-orange-400 shrink-0">S</span>
                {:else if path.endsWith('.ts')}
                  <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-blue-500/15 text-blue-600 dark:bg-blue-500/25 dark:text-blue-400 shrink-0">TS</span>
                {:else if path.endsWith('.js') || path.endsWith('.mjs')}
                  <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-amber-500/15 text-amber-600 dark:bg-amber-500/25 dark:text-amber-400 shrink-0">JS</span>
                {:else if path.endsWith('.json')}
                  <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/25 dark:text-emerald-400 shrink-0">{"{}"}</span>
                {:else if path.endsWith('.html')}
                  <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-rose-500/15 text-rose-600 dark:bg-rose-500/25 dark:text-rose-400 shrink-0">&lt;&gt;</span>
                {:else if path.endsWith('.css')}
                  <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-purple-500/15 text-purple-600 dark:bg-purple-500/25 dark:text-purple-400 shrink-0">#</span>
                {:else if path.endsWith('.db') || path.endsWith('.sqlite') || path.endsWith('.sqlite3')}
                  <span class="w-3.5 h-3.5 flex items-center justify-center text-[7px] font-bold rounded bg-cyan-500/15 text-cyan-600 dark:bg-cyan-500/25 dark:text-cyan-400 shrink-0">DB</span>
                {:else if path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.gif') || path.endsWith('.webp') || path.endsWith('.ico')}
                  <span class="w-3.5 h-3.5 flex items-center justify-center text-[7px] font-bold rounded bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/25 dark:text-indigo-400 shrink-0">IMG</span>
                {:else if path.endsWith('.svg')}
                  <span class="w-3.5 h-3.5 flex items-center justify-center text-[7px] font-bold rounded bg-violet-500/15 text-violet-600 dark:bg-violet-500/25 dark:text-violet-400 shrink-0">SVG</span>
                {:else if path.endsWith('.md')}
                  <span class="w-3.5 h-3.5 flex items-center justify-center text-[7px] font-bold rounded bg-teal-500/15 text-teal-600 dark:bg-teal-500/25 dark:text-teal-400 shrink-0">MD</span>
                {:else}
                  <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-black/10 dark:bg-white/10 text-muted-foreground dark:text-neutral-400 shrink-0">📄</span>
                {/if}

                <span class="truncate max-w-[130px]">{file.name}</span>

                <!-- Close Tab Button -->
                <button
                  type="button"
                  onclick={(e) => closeTab(e, path)}
                  class="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground dark:hover:text-white opacity-50 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
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
            {#if activeFileCategory === 'code'}
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
            {:else if activeFileCategory === 'sqlite'}
              <span class="px-2.5 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-700 text-[10px] font-mono font-medium">
                Base SQLite
              </span>
            {:else if activeFileCategory === 'image'}
              <span class="px-2.5 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-700 text-[10px] font-mono font-medium">
                Aperçu Image
              </span>
            {:else}
              <span class="px-2.5 py-1 rounded-full border border-black/10 bg-black/5 text-muted-foreground text-[10px] font-mono">
                Binaire protégé
              </span>
            {/if}
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
        {/if}
      </div>

      <!-- Main Editor Area with Tree-based Explorer Sidebar -->
      <div class="flex-1 flex overflow-hidden min-h-0">
        <!-- File Explorer Sidebar -->
        {#if showExplorer || openTabs.length === 0}
          <div class="{openTabs.length === 0 ? 'w-full flex-1 border-r-0' : 'w-48 sm:w-52 border-r border-black/10 dark:border-white/10'} bg-surface/30 dark:bg-[#121217] flex flex-col shrink-0 overflow-hidden select-none">
            <!-- Explorer Header & Filter -->
            <div class="p-2 border-b border-black/10 dark:border-white/10 space-y-1.5 shrink-0 bg-transparent">
              {#if openTabs.length > 0}
                <div class="flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  <span class="flex items-center gap-1.5 font-semibold text-foreground/80 dark:text-neutral-300">
                    <svg class="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span>Explorateur</span>
                  </span>
                  <div class="flex items-center gap-1">
                    <span class="text-[10px] text-muted-foreground">({Object.keys(files).length})</span>
                    <button
                      onclick={loadTenantFiles}
                      class="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground dark:hover:text-white transition-colors cursor-pointer"
                      title="Recharger l'arborescence"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
              {/if}
              <div class="relative">
                <input
                  type="text"
                  bind:value={fileSearchQuery}
                  placeholder="Filtrer les fichiers..."
                  class="w-full bg-black/5 dark:bg-white/[0.06] border border-black/10 dark:border-white/10 rounded px-2 py-1 text-[11px] font-mono placeholder:text-muted-foreground/60 text-foreground dark:text-white focus:outline-none focus:border-brand dark:focus:border-brand/70 transition-colors"
                />
                {#if fileSearchQuery}
                  <button
                    onclick={() => fileSearchQuery = ""}
                    class="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[10px] p-0.5 cursor-pointer"
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
                    class="w-full text-left h-[26px] flex items-center gap-1.5 bg-transparent hover:bg-black/5 dark:hover:bg-white/[0.06] text-muted-foreground hover:text-foreground dark:hover:text-white transition-colors cursor-pointer text-xs group select-none focus:outline-none rounded-none border-0"
                    style="padding-left: {node.depth * 14 + 10}px; padding-right: 8px;"
                    title={node.path}
                  >
                    <svg class="w-3 h-3 text-muted-foreground/70 group-hover:text-foreground dark:group-hover:text-white transition-transform duration-150 shrink-0 {isCollapsed ? '' : 'rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
                    </svg>

                    {#if isCollapsed}
                      <svg class="w-3.5 h-3.5 text-amber-500/90 dark:text-amber-400/90 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                    {:else}
                      <svg class="w-3.5 h-3.5 text-amber-500/90 dark:text-amber-400/90 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v4.5A1.5 1.5 0 013.5 18H4a2 2 0 01-2-2V6z" clip-rule="evenodd" />
                        <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H8a2 2 0 01-2-2v-2z" />
                      </svg>
                    {/if}

                    <span class="truncate font-medium text-foreground/90 dark:text-neutral-200 group-hover:text-foreground dark:group-hover:text-white text-[11px]">{node.name}</span>
                  </button>

                  {#if !isCollapsed}
                    <div class="space-y-0">
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
                  class="w-full text-left h-[26px] flex items-center gap-1.5 transition-colors cursor-pointer text-xs group focus:outline-none rounded-none border-0 {activeFile === node.path ? 'bg-black/10 dark:bg-white/[0.12] text-foreground dark:text-white font-medium' : 'bg-transparent text-muted-foreground hover:bg-black/5 dark:hover:bg-white/[0.06] hover:text-foreground dark:hover:text-white'}"
                  style="padding-left: {node.depth * 14 + 24}px; padding-right: 8px;"
                  title={node.path}
                >
                  {#if node.path.endsWith('.svelte')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-orange-500/15 text-orange-600 dark:bg-orange-500/25 dark:text-orange-400 shrink-0">S</span>
                  {:else if node.path.endsWith('.ts')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-blue-500/15 text-blue-600 dark:bg-blue-500/25 dark:text-blue-400 shrink-0">TS</span>
                  {:else if node.path.endsWith('.js') || node.path.endsWith('.mjs')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-amber-500/15 text-amber-600 dark:bg-amber-500/25 dark:text-amber-400 shrink-0">JS</span>
                  {:else if node.path.endsWith('.json')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/25 dark:text-emerald-400 shrink-0">{"{}"}</span>
                  {:else if node.path.endsWith('.html')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-rose-500/15 text-rose-600 dark:bg-rose-500/25 dark:text-rose-400 shrink-0">&lt;&gt;</span>
                  {:else if node.path.endsWith('.css')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-purple-500/15 text-purple-600 dark:bg-purple-500/25 dark:text-purple-400 shrink-0">#</span>
                  {:else if node.path.endsWith('.db') || node.path.endsWith('.sqlite') || node.path.endsWith('.sqlite3')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[7px] font-bold rounded bg-cyan-500/15 text-cyan-600 dark:bg-cyan-500/25 dark:text-cyan-400 shrink-0">DB</span>
                  {:else if node.path.endsWith('.png') || node.path.endsWith('.jpg') || node.path.endsWith('.jpeg') || node.path.endsWith('.gif') || node.path.endsWith('.webp') || node.path.endsWith('.ico')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[7px] font-bold rounded bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/25 dark:text-indigo-400 shrink-0">IMG</span>
                  {:else if node.path.endsWith('.svg')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[7px] font-bold rounded bg-violet-500/15 text-violet-600 dark:bg-violet-500/25 dark:text-violet-400 shrink-0">SVG</span>
                  {:else if node.path.endsWith('.md')}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[7px] font-bold rounded bg-teal-500/15 text-teal-600 dark:bg-teal-500/25 dark:text-teal-400 shrink-0">MD</span>
                  {:else}
                    <span class="w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded bg-black/10 dark:bg-white/10 text-muted-foreground dark:text-neutral-400 shrink-0">📄</span>
                  {/if}

                  <span class="truncate text-[11px] {activeFile === node.path ? 'font-medium text-foreground dark:text-white' : 'text-foreground/80 dark:text-neutral-300 group-hover:text-foreground dark:group-hover:text-white'}">{node.name}</span>
                </button>
              {/if}
            {/snippet}

            <!-- Tree View Nodes -->
            <div class="flex-1 overflow-y-auto overflow-x-hidden p-0 py-1 font-mono text-xs space-y-0 bg-transparent">
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

        <!-- CodeMirror Editor Container (Kept mounted for CodeMirror persistence) -->
        <div class="flex-1 overflow-hidden bg-card relative {openTabs.length > 0 && activeFileCategory === 'code' ? 'flex flex-col' : 'hidden'}" bind:this={editorContainer}>
          {#if editorSaved}
            <div class="absolute bottom-3 right-3 bg-foreground text-background text-[11px] font-mono px-3 py-1.5 rounded-full shadow-retro z-20 pointer-events-none flex items-center gap-1.5">
              <span>✓ Sauvegardé</span>
            </div>
          {/if}
        </div>

        {#if openTabs.length > 0}
          <!-- Dedicated SQLite Inspector -->
          {#if activeFileCategory === 'sqlite'}
            <div class="flex-1 overflow-hidden">
              <SqliteInspector
                projectSlug={projectSlug}
                dbPath={activeFile}
                fileSize={files[activeFile]?.size || 0}
              />
            </div>
          {/if}

          <!-- Dedicated Image Previewer -->
          {#if activeFileCategory === 'image'}
            <div class="flex-1 overflow-hidden">
              <ImagePreviewer
                path={activeFile}
                name={files[activeFile]?.name || activeFile.split('/').pop() || activeFile}
                size={files[activeFile]?.size || 0}
                dataUrl={files[activeFile]?.dataUrl}
                previewUrl={files[activeFile]?.previewUrl}
              />
            </div>
          {/if}

          <!-- Protected Binary / Media View -->
          {#if activeFileCategory === 'binary' || activeFileCategory === 'media'}
            <div class="flex-1 overflow-hidden flex flex-col items-center justify-center p-8 text-center font-mono text-xs bg-card">
              <div class="w-12 h-12 rounded-2xl bg-black/5 flex items-center justify-center text-2xl mb-3">
                📦
              </div>
              <p class="font-semibold text-foreground text-sm mb-1">{files[activeFile]?.name || activeFile}</p>
              <p class="text-muted-foreground text-[11px] max-w-sm mb-4">
                Fichier binaire protégé ({activeFile.split('.').pop()?.toUpperCase() || 'BIN'}). La modification directe en texte brut est désactivée pour éviter toute altération.
              </p>
              <div class="px-3 py-1.5 rounded-full bg-surface border border-black/10 text-[11px] text-muted-foreground">
                Taille : {((files[activeFile]?.size || 0) / 1024).toFixed(1)} KB
              </div>
            </div>
          {/if}
        {/if}
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
        onclick={() => {
          showPreview = true;
          if (showChat && showEditor && typeof window !== "undefined" && window.innerWidth < 1440) {
            showExplorer = false;
          }
        }}
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
      <div class="h-10 border-b border-black/10 dark:border-white/10 bg-surface/60 dark:bg-[#16161c] flex items-center justify-between px-3 text-xs font-mono shrink-0 gap-2 overflow-x-auto no-scrollbar">
        <!-- Viewport & Environment Switchers -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- Viewport Switcher: ONLY Desktop or Mobile -->
          <div class="flex items-center gap-[2px] bg-surface/80 dark:bg-[#121217] p-[2px] rounded-full border border-black/10 dark:border-white/10 shrink-0 shadow-retro-sm dark:shadow-none">
            <button
              onclick={() => viewportMode = "desktop"}
              class="px-2.5 py-1 rounded-full flex items-center gap-1.5 transition-all cursor-pointer {viewportMode === 'desktop' ? 'bg-brand text-white font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground dark:hover:text-white'}"
              title="Vue Bureau"
            >
              <span>🖥</span>
              <span class="text-[11px]">Bureau</span>
            </button>
            <button
              onclick={() => viewportMode = "mobile"}
              class="px-2.5 py-1 rounded-full flex items-center gap-1.5 transition-all cursor-pointer {viewportMode === 'mobile' ? 'bg-brand text-white font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground dark:hover:text-white'}"
              title="Vue Mobile"
            >
              <span>📱</span>
              <span class="text-[11px]">Mobile</span>
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- Fullscreen / Expand preview toggle -->
          <button
            onclick={togglePreviewFullscreen}
            class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors cursor-pointer shrink-0"
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
            class="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-black/5 cursor-pointer shrink-0"
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
            class="text-[11px] text-brand hover:underline font-mono inline-flex items-center gap-1 whitespace-nowrap shrink-0 px-1 py-0.5 rounded hover:bg-brand/5"
            title="Ouvrir l'aperçu du code dans un nouvel onglet"
          >
            <span>Ouvrir</span><span class="text-xs leading-none">↗</span>
          </a>

          <button
            onclick={() => showPreview = false}
            class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors cursor-pointer shrink-0"
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

{#if previewImageModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
    onclick={() => previewImageModal = null}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
      <button
        type="button"
        class="absolute -top-10 right-0 text-white hover:text-white/80 p-2 text-xs font-mono cursor-pointer flex items-center gap-1.5 bg-black/40 hover:bg-black/60 rounded-md px-3 transition-colors"
        onclick={() => previewImageModal = null}
      >
        <span>✕</span> Fermer
      </button>
      <img
        src={resolveImageUrl(previewImageModal)}
        alt="Image agrandie"
        class="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain border border-white/20 cursor-default"
        onclick={(e) => e.stopPropagation()}
      />
    </div>
  </div>
{/if}

{#if showTopupModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
    onclick={() => showTopupModal = false}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="retro-card bg-card text-foreground rounded-2xl shadow-2xl border border-black/15 max-w-xl w-full p-6 cursor-default relative overflow-hidden"
      onclick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        class="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-sm font-mono cursor-pointer p-1.5 rounded-md hover:bg-black/5 transition-colors"
        onclick={() => showTopupModal = false}
      >
        ✕
      </button>

      <div class="mb-2 pr-8">
        <h3 class="text-lg font-bold font-display text-foreground">Recharger vos Prompts Studio</h3>
        <p class="text-xs text-muted-foreground">Continuez à concevoir et itérer sur votre site sans attendre.</p>
      </div>

      {#if promptQuota.remaining <= 0}
        <div class="my-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>Votre quota quotidien gratuit de <strong>{promptQuota.limit} prompts</strong> est atteint pour aujourd'hui. Rechargez pour continuer immédiatement :</span>
        </div>
      {:else}
        <div class="my-4 p-3 rounded-lg bg-black/5 border border-black/10 text-xs text-muted-foreground flex items-center justify-between">
          <span>Solde actuel : <strong>{promptQuota.remaining} prompt{promptQuota.remaining > 1 ? 's' : ''}</strong></span>
          <span class="text-[11px] text-emerald-600 font-mono font-medium">Prêt à l'emploi</span>
        </div>
      {/if}

      {#if topupError}
        <div class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 text-xs flex items-center justify-between">
          <span>{topupError}</span>
          <button type="button" onclick={() => topupError = null} class="text-red-700 font-mono text-[11px]">✕</button>
        </div>
      {/if}

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
        <!-- Starter Pack -->
        <div class="rounded-xl border border-black/10 p-4 bg-surface flex flex-col justify-between hover:border-brand/40 transition-all shadow-xs">
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Starter</div>
            <div class="text-2xl font-bold font-display text-foreground">5 €</div>
            <div class="text-xs text-muted-foreground font-mono mt-0.5">20 prompts</div>
            <div class="text-[10px] text-muted-foreground/80 mt-1">0,25 € / prompt</div>
          </div>
          <button
            type="button"
            disabled={topupLoading !== null}
            onclick={() => handleTopup("starter")}
            class="mt-4 w-full py-2 px-3 rounded-lg border border-black/15 bg-card hover:bg-surface text-foreground text-xs font-medium transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {#if topupLoading === "starter"}
              Chargement...
            {:else}
              Choisir 20
            {/if}
          </button>
        </div>

        <!-- Creator Pack (Popular) -->
        <div class="rounded-xl border-2 border-brand p-4 bg-brand/[0.03] flex flex-col justify-between relative shadow-sm">
          <div class="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-brand text-white text-[9px] font-bold uppercase tracking-wider rounded-full shadow-xs">
            Populaire
          </div>
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-brand font-semibold mb-1">Créateur</div>
            <div class="text-2xl font-bold font-display text-foreground">10 €</div>
            <div class="text-xs text-foreground font-medium font-mono mt-0.5">50 prompts</div>
            <div class="text-[10px] text-muted-foreground/80 mt-1">0,20 € / prompt</div>
          </div>
          <button
            type="button"
            disabled={topupLoading !== null}
            onclick={() => handleTopup("creator")}
            class="mt-4 w-full py-2 px-3 rounded-lg bg-brand hover:bg-brand/90 text-white text-xs font-semibold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {#if topupLoading === "creator"}
              Chargement...
            {:else}
              Choisir 50
            {/if}
          </button>
        </div>

        <!-- Agency Pack -->
        <div class="rounded-xl border border-black/10 p-4 bg-surface flex flex-col justify-between hover:border-brand/40 transition-all shadow-xs">
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Agence</div>
            <div class="text-2xl font-bold font-display text-foreground">25 €</div>
            <div class="text-xs text-muted-foreground font-mono mt-0.5">150 prompts</div>
            <div class="text-[10px] text-emerald-600 font-semibold mt-1">0,17 € / prompt</div>
          </div>
          <button
            type="button"
            disabled={topupLoading !== null}
            onclick={() => handleTopup("agency")}
            class="mt-4 w-full py-2 px-3 rounded-lg border border-black/15 bg-card hover:bg-surface text-foreground text-xs font-medium transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {#if topupLoading === "agency"}
              Chargement...
            {:else}
              Choisir 150
            {/if}
          </button>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-black/10 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
        <span class="flex items-center gap-1.5">
          <span>🔒</span> Paiement Stripe sécurisé
        </span>
        <span>Sans date d'expiration</span>
      </div>
    </div>
  </div>
{/if}

{#if topupSuccessMessage}
  <div class="fixed top-4 right-4 z-50 max-w-md p-4 rounded-xl bg-emerald-600 text-white shadow-xl flex items-center justify-between gap-3">
    <div class="flex items-center gap-2.5 text-xs font-medium">
      <span class="text-lg">🎉</span>
      <span>{topupSuccessMessage}</span>
    </div>
    <button
      type="button"
      class="text-white/80 hover:text-white text-sm font-mono cursor-pointer"
      onclick={() => topupSuccessMessage = null}
    >
      ✕
    </button>
  </div>
{/if}

<!-- Domain Management Modal -->
{#if isDomainModalOpen}
  <DomainModal
    isOpen={isDomainModalOpen}
    tenant={{
      id: tenant.id || 1,
      slug: projectSlug,
      email: tenant.email,
      brand_name: tenant.brand_name,
      domain: tenant.domain,
      subdomain: tenant.subdomain,
      custom_domain: currentCustomDomain,
      stalwart_username: tenant.stalwart_username,
      stalwart_password: tenant.stalwart_password,
    }}
    onclose={() => isDomainModalOpen = false}
    onconnected={(domain) => {
      currentCustomDomain = domain;
    }}
    onunlinked={() => {
      currentCustomDomain = null;
    }}
  />
{/if}

