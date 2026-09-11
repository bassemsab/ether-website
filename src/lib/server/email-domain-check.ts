import { promises as dns } from "node:dns";
import disposableDomains from "disposable-email-domains";

/**
 * Domains known to be burner/temp-mail services (~55k, maintained upstream).
 * Rejects temporary disposable emails while allowing institutional and custom domains.
 */
const DISPOSABLE_DOMAINS = new Set<string>(
  (disposableDomains as string[]).map((d) => d.toLowerCase()),
);

const EMAIL_RE = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

export type EmailDomainVerdict =
  | { ok: true; email: string }
  | { ok: false; reason: "malformed" | "disposable" | "no_mx" };

/**
 * Validates email acceptability exactly like ami-frontend:
 * 1. Proper email syntax check.
 * 2. Rejection of ~55k disposable / burner domains.
 * 3. DNS MX lookup to verify the domain has active mail exchanger records.
 */
export async function checkEmailDomain(
  rawEmail: string,
  resolveMx: (domain: string) => Promise<unknown[]> = dns.resolveMx,
): Promise<EmailDomainVerdict> {
  const email = rawEmail.trim().toLowerCase();
  const match = EMAIL_RE.exec(email);
  if (!match) return { ok: false, reason: "malformed" };

  const domain = match[1];
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, reason: "disposable" };
  }

  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) {
      return { ok: false, reason: "no_mx" };
    }
  } catch {
    return { ok: false, reason: "no_mx" };
  }

  return { ok: true, email };
}
