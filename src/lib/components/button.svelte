<script lang="ts">
  import { cn } from '$utils/cn';
  import type { HTMLButtonAttributes, HTMLAnchorAttributes } from 'svelte/elements';

  type Variant = 'solid' | 'ghost';
  type Size = 'sm' | 'md' | 'lg';

  interface Props {
    variant?: Variant;
    size?: Size;
    href?: string;
    class?: string;
    loading?: boolean;
    children?: import('svelte').Snippet;
    [key: string]: any;
  }

  let { 
    class: className, 
    variant = 'solid', 
    size = 'md', 
    href,
    loading = false,
    children, 
    ...props 
  }: Props = $props();

  const sizesMap = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-7 py-4 text-base'
  };

  const classes = $derived(cn(
    'focus-ring inline-flex items-center justify-center gap-2 rounded-full font-medium uppercase tracking-[0.2em] transition-all duration-300',
    variant === 'solid' &&
      'bg-brand text-white shadow-retro hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0',
    variant === 'ghost' &&
      'border border-black/10 bg-surface/60 text-foreground backdrop-blur-md hover:border-black/20',
    sizesMap[size],
    loading && 'pointer-events-none opacity-80 cursor-wait',
    // anchor tags don't support disabled attribute directly in styles usually without data-disabled, but we keep it
    'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none',
    className
  ));
</script>

{#if href}
  <a
    {href}
    class={classes}
    aria-busy={loading}
    {...props}
  >
    {#if loading}
      <svg class="h-4 w-4 animate-spin text-current shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    {/if}
    {@render children?.()}
  </a>
{:else}
  <button
    class={classes}
    aria-busy={loading}
    {...props}
  >
    {#if loading}
      <svg class="h-4 w-4 animate-spin text-current shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    {/if}
    {@render children?.()}
  </button>
{/if}
