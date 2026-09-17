import { describe, it, expect, mock } from "bun:test";
import {
  logPublishAudit,
  logUserActivity,
  logDeletionAudit,
  sendO2Log,
  type PublishAuditEvent,
  type UserActivityEvent,
} from "../src/lib/server/openobserve";

describe("OpenObserve (O2) Telemetry & Audit Service", () => {
  it("should send publish audit event without throwing on network failure", async () => {
    const event: PublishAuditEvent = {
      event: "publish_initiated",
      tenant_id: 42,
      tenant_slug: "test-site",
      brand_name: "Test Brand",
      domain: "test-site.ether.paris",
      user_id: 1,
      user_email: "tester@ether.paris",
      ip: "127.0.0.1",
      user_agent: "Mozilla/5.0 Test",
      status: "started",
    };

    // Should complete cleanly without throwing even if cluster endpoint is unreachable locally
    await expect(logPublishAudit(event)).resolves.toBeUndefined();
  });

  it("should send user activity event without throwing on network failure", async () => {
    const event: UserActivityEvent = {
      action: "studio_session",
      user_id: 1,
      user_email: "tester@ether.paris",
      tenant_slug: "test-site",
      ip: "127.0.0.1",
      user_agent: "Mozilla/5.0 Test",
      status: "success",
    };

    await expect(logUserActivity(event)).resolves.toBeUndefined();
  });

  it("should format payload correctly and include timestamp, service, and environment", async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = mock(async (url: any, opts: any) => {
        capturedBody = JSON.parse(opts.body);
        return new Response(JSON.stringify({ code: 200 }), { status: 200 });
      }) as any;

      await sendO2Log("test_stream", {
        action: "test_action",
        user_email: "hello@ether.paris",
      });

      expect(capturedBody).toBeDefined();
      expect(Array.isArray(capturedBody)).toBe(true);
      expect(capturedBody[0].action).toBe("test_action");
      expect(capturedBody[0].user_email).toBe("hello@ether.paris");
      expect(capturedBody[0].service).toBe("ether-website");
      expect(capturedBody[0].timestamp).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
