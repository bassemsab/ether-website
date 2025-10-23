'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitContact } from '@/app/actions/send-contact';
import { Button } from './button';
import type { Locale } from '@/lib/i18n/config';
import type { ContactFormCopy } from '@/lib/i18n/dictionaries';

function SubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full md:w-auto">
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}

type ContactFormProps = {
  locale: Locale;
  copy: ContactFormCopy;
};

export function ContactForm({ locale, copy }: ContactFormProps) {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        formData.set('locale', locale);
        const result = await submitContact(formData);
        setMessage(result.message ?? copy.success);
      }}
      className="retro-card space-y-6 p-8"
    >
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-sm text-muted-foreground">
          {copy.nameLabel}
          <input
            name="name"
            required
            minLength={3}
            className="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
            placeholder={copy.namePlaceholder}
          />
        </label>
        <label className="space-y-2 text-sm text-muted-foreground">
          {copy.emailLabel}
          <input
            type="email"
            name="email"
            required
            className="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
            placeholder={copy.emailPlaceholder}
          />
        </label>
      </div>
      <label className="space-y-2 text-sm text-muted-foreground">
        {copy.companyLabel}
        <input
          name="company"
          className="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
          placeholder={copy.companyPlaceholder}
        />
      </label>
      <label className="space-y-2 text-sm text-muted-foreground">
        {copy.messageLabel}
        <textarea
          name="message"
          required
          minLength={12}
          rows={4}
          className="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
          placeholder={copy.messagePlaceholder}
        />
      </label>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{copy.helper}</p>
        <SubmitButton idleLabel={copy.submitIdle} pendingLabel={copy.submitPending} />
      </div>
      {message ? <p className="text-sm text-brand">{message}</p> : null}
    </form>
  );
}
