<script lang="ts">
  interface Props {
    isOpen: boolean;
    projectSlug: string;
    onClose: () => void;
  }

  let { isOpen, projectSlug, onClose }: Props = $props();

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedBase = $state("publish");
  let selectedTarget = $state("working");
  let copied = $state(false);

  interface CommitInfo {
    hash: string;
    shortHash: string;
    author: string;
    timestamp: number;
    date: string;
    message: string;
    isPublish: boolean;
  }

  interface ChangedFile {
    path: string;
    status: "modified" | "added" | "deleted" | "renamed";
    additions: number;
    deletions: number;
  }

  interface DiffData {
    baseRef: string;
    baseShort?: string;
    baseMsg?: string;
    baseDate?: string;
    targetRef: string;
    stats: {
      filesChanged: number;
      totalAdditions: number;
      totalDeletions: number;
    };
    files: ChangedFile[];
    diff: string;
  }

  let commits = $state<CommitInfo[]>([]);
  let publishedHash = $state<string>("");
  let hasUncommitted = $state<boolean>(false);
  let diffData = $state<DiffData | null>(null);
  let activeFileFilter = $state<string | null>(null);

  // Load commit list and initial diff when modal opens
  $effect(() => {
    if (isOpen && projectSlug) {
      loadCommitsAndDiff();
    }
  });

  async function loadCommitsAndDiff() {
    loading = true;
    error = null;
    try {
      // 1. Fetch recent commits list
      const commitRes = await fetch(
        `/api/studio/diff?slug=${encodeURIComponent(projectSlug)}&action=commits`,
      );
      if (commitRes.ok) {
        const cData = await commitRes.json();
        if (cData.success) {
          commits = cData.commits || [];
          publishedHash = cData.publishedHash || "";
          hasUncommitted = Boolean(cData.hasUncommitted);
        }
      }

      // 2. Fetch diff for current selectedBase and selectedTarget
      await fetchDiff();
    } catch (err: any) {
      error = err.message || "Erreur lors du chargement des différences Git.";
    } finally {
      loading = false;
    }
  }

  async function fetchDiff() {
    loading = true;
    error = null;
    try {
      const url = `/api/studio/diff?slug=${encodeURIComponent(projectSlug)}&base=${encodeURIComponent(selectedBase)}&target=${encodeURIComponent(selectedTarget)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossible de récupérer le diff.");
      }
      diffData = data;
    } catch (err: any) {
      error = err.message || "Erreur lors du calcul du diff.";
    } finally {
      loading = false;
    }
  }

  function handleBaseChange(newBase: string) {
    selectedBase = newBase;
    fetchDiff();
  }

  function handleTargetChange(newTarget: string) {
    selectedTarget = newTarget;
    fetchDiff();
  }

  async function copyDiff() {
    if (!diffData?.diff) return;
    try {
      await navigator.clipboard.writeText(diffData.diff);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = diffData.diff;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  }

  function scrollToDiff(filePath: string) {
    activeFileFilter = filePath;
    const el = document.getElementById(`diff-file-${btoa(filePath).replace(/=/g, "")}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Parse raw unified diff into per-file chunks
  interface ParsedFileDiff {
    oldFile: string;
    newFile: string;
    displayPath: string;
    chunks: Array<{
      header: string;
      lines: Array<{
        type: "add" | "del" | "ctx" | "hunk";
        text: string;
        oldNum?: number;
        newNum?: number;
      }>;
    }>;
  }

  let parsedFiles = $derived.by<ParsedFileDiff[]>(() => {
    if (!diffData?.diff) return [];
    const files: ParsedFileDiff[] = [];
    const rawBlocks = diffData.diff.split(/(?=^diff --git )/m);

    for (const block of rawBlocks) {
      if (!block.trim()) continue;
      const lines = block.split("\n");
      let oldFile = "";
      let newFile = "";

      // Match diff --git a/... b/...
      const gitMatch = lines[0]?.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (gitMatch) {
        oldFile = gitMatch[1];
        newFile = gitMatch[2];
      }

      const displayPath = newFile || oldFile || "Fichier";
      const chunks: ParsedFileDiff["chunks"] = [];
      let currentChunk: ParsedFileDiff["chunks"][0] | null = null;
      let oldNum = 1;
      let newNum = 1;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        // Hunk header e.g. @@ -10,7 +10,7 @@
        const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
        if (hunkMatch) {
          oldNum = parseInt(hunkMatch[1], 10);
          newNum = parseInt(hunkMatch[2], 10);
          currentChunk = {
            header: line,
            lines: [{ type: "hunk", text: line }],
          };
          chunks.push(currentChunk);
          continue;
        }

        if (!currentChunk) continue;

        if (line.startsWith("+") && !line.startsWith("+++")) {
          currentChunk.lines.push({
            type: "add",
            text: line.slice(1),
            newNum: newNum++,
          });
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          currentChunk.lines.push({
            type: "del",
            text: line.slice(1),
            oldNum: oldNum++,
          });
        } else if (line.startsWith(" ")) {
          currentChunk.lines.push({
            type: "ctx",
            text: line.slice(1),
            oldNum: oldNum++,
            newNum: newNum++,
          });
        }
      }

      if (chunks.length > 0) {
        files.push({
          oldFile,
          newFile,
          displayPath,
          chunks,
        });
      }
    }

    return files;
  });
</script>

{#if isOpen}
  <!-- Modal Overlay -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <!-- Modal Card -->
    <div
      class="w-full max-w-5xl h-[88vh] rounded-2xl border border-black/15 dark:border-white/15 bg-card dark:bg-[#14141c] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 select-text"
      role="dialog"
      aria-modal="true"
      aria-label="Différences Git"
    >
      <!-- Modal Header -->
      <div class="px-5 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-black/[0.02] dark:bg-white/[0.02] shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-brand/10 dark:bg-brand/20 flex items-center justify-center text-brand">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold text-foreground dark:text-white tracking-wide uppercase">
                Différences Git
              </h2>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/5 dark:bg-white/10 text-muted-foreground">
                {projectSlug}
              </span>
            </div>
            <p class="text-xs text-muted-foreground mt-0.5">
              Inspectez et comparez les modifications apportées à votre site web.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          {#if diffData?.diff}
            <button
              onclick={copyDiff}
              class="focus-ring px-2.5 py-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-card dark:bg-white/[0.05] hover:bg-surface dark:hover:bg-white/10 text-foreground dark:text-white text-xs font-medium transition-all inline-flex items-center gap-1.5 cursor-pointer"
              title="Copier le diff unifié complet"
            >
              {#if copied}
                <svg class="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span class="text-emerald-500 font-mono">Copié !</span>
              {:else}
                <svg class="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                <span>Copier diff</span>
              {/if}
            </button>
          {/if}

          <button
            onclick={fetchDiff}
            disabled={loading}
            class="focus-ring p-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-card dark:bg-white/[0.05] hover:bg-surface dark:hover:bg-white/10 text-muted-foreground hover:text-foreground dark:hover:text-white transition-all cursor-pointer disabled:opacity-50"
            title="Rafraîchir les différences"
          >
            <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <button
            onclick={onClose}
            class="focus-ring p-1.5 rounded-lg text-muted-foreground hover:text-foreground dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer ml-1"
            title="Fermer (Échap)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Controls & Selectors Bar -->
      <div class="px-5 py-3 border-b border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div class="flex flex-wrap items-center gap-3">
          <!-- Base Selector -->
          <div class="flex items-center gap-2 text-xs">
            <span class="text-muted-foreground font-medium">Comparer depuis :</span>
            <div class="relative">
              <select
                value={selectedBase}
                onchange={(e) => handleBaseChange((e.target as HTMLSelectElement).value)}
                class="appearance-none bg-card dark:bg-[#1a1a24] border border-black/15 dark:border-white/15 rounded-lg pl-3 pr-8 py-1.5 text-xs text-foreground dark:text-white font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer"
              >
                <option value="publish">
                  ⭐ Dernière publication {diffData?.baseShort ? `(${diffData.baseShort})` : ''}
                </option>
                {#if hasUncommitted}
                  <option value="HEAD">
                    ⚡ Modifications en cours (vs Dernier commit)
                  </option>
                {/if}
                <optgroup label="Historique des commits">
                  {#each commits as c}
                    <option value={c.hash}>
                      {c.shortHash} — {c.message.slice(0, 45)}{c.message.length > 45 ? '...' : ''} ({c.date})
                    </option>
                  {/each}
                </optgroup>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Target Selector -->
          <div class="flex items-center gap-2 text-xs">
            <span class="text-muted-foreground font-medium">Jusqu'à :</span>
            <div class="inline-flex rounded-lg p-0.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs">
              <button
                type="button"
                onclick={() => handleTargetChange("working")}
                class="px-2.5 py-1 rounded-md transition-all font-medium {selectedTarget === 'working' ? 'bg-card dark:bg-[#20202c] text-foreground dark:text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'}"
              >
                Fichiers actuels
              </button>
              <button
                type="button"
                onclick={() => handleTargetChange("HEAD")}
                class="px-2.5 py-1 rounded-md transition-all font-medium {selectedTarget === 'HEAD' ? 'bg-card dark:bg-[#20202c] text-foreground dark:text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'}"
              >
                Dernier commit (HEAD)
              </button>
            </div>
          </div>
        </div>

        <!-- Summary Stats Pills -->
        {#if diffData?.stats}
          <div class="flex items-center gap-2 text-xs font-mono">
            <span class="px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 text-muted-foreground border border-black/10 dark:border-white/10">
              <strong class="text-foreground dark:text-white">{diffData.stats.filesChanged}</strong> fichier{diffData.stats.filesChanged > 1 ? 's' : ''}
            </span>
            <span class="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              +{diffData.stats.totalAdditions}
            </span>
            <span class="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              -{diffData.stats.totalDeletions}
            </span>
          </div>
        {/if}
      </div>

      <!-- Main Diff Content Body -->
      <div class="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {#if loading && !diffData}
          <div class="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div class="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-3"></div>
            <p class="text-xs text-muted-foreground font-mono">Calcul des différences Git en cours...</p>
          </div>
        {:else if error}
          <div class="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div class="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 class="text-sm font-semibold text-foreground dark:text-white mb-1">Erreur de calcul du diff</h3>
            <p class="text-xs text-rose-500 max-w-md font-mono">{error}</p>
            <button
              onclick={fetchDiff}
              class="mt-4 px-4 py-1.5 rounded-lg bg-brand text-white text-xs font-medium cursor-pointer hover:bg-brand/90"
            >
              Réessayer
            </button>
          </div>
        {:else if !diffData?.files?.length}
          <!-- Empty State: No changes detected -->
          <div class="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div class="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 class="text-sm font-semibold text-foreground dark:text-white mb-1">Aucune différence détectée</h3>
            <p class="text-xs text-muted-foreground max-w-md">
              Les fichiers actuels sont strictement identiques à la version sélectionnée ({diffData?.baseShort || selectedBase}).
            </p>
          </div>
        {:else}
          <!-- Files Sidebar List -->
          <div class="w-full md:w-72 border-b md:border-b-0 md:border-r border-black/10 dark:border-white/10 flex flex-col bg-black/[0.01] dark:bg-white/[0.01] shrink-0 overflow-y-auto max-h-48 md:max-h-none">
            <div class="px-3.5 py-2.5 text-[11px] font-semibold text-muted-foreground tracking-wider uppercase border-b border-black/5 dark:border-white/5 flex items-center justify-between">
              <span>Fichiers modifiés ({diffData.files.length})</span>
            </div>
            <div class="p-2 space-y-1">
              {#each diffData.files as file}
                <button
                  type="button"
                  onclick={() => scrollToDiff(file.path)}
                  class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center justify-between gap-2 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer {activeFileFilter === file.path ? 'bg-brand/10 dark:bg-brand/20 text-brand font-semibold' : 'text-foreground dark:text-white'}"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="w-4 text-center font-bold text-[10px] {file.status === 'added' ? 'text-emerald-500' : file.status === 'deleted' ? 'text-rose-500' : 'text-amber-500'}">
                      {file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : 'M'}
                    </span>
                    <span class="truncate text-[11px]">{file.path}</span>
                  </div>
                  <div class="flex items-center gap-1 text-[10px] shrink-0">
                    {#if file.additions > 0}
                      <span class="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
                    {/if}
                    {#if file.deletions > 0}
                      <span class="text-rose-600 dark:text-rose-400">-{file.deletions}</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>

          <!-- Diff Viewer Panes -->
          <div class="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 space-y-6">
            {#each parsedFiles as file}
              <div
                id="diff-file-{btoa(file.displayPath).replace(/=/g, '')}"
                class="rounded-xl border border-black/10 dark:border-white/10 bg-card dark:bg-[#181822] overflow-hidden shadow-xs"
              >
                <!-- File Diff Header -->
                <div class="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] border-b border-black/10 dark:border-white/10 flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <svg class="w-4 h-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span class="font-mono text-xs font-semibold text-foreground dark:text-white truncate">
                      {file.displayPath}
                    </span>
                  </div>
                </div>

                <!-- Unified Diff Lines Block -->
                <div class="font-mono text-[11px] leading-relaxed overflow-x-auto select-text">
                  {#each file.chunks as chunk}
                    {#each chunk.lines as line}
                      {#if line.type === "hunk"}
                        <div class="px-4 py-1 bg-brand/5 dark:bg-brand/10 text-brand dark:text-brand-light text-[10px] font-semibold border-y border-brand/10">
                          {line.text}
                        </div>
                      {:else if line.type === "add"}
                        <div class="flex items-start bg-emerald-500/[0.12] dark:bg-emerald-500/[0.15] text-emerald-900 dark:text-emerald-200 hover:bg-emerald-500/[0.18]">
                          <span class="w-10 px-2 py-0.5 text-right text-emerald-600/70 dark:text-emerald-400/50 select-none shrink-0 border-r border-emerald-500/20"></span>
                          <span class="w-10 px-2 py-0.5 text-right text-emerald-700 dark:text-emerald-400 font-bold select-none shrink-0 border-r border-emerald-500/20">{line.newNum}</span>
                          <span class="w-6 px-1.5 py-0.5 text-center text-emerald-600 font-bold select-none shrink-0">+</span>
                          <span class="px-2 py-0.5 flex-1 whitespace-pre-wrap break-all">{line.text}</span>
                        </div>
                      {:else if line.type === "del"}
                        <div class="flex items-start bg-rose-500/[0.12] dark:bg-rose-500/[0.15] text-rose-900 dark:text-rose-200 hover:bg-rose-500/[0.18]">
                          <span class="w-10 px-2 py-0.5 text-right text-rose-700 dark:text-rose-400 font-bold select-none shrink-0 border-r border-rose-500/20">{line.oldNum}</span>
                          <span class="w-10 px-2 py-0.5 text-right text-rose-600/70 dark:text-rose-400/50 select-none shrink-0 border-r border-rose-500/20"></span>
                          <span class="w-6 px-1.5 py-0.5 text-center text-rose-600 font-bold select-none shrink-0">-</span>
                          <span class="px-2 py-0.5 flex-1 whitespace-pre-wrap break-all">{line.text}</span>
                        </div>
                      {:else}
                        <div class="flex items-start text-foreground/80 dark:text-white/80 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                          <span class="w-10 px-2 py-0.5 text-right text-muted-foreground/60 select-none shrink-0 border-r border-black/5 dark:border-white/5">{line.oldNum}</span>
                          <span class="w-10 px-2 py-0.5 text-right text-muted-foreground/60 select-none shrink-0 border-r border-black/5 dark:border-white/5">{line.newNum}</span>
                          <span class="w-6 px-1.5 py-0.5 text-center text-muted-foreground/40 select-none shrink-0">&nbsp;</span>
                          <span class="px-2 py-0.5 flex-1 whitespace-pre-wrap break-all">{line.text}</span>
                        </div>
                      {/if}
                    {/each}
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="px-5 py-3 border-t border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between shrink-0 text-xs text-muted-foreground">
        <div class="flex items-center gap-2">
          {#if diffData?.baseMsg}
            <span class="truncate max-w-sm hidden sm:inline font-mono text-[11px]">
              Base : <strong>{diffData.baseShort}</strong> — {diffData.baseMsg} ({diffData.baseDate})
            </span>
          {/if}
        </div>
        <button
          onclick={onClose}
          class="focus-ring px-4 py-1.5 rounded-lg bg-card dark:bg-white/10 border border-black/10 dark:border-white/10 hover:bg-surface dark:hover:bg-white/20 text-foreground dark:text-white text-xs font-medium cursor-pointer transition-all"
        >
          Fermer
        </button>
      </div>
    </div>
  </div>
{/if}
