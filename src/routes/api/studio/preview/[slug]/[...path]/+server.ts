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
      signal: AbortSignal.timeout(5000),
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
    return new Response(`Preview error: ${err.message}`, { status: 502 });
  }
};
