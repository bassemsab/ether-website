import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  listStoredProfiles,
  generateAuthUrl,
  exchangeCodeForTokens,
  fetchUserEmail,
  saveProfile,
  createEmptyProfile,
  injectProfileIntoTenantSandbox,
  markProfileThrottled,
  getNextHealthyProfile,
  incrementProfileTurnCount,
} from "./auth-helper";

const PORT = parseInt(process.env.PORT || "8080", 10);
const DATA_DIR = process.env.DATA_DIR || "/data";
const MAX_CONCURRENT_TURNS = parseInt(process.env.MAX_CONCURRENT_TURNS || "3", 10);

// Ensure base directories exist
mkdirSync(join(DATA_DIR, "profiles"), { recursive: true });
mkdirSync(join(DATA_DIR, "tenants"), { recursive: true });

// Tenant queue tracking
const tenantLocks = new Map<string, Promise<any>>();
let globalActiveTurns = 0;

/**
 * Executes a function within a per-tenant sequential lock, respecting global concurrency limit.
 */
async function enqueueTenantTurn<T>(tenant: string, fn: () => Promise<T>): Promise<T> {
  while (globalActiveTurns >= MAX_CONCURRENT_TURNS) {
    await new Promise((r) => setTimeout(r, 200));
  }

  const currentLock = tenantLocks.get(tenant) || Promise.resolve();
  let releaseLock: () => void;
  const nextLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  tenantLocks.set(tenant, currentLock.then(() => nextLock));

  await currentLock;
  globalActiveTurns++;

  try {
    return await fn();
  } finally {
    globalActiveTurns--;
    releaseLock!();
    if (tenantLocks.get(tenant) === nextLock) {
      tenantLocks.delete(tenant);
    }
  }
}

/**
 * Resolves the best initial Google profile for execution.
 */
function resolveInitialProfile(requestedProfile?: string): string {
  const next = getNextHealthyProfile(DATA_DIR, requestedProfile);
  if (next) return next;

  const profiles = listStoredProfiles(DATA_DIR);
  if (profiles.length > 0) return profiles[0].name;

  return "primary";
}

/**
 * Detects if a process output indicates a Google rate limit / quota exhaustion.
 */
function isQuotaError(output: string): boolean {
  const lower = output.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("exhausted resource")
  );
}

/**
 * Prepares the tenant codebase directory if empty.
 */
function ensureTenantCodebase(tenantSlug: string): string {
  const codeDir = join(DATA_DIR, "tenants", tenantSlug, "code");
  mkdirSync(codeDir, { recursive: true });

  const pkgJson = join(codeDir, "package.json");
  if (!existsSync(pkgJson)) {
    writeFileSync(
      pkgJson,
      JSON.stringify(
        {
          name: tenantSlug,
          version: "1.0.0",
          private: true,
          dependencies: {
            "@sveltejs/kit": "^2.0.0",
            svelte: "^5.0.0",
            tailwindcss: "^3.4.3",
          },
        },
        null,
        2
      )
    );
  }

  return codeDir;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health Check
    if (path === "/health" && req.method === "GET") {
      const profiles = listStoredProfiles(DATA_DIR);
      return Response.json(
        {
          status: "ok",
          uptime: process.uptime(),
          activeTurns: globalActiveTurns,
          maxConcurrent: MAX_CONCURRENT_TURNS,
          profilesCount: profiles.length,
          profiles,
        },
        { headers: corsHeaders }
      );
    }

    // List Profiles with Quota Telemetry
    if (path === "/profiles" && req.method === "GET") {
      const profiles = listStoredProfiles(DATA_DIR);
      return Response.json({ success: true, profiles }, { headers: corsHeaders });
    }

    // Create New Profile Slot (e.g. profile-3, profile-4)
    if (path === "/profiles/create" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const profile = (body.profile || `profile-${Date.now()}`).trim();
        createEmptyProfile(DATA_DIR, profile);

        const authUrl = generateAuthUrl(DATA_DIR, profile, body.clientId);
        return Response.json({ success: true, profile, authUrl }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Start OAuth Flow (Generates Authorization URL with PKCE)
    if (path === "/auth/start" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const profile = (body.profile || "primary").trim();
        const authUrl = generateAuthUrl(DATA_DIR, profile, body.clientId);
        return Response.json({ success: true, profile, authUrl }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Finish OAuth Flow (Exchanges Code for Tokens & Saves Profile)
    if (path === "/auth/finish" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const profile = (body.profile || "primary").trim();
        const code = (body.code || "").trim();

        if (!code) {
          return Response.json({ success: false, error: "Authorization code is required" }, { status: 400, headers: corsHeaders });
        }

        const tokenPayload = await exchangeCodeForTokens(DATA_DIR, code, profile, body.clientId, body.clientSecret);
        const email = await fetchUserEmail(tokenPayload.access_token);
        saveProfile(DATA_DIR, profile, tokenPayload, email);

        return Response.json(
          {
            success: true,
            profile,
            email,
            expiry: tokenPayload.expiry,
          },
          { headers: corsHeaders }
        );
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Import / Direct Save Profile Tokens
    if (path === "/profiles/import" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const profile = (body.profile || "primary").trim();
        const tokenData = body.tokenData;
        const email = body.email;

        if (!tokenData || !tokenData.access_token) {
          return Response.json({ success: false, error: "Valid tokenData is required" }, { status: 400, headers: corsHeaders });
        }

        saveProfile(DATA_DIR, profile, tokenData, email);
        return Response.json({ success: true, profile, message: `Profile ${profile} imported successfully` }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Prompt Turn Execution with Transparent Auto-Failover
    if (path === "/prompt" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const project = (body.project || "tester").trim();
        const prompt = (body.prompt || "").trim();
        const requestedProfile = body.profile;
        const conversationId = body.conversationId;
        const isStream = body.stream === true || req.headers.get("accept") === "text/event-stream";

        if (!prompt) {
          return Response.json({ success: false, error: "Prompt is required" }, { status: 400, headers: corsHeaders });
        }

        const tenantCodeDir = ensureTenantCodebase(project);
        const triedProfiles: string[] = [];

        // Execute turn within per-tenant sequential queue
        if (isStream) {
          // SSE Stream with transparent quota retry
          const stream = new ReadableStream({
            async start(controller) {
              const sendEvent = (event: string, data: any) => {
                const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(new TextEncoder().encode(payload));
              };

              try {
                await enqueueTenantTurn(project, async () => {
                  let activeProfile = resolveInitialProfile(requestedProfile);
                  let success = false;
                  let attemptCount = 0;
                  const maxAttempts = 3;

                  while (!success && attemptCount < maxAttempts) {
                    attemptCount++;
                    triedProfiles.push(activeProfile);

                    sendEvent("status", {
                      message: `Exécution sur le compte [${activeProfile}]...`,
                      profile: activeProfile,
                    });

                    // Prepare tenant sandbox with Google credentials
                    let sandboxHome = join(DATA_DIR, "tenants", project, ".gemini-sandbox");
                    try {
                      sandboxHome = injectProfileIntoTenantSandbox(DATA_DIR, activeProfile, project);
                    } catch (e: any) {
                      console.error(`[Runner] Sandbox injection error: ${e.message}`);
                      mkdirSync(join(sandboxHome, ".gemini", "antigravity-cli"), { recursive: true });
                    }

                    const agyBin = Bun.which("agy") || "/usr/local/bin/agy";
                    const hasAgy = existsSync(agyBin);

                    if (!hasAgy) {
                      throw new Error("Antigravity CLI (agy) binary is not installed on runner");
                    }

                    const args = [
                      agyBin,
                      "-p", prompt,
                      "--add-dir", tenantCodeDir,
                      "--dangerously-skip-permissions",
                    ];
                    if (conversationId) {
                      args.push("--conversation", conversationId);
                    }

                    const proc = Bun.spawn(args, {
                      cwd: tenantCodeDir,
                      env: {
                        ...process.env,
                        HOME: sandboxHome,
                        AGY_PROFILE: activeProfile,
                      },
                      stdout: "pipe",
                      stderr: "pipe",
                    });

                    const reader = proc.stdout.getReader();
                    const decoder = new TextDecoder();
                    let fullOutput = "";

                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      const text = decoder.decode(value);
                      fullOutput += text;
                      sendEvent("chunk", { text });
                    }

                    const stderrText = await new Response(proc.stderr).text();
                    await proc.exited;

                    const combinedOutput = `${fullOutput} ${stderrText}`;

                    if (proc.exitCode !== 0 && isQuotaError(combinedOutput)) {
                      console.warn(`[Runner] Quota limit detected on profile [${activeProfile}]. Auto-failing over...`);
                      markProfileThrottled(activeProfile);

                      const nextProfile = getNextHealthyProfile(DATA_DIR, undefined, triedProfiles);
                      if (nextProfile) {
                        sendEvent("status", {
                          message: `Quota atteint sur [${activeProfile}]. Basculement automatique sur [${nextProfile}]...`,
                          profile: nextProfile,
                        });
                        activeProfile = nextProfile;
                        continue; // Retry with next profile
                      }
                    }

                    success = proc.exitCode === 0;
                    if (success) {
                      incrementProfileTurnCount(activeProfile);
                    } else if (!fullOutput && stderrText) {
                      sendEvent("chunk", { text: `\n⚠️ Erreur: ${stderrText.trim()}` });
                    }

                    sendEvent("done", {
                      success,
                      profileUsed: activeProfile,
                      conversationId: conversationId || `conv_${Date.now()}`,
                      exitCode: proc.exitCode,
                    });
                  }
                });
              } catch (turnErr: any) {
                sendEvent("error", { error: turnErr.message });
              } finally {
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              ...corsHeaders,
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        } else {
          // Standard JSON request/response with automatic failover retry
          const result = await enqueueTenantTurn(project, async () => {
            let activeProfile = resolveInitialProfile(requestedProfile);
            let attemptCount = 0;
            const maxAttempts = 3;

            while (attemptCount < maxAttempts) {
              attemptCount++;
              triedProfiles.push(activeProfile);

              let sandboxHome = join(DATA_DIR, "tenants", project, ".gemini-sandbox");
              try {
                sandboxHome = injectProfileIntoTenantSandbox(DATA_DIR, activeProfile, project);
              } catch (e: any) {
                console.error(`[Runner] Sandbox injection error: ${e.message}`);
                mkdirSync(join(sandboxHome, ".gemini", "antigravity-cli"), { recursive: true });
              }

              const agyBin = Bun.which("agy") || "/usr/local/bin/agy";
              const hasAgy = existsSync(agyBin);

              if (!hasAgy) {
                throw new Error("Antigravity CLI (agy) binary is not installed on runner");
              }

              const args = [
                agyBin,
                "-p", prompt,
                "--add-dir", tenantCodeDir,
                "--dangerously-skip-permissions",
              ];
              if (conversationId) {
                args.push("--conversation", conversationId);
              }

              const proc = Bun.spawn(args, {
                cwd: tenantCodeDir,
                env: {
                  ...process.env,
                  HOME: sandboxHome,
                  AGY_PROFILE: activeProfile,
                },
                stdout: "pipe",
                stderr: "pipe",
              });

              const stdout = await new Response(proc.stdout).text();
              const stderr = await new Response(proc.stderr).text();
              await proc.exited;

              const combinedOutput = `${stdout} ${stderr}`;

              if (proc.exitCode !== 0 && isQuotaError(combinedOutput)) {
                console.warn(`[Runner] Quota limit detected on profile [${activeProfile}]. Auto-failing over...`);
                markProfileThrottled(activeProfile);

                const nextProfile = getNextHealthyProfile(DATA_DIR, undefined, triedProfiles);
                if (nextProfile) {
                  activeProfile = nextProfile;
                  continue; // Retry with next profile
                }
              }

              const success = proc.exitCode === 0;
              if (success) {
                incrementProfileTurnCount(activeProfile);
              }

              return {
                success,
                response: stdout || stderr,
                profileUsed: activeProfile,
                conversationId: conversationId || `conv_${Date.now()}`,
                exitCode: proc.exitCode,
              };
            }

            return {
              success: false,
              response: "All configured Google profiles have reached their quota limits.",
              profileUsed: activeProfile,
              conversationId: conversationId || `conv_${Date.now()}`,
              exitCode: -1,
            };
          });

          return Response.json(result, { headers: corsHeaders });
        }
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});

console.log(`🤖 Ether Agent Runner Server started on port ${PORT}`);
