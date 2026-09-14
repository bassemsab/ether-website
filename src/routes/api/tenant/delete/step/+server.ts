import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantBySlug, deleteTenantBySlug } from "$lib/server/db";
import { deleteTenantK8s } from "$lib/server/k8s-tenant";
import { deleteGiteaRepo } from "$lib/server/gitea";
import { logDeletionAudit } from "$lib/server/openobserve";

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user) {
    return json(
      { success: false, error: "Non autorisé. Veuillez vous connecter." },
      { status: 401 },
    );
  }

  const startTime = performance.now();

  try {
    const body = await request.json();
    const slug = (body.slug || "").trim().toLowerCase();
    const step = (body.step || "").trim().toLowerCase();

    if (!slug) {
      return json({ success: false, error: "Identifiant du site (slug) requis." }, { status: 400 });
    }

    if (!["git", "runner", "k8s", "db"].includes(step)) {
      return json(
        { success: false, error: "Étape invalide. Choix: 'git', 'runner', 'k8s', 'db'." },
        { status: 400 },
      );
    }

    const tenant = await getTenantBySlug(slug);
    if (!tenant && step !== "db") {
      return json({ success: false, error: `Site '${slug}' introuvable dans la base.` }, { status: 404 });
    }

    const userEmail = (locals.user.email || "").trim().toLowerCase();
    if (tenant) {
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
    }

    // Log start of step
    await logDeletionAudit({
      event: "step_started",
      step: step as any,
      tenant_slug: slug,
      domain: tenant?.domain || `${slug}.ether.paris`,
      user_email: userEmail,
      user_id: locals.user.id,
      status: "started",
    });

    // Execute the selected step
    switch (step) {
      case "git": {
        if (tenant?.git_repo_url) {
          try {
            const u = new URL(tenant.git_repo_url);
            const parts = u.pathname.replace(/^\/+/, "").replace(/\.git$/, "").split("/");
            if (parts.length >= 2) {
              await deleteGiteaRepo(parts[0], parts[1]);
            }
          } catch (gitErr: any) {
            console.warn(`[Delete Step Git] Gitea note for ${slug}:`, gitErr.message);
            // If repository was already deleted (404), do not fail the step
            if (!gitErr.message?.includes("404") && !gitErr.message?.includes("not found")) {
              throw gitErr;
            }
          }
        }
        break;
      }

      case "runner": {
        const runnerUrl =
          process.env.RUNNER_API_URL ||
          (process.env.NODE_ENV === "production"
            ? "http://agent-runner.ether.svc.cluster.local:8080"
            : "http://localhost:8085");

        const res = await fetch(`${runnerUrl}/tenant/${slug}`, {
          method: "DELETE",
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok && res.status !== 404) {
          const text = await res.text().catch(() => "");
          throw new Error(`Erreur Runner (status ${res.status}): ${text || res.statusText}`);
        }
        break;
      }

      case "k8s": {
        const namespace = tenant?.k8s_namespace || `tenant-${slug}`;
        try {
          await deleteTenantK8s(namespace);
        } catch (k8sErr: any) {
          console.warn(`[Delete Step K8s] Namespace note for ${namespace}:`, k8sErr.message);
          // If namespace does not exist, consider it already cleaned
          if (!k8sErr.message?.includes("NotFound") && !k8sErr.message?.includes("not found")) {
            throw k8sErr;
          }
        }
        break;
      }

      case "db": {
        // deleteTenantBySlug removes the site from tenants table
        // while preserving studio_chat_messages and tenant_prompt_usage for accounting
        await deleteTenantBySlug(slug);

        const activeCookie = cookies.get("ether_active_workspace");
        if (activeCookie === slug) {
          cookies.delete("ether_active_workspace", { path: "/" });
        }
        break;
      }
    }

    const durationMs = Math.round(performance.now() - startTime);

    // Log success
    await logDeletionAudit({
      event: step === "db" ? "deletion_finished" : "step_completed",
      step: step as any,
      tenant_slug: slug,
      domain: tenant?.domain || `${slug}.ether.paris`,
      user_email: userEmail,
      user_id: locals.user.id,
      status: "success",
      duration_ms: durationMs,
    });

    return json({
      success: true,
      step,
      slug,
      durationMs,
      message: `Étape '${step}' complétée avec succès en ${durationMs}ms.`,
    });
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    const errorMsg = err.message || "Erreur interne lors de l'exécution de l'étape";

    console.error("[Delete Step Error]:", err);

    await logDeletionAudit({
      event: "step_failed",
      step: (request as any).step || "all",
      tenant_slug: "unknown",
      status: "error",
      duration_ms: durationMs,
      error_details: errorMsg,
    });

    return json(
      {
        success: false,
        error: errorMsg,
        durationMs,
      },
      { status: 500 },
    );
  }
};
