/**
 * OpenObserve (O2) Central Audit & Telemetry Service
 * Cluster internal endpoint for tenant lifecycle, user activity, publish events, and infrastructure tracing.
 */

const OPENOBSERVE_ENDPOINT =
  process.env.OPENOBSERVE_ENDPOINT ||
  "http://openobserve.ether-shared.svc.cluster.local:5080";

const OPENOBSERVE_ORG =
  process.env.OPENOBSERVE_ORG || "3JKn1JgsmEjFfbfLukHBIgjkRfN";

const OPENOBSERVE_AUTH =
  process.env.OPENOBSERVE_AUTH ||
  "Basic cm9vdEBhbWkuZXRoZXIucGFyaXM6eklHc1R1Y2t6L2JqWVJ4ZTdWb1NpQWs4QWExQA==";

/**
 * Generic OpenObserve JSON payload ingestion.
 * Sends a structured event to any OpenObserve stream asynchronously.
 * Non-blocking: errors are logged to console.warn to ensure platform stability.
 */
export async function sendO2Log(
  stream: string,
  event: Record<string, any>,
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
    const url = `${OPENOBSERVE_ENDPOINT}/api/${OPENOBSERVE_ORG}/${stream}/_json`;
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
        `[OpenObserve Audit] Failed to ingest into stream '${stream}' (status ${res.status}): ${errText}`,
      );
    }
  } catch (err: any) {
    console.warn(
      `[OpenObserve Audit] Network error (${stream}): ${err.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Site Publish Audit
// ---------------------------------------------------------------------------

export interface PublishAuditEvent {
  event: "publish_initiated" | "publish_completed" | "publish_failed";
  tenant_id: number;
  tenant_slug: string;
  brand_name?: string | null;
  domain?: string | null;
  user_id?: number | null;
  user_email?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  duration_ms?: number;
  status: "started" | "success" | "error";
  error_details?: string | null;
  steps?: {
    git_commit?: boolean;
    build?: boolean;
    k8s_rollout?: boolean;
  };
  metadata?: Record<string, any>;
  timestamp?: string;
}

/**
 * Logs a site publish event into the 'publish_audit' stream in OpenObserve.
 */
export async function logPublishAudit(event: PublishAuditEvent): Promise<void> {
  return sendO2Log("publish_audit", event);
}

// ---------------------------------------------------------------------------
// 2. User Activity & System Usage Audit
// ---------------------------------------------------------------------------

export interface UserActivityEvent {
  action:
    | "login_otp"
    | "login_github"
    | "session_restore"
    | "studio_session"
    | "studio_prompt"
    | "site_publish";
  user_id?: number | null;
  user_email?: string | null;
  tenant_slug?: string | null;
  domain?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  status?: "success" | "error";
  details?: Record<string, any>;
  timestamp?: string;
}

/**
 * Logs user platform usage into the 'user_activity' stream in OpenObserve.
 * Tracks who is using the system, what action they took, which workspace, and when.
 */
export async function logUserActivity(event: UserActivityEvent): Promise<void> {
  return sendO2Log("user_activity", event);
}

// ---------------------------------------------------------------------------
// 3. Tenant Deletion Audit (Maintained for backward compatibility)
// ---------------------------------------------------------------------------

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
 * Sends a structured deletion audit event to OpenObserve asynchronously.
 */
export async function logDeletionAudit(
  event: DeletionAuditEvent,
): Promise<void> {
  return sendO2Log("deletion_audit", event);
}
