import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  isBotScannerProbe,
  isSearchEngineCrawler,
  getStaticSnapshotHtml,
  isTenantPodAwake,
  wakeTenantPod,
} from "$lib/server/tenant-wake";
import { getTenantByDomain } from "$lib/server/db";

export const fallback: RequestHandler = async ({ request, url }) => {
  const rawHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";
  const host = rawHost.split(":")[0].toLowerCase();
  const pathname = url.pathname;

  // 1. Instant 404 for vulnerability scanners
  if (isBotScannerProbe(pathname)) {
    return new Response("Not Found", { status: 404 });
  }

  // 2. Resolve tenant slug from host
  let slug: string | null = null;
  if (host.endsWith(".ether.paris") && !host.startsWith("preview-")) {
    slug = host.replace(".ether.paris", "");
  } else {
    // Check custom domain
    const tenant = await getTenantByDomain(host);
    if (tenant?.slug) {
      slug = tenant.slug;
    }
  }

  if (!slug) {
    return new Response("Tenant not found", { status: 404 });
  }

  const userAgent = request.headers.get("user-agent") || "";
  const isCrawler = isSearchEngineCrawler(userAgent);
  const awake = await isTenantPodAwake(slug);

  // 3. Crawler policy
  if (isCrawler && !awake) {
    // Pod is asleep: serve static pre-rendered HTML directly from PVC without waking the pod!
    const staticHtml = getStaticSnapshotHtml(slug);
    if (staticHtml) {
      return new Response(staticHtml, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "X-Served-By": "Ether-Static-Crawler-Cache",
        },
      });
    }
  }

  // 4. Human visitor or dynamic crawler on awake pod:
  if (!awake) {
    // Hold HTTP connection open while pod starts in ~800ms
    const woken = await wakeTenantPod(slug);
    if (!woken) {
      return new Response(
        "Service temporarily unavailable. Please refresh in a moment.",
        {
          status: 503,
          headers: { "Retry-After": "2" },
        },
      );
    }
  }

  // 5. Proxy directly to the live tenant pod
  const targetUrl = `http://web-prod.tenant-${slug}.svc.cluster.local:3000${pathname}${url.search}`;
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set("host", `web-prod.tenant-${slug}.svc.cluster.local:3000`);
  forwardHeaders.set("x-forwarded-host", rawHost);
  forwardHeaders.set("accept-encoding", "identity");

  const reqBody =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.blob()
      : undefined;

  try {
    const podRes = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: reqBody,
    });

    const resHeaders = new Headers(podRes.headers);
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");

    return new Response(podRes.body, {
      status: podRes.status,
      statusText: podRes.statusText,
      headers: resHeaders,
    });
  } catch (err: any) {
    return new Response(`Error connecting to tenant site: ${err.message}`, {
      status: 502,
    });
  }
};
