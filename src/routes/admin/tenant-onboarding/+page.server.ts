import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user;

  if (!user) {
    throw redirect(302, "/login");
  }

  return {
    user: {
      id: user.id,
      github_id: user.github_id,
      github_username: user.github_username,
      github_email: user.github_email,
      avatar_url: user.avatar_url,
    },
  };
};
