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
});
