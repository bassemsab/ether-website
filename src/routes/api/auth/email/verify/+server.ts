import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { verifyEmailCode } from "$lib/server/email-login-codes";
import { getOrCreateUserByEmail, createSession } from "$lib/server/db";
import { generateSessionToken, getSessionCookieDomain, SESSION_MAX_AGE_SECONDS } from "$lib/server/auth";

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  try {
    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();
    const code = (body.code || "").trim();

    if (!email || !code) {
      return json({ success: false, error: "Email et code requis" }, { status: 400 });
    }

    const verifyResult = await verifyEmailCode(email, code);

    if (!verifyResult.ok) {
      const errorMap: Record<string, string> = {
        malformed: "Format du code invalide (6 chiffres requis)",
        not_found: "Aucun code trouvé ou code déjà utilisé. Veuillez en redemander un.",
        expired: "Ce code a expiré (validité 10 minutes). Veuillez en redemander un.",
        too_many_attempts: "Nombre maximal de tentatives dépassé. Veuillez redemander un nouveau code.",
        wrong_code: "Code incorrect. Veuillez vérifier et réessayer.",
      };

      return json(
        { success: false, error: errorMap[verifyResult.reason] || "Code invalide" },
        { status: 400 }
      );
    }

    // Code verified: get or create user
    const user = await getOrCreateUserByEmail(email);
    if (!user) {
      return json(
        { success: false, error: "Impossible de créer ou récupérer l'utilisateur" },
        { status: 500 }
      );
    }

    // Create session (30 days validity)
    const sessionToken = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const session = await createSession(user.id, sessionToken, expiresAt);
    if (!session) {
      return json({ success: false, error: "Erreur lors de la création de la session" }, { status: 500 });
    }

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.hostname;
    const cookieDomain = getSessionCookieDomain(host);

    // Set cookie scoped across all .ether.paris subdomains (studio, app, tenant)
    cookies.set("session", sessionToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE_SECONDS,
      domain: cookieDomain,
    });

    const targetRedirect = body.redirect || "/dashboard";

    return json({
      success: true,
      message: "Connexion réussie",
      redirect: targetRedirect,
    });
  } catch (err: any) {
    console.error("[api/auth/email/verify] Error:", err);
    return json(
      { success: false, error: err.message || "Erreur serveur" },
      { status: 500 }
    );
  }
};
