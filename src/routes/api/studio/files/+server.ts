import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listTenantFiles, saveTenantFile } from "$lib/server/tenant-files";
import { getTenantBySlug } from "$lib/server/db";

function isUserAuthorizedForTenant(locals: App.Locals, tenant: any): boolean {
  if (!locals.user) return false;
  const adminEmails = [
    "bassem.bme@gmail.com",
    "bassem1alsa@gmail.com",
    process.env.ADMIN_EMAIL,
    process.env.RESEND_CONTACT_EMAIL,
  ]
    .filter(Boolean)
    .map((e) => e!.trim().toLowerCase());
  const userEmail = (locals.user.email || "").trim().toLowerCase();
  const isAdmin =
    adminEmails.includes(userEmail) || userEmail.endsWith("@ether.paris");
  return tenant.user_id === locals.user.id || isAdmin;
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json(
      { success: false, error: "Non autorisé. Veuillez vous connecter." },
      { status: 401 },
    );
  }

  const projectSlug = (url.searchParams.get("project") || "tester").trim();
  const tenant = await getTenantBySlug(projectSlug);
  if (!tenant) {
    return json({ success: false, error: "Site introuvable." }, { status: 404 });
  }

  if (!isUserAuthorizedForTenant(locals, tenant)) {
    return json(
      { success: false, error: "Accès refusé : vous n'êtes pas autorisé à accéder aux fichiers de ce site." },
      { status: 403 },
    );
  }

  const runnerUrl =
    process.env.RUNNER_API_URL ||
    (process.env.NODE_ENV === "production"
      ? "http://agent-runner:8080"
      : "http://localhost:8085");

  try {
    const res = await fetch(`${runnerUrl}/files/${projectSlug}`, {
      headers: {
        "x-git-repo-url": tenant.git_repo_url || "",
        "x-git-token": tenant.git_access_token || "",
      },
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

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json(
      { success: false, error: "Non autorisé. Veuillez vous connecter." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const projectSlug = (body.projectSlug || "tester").trim();
    const tenant = await getTenantBySlug(projectSlug);
    if (!tenant) {
      return json({ success: false, error: "Site introuvable." }, { status: 404 });
    }

    if (!isUserAuthorizedForTenant(locals, tenant)) {
      return json(
        { success: false, error: "Accès refusé : vous n'êtes pas autorisé à modifier les fichiers de ce site." },
        { status: 403 },
      );
    }
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
