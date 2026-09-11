import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantBySlug, createTenantWebsite, updateUserGitea, updateTenantStatus } from "$lib/server/db";
import { ensureGiteaUser, createGiteaRepo, seedTenantRepoTemplate } from "$lib/server/gitea";
import { applyTenantK8s } from "$lib/server/k8s-tenant";

const RESERVED_SLUGS = new Set([
  "api", "admin", "studio", "git", "mail", "smtp", "www", "app", "dev", "staging", "auth", "login", "dashboard"
]);

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ success: false, error: "Non autorisé. Veuillez vous connecter." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rawSlug = (body.slug || "").trim().toLowerCase();
    const brandName = (body.brandName || rawSlug || "Mon Site").trim();

    // Sanitize slug
    const slug = rawSlug.replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");

    if (slug.length < 3 || slug.length > 32) {
      return json({ success: false, error: "Le sous-domaine doit comporter entre 3 et 32 caractères." }, { status: 400 });
    }

    if (RESERVED_SLUGS.has(slug)) {
      return json({ success: false, error: "Ce sous-domaine est réservé par la plateforme." }, { status: 400 });
    }

    // Check slug availability
    const existing = await getTenantBySlug(slug);
    if (existing) {
      return json({ success: false, error: `Le sous-domaine '${slug}.ether.paris' est déjà utilisé.` }, { status: 409 });
    }

    const email = locals.user.email || "user@ether.paris";

    // 1. Ensure Gitea user exists
    const { username: giteaUsername, token: giteaToken } = await ensureGiteaUser(
      email,
      locals.user.gitea_username || undefined
    );
    await updateUserGitea(locals.user.id, giteaUsername, giteaToken);

    // 2. Create Gitea repository
    const repo = await createGiteaRepo(
      giteaUsername,
      slug,
      `Site web pour ${brandName} (${slug}.ether.paris)`
    );

    // 3. Seed repository with base SvelteKit 5 + Bun template
    await seedTenantRepoTemplate(giteaUsername, slug, {
      brandName,
      domain: `${slug}.ether.paris`,
      slug,
    });

    // 4. Create database record
    const tenant = await createTenantWebsite(locals.user.id, slug, brandName, email);
    if (!tenant) {
      throw new Error("Échec de la création du tenant en base de données.");
    }

    // Update with git repo URL and access token
    await updateTenantStatus(slug, "active", {
      git_repo_url: repo.clone_url,
      git_access_token: giteaToken,
    });

    // 5. Apply Kubernetes resources (Namespace, NetworkPolicy, PVC, Deployments, Ingress)
    const k8sOk = await applyTenantK8s({
      slug,
      brandName,
      subdomain: `${slug}.ether.paris`,
      namespace: `tenant-${slug}`,
    });

    return json({
      success: true,
      message: `Site ${slug}.ether.paris créé avec succès !`,
      tenant: {
        id: tenant.id,
        slug,
        brandName,
        subdomain: `${slug}.ether.paris`,
        url: `https://${slug}.ether.paris`,
        gitUrl: repo.clone_url,
        gitToken: giteaToken,
        k8sProvisioned: k8sOk,
      },
      studioUrl: `https://studio.ether.paris/?project=${slug}`,
    });
  } catch (err: any) {
    console.error("[api/tenant/create] Error:", err);
    return json({ success: false, error: err.message || "Erreur lors de la création du site" }, { status: 500 });
  }
};
