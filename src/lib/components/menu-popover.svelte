<script lang="ts">
  import { cn } from '$utils/cn';
  import type { Snippet } from 'svelte';

  interface Props {
    open?: boolean;
    align?: 'left' | 'right';
    width?: string;
    maxHeight?: string;
    class?: string;
    ref?: HTMLElement | null;
    header?: Snippet;
    footer?: Snippet;
    children?: Snippet;
  }

  let {
    open = true,
    align = 'right',
    width = 'w-80',
    maxHeight = 'max-h-[380px]',
    class: className,
    ref = $bindable(null),
    header,
    footer,
    children
  }: Props = $props();
</script>

{#if open}
  <div
    bind:this={ref}
    class={cn(
      'absolute top-full mt-1.5 bg-card/95 dark:bg-[#18181f]/95 backdrop-blur-md border border-black/10 dark:border-white/10 rounded-2xl shadow-retro-sm dark:shadow-2xl z-50 flex flex-col overflow-hidden text-xs font-mono transition-all',
      align === 'right' ? 'right-0' : 'left-0',
      width,
      maxHeight,
      className
    )}
  >
    {#if header}
      <div class="px-4 py-3 flex items-center justify-between border-b border-black/5 dark:border-white/10 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold shrink-0 bg-surface/50 dark:bg-white/[0.02]">
        {@render header()}
      </div>
    {/if}

    <!-- Scrollable container with generous bottom padding buffer (pb-4) so items never touch the bottom rounded edge -->
    <div class="overflow-y-auto flex-1 p-2 pb-4 space-y-1 pr-2 scroll-smooth">
      {@render children?.()}
    </div>

    {#if footer}
      <div class="px-4 py-3 border-t border-black/5 dark:border-white/10 shrink-0 bg-surface/50 dark:bg-white/[0.02]">
        {@render footer()}
      </div>
    {/if}
  </div>
{/if}
