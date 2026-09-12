<script lang="ts">
  let { class: className = "h-8 w-8" }: { class?: string } = $props();
</script>

<span
  class={`inline-flex items-center justify-center aspect-square shrink-0 select-none overflow-hidden dark:bg-white dark:rounded-lg dark:shadow-sm dark:p-1 ${className}`}
>
  <img
    src="https://img.ether.paris/ether-website/assets/ether-cropped.png?width=1000"
    alt="ether"
    class="w-full h-full object-contain"
  />
</span>
