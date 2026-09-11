import type { PageServerLoad } from "./$types";
import { getRunnerProfiles, type RunnerProfileInfo } from "$lib/server/agent-bridge";

const COOKIE_NAME = "ether_admin_auth";

export const load: PageServerLoad = async ({ cookies, locals }) => {
  const authCookie = cookies.get(COOKIE_NAME);
  const authenticated = authCookie === "true" || !!locals.user;

  let profiles: RunnerProfileInfo[] = [];
  if (authenticated) {
    try {
      profiles = await getRunnerProfiles();
    } catch (e) {
      console.error("Failed to fetch runner profiles", e);
    }
  }

  return {
    authenticated,
    profiles,
  };
};
