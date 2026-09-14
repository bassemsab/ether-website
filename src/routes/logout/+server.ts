import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { deleteSession } from "$lib/server/db";
import { getSessionCookieDomain } from "$lib/server/auth";

async function performLogout({
  cookies,
  request,
  url,
}: {
  cookies: any;
  request: Request;
  url: URL;
}): Promise<never> {
  const sessionToken = cookies.get("session");
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    url.hostname;
  const cookieDomain = getSessionCookieDomain(host);

  if (sessionToken) {
    try {
      await deleteSession(sessionToken);
    } catch (err) {
      console.warn("[Logout] Error deleting session:", err);
    }
  }

  // Clear session and workspace cookies across .ether.paris domain and host
  cookies.delete("session", { path: "/", domain: cookieDomain });
  cookies.delete("session", { path: "/" });
  cookies.delete("ether_active_workspace", { path: "/", domain: cookieDomain });
  cookies.delete("ether_active_workspace", { path: "/" });
  cookies.delete("ether_admin_auth", { path: "/", domain: cookieDomain });
  cookies.delete("ether_admin_auth", { path: "/" });

  throw redirect(302, "/login?logged_out=1");
}

export const POST: RequestHandler = async ({ cookies, request, url }) => {
  return performLogout({ cookies, request, url });
};

export const GET: RequestHandler = async ({ cookies, request, url }) => {
  return performLogout({ cookies, request, url });
};
