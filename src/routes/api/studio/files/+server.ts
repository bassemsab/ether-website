import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listTenantFiles, saveTenantFile } from "$lib/server/tenant-files";

export const GET: RequestHandler = async ({ url }) => {
  const projectSlug = (url.searchParams.get("project") || "tester").trim();

  try {
    const files = listTenantFiles(projectSlug);
    return json({
      success: true,
      projectSlug,
      files,
    });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const projectSlug = (body.projectSlug || "tester").trim();
    const filePath = (body.path || "").trim();
    const content = typeof body.content === "string" ? body.content : "";

    if (!filePath) {
      return json(
        { success: false, error: "Chemin de fichier requis" },
        { status: 400 },
      );
    }

    saveTenantFile(projectSlug, filePath, content);

    return json({
      success: true,
      projectSlug,
      path: filePath,
      savedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
