import { describe, expect, it } from "bun:test";
import { generateCode, hashCode, createEmailLoginCode, verifyEmailCode } from "../src/lib/server/email-login-codes";
import { getOrCreateUserByEmail, createTenantWebsite, getTenantBySlug } from "../src/lib/server/db";
import { searchDomains } from "../src/lib/server/domains";

describe("Email OTP Authentication", () => {
  it("should generate a 6-digit code and produce correct SHA-256 hash", () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{6}$/);

    const hash = hashCode(code);
    expect(hash).toHaveLength(64);
  });

  it("should create and verify an email login code successfully", async () => {
    const testEmail = `test-${Date.now()}@ether.paris`;
    const code = await createEmailLoginCode(testEmail);
    expect(code).toMatch(/^\d{6}$/);

    // Wrong code attempt
    const wrongRes = await verifyEmailCode(testEmail, "000000");
    expect(wrongRes.ok).toBe(false);

    // Correct code attempt
    const validRes = await verifyEmailCode(testEmail, code);
    expect(validRes.ok).toBe(true);

    // Replay attempt (should be consumed)
    const replayRes = await verifyEmailCode(testEmail, code);
    expect(replayRes.ok).toBe(false);
  });
});

describe("Tenant and Database Integration", () => {
  it("should create user and provision tenant record", async () => {
    const testEmail = `tenant-owner-${Date.now()}@ether.paris`;
    const user = await getOrCreateUserByEmail(testEmail);
    expect(user).not.toBeNull();
    expect(user?.email).toBe(testEmail);

    const slug = `site-${Date.now()}`;
    const tenant = await createTenantWebsite(user!.id, slug, "Test Brand", testEmail);
    expect(tenant).not.toBeNull();
    expect(tenant?.slug).toBe(slug);
    expect(tenant?.subdomain).toBe(`${slug}.ether.paris`);

    const fetched = await getTenantBySlug(slug);
    expect(fetched).not.toBeNull();
    expect(fetched?.brand_name).toBe("Test Brand");
  });
});

describe("Aggregated Domain Search", () => {
  it("should return normalized domain results for common TLDs", async () => {
    const results = await searchDomains("moncafeparis");
    expect(results.length).toBeGreaterThan(0);
    const comResult = results.find((r) => r.tld === "com");
    expect(comResult).toBeDefined();
    expect(comResult?.domain).toBe("moncafeparis.com");
    expect(comResult?.currency).toBe("EUR");
    expect(comResult?.formattedPrice).toContain("€/an");
  });
});
