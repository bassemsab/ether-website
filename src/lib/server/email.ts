import { Resend } from "resend";

export type ContactPayload = {
  name: string;
  email: string;
  company?: string;
  message: string;
};

export async function sendContactEmail(payload: ContactPayload) {
  const apiKey = process.env.RESEND_EMAIL_TOKEN;
  if (!apiKey) {
    console.error("[sendContactEmail] RESEND_EMAIL_TOKEN is missing in process.env");
    throw new Error("RESEND_EMAIL_TOKEN is missing in environment.");
  }

  const resend = new Resend(apiKey);
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

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    replyTo: payload.email,
  });

  if (error) {
    console.error("[sendContactEmail] Resend API error:", error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
