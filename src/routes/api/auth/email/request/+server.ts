import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createEmailLoginCode } from "$lib/server/email-login-codes";
import { sendOtpEmail } from "$lib/server/email";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();

    // Basic email format check
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: "Adresse email invalide" }, { status: 400 });
    }

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
