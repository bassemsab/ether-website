<script lang="ts">
  let { class: className = "h-8 w-8" }: { class?: string } = $props();
</script>

<span
  class={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
>
  <img
    src="/ether-logo-official.png"
    alt="ether"
    class="w-full h-full object-contain dark:hidden"
  />
  <img
    src="/ether-logo-white.png"
    alt="ether"
    class="w-full h-full object-contain hidden dark:block"
  />
</span>
