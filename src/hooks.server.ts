import type { Handle } from "@sveltejs/kit";
import { getSessionByToken, cleanupExpiredSessions } from "$lib/server/db";

// Clean up expired sessions periodically
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

export const handle: Handle = async ({ event, resolve }) => {
  // Cleanup expired sessions every hour
  if (Date.now() - lastCleanup > CLEANUP_INTERVAL) {
    await cleanupExpiredSessions();
    lastCleanup = Date.now();
  }

  // Get session from cookie
  const sessionToken = event.cookies.get("session");

  if (sessionToken) {
    const session = await getSessionByToken(sessionToken);

    if (session) {
      // Attach user to locals
      event.locals.user = {
        id: session.user_id,
        email: session.email || session.github_email || null,
        gitea_username: session.gitea_username || null,
        gitea_token: session.gitea_token || null,
        github_id: session.github_id || null,
        github_username: session.github_username || null,
        github_email: session.github_email || null,
        github_access_token: session.github_access_token || null,
        avatar_url: session.avatar_url || null,
      };
    } else {
      // Invalid session, clear cookie
      event.cookies.delete("session", { path: "/" });
      event.locals.user = null;
    }
  } else {
    event.locals.user = null;
  }

  const response = await resolve(event);
  return response;
};
