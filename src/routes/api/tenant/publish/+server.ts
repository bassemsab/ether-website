import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantById, updateTenantStatus } from "$lib/server/db";
import { applyTenantK8s } from "$lib/server/k8s-tenant";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ success: false, error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const tenantId = body.tenantId;

    if (!tenantId) {
      return json(
        { success: false, error: "ID de site requis" },
        { status: 400 },
      );
    }

    const tenant = await getTenantById(tenantId);
    if (!tenant || tenant.user_id !== locals.user.id) {
      return json(
        { success: false, error: "Site introuvable ou accès non autorisé" },
        { status: 404 },
      );
    }

    const namespace = tenant.k8s_namespace || `tenant-${tenant.slug}`;

    const tenantSlug = tenant.slug || `tenant-${tenant.id}`;

    const runnerUrl =
      process.env.RUNNER_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "http://agent-runner:8080"
        : "http://localhost:8085");

    // 1. Trigger production build in runner (bun run build)
    try {
      const buildRes = await fetch(`${runnerUrl}/build/${tenantSlug}`, {
        method: "POST",
        signal: AbortSignal.timeout(60000),
      });
      if (!buildRes.ok) {
        console.warn(`[publish] runner build returned ${buildRes.status}`);
      }
    } catch (buildErr: any) {
      console.warn(
        `[publish] runner build error for ${tenantSlug}:`,
        buildErr.message,
      );
    }

    // 2. Ensure tenant resources (Namespace, PVC, NetworkPolicy, Deployment, Service, Ingress) are applied
    await applyTenantK8s({
      slug: tenantSlug,
      brandName: tenant.brand_name || tenantSlug,
      subdomain: tenant.subdomain || `${tenantSlug}.ether.paris`,
      customDomain: tenant.custom_domain,
      namespace,
    });

    // 3. Rollout restart the production deployment
    try {
      const proc = Bun.spawn({
        cmd: [
          "kubectl",
          "rollout",
          "restart",
          "deployment/web-prod",
          "-n",
          namespace,
        ],
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
    } catch (k8sErr: any) {
      console.warn(
        `[api/tenant/publish] kubectl rollout note for ${tenant.slug}:`,
        k8sErr.message,
      );
    }

    await updateTenantStatus(tenant.domain, "active", {
      updated_at: new Date().toISOString(),
    });

    return json({
      success: true,
      message: `Votre site ${tenant.custom_domain || tenant.subdomain || tenant.domain} a été publié avec succès !`,
      url: `https://${tenant.custom_domain || tenant.subdomain || tenant.domain}`,
    });
  } catch (err: any) {
    console.error("[api/tenant/publish] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
