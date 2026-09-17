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

  const requestedSlug =
    url.searchParams.get("project") || url.searchParams.get("slug");
  const targetPath = (url.searchParams.get("path") || "").trim();
  const action = (url.searchParams.get("action") || "").trim();
  const base = (url.searchParams.get("base") || "").trim();
  const target = (url.searchParams.get("target") || "").trim();

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

  const forwardQuery = new URLSearchParams();
  if (targetPath) forwardQuery.set("path", targetPath);
  if (action) forwardQuery.set("action", action);
  if (base) forwardQuery.set("base", base);
  if (target) forwardQuery.set("target", target);

  // 1. Try to fetch diff from runner daemon
  try {
    const res = await fetch(
      `${runnerUrl}/diff/${projectSlug}?${forwardQuery.toString()}`,
      {
        headers: {
          "x-git-repo-url": tenant.git_repo_url || "",
          "x-git-token": tenant.git_access_token || "",
        },
        signal: AbortSignal.timeout(6000),
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

    if (action === "commits") {
      const logProc = Bun.spawnSync(
        [
          "git",
          "log",
          "-n",
          "40",
          "--pretty=format:%H%x09%h%x09%an%x09%at%x09%s",
        ],
        { cwd: codeDir },
      );
      const commits: Array<{
        hash: string;
        shortHash: string;
        author: string;
        timestamp: number;
        date: string;
        message: string;
        isPublish: boolean;
      }> = [];
      let publishedHash = "";

      const tagProc = Bun.spawnSync(
        ["git", "rev-parse", "-q", "--verify", "refs/tags/published"],
        { cwd: codeDir },
      );
      if (tagProc.exitCode === 0) {
        publishedHash = tagProc.stdout.toString().trim();
      }

      if (logProc.exitCode === 0) {
        const raw = logProc.stdout.toString().trim();
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          const [hash, shortHash, author, tsStr, ...msgParts] =
            line.split("\t");
          const message = msgParts.join("\t");
          const ts = parseInt(tsStr, 10) * 1000;
          const isPublish =
            (publishedHash && hash === publishedHash) ||
            message.toLowerCase().includes("publication via ether studio") ||
            message.toLowerCase().startsWith("publier") ||
            message.toLowerCase().startsWith("publish");

          if (!publishedHash && isPublish) {
            publishedHash = hash;
          }

          commits.push({
            hash,
            shortHash: shortHash || hash.slice(0, 7),
            author: author || "Ether Studio",
            timestamp: isNaN(ts) ? Date.now() : ts,
            date: isNaN(ts)
              ? ""
              : new Date(ts).toLocaleString("fr-FR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }),
            message: message || "Mise à jour",
            isPublish: Boolean(isPublish),
          });
        }
      }

      const statusProc = Bun.spawnSync(["git", "status", "--porcelain"], {
        cwd: codeDir,
      });
      const hasUncommitted = Boolean(
        statusProc.stdout && statusProc.stdout.toString().trim().length > 0,
      );

      return json({
        success: true,
        commits,
        publishedHash: publishedHash || (commits[0]?.hash ?? ""),
        hasUncommitted,
      });
    }

    let baseRef = base || "HEAD~1";
    if (base === "publish") {
      const tagCheck = Bun.spawnSync(
        ["git", "rev-parse", "-q", "--verify", "refs/tags/published"],
        { cwd: codeDir },
      );
      if (tagCheck.exitCode === 0 && tagCheck.stdout.toString().trim()) {
        baseRef = tagCheck.stdout.toString().trim();
      } else {
        baseRef = "HEAD~1";
      }
    }

    const isWorkingTree = !target || target === "working";
    const diffArgs = isWorkingTree
      ? ["git", "diff", baseRef]
      : ["git", "diff", `${baseRef}..${target}`];

    if (targetPath) {
      diffArgs.push("--", targetPath);
    }

    const diffProc = Bun.spawnSync(diffArgs, { cwd: codeDir });
    const diffOutput = diffProc.exitCode === 0 ? diffProc.stdout.toString() : "";

    const numstatArgs = isWorkingTree
      ? ["git", "diff", "--numstat", baseRef]
      : ["git", "diff", "--numstat", `${baseRef}..${target}`];
    const numstatProc = Bun.spawnSync(numstatArgs, { cwd: codeDir });

    let totalAdditions = 0;
    let totalDeletions = 0;
    const files: Array<{
      path: string;
      status: "modified" | "added" | "deleted" | "renamed";
      additions: number;
      deletions: number;
    }> = [];

    if (numstatProc.exitCode === 0) {
      for (const l of numstatProc.stdout.toString().trim().split("\n")) {
        if (!l.trim()) continue;
        const [aStr, dStr, ...fParts] = l.trim().split("\t");
        const fPath = fParts.join("\t");
        const additions = parseInt(aStr, 10) || 0;
        const deletions = parseInt(dStr, 10) || 0;
        totalAdditions += additions;
        totalDeletions += deletions;
        files.push({
          path: fPath,
          status: "modified",
          additions,
          deletions,
        });
      }
    }

    return json({
      success: true,
      baseRef,
      targetRef: target || "working",
      stats: {
        filesChanged: files.length,
        totalAdditions,
        totalDeletions,
      },
      files,
      diff: diffOutput,
    });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
