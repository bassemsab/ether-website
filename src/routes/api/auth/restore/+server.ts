import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getSessionByToken } from "$lib/server/db";
import {
  getSessionCookieDomain,
  SESSION_MAX_AGE_SECONDS,
} from "$lib/server/auth";

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  try {
    const body = await request.json();
    const token = (body.sessionToken || "").trim();

    if (!token) {
      return json({ success: false, error: "Token manquant" }, { status: 400 });
    }

    const session = await getSessionByToken(token);
    if (!session) {
      return json(
        { success: false, error: "Session expirée ou invalide" },
        { status: 401 },
      );
    }

    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      url.hostname;
    const cookieDomain = getSessionCookieDomain(host);

    cookies.set("session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE_SECONDS,
      domain: cookieDomain,
    });

    return json({
      success: true,
      user: {
        id: session.user_id,
        email: session.email,
      },
    });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
