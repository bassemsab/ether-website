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
    const adminEmails = [
      process.env.ADMIN_EMAIL,
      process.env.RESEND_CONTACT_EMAIL,
    ]
      .filter(Boolean)
      .map((e) => e!.trim().toLowerCase());

    const userEmail = (locals.user?.email || "").trim().toLowerCase();
    const isAdmin =
      adminEmails.includes(userEmail) ||
      userEmail.endsWith("@ether.paris");

    const isOwner =
      tenant &&
      (tenant.user_id === locals.user.id ||
        (tenant.email && tenant.email.trim().toLowerCase() === userEmail));

    if (!tenant || (!isOwner && !isAdmin)) {
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

    // 3.5. Stream compiled bundle directly into tenant pod's /app PVC
    let syncOk = false;
    try {
      console.log(
        `[publish] Streaming build bundle for ${tenantSlug} into pod...`,
      );
      // Ensure deployment is running (at least 1 replica)
      await Bun.spawn([
        "kubectl",
        "scale",
        "deployment/web-prod",
        "--replicas=1",
        "-n",
        namespace,
      ]).exited;
      await Bun.spawn([
        "kubectl",
        "rollout",
        "status",
        "deployment/web-prod",
        "-n",
        namespace,
        "--timeout=25s",
      ]).exited;

      // Stream bundle from runner directly into /app via kubectl exec
      const bundleRes = await fetch(`${runnerUrl}/bundle/${tenantSlug}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (bundleRes.ok && bundleRes.body) {
        const execProc = Bun.spawn(
          [
            "kubectl",
            "exec",
            "-i",
            "-n",
            namespace,
            "deployment/web-prod",
            "--",
            "tar",
            "-xz",
            "-C",
            "/app",
          ],
          {
            stdin: bundleRes.body,
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        const exitCode = await execProc.exited;
        if (exitCode === 0) {
          syncOk = true;
          console.log(
            `[publish] Successfully synced bundle into ${namespace}/web-prod`,
          );
        } else {
          const errText = await new Response(execProc.stderr).text();
          console.warn(
            `[publish] Bundle sync stderr for ${tenantSlug}:`,
            errText,
          );
        }
      }
    } catch (syncErr: any) {
      console.warn(
        `[publish] Error syncing bundle for ${tenantSlug}:`,
        syncErr.message,
      );
    }

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

    // 4.5 Capture pre-rendered HTML snapshot for crawler caching
    try {
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          const snapRes = await fetch(
            `http://web-prod.${namespace}.svc.cluster.local:3000/`,
            { signal: AbortSignal.timeout(1500) },
          );
          if (snapRes.ok) {
            const snapHtml = await snapRes.text();
            if (snapHtml && snapHtml.length > 100) {
              await fetch(`${runnerUrl}/snapshot/${tenantSlug}`, {
                method: "POST",
                headers: { "Content-Type": "text/html; charset=utf-8" },
                body: snapHtml,
                signal: AbortSignal.timeout(3000),
              });
              console.log(
                `[publish] Saved crawler static snapshot for ${tenantSlug}`,
              );
              break;
            }
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (snapErr: any) {
      console.warn(
        `[publish] Snapshot capture note for ${tenantSlug}:`,
        snapErr.message,
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
