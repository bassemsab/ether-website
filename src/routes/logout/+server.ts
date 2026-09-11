import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { deleteSession } from "$lib/server/db";
import { getSessionCookieDomain } from "$lib/server/auth";

export const POST: RequestHandler = async ({ cookies, request, url }) => {
  const sessionToken = cookies.get("session");
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    url.hostname;
  const cookieDomain = getSessionCookieDomain(host);

  if (sessionToken) {
    // Delete session from database
    await deleteSession(sessionToken);

    // Clear session cookie across .ether.paris domain and host
    cookies.delete("session", { path: "/", domain: cookieDomain });
    cookies.delete("session", { path: "/" });
  }

  throw redirect(302, "/");
};

export const GET: RequestHandler = async () => {
  // GET requests also log out (for convenience)
  throw redirect(302, "/");
};
