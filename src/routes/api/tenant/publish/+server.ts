import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantById, updateTenantStatus } from "$lib/server/db";
import { applyTenantK8s } from "$lib/server/k8s-tenant";
import { logPublishAudit, logUserActivity } from "$lib/server/openobserve";

export const POST: RequestHandler = async ({ request, locals }) => {
  const startTime = Date.now();
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  if (!locals.user) {
    return json({ success: false, error: "Non autorisé" }, { status: 401 });
  }

  let currentTenant: any = null;

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
    currentTenant = tenant;

    const tenantSlug = tenant.slug || `tenant-${tenant.id}`;
    const tenantDomain =
      tenant.custom_domain || tenant.subdomain || tenant.domain;
    const brandName = tenant.brand_name || tenantSlug;

    // 1. Audit log publish initiation to OpenObserve (O2)
    void logPublishAudit({
      event: "publish_initiated",
      tenant_id: tenant.id,
      tenant_slug: tenantSlug,
      brand_name: brandName,
      domain: tenantDomain,
      user_id: locals.user.id,
      user_email: locals.user.email,
      ip: clientIp,
      user_agent: userAgent,
      status: "started",
    });

    void logUserActivity({
      action: "site_publish",
      user_id: locals.user.id,
      user_email: locals.user.email,
      tenant_slug: tenantSlug,
      domain: tenantDomain,
      ip: clientIp,
      user_agent: userAgent,
      status: "success",
      details: { stage: "initiated" },
    });

    const namespace = tenant.k8s_namespace || `tenant-${tenant.slug}`;

    const runnerUrl =
      process.env.RUNNER_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "http://agent-runner.ether.svc.cluster.local:8080"
        : "http://localhost:8085");

    let gitPushed = false;
    let buildOk = false;
    let rolloutOk = false;

    // 1. Commit and push all changes to Gitea repository
    try {
      const gitRes = await fetch(
        `${runnerUrl}/git/commit-and-push/${tenantSlug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Publication via Ether Studio - ${new Date().toLocaleString("fr-FR")}`,
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (gitRes.ok) {
        gitPushed = true;
        const gitData = await gitRes.json();
        console.log(
          `[publish] git commit-and-push for ${tenantSlug}:`,
          gitData,
        );
      }
    } catch (gitErr: any) {
      console.warn(
        `[publish] git commit-and-push note for ${tenantSlug}:`,
        gitErr.message,
      );
    }

    // 2. Trigger production build in runner (bun run build)
    try {
      const buildRes = await fetch(`${runnerUrl}/build/${tenantSlug}`, {
        method: "POST",
        signal: AbortSignal.timeout(60000),
      });
      if (buildRes.ok) {
        buildOk = true;
      } else {
        console.warn(`[publish] runner build returned ${buildRes.status}`);
      }
    } catch (buildErr: any) {
      console.warn(
        `[publish] runner build error for ${tenantSlug}:`,
        buildErr.message,
      );
    }

    // 3. Ensure tenant resources (Namespace, PVC, NetworkPolicy, Deployment, Service, Ingress) are applied
    await applyTenantK8s({
      slug: tenantSlug,
      brandName,
      subdomain: tenant.subdomain || `${tenantSlug}.ether.paris`,
      customDomain: tenant.custom_domain,
      namespace,
    });

    // 4. Rollout restart the production deployment
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
      rolloutOk = true;
    } catch (k8sErr: any) {
      console.warn(
        `[api/tenant/publish] kubectl rollout note for ${tenant.slug}:`,
        k8sErr.message,
      );
    }

    await updateTenantStatus(tenant.domain, "active", {
      updated_at: new Date().toISOString(),
    });

    const durationMs = Date.now() - startTime;

    // 5. Audit log publish completion to OpenObserve (O2)
    void logPublishAudit({
      event: "publish_completed",
      tenant_id: tenant.id,
      tenant_slug: tenantSlug,
      brand_name: brandName,
      domain: tenantDomain,
      user_id: locals.user.id,
      user_email: locals.user.email,
      ip: clientIp,
      user_agent: userAgent,
      duration_ms: durationMs,
      status: "success",
      steps: {
        git_commit: gitPushed,
        build: buildOk,
        k8s_rollout: rolloutOk,
      },
    });

    void logUserActivity({
      action: "site_publish",
      user_id: locals.user.id,
      user_email: locals.user.email,
      tenant_slug: tenantSlug,
      domain: tenantDomain,
      ip: clientIp,
      user_agent: userAgent,
      status: "success",
      details: {
        stage: "completed",
        duration_ms: durationMs,
        steps: { gitPushed, buildOk, rolloutOk },
      },
    });

    return json({
      success: true,
      message: `Votre site ${tenantDomain} a été publié avec succès !`,
      url: `https://${tenantDomain}`,
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error("[api/tenant/publish] Error:", err);

    if (currentTenant && locals.user) {
      const tenantSlug = currentTenant.slug || `tenant-${currentTenant.id}`;
      const tenantDomain =
        currentTenant.custom_domain ||
        currentTenant.subdomain ||
        currentTenant.domain;

      void logPublishAudit({
        event: "publish_failed",
        tenant_id: currentTenant.id,
        tenant_slug: tenantSlug,
        brand_name: currentTenant.brand_name || tenantSlug,
        domain: tenantDomain,
        user_id: locals.user.id,
        user_email: locals.user.email,
        ip: clientIp,
        user_agent: userAgent,
        duration_ms: durationMs,
        status: "error",
        error_details: err.message,
      });

      void logUserActivity({
        action: "site_publish",
        user_id: locals.user.id,
        user_email: locals.user.email,
        tenant_slug: tenantSlug,
        domain: tenantDomain,
        ip: clientIp,
        user_agent: userAgent,
        status: "error",
        details: { error: err.message, duration_ms: durationMs },
      });
    }

    return json({ success: false, error: err.message }, { status: 500 });
  }
};
