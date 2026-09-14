<script lang="ts">
  import { toast } from "$lib/stores/toast";
  import { fade, fly } from "svelte/transition";
</script>

{#if $toast.visible}
  <div
    in:fly={{ y: 20, duration: 300 }}
    out:fade={{ duration: 200 }}
    class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transform max-w-md w-full px-4 pointer-events-none"
  >
    <div
      class="flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm shadow-2xl backdrop-blur-md border transition-all duration-300 pointer-events-auto {
        $toast.type === 'success'
          ? 'bg-slate-900/95 border-emerald-500/40 text-emerald-200 shadow-emerald-950/40'
          : $toast.type === 'error'
            ? 'bg-slate-900/95 border-rose-500/40 text-rose-200 shadow-rose-950/40'
            : 'bg-slate-900/95 border-slate-700/80 text-white shadow-black/50'
      }"
    >
      {#if $toast.type === 'success'}
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
          ✓
        </span>
      {:else if $toast.type === 'error'}
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 text-xs font-bold">
          ✕
        </span>
      {:else}
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold">
          ℹ
        </span>
      {/if}
      <span class="flex-1 font-sans text-xs sm:text-sm font-medium leading-snug">
        {$toast.message}
      </span>
    </div>
  </div>
{/if}
