import type { RequestHandler } from "./$types";

export const fallback: RequestHandler = async ({ params, request, url }) => {
  const slug = params.slug;
  const path = params.path ? `/${params.path}` : "/";
  const runnerUrl =
    process.env.RUNNER_API_URL ||
    (process.env.NODE_ENV === "production"
      ? "http://agent-runner.ether.svc.cluster.local:8080"
      : "http://localhost:8085");

  try {
    const targetUrl = `${runnerUrl}/dev/${slug}${path}${url.search}`;
    const reqHeaders = new Headers(request.headers);
    reqHeaders.set("x-forwarded-host", url.host);
    reqHeaders.set("accept-encoding", "identity");

    const res = await fetch(targetUrl, {
      method: request.method,
      headers: reqHeaders,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? await request.blob()
          : undefined,
      signal: AbortSignal.timeout(15000),
    });

    const resHeaders = new Headers(res.headers);
    resHeaders.delete("x-frame-options");
    resHeaders.delete("content-security-policy");
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    });
  } catch (err: any) {
    return new Response(
      `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="2"><title>Démarrage de l'aperçu...</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#FBF9F5;color:#1E1B39;margin:0;}</style></head><body><div style="text-align:center;padding:24px 32px;background:#fff;border:1.5px solid #1E1B39;border-radius:16px;box-shadow:3px 3px 0 #1E1B39;"><h3>⚡ Démarrage de l'aperçu...</h3><p style="font-size:13px;color:#666;margin:8px 0 0 0;">Connexion au serveur de prévisualisation en cours. Actualisation automatique...</p></div></body></html>`,
      {
        status: 502,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          pragma: "no-cache",
          "retry-after": "2",
        },
      },
    );
  }
};
