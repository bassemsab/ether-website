<script lang="ts">
  let { class: className = "h-10 w-auto" }: { class?: string } = $props();
</script>

<span class="inline-flex items-center justify-center bg-white rounded-md px-2 py-0.5 shadow-sm shrink-0">
  <img
    src="https://img.ether.paris/ether-website/assets/ether-cropped.png?width=1000"
    alt="ether"
    class={`object-contain ${className}`}
  />
</span>
