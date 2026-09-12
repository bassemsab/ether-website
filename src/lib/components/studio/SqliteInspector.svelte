<script lang="ts">
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

  // Table browse state
  let tableRows = $state<Record<string, any>[]>([]);
  let tableColumns = $state<string[]>([]);
  let tableLoading = $state(false);
  let filterQuery = $state("");

  // SQL Console state
  let customSql = $state("SELECT * FROM items LIMIT 20;");
  let queryLoading = $state(false);
  let queryError = $state<string | null>(null);
  let queryResult = $state<QueryResult | null>(null);

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
</script>

<div class="w-full h-full flex flex-col bg-background text-foreground overflow-hidden font-mono text-xs">
  <!-- Inspector Top Bar -->
  <div class="h-10 border-b border-black/10 bg-surface/70 px-4 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-2 min-w-0">
      <span class="w-5 h-5 rounded flex items-center justify-center bg-cyan-500/15 text-cyan-600 font-bold text-[10px]">
        DB
      </span>
      <span class="font-semibold text-foreground truncate">{dbPath}</span>
      {#if fileSize > 0}
        <span class="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-black/5">
          {formatSize(fileSize)}
        </span>
      {/if}
      <span class="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        Bun SQLite Connecté
      </span>
    </div>

    <div class="flex items-center gap-2">
      <!-- Sub Tabs -->
      <div class="flex items-center bg-black/5 p-0.5 rounded-lg">
        <button
          type="button"
          onclick={() => activeSubTab = "browse"}
          class="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all {activeSubTab === 'browse' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
        >
          Données
        </button>
        <button
          type="button"
          onclick={() => activeSubTab = "query"}
          class="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all {activeSubTab === 'query' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
        >
          Console SQL
        </button>
        <button
          type="button"
          onclick={() => activeSubTab = "schema"}
          class="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all {activeSubTab === 'schema' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
        >
          Schéma DDL
        </button>
      </div>

      <button
        type="button"
        onclick={loadSchema}
        disabled={loading}
        class="p-1.5 rounded hover:bg-black/5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Actualiser la base"
      >
        <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
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
    <div class="flex-1 flex overflow-hidden">
      <!-- Tables Sidebar -->
      <div class="w-48 border-r border-black/10 bg-surface/30 flex flex-col shrink-0">
        <div class="p-2 border-b border-black/10 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span>Tables ({tables.length})</span>
        </div>
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

      <!-- Right Panel by Sub Tab -->
      <div class="flex-1 flex flex-col overflow-hidden bg-card">
        {#if activeSubTab === "browse"}
          <!-- Browse Table Toolbar -->
          <div class="h-10 border-b border-black/10 px-3 flex items-center justify-between shrink-0 bg-surface/20">
            <div class="flex items-center gap-3">
              <span class="font-semibold text-foreground text-xs">{selectedTableName}</span>
              <span class="text-[11px] text-muted-foreground">
                {tableRows.length} ligne{tableRows.length > 1 ? 's' : ''}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <input
                type="text"
                bind:value={filterQuery}
                placeholder="Filtrer les lignes..."
                class="px-2.5 py-1 text-[11px] rounded border border-black/10 bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand w-48 font-mono"
              />
              <button
                type="button"
                onclick={() => loadTableRows(selectedTableName)}
                class="px-2.5 py-1 text-[11px] rounded border border-black/10 hover:bg-black/5 transition-colors cursor-pointer"
              >
                Actualiser
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
            <div class="p-3 border-b border-black/10 bg-surface/20 space-y-2 shrink-0">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Requête SQL (Bun SQLite)
                </span>
                <span class="text-[10px] text-muted-foreground">
                  Raccourci : <kbd class="px-1 py-0.5 rounded bg-black/10">⌘ + Entrée</kbd>
                </span>
              </div>
              <textarea
                bind:value={customSql}
                onkeydown={handleKeyDown}
                rows={3}
                class="w-full p-2.5 rounded-lg border border-black/10 bg-card text-foreground font-mono text-xs focus:outline-none focus:border-brand resize-none shadow-sm"
                placeholder="Entrez votre requête SQL (ex: SELECT * FROM items LIMIT 10;)"
              ></textarea>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5 overflow-x-auto text-[10px] text-muted-foreground">
                  <span>Exemples :</span>
                  {#each tables.slice(0, 3) as t}
                    <button
                      type="button"
                      onclick={() => customSql = `SELECT * FROM "${t.name}" LIMIT 20;`}
                      class="px-1.5 py-0.5 rounded bg-black/5 hover:bg-black/10 text-foreground cursor-pointer"
                    >
                      SELECT {t.name}
                    </button>
                  {/each}
                </div>
                <button
                  type="button"
                  onclick={executeQuery}
                  disabled={queryLoading || !customSql.trim()}
                  class="px-3.5 py-1.5 rounded-full bg-brand text-white font-medium text-xs hover:bg-brand/90 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
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
                <div class="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-600 text-xs">
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
                      <span class="text-emerald-600 font-medium">
                        {queryResult.changes} modification(s)
                      </span>
                    {/if}
                  </div>

                  {#if queryResult.rows && queryResult.rows.length > 0}
                    <div class="border border-black/10 rounded-lg overflow-hidden">
                      <table class="w-full text-left border-collapse font-mono text-[11px]">
                        <thead class="bg-surface/80 border-b border-black/10">
                          <tr>
                            {#each queryResult.columns as col}
                              <th class="p-2 font-semibold text-foreground border-r border-black/5 whitespace-nowrap">
                                {col}
                              </th>
                            {/each}
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-black/5">
                          {#each queryResult.rows as row, idx}
                            <tr class="hover:bg-brand/5 {idx % 2 === 0 ? 'bg-card' : 'bg-surface/20'}">
                              {#each queryResult.columns as col}
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
