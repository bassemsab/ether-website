<script lang="ts">
  interface Props {
    path: string;
    name: string;
    size: number;
    dataUrl?: string;
    previewUrl?: string;
  }

  let { path, name, size, dataUrl, previewUrl }: Props = $props();

  let zoom = $state(1);
  let naturalWidth = $state<number | null>(null);
  let naturalHeight = $state<number | null>(null);
  let copiedHtml = $state(false);
  let copiedPath = $state(false);

  // Compute public asset URL for HTML tag
  // In SvelteKit / Vite, static files (e.g. static/uploads/img.png) are served at /uploads/img.png
  const publicSrc = $derived.by(() => {
    if (path.startsWith("static/")) {
      return path.replace(/^static/, "");
    }
    return `/${path}`;
  });

  const imgSrc = $derived(dataUrl || previewUrl || publicSrc);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function handleImageLoad(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    naturalWidth = img.naturalWidth;
    naturalHeight = img.naturalHeight;
  }

  async function copyHtmlTag() {
    const tag = `<img src="${publicSrc}" alt="${name}" />`;
    await navigator.clipboard.writeText(tag);
    copiedHtml = true;
    setTimeout(() => (copiedHtml = false), 2000);
  }

  async function copyPath() {
    await navigator.clipboard.writeText(publicSrc);
    copiedPath = true;
    setTimeout(() => (copiedPath = false), 2000);
  }

  function resetZoom() {
    zoom = 1;
  }
</script>

<div class="w-full h-full flex flex-col bg-background text-foreground overflow-hidden font-mono text-xs">
  <!-- Top Bar -->
  <div class="h-10 border-b border-black/10 bg-surface/70 px-4 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-2 min-w-0">
      <span class="w-5 h-5 rounded flex items-center justify-center bg-indigo-500/15 text-indigo-600 font-bold text-[10px]">
        IMG
      </span>
      <span class="font-semibold text-foreground truncate">{name}</span>
      <span class="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-black/5">
        {formatSize(size)}
      </span>
      {#if naturalWidth && naturalHeight}
        <span class="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-black/5">
          {naturalWidth} × {naturalHeight} px
        </span>
      {/if}
    </div>

    <!-- Zoom & Actions -->
    <div class="flex items-center gap-2">
      <!-- Zoom Controls -->
      <div class="flex items-center gap-1 bg-black/5 p-0.5 rounded-lg text-[11px]">
        <button
          type="button"
          onclick={() => zoom = Math.max(0.2, zoom - 0.2)}
          class="px-2 py-0.5 rounded hover:bg-black/10 transition-colors cursor-pointer"
          title="Zoom arrière"
        >
          -
        </button>
        <button
          type="button"
          onclick={resetZoom}
          class="px-2 py-0.5 rounded hover:bg-black/10 transition-colors cursor-pointer min-w-[45px] text-center"
          title="Réinitialiser le zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onclick={() => zoom = Math.min(3, zoom + 0.2)}
          class="px-2 py-0.5 rounded hover:bg-black/10 transition-colors cursor-pointer"
          title="Zoom avant"
        >
          +
        </button>
      </div>

      <!-- Copy HTML tag button -->
      <button
        type="button"
        onclick={copyHtmlTag}
        class="px-2.5 py-1 rounded-full border border-black/10 bg-card hover:bg-surface text-[11px] text-foreground transition-all cursor-pointer flex items-center gap-1"
        title="Copier la balise <img>"
      >
        <span>{copiedHtml ? "✓ Balise copiée" : "Copier <img>"}</span>
      </button>

      <!-- Copy public path button -->
      <button
        type="button"
        onclick={copyPath}
        class="px-2.5 py-1 rounded-full border border-black/10 bg-card hover:bg-surface text-[11px] text-foreground transition-all cursor-pointer flex items-center gap-1"
        title="Copier le chemin d'accès public"
      >
        <span>{copiedPath ? "✓ Chemin copié" : "Copier chemin"}</span>
      </button>
    </div>
  </div>

  <!-- Image Canvas with Checkerboard pattern for alpha transparency -->
  <div class="flex-1 overflow-auto flex items-center justify-center p-6 relative bg-neutral-100 dark:bg-neutral-900 select-none"
    style="background-image: linear-gradient(45deg, rgba(0, 0, 0, 0.05) 25%, transparent 25%), linear-gradient(-45deg, rgba(0, 0, 0, 0.05) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0, 0, 0, 0.05) 75%), linear-gradient(-45deg, transparent 75%, rgba(0, 0, 0, 0.05) 75%); background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0px;"
  >
    {#if imgSrc}
      <div
        class="transition-transform duration-100 ease-out max-w-full max-h-full flex items-center justify-center"
        style="transform: scale({zoom});"
      >
        <img
          src={imgSrc}
          alt={name}
          onload={handleImageLoad}
          class="max-w-[80vw] max-h-[70vh] object-contain rounded border border-black/10 shadow-sm bg-transparent pointer-events-auto"
        />
      </div>
    {:else}
      <div class="text-center text-muted-foreground p-8">
        <p>Aperçu indisponible</p>
      </div>
    {/if}
  </div>

  <!-- Bottom Details Strip -->
  <div class="h-7 border-t border-black/10 bg-surface/50 px-4 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
    <span class="truncate">Chemin : <code class="text-foreground">{path}</code></span>
    <span class="truncate">Accès public : <code class="text-brand font-semibold">{publicSrc}</code></span>
  </div>
</div>
