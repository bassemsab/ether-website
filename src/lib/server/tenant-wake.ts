import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAllTenants } from "./db";

const DATA_DIR =
  process.env.DATA_DIR ||
  (process.platform === "darwin"
    ? join(process.cwd(), ".local-data")
    : "/data");

const wakeLocks = new Map<string, Promise<boolean>>();

export function isBotScannerProbe(pathname: string): boolean {
  return (
    /^\/(?:wp-|xmlrpc|\.env|\.git|php|actuator|setup\.cgi|solr|autodiscover|config\.)/i.test(
      pathname,
    ) || /\.(?:php|asp|aspx|jsp|cgi|env|git|bak|old)$/i.test(pathname)
  );
}

export function isSearchEngineCrawler(userAgent: string): boolean {
  return /Googlebot|bingbot|yandex|Baiduspider|DuckDuckBot|facebookexternalhit|Twitterbot/i.test(
    userAgent,
  );
}

export function getStaticSnapshotHtml(slug: string): string | null {
  const codeDir = join(DATA_DIR, "tenants", slug, "code");
  const candidates = [
    join(codeDir, ".output", "public", "index.html"),
    join(codeDir, "build", "client", "index.html"),
    join(codeDir, "dist", "index.html"),
    join(codeDir, "public", "index.html"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return readFileSync(p, "utf-8");
      } catch {}
    }
  }
  return null;
}

export async function isTenantPodAwake(slug: string): Promise<boolean> {
  const targetUrl = `http://web-prod.tenant-${slug}.svc.cluster.local:3000/api/_health`;
  try {
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(150) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function wakeTenantPod(slug: string): Promise<boolean> {
  let existingLock = wakeLocks.get(slug);
  if (existingLock) {
    return existingLock;
  }

  const wakePromise = (async () => {
    try {
      console.log(
        `[wake-on-request] Scaling up deployment/web-prod for tenant '${slug}'...`,
      );
      const scaleProc = Bun.spawn(
        [
          "kubectl",
          "scale",
          "deployment/web-prod",
          "--replicas=1",
          "-n",
          `tenant-${slug}`,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      await scaleProc.exited;

      // Poll until web-prod pod is healthy and ready to answer traffic (~600ms-900ms)
      const healthUrl = `http://web-prod.tenant-${slug}.svc.cluster.local:3000/api/_health`;
      for (let attempt = 0; attempt < 80; attempt++) {
        try {
          const check = await fetch(healthUrl, {
            signal: AbortSignal.timeout(250),
          });
          if (check.ok) {
            console.log(
              `[wake-on-request] Tenant '${slug}' is now awake and healthy.`,
            );
            return true;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }

      console.warn(
        `[wake-on-request] Timed out waiting for tenant '${slug}' to answer healthcheck.`,
      );
      return false;
    } catch (err: any) {
      console.error(
        `[wake-on-request] Error waking tenant '${slug}':`,
        err.message,
      );
      return false;
    } finally {
      wakeLocks.delete(slug);
    }
  })();

  wakeLocks.set(slug, wakePromise);
  return wakePromise;
}

export async function reapInactiveTenants(
  inactivityHours: number = 48,
): Promise<{ reaped: string[]; active: string[]; sleeping: string[] }> {
  const reaped: string[] = [];
  const active: string[] = [];
  const sleeping: string[] = [];

  try {
    const allTenants = await getAllTenants();
    const tenants = allTenants.filter((t) => t.status === "active");

    const cutoffMs = inactivityHours * 3600 * 1000;
    const now = Date.now();

    for (const t of tenants) {
      if (!t.slug) continue;
      const healthUrl = `http://web-prod.tenant-${t.slug}.svc.cluster.local:3000/api/_health`;

      try {
        const res = await fetch(healthUrl, {
          signal: AbortSignal.timeout(1500),
        });
        if (res.ok) {
          const data: any = await res.json().catch(() => null);
          const lastActive = data?.lastActive || now;
          if (now - lastActive > cutoffMs) {
            console.log(
              `[inactivity-reaper] Tenant '${t.slug}' inactive for ${Math.round(
                (now - lastActive) / 3600000,
              )}h. Scaling to 0 replicas...`,
            );
            const scaleDown = Bun.spawn(
              [
                "kubectl",
                "scale",
                "deployment/web-prod",
                "--replicas=0",
                "-n",
                `tenant-${t.slug}`,
              ],
              { stdout: "pipe", stderr: "pipe" },
            );
            await scaleDown.exited;
            reaped.push(t.slug);
          } else {
            active.push(t.slug);
          }
        } else {
          sleeping.push(t.slug);
        }
      } catch {
        sleeping.push(t.slug);
      }
    }
  } catch (err: any) {
    console.error("[inactivity-reaper] Error running reaper:", err.message);
  }

  return { reaped, active, sleeping };
}
