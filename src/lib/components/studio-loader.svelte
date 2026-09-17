<script lang="ts">
  import { fade } from 'svelte/transition';

  interface Props {
    label?: string;
    id?: string;
    standalone?: boolean;
  }

  let {
    label = "Connexion au Studio...",
    id = "studio-splash-loader",
    standalone = false,
  }: Props = $props();
</script>

<div
  {id}
  transition:fade={{ duration: 250 }}
  class="{standalone ? 'relative min-h-[300px]' : 'fixed inset-0'} z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md transition-opacity duration-300 select-none"
  aria-live="polite"
  aria-label={label}
>
  <div class="relative flex flex-col items-center justify-center">
    <!-- Ambient aura glow -->
    <div class="absolute -inset-10 rounded-full bg-brand/10 blur-3xl pointer-events-none"></div>

    <!-- Flashing / breathing transparent Ether logo -->
    <img
      src="/ether-logo-official.png"
      alt="ether"
      width={130}
      height={114}
      class="h-16 sm:h-20 w-auto object-contain animate-ether-pulse dark:hidden relative z-10 select-none"
    />
    <img
      src="/ether-logo-white.png"
      alt="ether"
      width={130}
      height={114}
      class="h-16 sm:h-20 w-auto object-contain animate-ether-pulse hidden dark:block relative z-10 select-none"
    />

    <!-- Status label -->
    <p class="mt-8 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground animate-pulse text-center">
      {label}
    </p>

    <!-- Subtle loading indicator line -->
    <div class="mt-4 h-0.5 w-28 overflow-hidden rounded-full bg-foreground/10 relative">
      <div class="absolute inset-y-0 w-1/2 rounded-full bg-brand animate-shimmer-slide"></div>
    </div>
  </div>
</div>

<style>
  @keyframes ether-pulse-breath {
    0%, 100% {
      opacity: 0.3;
      transform: scale(0.96);
    }
    50% {
      opacity: 1;
      transform: scale(1.05);
      filter: drop-shadow(0 0 25px rgba(22, 46, 74, 0.3));
    }
  }
  @keyframes ether-pulse-breath-dark {
    0%, 100% {
      opacity: 0.3;
      transform: scale(0.96);
    }
    50% {
      opacity: 1;
      transform: scale(1.05);
      filter: drop-shadow(0 0 25px rgba(255, 255, 255, 0.4));
    }
  }
  .animate-ether-pulse {
    animation: ether-pulse-breath 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  :global(.dark) .animate-ether-pulse {
    animation-name: ether-pulse-breath-dark;
  }
  @keyframes shimmer-slide {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(200%);
    }
  }
  .animate-shimmer-slide {
    animation: shimmer-slide 1.5s ease-in-out infinite;
  }
</style>
