'use server';

import { z } from 'zod';
import { sendContactEmail } from '@/lib/api/email';
import { defaultLocale, isLocale, type Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';

const contactSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  company: z.string().optional(),
  message: z.string().min(12),
  locale: z.string().optional()
});

export async function submitContact(formData: FormData) {
  const payload = Object.fromEntries(formData.entries());

  const parsed = contactSchema.safeParse({
    name: payload.name,
    email: payload.email,
    company: payload.company,
    message: payload.message,
    locale: payload.locale
  });

  const locale: Locale = parsed.success && parsed.data.locale && isLocale(parsed.data.locale)
    ? parsed.data.locale
    : defaultLocale;
  const dictionary = getDictionary(locale);

  if (!parsed.success) {
    return {
      success: false,
      message: dictionary.contactForm.error
    };
  }

  await sendContactEmail(parsed.data);

  return {
    success: true,
    message: dictionary.contactForm.success
  };
}
