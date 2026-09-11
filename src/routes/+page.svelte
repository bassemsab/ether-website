<script lang="ts">
  import TenantSite from "$lib/components/tenant-site.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

{#if data?.isTenant && data?.tenant}
  <TenantSite tenant={data.tenant} />
{:else}
  <div class="flex h-screen items-center justify-center bg-background text-foreground">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent"></div>
  </div>
{/if}
