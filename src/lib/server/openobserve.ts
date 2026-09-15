/**
 * OpenObserve (O2) Central Audit Logging Service
 * Cluster internal endpoint for tenant lifecycle, deletion, and infrastructure tracing.
 */

const OPENOBSERVE_ENDPOINT =
  process.env.OPENOBSERVE_ENDPOINT ||
  "http://openobserve.ether-shared.svc.cluster.local:5080";

const OPENOBSERVE_ORG =
  process.env.OPENOBSERVE_ORG || "3JKn1JgsmEjFfbfLukHBIgjkRfN";

const OPENOBSERVE_AUTH =
  process.env.OPENOBSERVE_AUTH ||
  "Basic cm9vdEBhbWkuZXRoZXIucGFyaXM6eklHc1R1Y2t6L2JqWVJ4ZTdWb1NpQWs4QWExQA==";

const OPENOBSERVE_STREAM = "deletion_audit";

export interface DeletionAuditEvent {
  event:
    | "deletion_initiated"
    | "step_started"
    | "step_completed"
    | "step_failed"
    | "deletion_finished";
  step?: "git" | "runner" | "k8s" | "db" | "all";
  tenant_slug: string;
  domain?: string | null;
  user_email?: string | null;
  user_id?: number | null;
  status: "started" | "success" | "error";
  duration_ms?: number;
  error_details?: string | null;
  metadata?: Record<string, any>;
  timestamp?: string;
}

/**
 * Sends a structured audit event to OpenObserve asynchronously.
 * Non-blocking: errors are logged to console.warn to ensure platform stability.
 */
export async function logDeletionAudit(
  event: DeletionAuditEvent,
): Promise<void> {
  const payload = [
    {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      service: "ether-website",
      environment: process.env.NODE_ENV || "production",
    },
  ];

  try {
    const url = `${OPENOBSERVE_ENDPOINT}/api/${OPENOBSERVE_ORG}/${OPENOBSERVE_STREAM}/_json`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: OPENOBSERVE_AUTH,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(
        `[OpenObserve Audit] Failed to ingest log (status ${res.status}): ${errText}`,
      );
    }
  } catch (err: any) {
    console.warn(`[OpenObserve Audit] Network error: ${err.message}`);
  }
}
