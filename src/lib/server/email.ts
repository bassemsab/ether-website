import net from "node:net";
import { Resend } from "resend";

export type ContactPayload = {
  name: string;
  email: string;
  company?: string;
  message: string;
};

interface SmtpOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

function sendSmtpEmail(options: SmtpOptions): Promise<void> {
  const host = process.env.SMTP_HOST || "smtp.mail-server.svc.cluster.local";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER || "noreply@ether.paris";
  const pass = process.env.SMTP_PASS || "cXkWxnZLRnjVtNXhnlNuQc3iesN0xZq7";

  return new Promise((resolve, reject) => {
    const client = net.connect({ host, port });
    let step = 0;

    client.on("error", (err) => {
      client.destroy();
      reject(err);
    });

    client.on("data", (chunk) => {
      const resp = chunk.toString();

      if (resp.startsWith("4") || resp.startsWith("5")) {
        client.destroy();
        return reject(new Error(`SMTP Server Error: ${resp.trim()}`));
      }

      if (step === 0 && resp.startsWith("220")) {
        step = 1;
        client.write("EHLO cluster.local\r\n");
      } else if (step === 1 && resp.startsWith("250")) {
        step = 2;
        const authStr = Buffer.from(`\0${user}\0${pass}`).toString("base64");
        client.write(`AUTH PLAIN ${authStr}\r\n`);
      } else if (step === 2 && resp.startsWith("235")) {
        step = 3;
        const fromAddr = options.from.match(/<([^>]+)>/)?.[1] || options.from;
        client.write(`MAIL FROM:<${fromAddr}>\r\n`);
      } else if (step === 3 && resp.startsWith("250")) {
        step = 4;
        const toAddr = options.to.match(/<([^>]+)>/)?.[1] || options.to;
        client.write(`RCPT TO:<${toAddr}>\r\n`);
      } else if (step === 4 && resp.startsWith("250")) {
        step = 5;
        client.write("DATA\r\n");
      } else if (step === 5 && resp.startsWith("354")) {
        step = 6;
        const headers = [
          `From: ${options.from}`,
          `To: ${options.to}`,
          ...(options.replyTo ? [`Reply-To: ${options.replyTo}`] : []),
          `Subject: ${options.subject}`,
          "MIME-Version: 1.0",
          "Content-Type: text/html; charset=utf-8",
        ].join("\r\n");

        const message = `${headers}\r\n\r\n${options.html}\r\n.\r\n`;
        client.write(message);
      } else if (step === 6 && resp.startsWith("250")) {
        step = 7;
        client.write("QUIT\r\n");
        resolve();
      }
    });
  });
}

export async function sendContactEmail(payload: ContactPayload) {
  const to = process.env.RESEND_CONTACT_EMAIL || "support@ether.paris";
  const rawFrom =
    process.env.RESEND_FROM_EMAIL || "ether <contact@ether.paris>";
  const from = rawFrom.replace(/^Ether\b/, "ether");
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
          <div class="value">${payload.name || "Non renseigné"}</div>
        </div>
        
        <div class="field">
          <div class="label">Adresse Email</div>
          <div class="value"><a href="mailto:${payload.email}" style="color: #2563eb; text-decoration: none;">${payload.email}</a></div>
        </div>
        
        ${
          payload.company
            ? `
        <div class="field">
          <div class="label">Organisation</div>
          <div class="value">${payload.company}</div>
        </div>
        `
            : ""
        }
        
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

  // Prefer internal cluster SMTP mail server
  try {
    await sendSmtpEmail({
      from,
      to,
      subject,
      html,
      replyTo: payload.email,
    });
    console.log(
      `[sendContactEmail] Sent email via internal SMTP server to ${to}`,
    );
    return;
  } catch (smtpErr) {
    console.warn(
      "[sendContactEmail] SMTP send failed, trying Resend fallback if available:",
      smtpErr,
    );

    // Fallback to Resend if API token is provided
    const resendToken = process.env.RESEND_EMAIL_TOKEN;
    if (resendToken) {
      const resend = new Resend(resendToken);
      const { data, error } = await resend.emails.send({
        from,
        to,
        subject,
        html,
        replyTo: payload.email,
      });
      if (error) throw new Error(`Resend fallback failed: ${error.message}`);
      return data;
    }
    throw smtpErr;
  }
}

export async function sendOtpEmail(email: string, code: string) {
  const rawFrom =
    process.env.RESEND_FROM_EMAIL || "ether <contact@ether.paris>";
  // Ensure sender name is strictly lowercase 'ether'
  const from = rawFrom.replace(/^Ether\b/, "ether");
  const subject = `Votre code de connexion ether : ${code}`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>Code de connexion ether</title>
      <style>
        :root {
          color-scheme: light dark;
          supported-color-schemes: light dark;
        }
        body {
          margin: 0;
          padding: 0;
          background-color: #FBF9F5;
          font-family: -apple-system, BlinkMacSystemFont, "Space Grotesk", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1E1B39;
          -webkit-font-smoothing: antialiased;
        }
        .email-table {
          width: 100%;
          border-collapse: collapse;
          background-color: #FBF9F5;
          padding: 32px 16px;
        }
        .email-card {
          max-width: 480px;
          margin: 0 auto;
          background-color: #FFFFFF;
          border: 1.5px solid #1E1B39;
          border-radius: 20px;
          box-shadow: 4px 4px 0px 0px rgba(30, 27, 57, 0.15);
          padding: 36px 32px;
          text-align: center;
        }
        .logo-mark {
          display: inline-block;
          width: 72px;
          height: auto;
          vertical-align: middle;
        }
        .brand-subtitle {
          margin-top: 8px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #78716C;
        }
        .greeting {
          margin-top: 28px;
          font-size: 15px;
          line-height: 1.6;
          color: #1E1B39;
          text-align: left;
        }
        .code-container {
          margin: 26px 0;
          padding: 18px;
          background-color: #FAF7F2;
          border: 2px solid #1E1B39;
          border-radius: 14px;
          box-shadow: 3px 3px 0px 0px #1E1B39;
          text-align: center;
        }
        .code-number {
          font-family: "Space Grotesk", SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 34px;
          font-weight: 700;
          letter-spacing: 0.32em;
          color: #1E1B39;
          margin-left: 0.32em;
        }
        .expiry-note {
          font-size: 12px;
          line-height: 1.5;
          color: #78716C;
          text-align: left;
          margin: 0;
        }
        .footer-note {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #E7E5E4;
          font-size: 11px;
          letter-spacing: 0.08em;
          color: #A8A29E;
          text-align: center;
        }
        @media (prefers-color-scheme: dark) {
          body, .email-table {
            background-color: #0c0f17 !important;
          }
          .email-card {
            background-color: #151a28 !important;
            border-color: #384259 !important;
            box-shadow: 4px 4px 0px 0px #384259 !important;
            color: #F1F5F9 !important;
          }
          .greeting, .code-number {
            color: #F8FAFC !important;
          }
          .brand-subtitle, .expiry-note {
            color: #94A3B8 !important;
          }
          .code-container {
            background-color: #1E2538 !important;
            border-color: #4B5563 !important;
            box-shadow: 3px 3px 0px 0px #FF6B4A !important;
          }
          .footer-note {
            border-top-color: #2D3748 !important;
            color: #64748B !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #FBF9F5; color: #1E1B39;">
      <table role="presentation" class="email-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #FBF9F5;">
        <tr>
          <td align="center" style="padding: 32px 16px;">
            <div class="email-card" style="max-width: 480px; background-color: #FFFFFF; border: 1.5px solid #1E1B39; border-radius: 20px; box-shadow: 4px 4px 0px 0px rgba(30, 27, 57, 0.15); padding: 36px 32px; text-align: center;">
              
              <!-- Official ether logo -->
              <div style="text-align: center;">
                <img
                  src="https://img.ether.paris/ether-website/assets/ether-cropped.png?width=1000"
                  alt="ether"
                  width="72"
                  class="logo-mark"
                  style="display: inline-block; width: 72px; height: auto; margin: 0 auto; vertical-align: middle;"
                />
                <div class="brand-subtitle" style="margin-top: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: #78716C;">
                  studio &amp; hébergement web
                </div>
              </div>

              <!-- Message body -->
              <p class="greeting" style="margin-top: 28px; margin-bottom: 8px; font-size: 15px; line-height: 1.6; color: #1E1B39; text-align: left;">
                Bonjour,
              </p>
              <p class="greeting" style="margin-top: 0; margin-bottom: 20px; font-size: 14px; line-height: 1.6; color: #57534E; text-align: left;">
                Voici votre code de vérification à 6 chiffres pour accéder à votre espace studio et gérer vos sites :
              </p>

              <!-- OTP code container in ether retro style -->
              <div class="code-container" style="margin: 24px 0; padding: 18px; background-color: #FAF7F2; border: 2px solid #1E1B39; border-radius: 14px; box-shadow: 3px 3px 0px 0px #1E1B39; text-align: center;">
                <div class="code-number" style="font-family: 'Space Grotesk', SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 34px; font-weight: 700; letter-spacing: 0.32em; color: #1E1B39;">
                  ${code}
                </div>
              </div>

              <p class="expiry-note" style="font-size: 12px; line-height: 1.5; color: #78716C; text-align: left; margin: 0;">
                Ce code est valide pendant 10 minutes. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.
              </p>

              <div class="footer-note" style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #E7E5E4; font-size: 11px; letter-spacing: 0.08em; color: #A8A29E; text-align: center;">
                © ether · plateforme web &amp; studio · paris
              </div>

            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return sendSystemEmail({
    from,
    to: email,
    subject,
    html,
  });
}

/**
 * Robust email dispatcher: tries cluster SMTP first, then Resend API fallback.
 */
export async function sendSystemEmail(options: SmtpOptions): Promise<any> {
  const from = options.from || "ether <contact@ether.paris>";
  const isLocal =
    process.env.NODE_ENV !== "production" ||
    (process.env.BASE_URL || "").includes("localhost") ||
    process.platform === "darwin";

  // 1. Try internal cluster SMTP first
  try {
    await sendSmtpEmail({
      ...options,
      from,
    });
    console.log(`[sendSystemEmail] Sent email to ${options.to} via SMTP: "${options.subject}"`);
    return { success: true, provider: "smtp" };
  } catch (smtpErr: any) {
    if (isLocal && smtpErr?.code === "ECONNREFUSED") {
      console.log(`[sendSystemEmail] Local SMTP (${process.env.SMTP_HOST || "127.0.0.1"}:${process.env.SMTP_PORT || "2587"}) not reachable.`);
    } else {
      console.warn(
        "[sendSystemEmail] SMTP send failed, falling back to Resend:",
        smtpErr,
      );
    }
  }

  // 2. Fallback to Resend
  const resendToken =
    process.env.RESEND_EMAIL_TOKEN ||
    process.env.RESEND_API_KEY ||
    process.env.RESEDN_EMAIL_TOKEN;

  if (resendToken && !resendToken.includes("replace_with")) {
    try {
      const resend = new Resend(resendToken);
      const { data, error } = await resend.emails.send({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      if (!error) {
        console.log(`[sendSystemEmail] Sent email to ${options.to} via Resend: "${options.subject}"`);
        return { success: true, provider: "resend", data };
      }
      if (isLocal) {
        console.log(`[sendSystemEmail] Resend API key inactive (${error.message || error.name}).`);
      } else {
        console.warn("[sendSystemEmail] Resend error:", error);
      }
    } catch (rErr) {
      if (!isLocal) {
        console.warn("[sendSystemEmail] Resend send threw:", rErr);
      }
    }
  }

  // 3. In local development or testing, log instead of failing
  if (isLocal) {
    console.log("\n==================================================");
    console.log(`📧 [EMAIL MOCK / DEV DISPATCH]`);
    console.log(`   To     : ${options.to}`);
    console.log(`   Subject: ${options.subject}`);
    const codeMatch = options.subject.match(/(\d{6})/);
    if (codeMatch) {
      console.log(`   👉 LOGIN CODE: ${codeMatch[1]}`);
    }
    console.log("==================================================\n");
    return { success: true, provider: "mock" };
  }

  throw new Error(`Failed to deliver email to ${options.to} via SMTP and Resend`);
}

export interface PromptTopupEmailParams {
  email: string;
  tenantSlug: string;
  packName: string;
  prompts: number;
  priceFormatted: string;
  orderDate?: string;
}

/**
 * Sends a confirmation email to the user when they purchase a prompt top-up pack.
 */
export async function sendPromptTopupConfirmationEmail(params: PromptTopupEmailParams) {
  const from = "ether · studio <contact@ether.paris>";
  const subject = `Confirmation de commande · ${params.packName}`;
  const studioUrl = `https://studio.ether.paris/studio?project=${encodeURIComponent(params.tenantSlug)}`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirmation de commande · ether studio</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #FBF9F5;
          font-family: -apple-system, BlinkMacSystemFont, "Space Grotesk", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1E1B39;
        }
        .email-table {
          width: 100%;
          border-collapse: collapse;
          background-color: #FBF9F5;
          padding: 32px 16px;
        }
        .email-card {
          max-width: 520px;
          margin: 0 auto;
          background-color: #FFFFFF;
          border: 1.5px solid #1E1B39;
          border-radius: 20px;
          box-shadow: 4px 4px 0px 0px rgba(30, 27, 57, 0.15);
          padding: 36px 32px;
          text-align: left;
        }
        .badge {
          display: inline-block;
          background-color: #FAF7F2;
          border: 1px solid #1E1B39;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #FF5500;
        }
        .title {
          font-size: 22px;
          font-weight: 700;
          margin-top: 16px;
          margin-bottom: 8px;
          color: #1E1B39;
        }
        .text {
          font-size: 14px;
          line-height: 1.6;
          color: #4B5563;
        }
        .receipt-box {
          margin: 24px 0;
          padding: 20px;
          background-color: #FAF7F2;
          border: 1.5px solid #1E1B39;
          border-radius: 14px;
          box-shadow: 3px 3px 0px 0px #1E1B39;
        }
        .button {
          display: inline-block;
          background-color: #FF5500;
          color: #FFFFFF !important;
          text-decoration: none;
          font-weight: 600;
          font-size: 13px;
          padding: 12px 24px;
          border-radius: 10px;
          border: 1.5px solid #1E1B39;
          box-shadow: 2px 2px 0px 0px #1E1B39;
          text-align: center;
          margin-top: 16px;
        }
        .footer {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #E5E7EB;
          font-size: 11px;
          color: #9CA3AF;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <table class="email-table" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <div class="email-card">
              <span class="badge">ether · studio</span>
              <h1 class="title">Paiement confirmé 🎉</h1>
              <p class="text">
                Merci pour votre achat ! Votre solde de prompts a été crédité avec succès et est immédiatement disponible dans votre espace Studio.
              </p>

              <div class="receipt-box">
                <table width="100%" style="border-collapse: collapse; font-size: 13px;">
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280;">Article</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1E1B39;">${params.packName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280;">Prompts ajoutés</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #059669;">+${params.prompts} prompts</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280;">Validité</td>
                    <td style="padding: 6px 0; text-align: right; color: #1E1B39;">Sans expiration</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280;">Site associé</td>
                    <td style="padding: 6px 0; text-align: right; font-family: monospace; color: #1E1B39;">${params.tenantSlug}</td>
                  </tr>
                  <tr style="border-top: 1px solid rgba(30, 27, 57, 0.15);">
                    <td style="padding: 10px 0 0 0; font-weight: 700; font-size: 14px; color: #1E1B39;">Total réglé</td>
                    <td style="padding: 10px 0 0 0; text-align: right; font-weight: 700; font-size: 15px; color: #1E1B39;">${params.priceFormatted} TTC</td>
                  </tr>
                </table>
              </div>

              <div style="text-align: center; margin: 24px 0;">
                <a href="${studioUrl}" class="button" target="_blank">Ouvrir le Studio &rarr;</a>
              </div>

              <p class="text" style="font-size: 12px; color: #6B7280;">
                Une question ou besoin d'aide ? Répondez directement à cet email ou contactez notre équipe à <a href="mailto:contact@ether.paris" style="color: #FF5500;">contact@ether.paris</a>.
              </p>

              <div class="footer">
                © ether · plateforme &amp; studio web · paris
              </div>
            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return sendSystemEmail({
    from,
    to: params.email,
    subject,
    html,
  });
}

export interface DomainPurchaseEmailParams {
  email: string;
  domain: string;
  tenantSlug: string;
  priceFormatted: string;
}

/**
 * Sends a confirmation email to the user when they purchase a custom domain.
 */
export async function sendDomainPurchaseConfirmationEmail(params: DomainPurchaseEmailParams) {
  const from = "ether · domaines <contact@ether.paris>";
  const subject = `Activation de votre domaine · ${params.domain}`;
  const siteUrl = `https://${params.domain}`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Activation de votre domaine · ether</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #FBF9F5;
          font-family: -apple-system, BlinkMacSystemFont, "Space Grotesk", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1E1B39;
        }
        .email-table {
          width: 100%;
          border-collapse: collapse;
          background-color: #FBF9F5;
          padding: 32px 16px;
        }
        .email-card {
          max-width: 520px;
          margin: 0 auto;
          background-color: #FFFFFF;
          border: 1.5px solid #1E1B39;
          border-radius: 20px;
          box-shadow: 4px 4px 0px 0px rgba(30, 27, 57, 0.15);
          padding: 36px 32px;
          text-align: left;
        }
        .badge {
          display: inline-block;
          background-color: #FAF7F2;
          border: 1px solid #1E1B39;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #FF5500;
        }
        .title {
          font-size: 22px;
          font-weight: 700;
          margin-top: 16px;
          margin-bottom: 8px;
          color: #1E1B39;
        }
        .text {
          font-size: 14px;
          line-height: 1.6;
          color: #4B5563;
        }
        .receipt-box {
          margin: 24px 0;
          padding: 20px;
          background-color: #FAF7F2;
          border: 1.5px solid #1E1B39;
          border-radius: 14px;
          box-shadow: 3px 3px 0px 0px #1E1B39;
        }
        .button {
          display: inline-block;
          background-color: #FF5500;
          color: #FFFFFF !important;
          text-decoration: none;
          font-weight: 600;
          font-size: 13px;
          padding: 12px 24px;
          border-radius: 10px;
          border: 1.5px solid #1E1B39;
          box-shadow: 2px 2px 0px 0px #1E1B39;
          text-align: center;
          margin-top: 16px;
        }
        .footer {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #E5E7EB;
          font-size: 11px;
          color: #9CA3AF;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <table class="email-table" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <div class="email-card">
              <span class="badge">ether · domaines</span>
              <h1 class="title">Domaine réservé et actif 🎉</h1>
              <p class="text">
                Félicitations ! Votre nom de domaine personnalisé <strong>${params.domain}</strong> a été réservé et relié à votre site.
              </p>

              <div class="receipt-box">
                <table width="100%" style="border-collapse: collapse; font-size: 13px;">
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280;">Domaine</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600; font-family: monospace; color: #1E1B39;">${params.domain}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280;">Protection DNS</td>
                    <td style="padding: 6px 0; text-align: right; color: #059669; font-weight: 600;">Cloudflare Edge SSL</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280;">Email professionnel</td>
                    <td style="padding: 6px 0; text-align: right; font-family: monospace; color: #1E1B39;">contact@${params.domain}</td>
                  </tr>
                  <tr style="border-top: 1px solid rgba(30, 27, 57, 0.15);">
                    <td style="padding: 10px 0 0 0; font-weight: 700; font-size: 14px; color: #1E1B39;">Abonnement</td>
                    <td style="padding: 10px 0 0 0; text-align: right; font-weight: 700; font-size: 15px; color: #1E1B39;">${params.priceFormatted}</td>
                  </tr>
                </table>
              </div>

              <div style="text-align: center; margin: 24px 0;">
                <a href="${siteUrl}" class="button" target="_blank">Voir mon site en ligne &rarr;</a>
              </div>

              <p class="text" style="font-size: 12px; color: #6B7280;">
                La propagation DNS mondiale s'effectue généralement en quelques minutes.
              </p>

              <div class="footer">
                © ether · plateforme &amp; studio web · paris
              </div>
            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return sendSystemEmail({
    from,
    to: params.email,
    subject,
    html,
  });
}
