<script lang="ts">
  let { class: className = "h-8 w-8" }: { class?: string } = $props();
</script>

<span
  class={`inline-flex items-center justify-center bg-white rounded-lg aspect-square shadow-sm shrink-0 p-1 select-none overflow-hidden ${className}`}
>
  <img
    src="https://img.ether.paris/ether-website/assets/ether-cropped.png?width=1000"
    alt="ether"
    class="w-full h-full object-contain"
  />
</span>
