import { describe, expect, it } from "bun:test";
import {
  generateCode,
  hashCode,
  createEmailLoginCode,
  verifyEmailCode,
} from "../src/lib/server/email-login-codes";
import {
  getOrCreateUserByEmail,
  createTenantWebsite,
  getTenantBySlug,
  getUserOwnedTenants,
  getTenantsByUserId,
  deleteTenantBySlug,
  createDefaultTenantForUser,
  resolveUserWorkspace,
  recordDomainOrder,
  updateDomainOrderStatus,
  getTenantOwnedDomains,
  isDomainOwnedByTenant,
  getDomainOwnershipConflict,
} from "../src/lib/server/db";
import {
  searchDomains,
  calculateMarkedUpPriceCents,
  resolveLiveDomainPriceCents,
} from "../src/lib/server/domains";
import { checkEmailDomain } from "../src/lib/server/email-domain-check";

describe("Email Domain & Acceptability Check (AMI frontend model)", () => {
  it("should accept valid email domains with MX records", async () => {
    const verdict = await checkEmailDomain("contact@ether.paris");
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.email).toBe("contact@ether.paris");
    }
  });

  it("should reject disposable and temporary email domains", async () => {
    const verdict = await checkEmailDomain("spammer@mailinator.com");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toBe("disposable");
    }
  });

  it("should reject malformed email strings", async () => {
    const verdict = await checkEmailDomain("not-an-email");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toBe("malformed");
    }
  });

  it("should reject domains without MX records", async () => {
    const verdict = await checkEmailDomain(
      "user@nonexistent-domain-fake-123456789.xyz",
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toBe("no_mx");
    }
  });
});

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
    const tenant = await createTenantWebsite(
      user!.id,
      slug,
      "Test Brand",
      testEmail,
    );
    expect(tenant).not.toBeNull();
    expect(tenant?.slug).toBe(slug);
    expect(tenant?.subdomain).toBe(`${slug}.ether.paris`);

    const fetched = await getTenantBySlug(slug);
    expect(fetched).not.toBeNull();
    expect(fetched?.brand_name).toBe("Test Brand");
  });

  it("should auto-provision unique workspaces and isolate tenants between different users", async () => {
    const emailA = `bassem-a-${Date.now()}@example.com`;
    const emailB = `bassem-b-${Date.now()}@example.com`;

    const userA = await getOrCreateUserByEmail(emailA);
    const userB = await getOrCreateUserByEmail(emailB);
    expect(userA).not.toBeNull();
    expect(userB).not.toBeNull();
    expect(userA!.id).not.toBe(userB!.id);

    const tenantA = await createDefaultTenantForUser(userA!.id, emailA);
    const tenantB = await createDefaultTenantForUser(userB!.id, emailB);

    expect(tenantA).not.toBeNull();
    expect(tenantB).not.toBeNull();
    expect(tenantA!.slug).not.toBe(tenantB!.slug);
    expect(tenantA!.user_id).toBe(userA!.id);
    expect(tenantB!.user_id).toBe(userB!.id);

    const ownedA = await getUserOwnedTenants(userA!.id, emailA);
    const ownedB = await getUserOwnedTenants(userB!.id, emailB);

    expect(ownedA.some((t) => t.slug === tenantA!.slug)).toBe(true);
    expect(ownedA.some((t) => t.slug === tenantB!.slug)).toBe(false);

    expect(ownedB.some((t) => t.slug === tenantB!.slug)).toBe(true);
    expect(ownedB.some((t) => t.slug === tenantA!.slug)).toBe(false);
  });

  it("should resolve distinct isolated workspaces for bassem.bme and bassem1alsa without URL parameters", async () => {
    const user1 = await getOrCreateUserByEmail("bassem.bme@gmail.com");
    const user2 = await getOrCreateUserByEmail("bassem1alsa@gmail.com");

    expect(user1).not.toBeNull();
    expect(user2).not.toBeNull();

    // Zero URL parameters, no cookies
    const dummyCookies = { get: () => undefined };

    const workspace1 = await resolveUserWorkspace(user1, dummyCookies, null);
    const workspace2 = await resolveUserWorkspace(user2, dummyCookies, null);

    expect(workspace1).toBeDefined();
    expect(workspace2).toBeDefined();
    expect(workspace1.slug).not.toBe(workspace2.slug);
    expect(workspace1.user_id).toBe(user1!.id);
    expect(workspace2.user_id).toBe(user2!.id);

    // Verify workspace switching via cookie
    const switchCookies = {
      get: (name: string) =>
        name === "ether_active_workspace" ? workspace1.slug : undefined,
    };
    const switched = await resolveUserWorkspace(user1, switchCookies, null);
    expect(switched.slug).toBe(workspace1.slug);

    // Cross-user cookie test: user2 must NOT get user1's workspace via cookie
    const crossCookies = {
      get: (name: string) =>
        name === "ether_active_workspace" ? workspace1.slug : undefined,
    };
    const crossResolved = await resolveUserWorkspace(user2, crossCookies, null);
    expect(crossResolved.slug).toBe(workspace2.slug);
    expect(crossResolved.slug).not.toBe(workspace1.slug);

    // Dashboard getTenantsByUserId isolation & deletion test
    // 1. Users start with zero created websites on dashboard (no phantom auto-provisioning)
    const initialTenants1 = await getTenantsByUserId(
      user1!.id,
      "bassem.bme@gmail.com",
    );
    const initialTenants2 = await getTenantsByUserId(
      user2!.id,
      "bassem1alsa@gmail.com",
    );
    expect(initialTenants1.length).toBe(0);
    expect(initialTenants2.length).toBe(0);

    // 2. When a site is created by user1, it is visible only to user1
    const testSiteSlug = `user1-site-${Date.now()}`;
    await createTenantWebsite(
      user1!.id,
      testSiteSlug,
      "User 1 Site",
      "bassem.bme@gmail.com",
    );
    const tenants1 = await getTenantsByUserId(
      user1!.id,
      "bassem.bme@gmail.com",
    );
    const tenants2 = await getTenantsByUserId(
      user2!.id,
      "bassem1alsa@gmail.com",
    );
    expect(tenants1.some((t) => t.slug === testSiteSlug)).toBe(true);
    expect(tenants2.some((t) => t.slug === testSiteSlug)).toBe(false);

    // 3. Deletion test: deleteTenantBySlug cleans it from the system
    await deleteTenantBySlug(testSiteSlug);
    const afterDelete = await getTenantsByUserId(
      user1!.id,
      "bassem.bme@gmail.com",
    );
    expect(afterDelete.some((t) => t.slug === testSiteSlug)).toBe(false);

    // 4. Domain Ownership Isolation test between bassem.bme and bassem1alsa
    const bmeSiteSlug = `bme-test-${Date.now()}`;
    const alsaSiteSlug = `alsa-test-${Date.now()}`;
    const bmeSite = await createTenantWebsite(
      user1!.id,
      bmeSiteSlug,
      "BME Site",
      "bassem.bme@gmail.com",
    );
    const alsaSite = await createTenantWebsite(
      user2!.id,
      alsaSiteSlug,
      "Alsa Site",
      "bassem1alsa@gmail.com",
    );

    // bassem.bme acquires a domain order
    const sessionId = `test-session-${Date.now()}`;
    const domainOrder = await recordDomainOrder(
      bmeSite!.id,
      "miaw-isolated.ovh",
      "ovh",
      sessionId,
      1499,
      "eur",
    );
    expect(domainOrder).toBeDefined();
    await updateDomainOrderStatus(sessionId, "active");

    // Verify bassem.bme's site owns and sees the domain
    const bmeOwned = getTenantOwnedDomains(bmeSite!.id);
    expect(bmeOwned.some((d) => d.domain === "miaw-isolated.ovh")).toBe(true);
    expect(isDomainOwnedByTenant(bmeSite!.id, "miaw-isolated.ovh")).toBe(true);

    // Verify bassem1alsa's site NEVER sees or owns bassem.bme's domain
    const alsaOwned = getTenantOwnedDomains(alsaSite!.id);
    expect(alsaOwned.some((d) => d.domain === "miaw-isolated.ovh")).toBe(false);
    expect(isDomainOwnedByTenant(alsaSite!.id, "miaw-isolated.ovh")).toBe(
      false,
    );

    // Verify conflict check prevents bassem1alsa from hijacking bassem.bme's domain
    const conflictCheck = getDomainOwnershipConflict(
      "miaw-isolated.ovh",
      alsaSite!.id,
      user2!.id,
    );
    expect(conflictCheck.conflict).toBe(true);

    // Clean up test sites
    await deleteTenantBySlug(bmeSiteSlug);
    await deleteTenantBySlug(alsaSiteSlug);
  });
});

describe("Aggregated Domain Search & Live Pricing", () => {
  it("should calculate markup properly to cover processing fees", () => {
    // 4.99 € (499 cents) + 10% markup = 548.9 -> 549 cents (5.49 €)
    const frMarkedUp = calculateMarkedUpPriceCents(499, 10);
    expect(frMarkedUp).toBe(549);

    // 2.99 € (299 cents) + 10% markup = 328.9 -> 329 cents (3.29 €)
    const shopMarkedUp = calculateMarkedUpPriceCents(299, 10);
    expect(shopMarkedUp).toBe(329);

    // 0 cents should return 0
    expect(calculateMarkedUpPriceCents(0)).toBe(0);
  });

  it("should resolve live OVH pricing with Stripe fee markup", async () => {
    const frPricing = await resolveLiveDomainPriceCents("fr");
    expect(frPricing.rawCostCents).toBeGreaterThan(0);
    expect(frPricing.priceCents).toBeGreaterThan(frPricing.rawCostCents);
    expect(frPricing.priceCents).toBe(
      calculateMarkedUpPriceCents(frPricing.rawCostCents),
    );
  });

  it("should return normalized domain results for common TLDs with live marked-up prices", async () => {
    const results = await searchDomains("moncafeparis");
    expect(results.length).toBeGreaterThan(0);
    const comResult = results.find((r) => r.tld === "com");
    expect(comResult).toBeDefined();
    expect(comResult?.domain).toBe("moncafeparis.com");
    expect(comResult?.currency).toBe("EUR");
    expect(comResult?.formattedPrice).toContain("€/an");
    expect(comResult?.priceAnnualCents).toBeGreaterThan(0);
  });
});
