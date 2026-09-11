<script lang="ts">
  let { class: className = "h-10 w-auto" }: { class?: string } = $props();
</script>

<img
  src="https://img.ether.paris/ether-website/assets/ether-cropped.png?width=1000"
  alt="ether"
  class={`inline-block object-contain ${className}`}
/>
