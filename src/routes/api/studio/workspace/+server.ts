import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantBySlug } from "$lib/server/db";
import { getSessionCookieDomain } from "$lib/server/auth";

export const POST: RequestHandler = async ({ request, locals, cookies, url }) => {
  if (!locals.user) {
    return json(
      { success: false, error: "Non autorisé. Veuillez vous connecter." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const slug = (body.slug || "").trim().toLowerCase();

    if (!slug) {
      return json({ success: false, error: "Slug requis" }, { status: 400 });
    }

    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      return json({ success: false, error: "Site introuvable" }, { status: 404 });
    }

    const userEmail = (locals.user.email || "").trim().toLowerCase();
    const adminEmails = [
      "bassem.bme@gmail.com",
      "bassem1alsa@gmail.com",
      process.env.ADMIN_EMAIL,
      process.env.RESEND_CONTACT_EMAIL,
    ]
      .filter(Boolean)
      .map((e) => e!.trim().toLowerCase());

    const isAdmin =
      adminEmails.includes(userEmail) ||
      cookies.get("ether_admin_auth") === "true" ||
      userEmail.endsWith("@ether.paris");

    const isOwner =
      tenant.user_id === locals.user.id ||
      (tenant.email && tenant.email.trim().toLowerCase() === userEmail);

    if (!isOwner && !isAdmin) {
      return json(
        { success: false, error: "Accès refusé à ce projet." },
        { status: 403 },
      );
    }

    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      url.hostname;
    const cookieDomain = getSessionCookieDomain(host);

    cookies.set("ether_active_workspace", slug, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      domain: cookieDomain,
    });

    return json({
      success: true,
      slug,
      brand_name: tenant.brand_name || slug,
    });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
