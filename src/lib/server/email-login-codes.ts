import crypto from "node:crypto";
import { executeQuery } from "./db";

/** A code is good for this long — 10 minutes */
export const CODE_TTL_MS = 10 * 60 * 1000;

/** Wrong guesses allowed against one code before it is locked */
export const MAX_ATTEMPTS = 5;

export function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: "malformed" | "not_found" | "expired" | "too_many_attempts" | "wrong_code" };

export interface EmailLoginCodeRecord {
  id: number;
  email: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

/**
 * Creates and stores a new OTP code for an email.
 */
export async function createEmailLoginCode(email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const code = generateCode();
  const hash = hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  await executeQuery(
    `INSERT INTO email_login_codes (email, code_hash, attempts, expires_at)
     VALUES (?, ?, 0, ?)`,
    [normalizedEmail, hash, expiresAt]
  );

  return code;
}

/**
 * Consumes the latest unconsumed code for `email` if `code` matches it.
 */
export async function verifyEmailCode(email: string, code: string): Promise<VerifyCodeResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^\d{6}$/.test(code)) {
    return { ok: false, reason: "malformed" };
  }

  const rows = (await executeQuery(
    `SELECT * FROM email_login_codes
     WHERE email = ? AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedEmail]
  )) as EmailLoginCodeRecord[];

  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };

  const expiresTime = new Date(row.expires_at).getTime();
  if (expiresTime < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  if (hashCode(code) !== row.code_hash) {
    await executeQuery(
      `UPDATE email_login_codes SET attempts = attempts + 1 WHERE id = ?`,
      [row.id]
    );
    return { ok: false, reason: "wrong_code" };
  }

  await executeQuery(
    `UPDATE email_login_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [row.id]
  );

  return { ok: true };
}
