import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY ?? '';

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type ContactPayload = {
  name: string;
  email: string;
  company?: string;
  message: string;
};

export async function sendContactEmail(payload: ContactPayload) {
  if (!resend) {
    console.warn('Resend API key not configured, skipping email send.');
    return;
  }

  const to = process.env.RESEND_CONTACT_EMAIL;
  if (!to) {
    console.warn('RESEND_CONTACT_EMAIL is not set, skipping email send.');
    return;
  }

  const subject = `Nouvelle prise de contact · ${payload.name}`;
  const html = `
    <h2>Nouveau message depuis ether.studio</h2>
    <p><strong>Nom :</strong> ${payload.name}</p>
    <p><strong>Email :</strong> ${payload.email}</p>
    <p><strong>Organisation :</strong> ${payload.company ?? '—'}</p>
    <p><strong>Message :</strong></p>
    <p>${payload.message.replace(/\n/g, '<br/>')}</p>
  `;

  await resend.emails.send({
    from: 'Ether Studio <hello@mail.ether.studio>',
    to,
    subject,
    html
  });
}
