<script lang="ts">
  import { EditorView, keymap, placeholder } from "@codemirror/view";
  import { EditorState, Compartment } from "@codemirror/state";
  import { minimalSetup } from "codemirror";
  import { sql, SQLite } from "@codemirror/lang-sql";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
  import { theme } from "$lib/stores/theme";

  interface TableColumn {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: any;
    pk: number;
  }

  interface TableInfo {
    name: string;
    type: string;
    sql: string;
    rowCount: number;
    columns: TableColumn[];
  }

  interface QueryResult {
    columns: string[];
    rows: Record<string, any>[];
    rowCount: number;
    executionTimeMs: number;
    readonly?: boolean;
    changes?: number;
    lastInsertRowid?: number;
  }

  interface Props {
    projectSlug: string;
    dbPath: string;
    fileSize?: number;
  }

  let { projectSlug, dbPath, fileSize = 0 }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let tables = $state<TableInfo[]>([]);
  let selectedTableName = $state<string>("");

  let activeSubTab = $state<"browse" | "query" | "schema">("browse");
  let showTablesSidebar = $state(true);

  // Table browse state
  let tableRows = $state<Record<string, any>[]>([]);
  let tableColumns = $state<string[]>([]);
  let tableLoading = $state(false);
  let filterQuery = $state("");

  // SQL Console state & CodeMirror Editor
  let customSql = $state("SELECT * FROM items LIMIT 20;");
  let queryLoading = $state(false);
  let queryError = $state<string | null>(null);
  let queryResult = $state<QueryResult | null>(null);

  let sqlEditorView = $state<EditorView | null>(null);
  const sqlThemeCompartment = new Compartment();
  const sqlLangCompartment = new Compartment();

  const sqlSchema = $derived.by(() => {
    const map: Record<string, string[]> = {};
    for (const t of tables) {
      map[t.name] = t.columns ? t.columns.map((c) => c.name) : [];
    }
    return map;
  });

  const baseSqlTheme = EditorView.theme({
    "&": {
      height: "auto",
      minHeight: "68px",
      maxHeight: "180px",
      fontSize: "12px",
      fontFamily: "'Space Grotesk', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      backgroundColor: "transparent",
    },
    ".cm-content": {
      padding: "8px 12px",
      lineHeight: "1.5",
      fontFamily: "inherit",
      caretColor: "currentColor",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "inherit",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-placeholder": {
      color: "hsl(var(--muted-foreground))",
      opacity: "0.6",
    },
  });

  function getSqlThemeExtensions(isDark: boolean) {
    if (isDark) {
      return [
        oneDark,
        baseSqlTheme,
        EditorView.theme({
          "&": {
            color: "hsl(var(--foreground))",
          },
          ".cm-cursor": {
            borderLeftColor: "hsl(var(--brand))",
            borderLeftWidth: "2px",
          },
          "&.cm-focused .cm-selectionBackground, ::selection": {
            backgroundColor: "rgba(255, 255, 255, 0.15)",
          },
        }),
      ];
    }
    return [
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      baseSqlTheme,
      EditorView.theme({
        "&": {
          color: "#1E1B39",
        },
        ".cm-cursor": {
          borderLeftColor: "#1E1B39",
          borderLeftWidth: "2px",
        },
        "&.cm-focused .cm-selectionBackground, ::selection": {
          backgroundColor: "rgba(30, 27, 57, 0.15)",
        },
      }),
    ];
  }

  function sqlEditorAction(container: HTMLElement) {
    const isDark = $theme === "dark";
    const state = EditorState.create({
      doc: customSql,
      extensions: [
        minimalSetup,
        EditorView.lineWrapping,
        placeholder("Entrez votre requête SQL (ex: SELECT * FROM items LIMIT 10;)"),
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              executeQuery();
              return true;
            },
          },
          {
            key: "Ctrl-Enter",
            run: () => {
              executeQuery();
              return true;
            },
          },
        ]),
        sqlLangCompartment.of(sql({ dialect: SQLite, schema: sqlSchema })),
        sqlThemeCompartment.of(getSqlThemeExtensions(isDark)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            customSql = update.state.doc.toString();
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: container,
    });

    sqlEditorView = view;

    return {
      destroy() {
        view.destroy();
        if (sqlEditorView === view) {
          sqlEditorView = null;
        }
      },
    };
  }

  const selectedTable = $derived(
    tables.find((t) => t.name === selectedTableName) || tables[0] || null
  );

  const filteredRows = $derived.by(() => {
    if (!filterQuery.trim()) return tableRows;
    const q = filterQuery.toLowerCase();
    return tableRows.filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? "").toLowerCase().includes(q)
      )
    );
  });

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function loadSchema() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/studio/sqlite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug,
          dbPath,
          action: "schema",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossible de charger le schéma SQLite.");
      }
      tables = data.tables || [];
      if (tables.length > 0) {
        if (!selectedTableName || !tables.some((t) => t.name === selectedTableName)) {
          selectedTableName = tables[0].name;
        }
        await loadTableRows(selectedTableName);
        customSql = `SELECT * FROM "${selectedTableName}" LIMIT 25;`;
      }
    } catch (err: any) {
      error = err.message || "Erreur de connexion à la base SQLite.";
    } finally {
      loading = false;
    }
  }

  async function loadTableRows(tableName: string) {
    if (!tableName) return;
    tableLoading = true;
    try {
      const res = await fetch("/api/studio/sqlite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug,
          dbPath,
          action: "query",
          sql: `SELECT * FROM "${tableName.replace(/"/g, '""')}" LIMIT 100;`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        tableRows = data.rows || [];
        tableColumns = data.columns || [];
      } else {
        tableRows = [];
        tableColumns = [];
      }
    } catch {
      tableRows = [];
      tableColumns = [];
    } finally {
      tableLoading = false;
    }
  }

  async function executeQuery() {
    if (!customSql.trim()) return;
    queryLoading = true;
    queryError = null;
    try {
      const res = await fetch("/api/studio/sqlite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug,
          dbPath,
          action: "query",
          sql: customSql.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'exécution SQL.");
      }
      queryResult = data;
    } catch (err: any) {
      queryError = err.message;
      queryResult = null;
    } finally {
      queryLoading = false;
    }
  }

  function handleSelectTable(name: string) {
    selectedTableName = name;
    loadTableRows(name);
    customSql = `SELECT * FROM "${name}" LIMIT 25;`;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      executeQuery();
    }
  }

  $effect(() => {
    // Re-fetch schema when dbPath or projectSlug changes
    if (projectSlug && dbPath) {
      loadSchema();
    }
  });

  $effect(() => {
    // Sync external customSql changes to CodeMirror editor
    if (sqlEditorView) {
      const currentDoc = sqlEditorView.state.doc.toString();
      if (customSql !== currentDoc) {
        sqlEditorView.dispatch({
          changes: {
            from: 0,
            to: currentDoc.length,
            insert: customSql,
          },
        });
      }
    }
  });

  $effect(() => {
    // React to theme changes (light/dark)
    const isDark = $theme === "dark";
    if (sqlEditorView) {
      sqlEditorView.dispatch({
        effects: sqlThemeCompartment.reconfigure(getSqlThemeExtensions(isDark)),
      });
    }
  });

  $effect(() => {
    // Update SQL dialect schema autocompletion when tables reload
    if (sqlEditorView) {
      sqlEditorView.dispatch({
        effects: sqlLangCompartment.reconfigure(sql({ dialect: SQLite, schema: sqlSchema })),
      });
    }
  });
</script>

<div class="w-full h-full flex flex-col bg-background text-foreground overflow-hidden font-mono text-xs">
  <!-- Inspector Top Bar (Split to match sidebar & content columns) -->
  <div class="h-10 border-b border-black/10 bg-surface/70 flex items-stretch shrink-0">
    <!-- Left column: Tables header & DB size (collapsible) -->
    {#if showTablesSidebar}
      <div class="w-44 sm:w-48 border-r border-black/10 px-2.5 flex items-center justify-between shrink-0 bg-surface/50">
        <div class="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onclick={() => showTablesSidebar = false}
            class="p-1 -ml-1 rounded hover:bg-black/5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            title="Masquer la liste des tables"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
          <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Bun SQLite Connecté"></span>
          <span class="font-semibold text-foreground truncate text-[11px]">Tables ({tables.length})</span>
        </div>
        {#if fileSize > 0}
          <span class="text-[10px] text-muted-foreground shrink-0 font-mono">
            {formatSize(fileSize)}
          </span>
        {/if}
      </div>
    {/if}

    <!-- Right column: Navigation tabs, Dropdown & Refresh -->
    <div class="flex-1 flex items-center justify-between gap-2 px-2.5 overflow-x-auto min-w-0 bg-surface/30 no-scrollbar">
      <div class="flex items-center gap-2 shrink-0">
        {#if !showTablesSidebar}
          <button
            type="button"
            onclick={() => showTablesSidebar = true}
            class="px-2 py-1 rounded-md border border-black/10 bg-surface hover:bg-surface/80 text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5 text-[11px] font-mono shadow-xs transition-colors shrink-0"
            title="Afficher la liste des tables"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            <span class="font-semibold">Tables ({tables.length})</span>
          </button>

          <!-- Compact Table Selector Dropdown when sidebar is closed -->
          <div class="relative inline-flex items-center shrink-0">
            <select
              value={selectedTableName}
              onchange={(e) => handleSelectTable(e.currentTarget.value)}
              class="appearance-none cursor-pointer rounded-md border border-black/10 bg-card pl-2.5 pr-7 py-1 text-[11px] font-mono font-medium text-foreground focus:outline-none focus:border-brand shadow-xs"
            >
              {#each tables as t}
                <option value={t.name}>{t.name} ({t.rowCount})</option>
              {/each}
            </select>
            <svg class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        {/if}

        <!-- Sub Tabs -->
        <div class="flex items-center bg-black/5 p-0.5 rounded-lg shrink-0">
          <button
            type="button"
            onclick={() => activeSubTab = "browse"}
            class="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap {activeSubTab === 'browse' ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'}"
          >
            Données
          </button>
          <button
            type="button"
            onclick={() => activeSubTab = "query"}
            class="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap {activeSubTab === 'query' ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'}"
          >
            Console SQL
          </button>
          <button
            type="button"
            onclick={() => activeSubTab = "schema"}
            class="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap {activeSubTab === 'schema' ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'}"
          >
            Schéma DDL
          </button>
        </div>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onclick={loadSchema}
          disabled={loading}
          class="p-1.5 rounded hover:bg-black/5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
          title="Actualiser la base"
        >
          <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  {#if loading && tables.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-3">
      <div class="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
      <p class="text-xs">Chargement du schéma de la base SQLite...</p>
    </div>
  {:else if error}
    <div class="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
      <div class="w-10 h-10 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold text-base">
        !
      </div>
      <p class="text-xs text-foreground font-medium">Erreur d'accès à la base de données</p>
      <p class="text-[11px] text-muted-foreground max-w-md">{error}</p>
      <button
        type="button"
        onclick={loadSchema}
        class="mt-2 px-3 py-1.5 rounded-full bg-surface border border-black/10 text-[11px] hover:bg-surface/80 cursor-pointer"
      >
        Réessayer
      </button>
    </div>
  {:else if tables.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2">
      <span class="text-2xl">🗄️</span>
      <p class="text-xs text-foreground font-medium">Base de données vide</p>
      <p class="text-[11px] text-muted-foreground max-w-sm">
        Ce fichier SQLite ne contient actuellement aucune table. Utilisez la Console SQL pour exécuter vos requêtes <code>CREATE TABLE</code>.
      </p>
      <button
        type="button"
        onclick={() => activeSubTab = 'query'}
        class="mt-3 px-3 py-1.5 rounded-full bg-brand text-white text-[11px] font-medium"
      >
        Ouvrir la Console SQL
      </button>
    </div>
  {:else}
    <!-- Main Content Layout -->
    <div class="flex-1 flex overflow-hidden min-h-0">
      <!-- Tables Sidebar -->
      {#if showTablesSidebar}
        <div class="w-44 sm:w-48 border-r border-black/10 bg-surface/30 flex flex-col shrink-0 overflow-hidden select-none">
          <div class="flex-1 overflow-y-auto p-1 space-y-0.5">
            {#each tables as table}
              <button
                type="button"
                onclick={() => handleSelectTable(table.name)}
                class="w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition-colors cursor-pointer text-xs {selectedTableName === table.name ? 'bg-brand/10 text-brand font-semibold' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}"
              >
                <div class="flex items-center gap-1.5 min-w-0 truncate">
                  <span class="text-[10px] text-muted-foreground">📋</span>
                  <span class="truncate">{table.name}</span>
                </div>
                <span class="text-[10px] font-normal px-1 rounded bg-black/5 text-muted-foreground">
                  {table.rowCount}
                </span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Right Panel by Sub Tab -->
      <div class="flex-1 flex flex-col overflow-hidden bg-card min-w-0">
        {#if activeSubTab === "browse"}
          <!-- Browse Table Toolbar -->
          <div class="h-10 border-b border-black/10 px-2.5 flex items-center justify-between shrink-0 bg-surface/20 gap-2 overflow-x-auto no-scrollbar">
            <div class="flex items-center gap-2 min-w-0 shrink-0">
              <span class="font-semibold text-foreground text-xs truncate max-w-[120px]">{selectedTableName}</span>
              <span class="text-[10px] text-muted-foreground whitespace-nowrap">
                {tableRows.length} ligne{tableRows.length > 1 ? 's' : ''}
              </span>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <input
                type="text"
                bind:value={filterQuery}
                placeholder="Filtrer..."
                class="px-2 py-1 text-[11px] rounded border border-black/10 bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand w-24 sm:w-36 md:w-44 font-mono"
              />
              <button
                type="button"
                onclick={() => loadTableRows(selectedTableName)}
                class="px-2 py-1 text-[11px] rounded border border-black/10 hover:bg-black/5 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1"
                title="Actualiser la table"
              >
                <svg class="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span class="hidden sm:inline">Actualiser</span>
              </button>
            </div>
          </div>

          <!-- Table Grid -->
          <div class="flex-1 overflow-auto">
            {#if tableLoading}
              <div class="p-8 text-center text-muted-foreground text-xs flex items-center justify-center gap-2">
                <div class="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
                <span>Lecture des données...</span>
              </div>
            {:else if tableRows.length === 0}
              <div class="p-8 text-center text-muted-foreground text-xs">
                Aucune ligne dans cette table.
              </div>
            {:else}
              <table class="w-full text-left border-collapse font-mono text-[11px]">
                <thead class="sticky top-0 bg-surface/90 backdrop-blur z-10 border-b border-black/10">
                  <tr>
                    {#each tableColumns as col}
                      {@const colMeta = selectedTable?.columns?.find((c) => c.name === col)}
                      <th class="p-2 font-semibold text-foreground border-r border-black/5 whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                          <span>{col}</span>
                          {#if colMeta}
                            <span class="text-[9px] font-normal px-1 py-0.2 rounded bg-black/5 text-muted-foreground">
                              {colMeta.type || 'ANY'}{colMeta.pk ? ' 🔑' : ''}
                            </span>
                          {/if}
                        </div>
                      </th>
                    {/each}
                  </tr>
                </thead>
                <tbody class="divide-y divide-black/5">
                  {#each filteredRows as row, i}
                    <tr class="hover:bg-brand/5 transition-colors {i % 2 === 0 ? 'bg-card' : 'bg-surface/20'}">
                      {#each tableColumns as col}
                        <td class="p-2 border-r border-black/5 whitespace-pre-wrap max-w-xs truncate text-foreground">
                          {#if row[col] === null}
                            <span class="text-muted-foreground italic text-[10px]">NULL</span>
                          {:else}
                            {String(row[col])}
                          {/if}
                        </td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>

        {:else if activeSubTab === "query"}
          <!-- SQL Query Console -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <div class="p-3 border-b border-black/10 dark:border-white/10 bg-surface/20 dark:bg-background/90 space-y-2 shrink-0">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Requête SQL (Bun SQLite)
                </span>
                <span class="text-[10px] text-muted-foreground">
                  Raccourci : <kbd class="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-muted-foreground dark:text-neutral-300 font-mono text-[9px]">⌘ + Entrée</kbd>
                </span>
              </div>
              <div
                use:sqlEditorAction
                class="w-full rounded-lg border border-black/10 dark:border-white/10 bg-card dark:bg-[#121217] overflow-hidden shadow-sm focus-within:border-brand dark:focus-within:border-brand/70 focus-within:ring-1 focus-within:ring-brand/20 transition-all cursor-text"
              ></div>
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 overflow-x-auto text-[10px] text-muted-foreground no-scrollbar">
                  <span class="shrink-0">Exemples :</span>
                  {#each tables.slice(0, 4) as t}
                    <button
                      type="button"
                      onclick={() => customSql = `SELECT * FROM "${t.name}" LIMIT 20;`}
                      class="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-foreground dark:text-neutral-200 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      SELECT {t.name}
                    </button>
                  {/each}
                </div>
                <button
                  type="button"
                  onclick={executeQuery}
                  disabled={queryLoading || !customSql.trim()}
                  class="px-3.5 py-1.5 rounded-full bg-brand text-white font-medium text-xs hover:bg-brand/90 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shrink-0 shadow-retro-sm dark:shadow-none"
                >
                  {#if queryLoading}
                    <div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Exécution...</span>
                  {:else}
                    <span>Exécuter</span>
                  {/if}
                </button>
              </div>
            </div>

            <!-- Query Output Area -->
            <div class="flex-1 overflow-auto p-3">
              {#if queryError}
                <div class="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs">
                  <p class="font-semibold mb-1">Erreur SQL :</p>
                  <p class="font-mono">{queryError}</p>
                </div>
              {:else if queryResult}
                <div class="space-y-3">
                  <div class="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>
                      {queryResult.rowCount !== undefined ? `${queryResult.rowCount} résultat${queryResult.rowCount > 1 ? 's' : ''}` : 'Requête exécutée'}
                    </span>
                    <span>·</span>
                    <span>Temps : {queryResult.executionTimeMs} ms</span>
                    {#if queryResult.changes !== undefined}
                      <span>·</span>
                      <span class="text-emerald-600 dark:text-emerald-400 font-medium">
                        {queryResult.changes} modification(s)
                      </span>
                    {/if}
                  </div>

                  {#if queryResult.rows && queryResult.rows.length > 0}
                    <div class="border border-black/10 dark:border-white/10 rounded-lg overflow-hidden">
                      <table class="w-full text-left border-collapse font-mono text-[11px]">
                        <thead class="bg-surface/80 dark:bg-[#18181f] border-b border-black/10 dark:border-white/10">
                          <tr>
                            {#each queryResult.columns as col}
                              <th class="p-2 font-semibold text-foreground dark:text-neutral-200 border-r border-black/5 dark:border-white/5 whitespace-nowrap">
                                {col}
                              </th>
                            {/each}
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-black/5 dark:divide-white/5">
                          {#each queryResult.rows as row, idx}
                            <tr class="hover:bg-brand/5 dark:hover:bg-white/[0.04] transition-colors {idx % 2 === 0 ? 'bg-card dark:bg-card' : 'bg-surface/20 dark:bg-surface/10'}">
                              {#each queryResult.columns as col}
                                <td class="p-2 border-r border-black/5 dark:border-white/5 whitespace-pre-wrap max-w-xs truncate text-foreground dark:text-neutral-200">
                                  {#if row[col] === null}
                                    <span class="text-muted-foreground italic text-[10px]">NULL</span>
                                  {:else}
                                    {String(row[col])}
                                  {/if}
                                </td>
                              {/each}
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  {/if}
                </div>
              {:else}
                <div class="h-full flex items-center justify-center text-center text-muted-foreground text-xs">
                  Écrivez une requête SQL ci-dessus et cliquez sur « Exécuter » ou appuyez sur ⌘+Entrée.
                </div>
              {/if}
            </div>
          </div>

        {:else if activeSubTab === "schema"}
          <!-- Schema DDL Tab -->
          <div class="flex-1 overflow-auto p-4 space-y-4">
            {#if selectedTable}
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold text-sm text-foreground">Table : {selectedTable.name}</h3>
                  <span class="text-[11px] text-muted-foreground">{selectedTable.columns.length} colonnes</span>
                </div>

                <!-- Columns List -->
                <div class="border border-black/10 rounded-lg overflow-hidden">
                  <table class="w-full text-left border-collapse text-[11px]">
                    <thead class="bg-surface/80 border-b border-black/10 font-semibold text-muted-foreground">
                      <tr>
                        <th class="p-2">#</th>
                        <th class="p-2">Nom Colonne</th>
                        <th class="p-2">Type</th>
                        <th class="p-2">Clé Primaire</th>
                        <th class="p-2">Non Nul</th>
                        <th class="p-2">Valeur par défaut</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-black/5">
                      {#each selectedTable.columns as col}
                        <tr class="hover:bg-black/5">
                          <td class="p-2 text-muted-foreground">{col.cid}</td>
                          <td class="p-2 font-semibold text-foreground">{col.name}</td>
                          <td class="p-2 font-mono text-cyan-600">{col.type || 'ANY'}</td>
                          <td class="p-2">{col.pk ? '🔑 Oui' : '-'}</td>
                          <td class="p-2">{col.notnull ? 'Oui' : '-'}</td>
                          <td class="p-2 text-muted-foreground font-mono">{col.dflt_value ?? '-'}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>

                <!-- DDL Code Block -->
                {#if selectedTable.sql}
                  <div class="mt-4 space-y-1">
                    <p class="text-[11px] font-semibold text-muted-foreground uppercase">Définition SQL (DDL)</p>
                    <pre class="p-3 rounded-lg bg-surface/80 border border-black/10 font-mono text-xs text-foreground overflow-x-auto whitespace-pre-wrap">{selectedTable.sql}</pre>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
