import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { searchDomains } from "$lib/server/domains";

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get("q") || "";

  if (!query || query.trim().length < 2) {
    return json({ success: true, results: [] });
  }

  try {
    const results = await searchDomains(query);
    return json({ success: true, results });
  } catch (err: any) {
    console.error("[api/domains/search] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
