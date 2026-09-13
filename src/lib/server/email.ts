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
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>Nouvelle prise de contact · ether</title>
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
        .logo-mark {
          display: inline-block;
          width: 72px;
          height: auto;
          vertical-align: middle;
        }
        .logo-light {
          display: inline-block;
        }
        .logo-dark {
          display: none;
        }
        @media (prefers-color-scheme: dark) {
          body, .email-table {
            background-color: #0c0f17 !important;
          }
          .email-card {
            background-color: #14141b !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: none !important;
            color: #F1F5F9 !important;
          }
          .logo-light {
            display: none !important;
          }
          .logo-dark {
            display: inline-block !important;
          }
          .logo-mark {
            filter: brightness(0) invert(1) !important;
            -webkit-filter: brightness(0) invert(1) !important;
          }
          .card-title, .val-text {
            color: #F8FAFC !important;
          }
          .brand-subtitle, .sub-text, .label-text {
            color: #94A3B8 !important;
          }
          .details-box {
            background-color: #1a1a24 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: none !important;
          }
          .message-box {
            background-color: #14141b !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            color: #F8FAFC !important;
          }
          .footer-note {
            border-top-color: rgba(255, 255, 255, 0.08) !important;
            color: #64748B !important;
          }
        }
        [data-ogsc] .email-card, [data-ogsb] .email-card {
          background-color: #14141b !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: none !important;
          color: #F1F5F9 !important;
        }
        [data-ogsc] .logo-light, [data-ogsb] .logo-light {
          display: none !important;
        }
        [data-ogsc] .logo-dark, [data-ogsb] .logo-dark {
          display: inline-block !important;
        }
        [data-ogsc] .details-box, [data-ogsb] .details-box {
          background-color: #1a1a24 !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: none !important;
        }
        [data-ogsc] .message-box, [data-ogsb] .message-box {
          background-color: #14141b !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          color: #F8FAFC !important;
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #FBF9F5; color: #1E1B39; -webkit-font-smoothing: antialiased;">
      <table role="presentation" class="email-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; background-color: #FBF9F5; padding: 36px 16px;">
        <tr>
          <td align="center" style="padding: 36px 16px; background-color: #FBF9F5;">
            <div class="email-card" style="max-width: 500px; margin: 0 auto; background-color: #FFFFFF; border: 1.5px solid #1E1B39; border-radius: 20px; box-shadow: 4px 4px 0px 0px rgba(30, 27, 57, 0.15); padding: 36px 32px; text-align: left;">
              
              <!-- Official ether logo -->
              <div style="text-align: center; margin-bottom: 24px;">
                <img
                  src="https://ether.paris/ether-logo-official.png"
                  alt="ether"
                  width="72"
                  class="logo-mark logo-light"
                  style="display: inline-block; width: 72px; height: auto; margin: 0 auto; vertical-align: middle;"
                />
                <!--[if !mso]><!-->
                <img
                  src="https://ether.paris/ether-logo-white.png"
                  alt="ether"
                  width="72"
                  class="logo-mark logo-dark"
                  style="display: none; width: 72px; height: auto; margin: 0 auto; vertical-align: middle;"
                />
                <!--<![endif]-->
                <div class="brand-subtitle" style="margin-top: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: #78716C; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif;">
                  studio &amp; hébergement web
                </div>
              </div>

              <!-- Badge -->
              <div style="text-align: center; margin-bottom: 16px;">
                <span style="display: inline-block; background-color: #FAF7F2; border: 1.5px solid #1E1B39; padding: 4px 14px; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #FF5500; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif;">
                  ether · contact
                </span>
              </div>

              <h1 class="card-title" style="font-size: 22px; font-weight: 700; margin: 0 0 10px 0; color: #1E1B39; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.02em;">
                Nouvelle prise de contact
              </h1>
              <p class="sub-text" style="font-size: 14px; line-height: 1.6; color: #57534E; text-align: center; margin: 0 0 20px 0; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif;">
                Un message a été envoyé depuis le formulaire de contact de ether.paris.
              </p>

              <!-- Details Box -->
              <div class="details-box" style="margin: 24px 0; padding: 20px; background-color: #FAF7F2; border: 1.5px solid #1E1B39; border-radius: 14px; box-shadow: 3px 3px 0px 0px #1E1B39;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif;">
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C;">Nom complet</td>
                    <td class="val-text" style="padding: 6px 0; text-align: right; font-weight: 700; color: #1E1B39;">${payload.name || "Non renseigné"}</td>
                  </tr>
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C;">Adresse e-mail</td>
                    <td style="padding: 6px 0; text-align: right;"><a href="mailto:${payload.email}" style="color: #FF5500; text-decoration: underline; font-weight: 600;">${payload.email}</a></td>
                  </tr>
                  ${payload.company ? `
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C;">Organisation</td>
                    <td class="val-text" style="padding: 6px 0; text-align: right; font-weight: 600; color: #1E1B39;">${payload.company}</td>
                  </tr>
                  ` : ""}
                  <tr style="border-top: 1px solid rgba(30, 27, 57, 0.15);">
                    <td colspan="2" class="val-text" style="padding: 12px 0 6px 0; font-weight: 700; font-size: 13px; color: #1E1B39;">
                      Message :
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" class="message-box val-text" style="padding: 8px 12px; background-color: #FFFFFF; border: 1px solid rgba(30, 27, 57, 0.15); border-radius: 8px; font-size: 13px; line-height: 1.6; color: #1E1B39; white-space: pre-wrap;">${payload.message}</td>
                  </tr>
                </table>
              </div>

              <div class="footer-note" style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #E7E5E4; font-size: 11px; letter-spacing: 0.08em; color: #A8A29E; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif;">
                © ether · plateforme web &amp; studio · paris
              </div>

            </div>
          </td>
        </tr>
      </table>
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
        .logo-light {
          display: inline-block;
        }
        .logo-dark {
          display: none;
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
            background-color: #14141b !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: none !important;
            color: #F1F5F9 !important;
          }
          .logo-light {
            display: none !important;
          }
          .logo-dark {
            display: inline-block !important;
          }
          .logo-mark {
            filter: brightness(0) invert(1) !important;
            -webkit-filter: brightness(0) invert(1) !important;
          }
          .greeting, .code-number {
            color: #F8FAFC !important;
          }
          .brand-subtitle, .expiry-note {
            color: #94A3B8 !important;
          }
          .code-container {
            background-color: #1a1a24 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: none !important;
          }
          .footer-note {
            border-top-color: rgba(255, 255, 255, 0.08) !important;
            color: #64748B !important;
          }
        }
        [data-ogsc] .email-card, [data-ogsb] .email-card {
          background-color: #14141b !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: none !important;
          color: #F1F5F9 !important;
        }
        [data-ogsc] .logo-light, [data-ogsb] .logo-light {
          display: none !important;
        }
        [data-ogsc] .logo-dark, [data-ogsb] .logo-dark {
          display: inline-block !important;
        }
        [data-ogsc] .code-container, [data-ogsb] .code-container {
          background-color: #1a1a24 !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: none !important;
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
                  src="https://ether.paris/ether-logo-official.png"
                  alt="ether"
                  width="72"
                  class="logo-mark logo-light"
                  style="display: inline-block; width: 72px; height: auto; margin: 0 auto; vertical-align: middle;"
                />
                <!--[if !mso]><!-->
                <img
                  src="https://ether.paris/ether-logo-white.png"
                  alt="ether"
                  width="72"
                  class="logo-mark logo-dark"
                  style="display: none; width: 72px; height: auto; margin: 0 auto; vertical-align: middle;"
                />
                <!--<![endif]-->
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
  locale?: string;
}

/**
 * Sends a confirmation email to the user when they purchase a prompt top-up pack.
 */
export async function sendPromptTopupConfirmationEmail(params: PromptTopupEmailParams) {
  const isEn = params.locale === "en";
  const rawFrom =
    process.env.RESEND_FROM_EMAIL || "ether <contact@ether.paris>";
  const from = rawFrom.replace(/^Ether\b/, "ether");
  const subject = isEn
    ? `Order confirmation · ${params.packName}`
    : `Confirmation de commande · ${params.packName}`;
  const studioUrl = `https://studio.ether.paris/studio?project=${encodeURIComponent(params.tenantSlug)}`;

  const greeting = isEn ? "Hello," : "Bonjour,";
  const intro = isEn
    ? `Your prompt top-up <strong>${params.packName}</strong> (+${params.prompts} prompts) has been confirmed and credited to your studio account.`
    : `Votre recharge de prompts <strong>${params.packName}</strong> (+${params.prompts} prompts) a été confirmée et créditée sur votre compte studio.`;
  const labelPack = isEn ? "Item" : "Article";
  const labelPrompts = isEn ? "Prompts credited" : "Prompts ajoutés";
  const valPrompts = `+${params.prompts} prompts`;
  const labelValidity = isEn ? "Validity" : "Validité";
  const valValidity = isEn ? "No expiration" : "Sans expiration";
  const labelSite = isEn ? "Associated site" : "Site associé";
  const labelTotal = isEn ? "Total paid" : "Total réglé";
  const valTotal = isEn ? `${params.priceFormatted} incl. VAT` : `${params.priceFormatted} TTC`;
  const ctaButton = isEn ? "Open Studio &rarr;" : "Ouvrir le Studio &rarr;";
  const note = isEn
    ? "Your prompts are immediately available to generate, design, and edit your websites in the ether studio."
    : "Vos prompts sont disponibles immédiatement pour concevoir, modifier et publier vos sites dans le studio ether.";
  const footerText = isEn
    ? "© ether · web platform &amp; studio · paris"
    : "© ether · plateforme web &amp; studio · paris";

  const html = `
    <!DOCTYPE html>
    <html lang="${isEn ? 'en' : 'fr'}">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>${subject}</title>
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
        .logo-light {
          display: inline-block;
        }
        .logo-dark {
          display: none;
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
          margin: 24px 0;
          padding: 20px;
          background-color: #FAF7F2;
          border: 2px solid #1E1B39;
          border-radius: 14px;
          box-shadow: 3px 3px 0px 0px #1E1B39;
          text-align: left;
        }
        .val-text {
          color: #1E1B39;
        }
        .cta-button {
          display: inline-block;
          background-color: #1E1B39;
          color: #FFFFFF !important;
          text-decoration: none;
          font-family: -apple-system, BlinkMacSystemFont, "Space Grotesk", "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          padding: 13px 32px;
          border-radius: 9999px;
          border: 1.5px solid #1E1B39;
          box-shadow: 2px 2px 0px 0px rgba(30, 27, 57, 0.2);
          text-align: center;
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
            background-color: #14141b !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: none !important;
            color: #F1F5F9 !important;
          }
          .logo-light {
            display: none !important;
          }
          .logo-dark {
            display: inline-block !important;
          }
          .logo-mark {
            filter: brightness(0) invert(1) !important;
            -webkit-filter: brightness(0) invert(1) !important;
          }
          .greeting, .val-text {
            color: #F8FAFC !important;
          }
          .brand-subtitle, .expiry-note, .label-text {
            color: #94A3B8 !important;
          }
          .code-container {
            background-color: #1a1a24 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: none !important;
          }
          .cta-button {
            background-color: #735af2 !important;
            color: #FFFFFF !important;
            border-color: #735af2 !important;
            box-shadow: 0 4px 14px rgba(115, 90, 242, 0.35) !important;
          }
          .footer-note {
            border-top-color: rgba(255, 255, 255, 0.08) !important;
            color: #64748B !important;
          }
        }
        [data-ogsc] .email-card, [data-ogsb] .email-card {
          background-color: #14141b !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: none !important;
          color: #F1F5F9 !important;
        }
        [data-ogsc] .logo-light, [data-ogsb] .logo-light {
          display: none !important;
        }
        [data-ogsc] .logo-dark, [data-ogsb] .logo-dark {
          display: inline-block !important;
        }
        [data-ogsc] .code-container, [data-ogsb] .code-container {
          background-color: #1a1a24 !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: none !important;
        }
        [data-ogsc] .cta-button, [data-ogsb] .cta-button {
          background-color: #735af2 !important;
          color: #FFFFFF !important;
          border-color: #735af2 !important;
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #FBF9F5; color: #1E1B39;">
      <table role="presentation" class="email-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #FBF9F5;">
        <tr>
          <td align="center" style="padding: 32px 16px;">
            <div class="email-card">
              
              <!-- Official ether logo -->
              <div style="text-align: center;">
                <img
                  src="https://ether.paris/ether-logo-official.png"
                  alt="ether"
                  width="72"
                  class="logo-mark logo-light"
                  style="display: inline-block; width: 72px; height: auto; margin: 0 auto; vertical-align: middle;"
                />
                <!--[if !mso]><!-->
                <img
                  src="https://ether.paris/ether-logo-white.png"
                  alt="ether"
                  width="72"
                  class="logo-mark logo-dark"
                  style="display: none; width: 72px; height: auto; margin: 0 auto; vertical-align: middle;"
                />
                <!--<![endif]-->
                <div class="brand-subtitle" style="margin-top: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: #78716C;">
                  studio &amp; hébergement web
                </div>
              </div>

              <!-- Message body -->
              <p class="greeting" style="margin-top: 28px; margin-bottom: 8px; font-size: 15px; line-height: 1.6; color: #1E1B39; text-align: left;">
                ${greeting}
              </p>
              <p class="greeting" style="margin-top: 0; margin-bottom: 20px; font-size: 14px; line-height: 1.6; color: #57534E; text-align: left;">
                ${intro}
              </p>

              <!-- Details Box in ether retro style -->
              <div class="code-container">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif;">
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C; font-size: 12px;">${labelPack}</td>
                    <td class="val-text" style="padding: 6px 0; text-align: right; font-weight: 700; color: #1E1B39; font-size: 12px;">${params.packName}</td>
                  </tr>
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C; font-size: 12px;">${labelPrompts}</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #059669; font-size: 12px;">${valPrompts}</td>
                  </tr>
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C; font-size: 12px;">${labelValidity}</td>
                    <td class="val-text" style="padding: 6px 0; text-align: right; color: #1E1B39; font-size: 12px;">${valValidity}</td>
                  </tr>
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C; font-size: 12px;">${labelSite}</td>
                    <td class="val-text" style="padding: 6px 0; text-align: right; font-family: 'Space Grotesk', SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #1E1B39; font-size: 12px;">${params.tenantSlug}</td>
                  </tr>
                  <tr style="border-top: 1px solid rgba(30, 27, 57, 0.12);">
                    <td class="val-text" style="padding: 10px 0 0 0; font-weight: 700; font-size: 13px; color: #1E1B39;">${labelTotal}</td>
                    <td class="val-text" style="padding: 10px 0 0 0; text-align: right; font-weight: 700; font-size: 13px; color: #1E1B39;">${valTotal}</td>
                  </tr>
                </table>
              </div>

              <!-- Button in ether rounded-full pill design -->
              <div style="text-align: center; margin: 26px 0 20px 0;">
                <a
                  href="${studioUrl}"
                  target="_blank"
                  class="cta-button"
                  style="display: inline-block; background-color: #1E1B39; color: #FFFFFF !important; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.18em; padding: 13px 32px; border-radius: 9999px; border: 1.5px solid #1E1B39; box-shadow: 2px 2px 0px 0px rgba(30, 27, 57, 0.2); text-align: center;"
                >
                  ${ctaButton}
                </a>
              </div>

              <p class="expiry-note" style="font-size: 12px; line-height: 1.5; color: #78716C; text-align: left; margin: 0;">
                ${note}
              </p>

              <div class="footer-note" style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #E7E5E4; font-size: 11px; letter-spacing: 0.08em; color: #A8A29E; text-align: center;">
                ${footerText}
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
  forwardToEmail?: string;
  locale?: string;
}

/**
 * Sends a confirmation email to the user when they purchase a custom domain via Stripe checkout.
 */
export async function sendDomainPurchaseConfirmationEmail(params: DomainPurchaseEmailParams) {
  const isEn = params.locale === "en";
  const rawFrom =
    process.env.RESEND_FROM_EMAIL || "ether <contact@ether.paris>";
  const from = rawFrom.replace(/^Ether\b/, "ether");
  const subject = isEn
    ? `Your domain ${params.domain} is active`
    : `Activation de votre domaine · ${params.domain}`;
  const siteUrl = `https://${params.domain}`;

  const greeting = isEn ? "Hello," : "Bonjour,";
  const intro = isEn
    ? `Your custom domain <strong>${params.domain}</strong> has been registered and connected to your ether site.`
    : `Votre nom de domaine <strong>${params.domain}</strong> a été réservé et relié à votre site ether.`;
  const labelDomain = isEn ? "Domain" : "Domaine";
  const labelProtection = isEn ? "DNS & SSL Protection" : "Protection DNS & SSL";
  const labelForward = isEn ? "Email forwarding" : "Redirection e-mail";
  const labelSubscription = isEn ? "Annual subscription" : "Abonnement annuel";
  const ctaButton = isEn ? "View my live site &rarr;" : "Voir mon site en ligne &rarr;";
  const forwardNote = isEn
    ? `All emails sent to contact@${params.domain} are automatically forwarded to your personal inbox in real time.`
    : `Tous les e-mails envoyés à contact@${params.domain} sont automatiquement transmis vers votre boîte personnelle en temps réel.`;
  const footerText = isEn
    ? "© ether · web platform &amp; studio · paris"
    : "© ether · plateforme web &amp; studio · paris";

  const html = `
    <!DOCTYPE html>
    <html lang="${isEn ? 'en' : 'fr'}">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>${subject}</title>
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
        .logo-light {
          display: inline-block;
        }
        .logo-dark {
          display: none;
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
          margin: 24px 0;
          padding: 20px;
          background-color: #FAF7F2;
          border: 2px solid #1E1B39;
          border-radius: 14px;
          box-shadow: 3px 3px 0px 0px #1E1B39;
          text-align: left;
        }
        .val-text {
          color: #1E1B39;
        }
        .cta-button {
          display: inline-block;
          background-color: #1E1B39;
          color: #FFFFFF !important;
          text-decoration: none;
          font-family: -apple-system, BlinkMacSystemFont, "Space Grotesk", "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          padding: 13px 32px;
          border-radius: 9999px;
          border: 1.5px solid #1E1B39;
          box-shadow: 2px 2px 0px 0px rgba(30, 27, 57, 0.2);
          text-align: center;
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
            background-color: #14141b !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: none !important;
            color: #F1F5F9 !important;
          }
          .logo-light {
            display: none !important;
          }
          .logo-dark {
            display: inline-block !important;
          }
          .logo-mark {
            filter: brightness(0) invert(1) !important;
            -webkit-filter: brightness(0) invert(1) !important;
          }
          .greeting, .val-text {
            color: #F8FAFC !important;
          }
          .brand-subtitle, .expiry-note, .label-text {
            color: #94A3B8 !important;
          }
          .code-container {
            background-color: #1a1a24 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: none !important;
          }
          .cta-button {
            background-color: #735af2 !important;
            color: #FFFFFF !important;
            border-color: #735af2 !important;
            box-shadow: 0 4px 14px rgba(115, 90, 242, 0.35) !important;
          }
          .footer-note {
            border-top-color: rgba(255, 255, 255, 0.08) !important;
            color: #64748B !important;
          }
        }
        [data-ogsc] .email-card, [data-ogsb] .email-card {
          background-color: #14141b !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: none !important;
          color: #F1F5F9 !important;
        }
        [data-ogsc] .logo-light, [data-ogsb] .logo-light {
          display: none !important;
        }
        [data-ogsc] .logo-dark, [data-ogsb] .logo-dark {
          display: inline-block !important;
        }
        [data-ogsc] .code-container, [data-ogsb] .code-container {
          background-color: #1a1a24 !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: none !important;
        }
        [data-ogsc] .cta-button, [data-ogsb] .cta-button {
          background-color: #735af2 !important;
          color: #FFFFFF !important;
          border-color: #735af2 !important;
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #FBF9F5; color: #1E1B39;">
      <table role="presentation" class="email-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #FBF9F5;">
        <tr>
          <td align="center" style="padding: 32px 16px;">
            <div class="email-card">
              
              <!-- Official ether logo -->
              <div style="text-align: center;">
                <img
                  src="https://ether.paris/ether-logo-official.png"
                  alt="ether"
                  width="72"
                  class="logo-mark logo-light"
                  style="display: inline-block; width: 72px; height: auto; margin: 0 auto; vertical-align: middle;"
                />
                <!--[if !mso]><!-->
                <img
                  src="https://ether.paris/ether-logo-white.png"
                  alt="ether"
                  width="72"
                  class="logo-mark logo-dark"
                  style="display: none; width: 72px; height: auto; margin: 0 auto; vertical-align: middle;"
                />
                <!--<![endif]-->
                <div class="brand-subtitle" style="margin-top: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: #78716C;">
                  studio &amp; hébergement web
                </div>
              </div>

              <!-- Message body -->
              <p class="greeting" style="margin-top: 28px; margin-bottom: 8px; font-size: 15px; line-height: 1.6; color: #1E1B39; text-align: left;">
                ${greeting}
              </p>
              <p class="greeting" style="margin-top: 0; margin-bottom: 20px; font-size: 14px; line-height: 1.6; color: #57534E; text-align: left;">
                ${intro}
              </p>

              <!-- Details Box in ether retro style -->
              <div class="code-container">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif;">
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C; font-size: 12px;">${labelDomain}</td>
                    <td class="val-text" style="padding: 6px 0; text-align: right; font-weight: 700; font-family: 'Space Grotesk', SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #1E1B39; font-size: 12px;">${params.domain}</td>
                  </tr>
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C; font-size: 12px;">${labelProtection}</td>
                    <td style="padding: 6px 0; text-align: right; color: #059669; font-weight: 600; font-size: 12px;">Cloudflare Edge + SSL</td>
                  </tr>
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C; font-size: 12px;">${labelForward}</td>
                    <td class="val-text" style="padding: 6px 0; text-align: right; font-family: 'Space Grotesk', SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #1E1B39;">contact@${params.domain} ➔ ${params.forwardToEmail || params.email}</td>
                  </tr>
                  <tr style="border-top: 1px solid rgba(30, 27, 57, 0.12);">
                    <td class="val-text" style="padding: 10px 0 0 0; font-weight: 700; font-size: 13px; color: #1E1B39;">${labelSubscription}</td>
                    <td class="val-text" style="padding: 10px 0 0 0; text-align: right; font-weight: 700; font-size: 13px; color: #1E1B39;">${params.priceFormatted}</td>
                  </tr>
                </table>
              </div>

              <!-- Button in ether rounded-full pill design -->
              <div style="text-align: center; margin: 26px 0 20px 0;">
                <a
                  href="${siteUrl}"
                  target="_blank"
                  class="cta-button"
                  style="display: inline-block; background-color: #1E1B39; color: #FFFFFF !important; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.18em; padding: 13px 32px; border-radius: 9999px; border: 1.5px solid #1E1B39; box-shadow: 2px 2px 0px 0px rgba(30, 27, 57, 0.2); text-align: center;"
                >
                  ${ctaButton}
                </a>
              </div>

              <p class="expiry-note" style="font-size: 12px; line-height: 1.5; color: #78716C; text-align: left; margin: 0;">
                ${forwardNote}
              </p>

              <div class="footer-note" style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #E7E5E4; font-size: 11px; letter-spacing: 0.08em; color: #A8A29E; text-align: center;">
                ${footerText}
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

export interface DomainLinkedEmailParams {
  email: string;
  domain: string;
  tenantSlug: string;
  forwardToEmail?: string;
  locale?: string;
}

/**
 * Sends a notification email when an existing domain has been verified and linked (NO purchase).
 */
export async function sendDomainLinkedEmail(params: DomainLinkedEmailParams) {
  const isEn = params.locale === "en";
  const rawFrom =
    process.env.RESEND_FROM_EMAIL || "ether <contact@ether.paris>";
  const from = rawFrom.replace(/^Ether\b/, "ether");
  const subject = isEn
    ? `Your domain ${params.domain} is connected`
    : `Votre domaine ${params.domain} est connecté`;
  const siteUrl = `https://${params.domain}`;

  const greeting = isEn ? "Hello," : "Bonjour,";
  const intro = isEn
    ? `Your custom domain <strong>${params.domain}</strong> is now connected and active on your ether site.`
    : `Votre nom de domaine <strong>${params.domain}</strong> est désormais relié et actif sur votre site ether.`;
  const labelDomain = isEn ? "Domain" : "Domaine";
  const labelStatus = isEn ? "Status" : "Statut";
  const valStatus = isEn ? "Verified & Active" : "Vérifié & Actif";
  const labelForward = isEn ? "Email forwarding" : "Redirection e-mail";
  const ctaButton = isEn ? "View my live site &rarr;" : "Voir mon site en ligne &rarr;";
  const forwardNote = isEn
    ? `All emails sent to contact@${params.domain} are automatically forwarded to your inbox in real time.`
    : `Tous les e-mails envoyés à contact@${params.domain} sont automatiquement transmis vers votre boîte personnelle en temps réel.`;
  const footerText = isEn
    ? "© ether · web platform &amp; studio · paris"
    : "© ether · plateforme web &amp; studio · paris";

  const html = `
    <!DOCTYPE html>
    <html lang="${isEn ? 'en' : 'fr'}">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>${subject}</title>
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
        .logo-light {
          display: inline-block;
        }
        .logo-dark {
          display: none;
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
          margin: 24px 0;
          padding: 20px;
          background-color: #FAF7F2;
          border: 2px solid #1E1B39;
          border-radius: 14px;
          box-shadow: 3px 3px 0px 0px #1E1B39;
          text-align: left;
        }
        .val-text {
          color: #1E1B39;
        }
        .cta-button {
          display: inline-block;
          background-color: #1E1B39;
          color: #FFFFFF !important;
          text-decoration: none;
          font-family: -apple-system, BlinkMacSystemFont, "Space Grotesk", "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          padding: 13px 32px;
          border-radius: 9999px;
          border: 1.5px solid #1E1B39;
          box-shadow: 2px 2px 0px 0px rgba(30, 27, 57, 0.2);
          text-align: center;
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
            background-color: #14141b !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: none !important;
            color: #F1F5F9 !important;
          }
          .logo-light {
            display: none !important;
          }
          .logo-dark {
            display: inline-block !important;
          }
          .logo-mark {
            filter: brightness(0) invert(1) !important;
            -webkit-filter: brightness(0) invert(1) !important;
          }
          .greeting, .val-text {
            color: #F8FAFC !important;
          }
          .brand-subtitle, .expiry-note, .label-text {
            color: #94A3B8 !important;
          }
          .code-container {
            background-color: #1a1a24 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: none !important;
          }
          .cta-button {
            background-color: #735af2 !important;
            color: #FFFFFF !important;
            border-color: #735af2 !important;
            box-shadow: 0 4px 14px rgba(115, 90, 242, 0.35) !important;
          }
          .footer-note {
            border-top-color: rgba(255, 255, 255, 0.08) !important;
            color: #64748B !important;
          }
        }
        [data-ogsc] .email-card, [data-ogsb] .email-card {
          background-color: #14141b !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: none !important;
          color: #F1F5F9 !important;
        }
        [data-ogsc] .logo-light, [data-ogsb] .logo-light {
          display: none !important;
        }
        [data-ogsc] .logo-dark, [data-ogsb] .logo-dark {
          display: inline-block !important;
        }
        [data-ogsc] .code-container, [data-ogsb] .code-container {
          background-color: #1a1a24 !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: none !important;
        }
        [data-ogsc] .cta-button, [data-ogsb] .cta-button {
          background-color: #735af2 !important;
          color: #FFFFFF !important;
          border-color: #735af2 !important;
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #FBF9F5; color: #1E1B39;">
      <table role="presentation" class="email-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #FBF9F5;">
        <tr>
          <td align="center" style="padding: 32px 16px;">
            <div class="email-card">
              
              <!-- Official ether logo -->
              <div style="text-align: center;">
                <img
                  src="https://ether.paris/ether-logo-official.png"
                  alt="ether"
                  width="72"
                  class="logo-mark logo-light"
                  style="display: inline-block; width: 72px; height: auto; margin: 0 auto; vertical-align: middle;"
                />
                <!--[if !mso]><!-->
                <img
                  src="https://ether.paris/ether-logo-white.png"
                  alt="ether"
                  width="72"
                  class="logo-mark logo-dark"
                  style="display: none; width: 72px; height: auto; margin: 0 auto; vertical-align: middle;"
                />
                <!--<![endif]-->
                <div class="brand-subtitle" style="margin-top: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: #78716C;">
                  studio &amp; hébergement web
                </div>
              </div>

              <!-- Message body -->
              <p class="greeting" style="margin-top: 28px; margin-bottom: 8px; font-size: 15px; line-height: 1.6; color: #1E1B39; text-align: left;">
                ${greeting}
              </p>
              <p class="greeting" style="margin-top: 0; margin-bottom: 20px; font-size: 14px; line-height: 1.6; color: #57534E; text-align: left;">
                ${intro}
              </p>

              <!-- Details Box in ether retro style -->
              <div class="code-container">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif;">
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C; font-size: 12px;">${labelDomain}</td>
                    <td class="val-text" style="padding: 6px 0; text-align: right; font-weight: 700; font-family: 'Space Grotesk', SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #1E1B39;">${params.domain}</td>
                  </tr>
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C; font-size: 12px;">${labelStatus}</td>
                    <td style="padding: 6px 0; text-align: right; color: #059669; font-weight: 600; font-size: 12px;">${valStatus}</td>
                  </tr>
                  <tr>
                    <td class="label-text" style="padding: 6px 0; color: #78716C; font-size: 12px;">${labelForward}</td>
                    <td class="val-text" style="padding: 6px 0; text-align: right; font-family: 'Space Grotesk', SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #1E1B39;">contact@${params.domain} ➔ ${params.forwardToEmail || params.email}</td>
                  </tr>
                </table>
              </div>

              <!-- Button in ether rounded-full pill design -->
              <div style="text-align: center; margin: 26px 0 20px 0;">
                <a
                  href="${siteUrl}"
                  target="_blank"
                  class="cta-button"
                  style="display: inline-block; background-color: #1E1B39; color: #FFFFFF !important; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Space Grotesk', 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.18em; padding: 13px 32px; border-radius: 9999px; border: 1.5px solid #1E1B39; box-shadow: 2px 2px 0px 0px rgba(30, 27, 57, 0.2); text-align: center;"
                >
                  ${ctaButton}
                </a>
              </div>

              <p class="expiry-note" style="font-size: 12px; line-height: 1.5; color: #78716C; text-align: left; margin: 0;">
                ${forwardNote}
              </p>

              <div class="footer-note" style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #E7E5E4; font-size: 11px; letter-spacing: 0.08em; color: #A8A29E; text-align: center;">
                ${footerText}
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
