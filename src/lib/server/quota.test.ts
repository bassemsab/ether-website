import { describe, expect, it } from "bun:test";
import {
  getTenantDailyLimit,
  checkTenantPromptLimit,
  incrementTenantPromptCount,
} from "./db";

describe("Tenant Fair-Use Prompt Quotas", () => {
  it("should calculate correct daily limits per plan", () => {
    expect(getTenantDailyLimit("demo")).toBe(3);
    expect(getTenantDailyLimit("free")).toBe(3);
    expect(getTenantDailyLimit(null)).toBe(3);
    expect(getTenantDailyLimit("starter")).toBe(20);
    expect(getTenantDailyLimit("pro")).toBe(100);
    expect(getTenantDailyLimit("enterprise")).toBe(1000);
  });

  it("should allow prompt when under daily limit and decrement remaining", () => {
    const testSlug = `tenant-test-${Date.now()}`;
    const initialCheck = checkTenantPromptLimit(testSlug, "demo");

    expect(initialCheck.allowed).toBe(true);
    expect(initialCheck.current).toBe(0);
    expect(initialCheck.limit).toBe(3);
    expect(initialCheck.remaining).toBe(3);

    const count1 = incrementTenantPromptCount(testSlug);
    expect(count1).toBe(1);

    const count2 = incrementTenantPromptCount(testSlug);
    expect(count2).toBe(2);

    const afterCheck = checkTenantPromptLimit(testSlug, "demo");
    expect(afterCheck.allowed).toBe(true);
    expect(afterCheck.current).toBe(2);
    expect(afterCheck.remaining).toBe(1);
  });

  it("should use extra_prompts when daily limit is exhausted", async () => {
    const { addTenantExtraPrompts, createTenantWebsite, getOrCreateUserByEmail } = await import("./db");
    const testSlug = `tenant-extra-${Date.now()}`;
    const user = await getOrCreateUserByEmail(`${testSlug}@test.com`);
    await createTenantWebsite(
      user!.id,
      testSlug,
      testSlug,
      `${testSlug}@test.com`,
    );

    // Exhaust daily 3 prompts
    incrementTenantPromptCount(testSlug);
    incrementTenantPromptCount(testSlug);
    incrementTenantPromptCount(testSlug);

    const exhaustedCheck = checkTenantPromptLimit(testSlug, "free");
    expect(exhaustedCheck.allowed).toBe(false);
    expect(exhaustedCheck.remaining).toBe(0);
    expect(exhaustedCheck.extraPrompts).toBe(0);

    // Add 20 extra prompts
    addTenantExtraPrompts(testSlug, 20);

    const topupCheck = checkTenantPromptLimit(testSlug, "free");
    expect(topupCheck.allowed).toBe(true);
    expect(topupCheck.remaining).toBe(20);
    expect(topupCheck.extraPrompts).toBe(20);

    // Increment prompt count and verify extra_prompts decrements
    incrementTenantPromptCount(testSlug);
    const afterExtraCheck = checkTenantPromptLimit(testSlug, "free");
    expect(afterExtraCheck.allowed).toBe(true);
    expect(afterExtraCheck.remaining).toBe(19);
    expect(afterExtraCheck.extraPrompts).toBe(19);
  });
});
