import { describe, it, expect } from "bun:test";
import { generateSecureGitPassword } from "$lib/server/gitea";
import {
  createTenantWebsite,
  getTenantBySlug,
  updateTenantGitPassword,
} from "$lib/server/db";

describe("Git Credentials & Repo Isolation", () => {
  it("should generate a secure URL-safe password without special characters", () => {
    const pwd1 = generateSecureGitPassword();
    const pwd2 = generateSecureGitPassword();

    expect(pwd1).not.toBe(pwd2);
    expect(pwd1.startsWith("eth_")).toBe(true);
    expect(pwd1.length).toBeGreaterThanOrEqual(24);

    // Ensure it contains only alphanumeric characters after prefix (safe for https://user:pass@host/...)
    const body = pwd1.replace("eth_", "");
    expect(/^[a-zA-Z0-9]+$/.test(body)).toBe(true);

    // Verify it contains no characters that require URL-encoding
    expect(pwd1.includes("@")).toBe(false);
    expect(pwd1.includes(":")).toBe(false);
    expect(pwd1.includes("/")).toBe(false);
    expect(pwd1.includes(" ")).toBe(false);
  });

  it("should store and update tenant git_password in database", async () => {
    const slug = `test-git-${Date.now()}`;
    const tenant = await createTenantWebsite(
      999,
      slug,
      "Test Git Site",
      "testgit@ether.paris",
    );

    expect(tenant).not.toBeNull();

    const password = generateSecureGitPassword();
    const ok = await updateTenantGitPassword(slug, password);
    expect(ok).toBe(true);

    const fetched = await getTenantBySlug(slug);
    expect(fetched).not.toBeNull();
    expect(fetched?.git_password).toBe(password);
  });
});
