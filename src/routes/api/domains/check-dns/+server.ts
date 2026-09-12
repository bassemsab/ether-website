import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const domain = url.searchParams.get("domain");
  if (!domain || domain.trim().length < 3) {
    return json({ success: false, error: "Nom de domaine manquant ou invalide" }, { status: 400 });
  }

  const cleanDomain = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/^www\./, "");

  const expectedIp = "135.181.95.61";

  try {
    // 1. Query public DNS over HTTPS
    const dnsRes = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanDomain)}&type=A`,
      { headers: { Accept: "application/dns-json" } },
    );
    const dnsData = await dnsRes.json();
    const answers = dnsData.Answer || [];
    const ips: string[] = answers.filter((a: any) => a.type === 1).map((a: any) => a.data);

    // 2. Check if expected IP is present
    const directMatch = ips.includes(expectedIp);

    // 3. If not direct match, check if proxied via Cloudflare or responding to HTTP
    let httpOk = false;
    if (!directMatch && ips.length > 0) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const testHttp = await fetch(`https://${cleanDomain}`, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "manual",
        });
        clearTimeout(timeout);
        if (testHttp.status >= 200 && testHttp.status < 400) {
          httpOk = true;
        }
      } catch {}
    }

    const isPropagated = directMatch || httpOk;

    return json({
      success: true,
      domain: cleanDomain,
      propagated: isPropagated,
      ips,
      expectedIp,
      message: isPropagated
        ? "✓ Votre domaine est correctement dirigé vers les serveurs Ether !"
        : ips.length === 0
          ? "Aucun enregistrement DNS A détecté pour ce domaine."
          : `Actuellement dirigé vers ${ips.join(", ")}. En attente de ${expectedIp}.`,
    });
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
