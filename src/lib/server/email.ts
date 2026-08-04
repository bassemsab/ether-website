import { Resend } from "resend";

const resendApiKey = process.env.RESEND_EMAIL_TOKEN ?? "";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type ContactPayload = {
  name: string;
  email: string;
  company?: string;
  message: string;
};

export async function sendContactEmail(payload: ContactPayload) {
  if (!resend) {
    console.warn("Resend API key not configured, skipping email send.");
    return;
  }

  const to = process.env.RESEND_CONTACT_EMAIL || "support@ether.paris";
  const from = process.env.RESEND_FROM_EMAIL || "Ether <contact@ether.paris>";

  const subject = `Nouvelle prise de contact · ${payload.name}`;
  const html = `
    <h2>Nouveau message depuis ether.paris</h2>
    <p><strong>Nom :</strong> ${payload.name}</p>
    <p><strong>Email :</strong> ${payload.email}</p>
    <p><strong>Organisation :</strong> ${payload.company ?? "—"}</p>
    <p><strong>Message :</strong></p>
    <p>${payload.message.replace(/\n/g, "<br/>")}</p>
  `;

  await resend.emails.send({
    from,
    to,
    subject,
    html,
    replyTo: payload.email,
  });
}
