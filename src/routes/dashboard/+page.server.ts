import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { getSessionByToken, getTenantsByUserId } from "$lib/server/db";
import { processDomainCheckoutSession } from "$lib/server/stripe";

export const load: PageServerLoad = async ({ cookies, url }) => {
  const sessionToken = cookies.get("session");

  if (!sessionToken) {
    throw redirect(302, "/login");
  }

  // Handle returning from Stripe domain checkout
  const domainSessionId = url.searchParams.get("session_id");
  if (domainSessionId && url.searchParams.get("domain_success") === "true") {
    try {
      await processDomainCheckoutSession(domainSessionId);
    } catch (err: any) {
      console.warn(`[Dashboard Load] Could not verify domain session ${domainSessionId}:`, err.message);
    }
  }

  const session = await getSessionByToken(sessionToken);

  if (!session) {
    cookies.delete("session", { path: "/" });
    throw redirect(302, "/login");
  }

  // Get user info and tenants
  const user = {
    id: session.user_id,
    email: session.email || session.github_email || "user@ether.paris",
    gitea_username: session.gitea_username || null,
    gitea_token: session.gitea_token || null,
    github_id: session.github_id,
    github_username: session.github_username,
    github_email: session.github_email,
    avatar_url: session.avatar_url,
  };

  const tenants = await getTenantsByUserId(session.user_id, session.email);

  return {
    user,
    tenants,
  };
};
