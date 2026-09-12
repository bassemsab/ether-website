<script>
  import '../app.css';
  import "@fontsource/inter";
  import "@fontsource/space-grotesk";
  import "@fontsource/playfair-display";
  import "@fontsource/ibm-plex-mono";
  import Toast from '$lib/components/toast.svelte';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';

  $effect(() => {
    if (browser) {
      if (!$page.url.pathname.startsWith('/studio')) {
        document.documentElement.classList.remove('dark');
      }
    }
  });
</script>

<style>
  :global(:root) {
    --font-neue: "Space Grotesk", sans-serif;
    --font-display: "Playfair Display", serif;
    --font-mono: "IBM Plex Mono", monospace;
  }
</style>

<div class="grain-overlay antialiased">
    <slot />
    <Toast />
</div>
