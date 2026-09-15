import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantBySlug } from "$lib/server/db";

export const GET: RequestHandler = async ({ url }) => {
  const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
  if (!slug) {
    return json({ ready: false, error: "Slug requis" }, { status: 400 });
  }

  try {
    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      return json({ ready: false, error: "Site introuvable" }, { status: 404 });
    }

    const runnerUrl =
      process.env.RUNNER_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "http://agent-runner.ether.svc.cluster.local:8080"
        : "http://localhost:8085");

    try {
      const ping = await fetch(`${runnerUrl}/prod/${slug}/`, {
        method: "GET",
        headers: {
          "x-forwarded-host": `${slug}.ether.paris`,
          "accept-encoding": "identity",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (ping.status < 400) {
        return json({
          ready: true,
          status: ping.status,
          url: `https://${slug}.ether.paris`,
          message: "Site en ligne et accessible !",
        });
      }

      return json({
        ready: false,
        status: ping.status,
        step: "launching",
        message: "Démarrage du serveur de production...",
      });
    } catch (fetchErr: any) {
      return json({
        ready: false,
        step: "building",
        message: "Compilation et initialisation de l'environnement...",
      });
    }
  } catch (err: any) {
    return json(
      { ready: false, error: err.message || "Erreur serveur" },
      { status: 500 },
    );
  }
};
