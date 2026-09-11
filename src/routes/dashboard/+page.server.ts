import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { getSessionByToken, getTenantsByUserId } from "$lib/server/db";

export const load: PageServerLoad = async ({ cookies }) => {
  const sessionToken = cookies.get("session");

  if (!sessionToken) {
    throw redirect(302, "/login");
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
