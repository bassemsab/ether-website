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
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Nouvelle prise de contact</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #f9fafb;
          color: #1f2937;
          padding: 24px;
          margin: 0;
        }
        .container {
          max-width: 600px;
          background-color: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 32px;
          margin: 0 auto;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        .header {
          border-bottom: 2px solid #2563eb;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .header h2 {
          margin: 0;
          color: #2563eb;
          font-size: 20px;
          font-weight: 700;
        }
        .header p {
          margin: 4px 0 0 0;
          color: #6b7280;
          font-size: 14px;
        }
        .field {
          margin-bottom: 16px;
        }
        .label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #9ca3af;
          margin-bottom: 4px;
        }
        .value {
          font-size: 15px;
          color: #111827;
          font-weight: 500;
        }
        .message-box {
          background-color: #f3f4f6;
          border-left: 4px solid #2563eb;
          border-radius: 0 8px 8px 0;
          padding: 16px;
          margin-top: 24px;
          font-size: 15px;
          line-height: 1.6;
          white-space: pre-wrap;
          color: #374151;
        }
        .footer {
          margin-top: 32px;
          border-top: 1px solid #e5e7eb;
          padding-top: 16px;
          font-size: 12px;
          color: #9ca3af;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>✉️ Nouvelle Prise de Contact</h2>
          <p>ether.paris Notification</p>
        </div>
        
        <div class="field">
          <div class="label">Nom complet</div>
          <div class="value">${payload.name || 'Non renseigné'}</div>
        </div>
        
        <div class="field">
          <div class="label">Adresse Email</div>
          <div class="value"><a href="mailto:${payload.email}" style="color: #2563eb; text-decoration: none;">${payload.email}</a></div>
        </div>
        
        ${payload.company ? `
        <div class="field">
          <div class="label">Organisation</div>
          <div class="value">${payload.company}</div>
        </div>
        ` : ''}
        
        <div class="field" style="margin-bottom: 0;">
          <div class="label">Message</div>
          <div class="message-box">${payload.message}</div>
        </div>
        
        <div class="footer">
          Ce message a été envoyé depuis le formulaire de contact de ether.paris. Vous pouvez y répondre directement.
        </div>
      </div>
    </body>
    </html>
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
