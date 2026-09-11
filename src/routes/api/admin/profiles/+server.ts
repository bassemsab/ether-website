import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getRunnerProfiles,
  startProfileAuth,
  finishProfileAuth,
} from "$lib/server/agent-bridge";

export const GET: RequestHandler = async ({ cookies, locals }) => {
  const isAuth = cookies.get("ether_admin_auth") === "true" || !!locals.user;
  if (!isAuth) {
    return json({ success: false, error: "Non autorisé" }, { status: 401 });
  }

  try {
    const profiles = await getRunnerProfiles();
    return json({ success: true, profiles });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const isAuth = cookies.get("ether_admin_auth") === "true" || !!locals.user;
  if (!isAuth) {
    return json({ success: false, error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const action = body.action;
    const profile = (body.profile || "primary").trim();

    if (action === "start_auth") {
      const { authUrl } = await startProfileAuth(profile);
      return json({ success: true, profile, authUrl });
    }

    if (action === "finish_auth") {
      const code = (body.code || "").trim();
      if (!code) {
        return json({ success: false, error: "Code d'autorisation requis" }, { status: 400 });
      }
      const result = await finishProfileAuth(profile, code);
      return json({ success: true, profile, email: result.email });
    }

    return json({ success: false, error: "Action inconnue" }, { status: 400 });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
