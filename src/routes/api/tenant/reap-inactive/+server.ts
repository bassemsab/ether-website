import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { reapInactiveTenants } from "$lib/server/tenant-wake";

export const POST: RequestHandler = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  const cronSecret =
    process.env.CRON_SECRET || process.env.ADMIN_PASSWORD || "ether-admin";

  if (authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await reapInactiveTenants(48);
  return json({ success: true, ...result });
};
