'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitContact } from '@/app/actions/send-contact';
import { Button } from './button';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full md:w-auto">
      {pending ? 'Envoi en cours...' : 'Envoyer'}
    </Button>
  );
}

export function ContactForm() {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        const result = await submitContact(formData);
        setMessage(result.message);
      }}
      className="retro-card space-y-6 p-8"
    >
      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-sm text-muted-foreground">
          Nom complet
          <input
            name="name"
            required
            minLength={3}
            className="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
            placeholder="Votre nom"
          />
        </label>
        <label className="space-y-2 text-sm text-muted-foreground">
          Email
          <input
            type="email"
            name="email"
            required
            className="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
            placeholder="contact@studio.com"
          />
        </label>
      </div>
      <label className="space-y-2 text-sm text-muted-foreground">
        Organisation
        <input
          name="company"
          className="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
          placeholder="Maison, studio, institution..."
        />
      </label>
      <label className="space-y-2 text-sm text-muted-foreground">
        Message
        <textarea
          name="message"
          required
          minLength={12}
          rows={4}
          className="focus-ring w-full rounded-2xl border border-black/10 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
          placeholder="Parlez-nous de votre projet..."
        />
      </label>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Réponse sous 48h · Sessions immersives possibles
        </p>
        <SubmitButton />
      </div>
      {message ? <p className="text-sm text-brand">{message}</p> : null}
    </form>
  );
}
