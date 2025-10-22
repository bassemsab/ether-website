'use server';

import { z } from 'zod';
import { sendContactEmail } from '@/lib/api/email';

const contactSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  company: z.string().optional(),
  message: z.string().min(12)
});

export async function submitContact(formData: FormData) {
  const payload = Object.fromEntries(formData.entries());

  const parsed = contactSchema.safeParse({
    name: payload.name,
    email: payload.email,
    company: payload.company,
    message: payload.message
  });

  if (!parsed.success) {
    return {
      success: false,
      message: 'Merci de vérifier les informations du formulaire.'
    };
  }

  await sendContactEmail(parsed.data);

  return {
    success: true,
    message: 'Merci ! Nous revenons vers vous sous 48h.'
  };
}
