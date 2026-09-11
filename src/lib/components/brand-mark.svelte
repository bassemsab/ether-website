<script lang="ts">
  let { class: className = "h-10 w-auto" }: { class?: string } = $props();
</script>

<span class="inline-flex items-center justify-center rounded-xl bg-white border border-black/10 shadow-retro-sm p-1.5 transition-transform hover:-translate-y-0.5">
  <img
    src="https://img.ether.paris/ether-website/assets/ether-logo-white.png?width=1000"
    alt="ether"
    class={`object-contain ${className}`}
  />
</span>
