import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveUserWorkspace } from "$lib/server/db";
import { getTenantCodeDir } from "$lib/server/tenant-files";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
  if (!locals.user) {
    return json(
      { success: false, error: "Non autorisé. Veuillez vous connecter." },
      { status: 401 },
    );
  }

  const requestedSlug = url.searchParams.get("project") || url.searchParams.get("slug");
  const targetPath = (url.searchParams.get("path") || "").trim();

  const tenant = await resolveUserWorkspace(
    locals.user,
    cookies,
    requestedSlug,
  );
  const projectSlug = tenant.slug || "workspace";

  const runnerUrl =
    process.env.RUNNER_API_URL ||
    (process.env.NODE_ENV === "production"
      ? "http://agent-runner.ether.svc.cluster.local:8080"
      : "http://localhost:8085");

  // 1. Try to fetch diff from runner daemon
  try {
    const res = await fetch(
      `${runnerUrl}/diff/${projectSlug}?path=${encodeURIComponent(targetPath)}`,
      {
        headers: {
          "x-git-repo-url": tenant.git_repo_url || "",
          "x-git-token": tenant.git_access_token || "",
        },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return json(data);
      }
    }
  } catch {}

  // 2. Fallback: local git repository inspection
  try {
    const codeDir = getTenantCodeDir(projectSlug);
    let current = "";
    let original = "";

    if (targetPath) {
      const absPath = join(codeDir, targetPath);
      if (existsSync(absPath)) {
        current = readFileSync(absPath, "utf-8");
      }

      // Try git show HEAD~1:path
      try {
        const proc = Bun.spawnSync(["git", "show", `HEAD~1:${targetPath}`], {
          cwd: codeDir,
        });
        if (proc.exitCode === 0) {
          original = proc.stdout.toString();
        } else {
          // Try git show HEAD:path
          const headProc = Bun.spawnSync(["git", "show", `HEAD:${targetPath}`], {
            cwd: codeDir,
          });
          if (headProc.exitCode === 0) {
            original = headProc.stdout.toString();
          }
        }
      } catch {}

      const diffProc = Bun.spawnSync(["git", "diff", "HEAD~1", "--", targetPath], {
        cwd: codeDir,
      });
      const diffOutput = diffProc.exitCode === 0 ? diffProc.stdout.toString() : "";

      return json({
        success: true,
        path: targetPath,
        original,
        current,
        diff: diffOutput,
      });
    }

    const fullDiffProc = Bun.spawnSync(["git", "diff", "HEAD~1"], {
      cwd: codeDir,
    });
    return json({
      success: true,
      diff: fullDiffProc.exitCode === 0 ? fullDiffProc.stdout.toString() : "",
    });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
