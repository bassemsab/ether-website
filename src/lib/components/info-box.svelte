<script lang="ts">
  import { cn } from '$utils/cn';
  import type { Snippet } from 'svelte';

  interface Props {
    label?: string;
    value?: string;
    badge?: string;
    subtext?: string;
    copyable?: boolean | string;
    secret?: boolean;
    placeholder?: string;
    variant?: 'default' | 'subtle' | 'brand' | 'success';
    layout?: 'row' | 'stacked';
    class?: string;
    children?: Snippet;
    labelSnippet?: Snippet;
    actionsSnippet?: Snippet;
  }

  let {
    label,
    value,
    badge,
    subtext,
    copyable = false,
    secret = false,
    placeholder,
    variant = 'default',
    layout = 'row',
    class: className,
    children,
    labelSnippet,
    actionsSnippet
  }: Props = $props();

  let showSecret = $state(false);
  let copied = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  async function handleCopy() {
    const textToCopy = typeof copyable === 'string' ? copyable : value;
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      copied = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (e) {
      console.error('Failed to copy text: ', e);
    }
  }

  const variantStyles = {
    default: 'bg-surface dark:bg-black/20 border-black/10 dark:border-white/10 text-foreground',
    subtle: 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 text-foreground',
    brand: 'bg-brand/5 border-brand/20 text-foreground',
    success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
  };
</script>

<div
  class={cn(
    'px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border text-xs font-mono transition-colors shadow-2xs',
    layout === 'row' ? 'flex items-center justify-between gap-3' : 'flex flex-col gap-2',
    variantStyles[variant],
    className
  )}
>
  <div class={cn('min-w-0 flex-1 truncate', layout === 'row' ? 'flex items-center gap-2' : 'flex flex-col gap-1')}>
    {#if badge}
      <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand/10 text-brand shrink-0">
        {badge}
      </span>
    {/if}

    {#if labelSnippet}
      {@render labelSnippet()}
    {:else if label}
      <span class="text-muted-foreground shrink-0">{label} :</span>
    {/if}

    <div class="font-semibold text-foreground truncate min-w-0">
      {#if children}
        {@render children()}
      {:else if secret && !showSecret}
        <span class="tracking-widest select-none text-muted-foreground">••••••••••••</span>
      {:else if value}
        <span class="truncate">{value}</span>
      {:else if placeholder}
        <span class="text-muted-foreground/60 italic">{placeholder}</span>
      {/if}
    </div>

    {#if subtext}
      <span class="text-[10px] text-muted-foreground truncate">{subtext}</span>
    {/if}
  </div>

  <div class="flex items-center gap-1.5 shrink-0">
    {#if actionsSnippet}
      {@render actionsSnippet()}
    {/if}

    {#if secret && value}
      <button
        type="button"
        onclick={() => (showSecret = !showSecret)}
        class="px-2.5 py-1 text-[11px] font-medium rounded-md bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        aria-label={showSecret ? 'Masquer le secret' : 'Afficher le secret'}
      >
        {showSecret ? 'Masquer' : 'Voir'}
      </button>
    {/if}

    {#if copyable && (value || typeof copyable === 'string')}
      <button
        type="button"
        onclick={handleCopy}
        class="px-2.5 py-1 text-[11px] font-medium rounded-md bg-brand/10 hover:bg-brand/20 text-brand transition-colors cursor-pointer inline-flex items-center gap-1"
        aria-label="Copier dans le presse-papiers"
      >
        {#if copied}
          <svg class="w-3 h-3 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
          </svg>
          <span class="text-emerald-600 dark:text-emerald-400 font-semibold">Copié !</span>
        {:else}
          <span>Copier</span>
        {/if}
      </button>
    {/if}
  </div>
</div>
