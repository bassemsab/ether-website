<script lang="ts">
  import { enhance } from '$app/forms';
  import Button from './button.svelte';
  import type { Locale } from '$lib/i18n/config';
  import type { ContactFormCopy } from '$lib/i18n/dictionaries';

  interface Props {
    locale: Locale;
    copy: ContactFormCopy;
  }

  let { locale, copy }: Props = $props();

  let message = $state<string | null>(null);
  let pending = $state(false);

</script>

<form
  method="POST"
  use:enhance={() => {
    pending = true;
    return async ({ result, update }) => {
      pending = false;
      if (result.type === 'success') {
        // @ts-ignore
        message = result.data?.message;
        await update({ reset: true });
      } else if (result.type === 'failure') {
        // @ts-ignore
        message = result.data?.message;
      }
    };
  }}
  class="retro-card space-y-6 p-8"
>
  <input type="hidden" name="locale" value={locale} />
  <div class="grid gap-6 md:grid-cols-2">
    <label class="space-y-2 text-sm text-muted-foreground">
      {copy.nameLabel}
      <input
        name="name"
        required
        minlength={3}
        class="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
        placeholder={copy.namePlaceholder}
      />
    </label>
    <label class="space-y-2 text-sm text-muted-foreground">
      {copy.emailLabel}
      <input
        type="email"
        name="email"
        required
        class="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
        placeholder={copy.emailPlaceholder}
      />
    </label>
  </div>
  <label class="space-y-2 text-sm text-muted-foreground">
    {copy.companyLabel}
    <input
      name="company"
      class="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
      placeholder={copy.companyPlaceholder}
    />
  </label>
  <label class="space-y-2 text-sm text-muted-foreground">
    {copy.messageLabel}
    <textarea
      name="message"
      required
      minlength={12}
      rows={4}
      class="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
      placeholder={copy.messagePlaceholder}
    ></textarea>
  </label>
  <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <p class="text-xs uppercase tracking-[0.3em] text-muted-foreground">{copy.helper}</p>
    <Button type="submit" disabled={pending} class="w-full md:w-auto">
      {pending ? copy.submitPending : copy.submitIdle}
    </Button>
  </div>
  {#if message}
    <p class="text-sm text-brand">{message}</p>
  {/if}
</form>
