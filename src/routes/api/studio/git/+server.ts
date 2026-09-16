import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getTenantBySlug,
  getUserOwnedTenants,
  updateTenantGitPassword,
} from "$lib/server/db";
import {
  ensureTenantGitPassword,
  generateSecureGitPassword,
  setGiteaUserPassword,
  listGiteaUserKeys,
  addGiteaUserKey,
  deleteGiteaUserKey,
  ensureGiteaUser,
} from "$lib/server/gitea";

async function resolveAuthorizedTenant(locals: App.Locals, requestedSlug?: string | null) {
  if (!locals.user) return null;
  const slug = requestedSlug?.trim().toLowerCase();
  if (!slug) return null;

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return null;

  const adminEmails = [
    process.env.ADMIN_EMAIL,
    process.env.RESEND_CONTACT_EMAIL,
  ]
    .filter(Boolean)
    .map((e) => e!.trim().toLowerCase());

  const userEmail = (locals.user.email || "").trim().toLowerCase();
  const isAdmin =
    adminEmails.includes(userEmail) || userEmail.endsWith("@ether.paris");

  if (tenant.user_id === locals.user.id || isAdmin) {
    return tenant;
  }

  // Check owned tenants by email
  const owned = await getUserOwnedTenants(locals.user.id, locals.user.email);
  if (owned.some((t) => t.slug === slug || t.id === tenant.id)) {
    return tenant;
  }

  return null;
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ success: false, error: "Non authentifié" }, { status: 401 });
  }

  const slug = url.searchParams.get("slug") || url.searchParams.get("project");
  const tenant = await resolveAuthorizedTenant(locals, slug);

  if (!tenant || !tenant.slug) {
    return json(
      { success: false, error: "Projet introuvable ou accès non autorisé" },
      { status: 404 },
    );
  }

  const email = tenant.email || locals.user.email || "user@ether.paris";
  const { username: giteaUsername } = await ensureGiteaUser(
    email,
    locals.user.gitea_username || undefined,
  );

  const gitPassword = await ensureTenantGitPassword(
    giteaUsername,
    tenant.slug,
    tenant.git_password,
  );

  const sshKeys = await listGiteaUserKeys(giteaUsername);

  const httpsCloneUrl =
    tenant.git_repo_url ||
    `https://git.ether.paris/${giteaUsername}/${tenant.slug}.git`;
  const sshCloneUrl = `ssh://git@git.ether.paris:2222/${giteaUsername}/${tenant.slug}.git`;

  return json({
    success: true,
    slug: tenant.slug,
    brandName: tenant.brand_name || tenant.slug,
    username: giteaUsername,
    gitPassword,
    gitRepoUrl: httpsCloneUrl,
    sshUrl: sshCloneUrl,
    isPrivate: true,
    sshKeys,
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ success: false, error: "Non authentifié" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const action = body.action;
    const slug = body.slug;

    const tenant = await resolveAuthorizedTenant(locals, slug);
    if (!tenant || !tenant.slug) {
      return json(
        { success: false, error: "Projet introuvable ou accès non autorisé" },
        { status: 404 },
      );
    }

    const email = tenant.email || locals.user.email || "user@ether.paris";
    const { username: giteaUsername } = await ensureGiteaUser(
      email,
      locals.user.gitea_username || undefined,
    );

    if (action === "regenerate-password") {
      const newPassword = generateSecureGitPassword();
      const ok = await setGiteaUserPassword(giteaUsername, newPassword);
      if (!ok) {
        return json(
          {
            success: false,
            error: "Impossible de mettre à jour le mot de passe sur le serveur Git.",
          },
          { status: 500 },
        );
      }

      await updateTenantGitPassword(tenant.slug, newPassword);

      return json({
        success: true,
        message: "Nouveau mot de passe Git généré avec succès.",
        gitPassword: newPassword,
      });
    }

    if (action === "add-ssh-key") {
      const { title, key } = body;
      if (!key || typeof key !== "string") {
        return json(
          { success: false, error: "Clé SSH publique requise." },
          { status: 400 },
        );
      }

      const result = await addGiteaUserKey(giteaUsername, title, key);
      if (!result.success) {
        return json(
          { success: false, error: result.error || "Erreur lors de l'ajout de la clé." },
          { status: 400 },
        );
      }

      const updatedKeys = await listGiteaUserKeys(giteaUsername);
      return json({
        success: true,
        message: "Clé SSH ajoutée avec succès.",
        key: result.key,
        sshKeys: updatedKeys,
      });
    }

    if (action === "delete-ssh-key") {
      const keyId = parseInt(body.keyId, 10);
      if (isNaN(keyId)) {
        return json({ success: false, error: "ID de clé invalide." }, { status: 400 });
      }

      const ok = await deleteGiteaUserKey(giteaUsername, keyId);
      if (!ok) {
        return json(
          { success: false, error: "Impossible de supprimer la clé SSH." },
          { status: 500 },
        );
      }

      const updatedKeys = await listGiteaUserKeys(giteaUsername);
      return json({
        success: true,
        message: "Clé SSH supprimée.",
        sshKeys: updatedKeys,
      });
    }

    return json({ success: false, error: "Action inconnue." }, { status: 400 });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
