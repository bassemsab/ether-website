import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantBySlug, deleteTenantBySlug } from "$lib/server/db";
import { deleteTenantK8s } from "$lib/server/k8s-tenant";

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user) {
    return json(
      { success: false, error: "Non autorisé. Veuillez vous connecter." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const slug = (body.slug || "").trim().toLowerCase();
    if (!slug) {
      return json({ success: false, error: "Identifiant du site (slug) requis." }, { status: 400 });
    }

    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      return json({ success: false, error: "Site introuvable." }, { status: 404 });
    }

    const userEmail = (locals.user.email || "").trim().toLowerCase();
    const isOwner =
      tenant.user_id === locals.user.id ||
      (tenant.email && tenant.email.trim().toLowerCase() === userEmail);
    const isAdmin =
      cookies.get("ether_admin_auth") === "true" ||
      userEmail === (process.env.ADMIN_EMAIL || "").toLowerCase();

    if (!isOwner && !isAdmin) {
      return json(
        { success: false, error: "Vous n'avez pas l'autorisation de supprimer ce site." },
        { status: 403 },
      );
    }

    // Delete k8s namespace if one was assigned
    if (tenant.k8s_namespace) {
      try {
        await deleteTenantK8s(tenant.k8s_namespace);
      } catch (k8sErr) {
        console.warn(`[Delete Tenant] K8s cleanup note for ${tenant.k8s_namespace}:`, k8sErr);
      }
    }

    // Delete database records
    await deleteTenantBySlug(slug);

    // Clear active workspace cookie if pointing to deleted site
    const activeCookie = cookies.get("ether_active_workspace");
    if (activeCookie === slug) {
      cookies.delete("ether_active_workspace", { path: "/" });
    }

    return json({
      success: true,
      message: `Le site '${slug}' a été supprimé du système avec succès.`,
    });
  } catch (err: any) {
    console.error("[Delete Tenant Error]:", err);
    return json({ success: false, error: err.message || "Erreur interne" }, { status: 500 });
  }
};
