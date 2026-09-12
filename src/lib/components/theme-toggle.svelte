<script lang="ts">
  import { theme } from "$lib/stores/theme";
  import { onMount } from "svelte";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  onMount(() => {
    theme.init();
  });
</script>

<button
  type="button"
  onclick={() => theme.toggle()}
  class="relative p-1.5 rounded-full border border-black/10 dark:border-white/15 bg-surface/80 hover:bg-surface text-foreground transition-all duration-200 cursor-pointer flex items-center justify-center {className}"
  title={$theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
  aria-label={$theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
>
  {#if $theme === "dark"}
    <!-- Sun Icon (in dark mode, click to switch to light mode) -->
    <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  {:else}
    <!-- Moon Icon (in light mode, click to switch to dark mode) -->
    <svg class="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  {/if}
</button>
