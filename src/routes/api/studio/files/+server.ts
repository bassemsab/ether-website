import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listTenantFiles, saveTenantFile } from "$lib/server/tenant-files";

export const GET: RequestHandler = async ({ url }) => {
  const projectSlug = (url.searchParams.get("project") || "tester").trim();
  const runnerUrl =
    process.env.RUNNER_API_URL ||
    (process.env.NODE_ENV === "production"
      ? "http://agent-runner:8080"
      : "http://localhost:8085");

  try {
    const res = await fetch(`${runnerUrl}/files/${projectSlug}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const jsonRes = await res.json();
      if (jsonRes.success && jsonRes.files) {
        return json(jsonRes);
      }
    }
  } catch {}

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

    const runnerUrl =
      process.env.RUNNER_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "http://agent-runner:8080"
        : "http://localhost:8085");

    try {
      const res = await fetch(`${runnerUrl}/files/${projectSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, content }),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        return json(await res.json());
      }
    } catch {}

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
