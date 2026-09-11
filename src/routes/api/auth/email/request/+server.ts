import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkEmailDomain } from "$lib/server/email-domain-check";
import { createEmailLoginCode } from "$lib/server/email-login-codes";
import { sendOtpEmail } from "$lib/server/email";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const rawEmail = typeof body?.email === "string" ? body.email : "";

    // Validate email acceptability exactly as ami-frontend does:
    // 1. Format check
    // 2. Reject disposable / burner domains (~55k denylist)
    // 3. Reject domains without active DNS MX records
    const verdict = await checkEmailDomain(rawEmail);
    if (!verdict.ok) {
      const errorMap: Record<string, string> = {
        malformed: "Format de l'adresse email invalide.",
        disposable: "Les adresses email temporaires ou jetables ne sont pas autorisées.",
        no_mx: "Ce domaine ne possède aucun serveur de réception d'emails valide (absence d'enregistrements DNS MX).",
      };
      return json(
        { success: false, error: errorMap[verdict.reason] || "Adresse email non acceptée." },
        { status: 400 }
      );
    }

    const email = verdict.email;
    const code = await createEmailLoginCode(email);
    await sendOtpEmail(email, code);

    return json({
      success: true,
      message: `Un code de connexion a été envoyé à ${email}`,
    });
  } catch (err: any) {
    console.error("[api/auth/email/request] Error:", err);
    return json(
      { success: false, error: err.message || "Erreur lors de l'envoi du code" },
      { status: 500 }
    );
  }
};
