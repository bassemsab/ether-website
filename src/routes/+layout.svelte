<script>
  import '../app.css';
  import "@fontsource/inter";
  import "@fontsource/space-grotesk";
  import "@fontsource/playfair-display";
  import "@fontsource/ibm-plex-mono";
  import Toast from '$lib/components/toast.svelte';
  import StudioLoader from '$lib/components/studio-loader.svelte';
  import { page, navigating } from '$app/stores';
  import { browser } from '$app/environment';
  import { isStudioNavigating, stopStudioNavigation } from '$lib/stores/studio-nav';

  // Navigation to studio is active if triggered manually or if SvelteKit router is actively navigating
  let showStudioLoader = $derived(
    Boolean(
      !$page.url.pathname.startsWith('/studio') &&
      !$page.url.pathname.startsWith('/login') &&
      (
        $isStudioNavigating ||
        ($navigating?.to?.url.pathname && ($navigating.to.url.pathname.startsWith('/studio') || $navigating.to.url.pathname.startsWith('/login')))
      )
    )
  );

  $effect(() => {
    // Whenever navigation completes or is cancelled, stop any pending manual studio navigation
    if (!$navigating) {
      stopStudioNavigation();
    }
  });

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
    {#if showStudioLoader}
      <StudioLoader />
    {/if}
    <Toast />
</div>
