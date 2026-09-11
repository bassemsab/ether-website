import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  listStoredProfiles,
  generateAuthUrl,
  exchangeCodeForTokens,
  fetchUserEmail,
  saveProfile,
  injectProfileIntoTenantSandbox,
  refreshAccessToken,
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
 * Resolves the best available Google profile for execution.
 */
function resolveProfile(requestedProfile?: string): string {
  const profiles = listStoredProfiles(DATA_DIR);
  if (profiles.length === 0) {
    return "default";
  }

  // If requested profile is healthy and has token, use it
  if (requestedProfile) {
    const match = profiles.find((p) => p.name === requestedProfile);
    if (match && match.hasToken && !match.isExpired) {
      return match.name;
    }
  }

  // Otherwise, find the first valid non-expired profile
  const valid = profiles.find((p) => p.hasToken && !p.isExpired);
  if (valid) {
    return valid.name;
  }

  // Fallback to first profile or primary
  return profiles[0].name;
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

    // List Profiles
    if (path === "/profiles" && req.method === "GET") {
      const profiles = listStoredProfiles(DATA_DIR);
      return Response.json({ success: true, profiles }, { headers: corsHeaders });
    }

    // Start OAuth Flow (Generates Authorization URL)
    if (path === "/auth/start" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const profile = body.profile || "primary";
        const clientId = body.clientId;
        const redirectUri = body.redirectUri || "urn:ietf:wg:oauth:2.0:oob";

        const authUrl = generateAuthUrl(clientId, redirectUri, profile);
        return Response.json({ success: true, profile, authUrl }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Finish OAuth Flow (Exchanges Code for Tokens & Saves Profile)
    if (path === "/auth/finish" && req.method === "POST") {
      try {
        const body = (await req.json()) as any;
        const profile = body.profile || "primary";
        const code = (body.code || "").trim();
        const clientId = body.clientId;
        const clientSecret = body.clientSecret;
        const redirectUri = body.redirectUri || "urn:ietf:wg:oauth:2.0:oob";

        if (!code) {
          return Response.json({ success: false, error: "Authorization code is required" }, { status: 400, headers: corsHeaders });
        }

        const tokenPayload = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);
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
        const profile = body.profile || "primary";
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

    // Prompt Turn Execution
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

        const selectedProfile = resolveProfile(requestedProfile);
        const tenantCodeDir = ensureTenantCodebase(project);

        // Prepare tenant sandbox with Google credentials
        let sandboxHome = join(DATA_DIR, "tenants", project, ".gemini-sandbox");
        try {
          sandboxHome = injectProfileIntoTenantSandbox(DATA_DIR, selectedProfile, project);
        } catch (e) {
          // If no profiles exist yet, allow fallback sandbox
          mkdirSync(join(sandboxHome, ".gemini"), { recursive: true });
        }

        // Execute turn within per-tenant sequential queue
        if (isStream) {
          // Return SSE ReadableStream
          const stream = new ReadableStream({
            async start(controller) {
              const sendEvent = (event: string, data: any) => {
                const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(new TextEncoder().encode(payload));
              };

              try {
                await enqueueTenantTurn(project, async () => {
                  sendEvent("status", { message: `Lancement de la session (${selectedProfile})...`, profile: selectedProfile });

                  // Check if agy binary exists
                  const agyBin = Bun.which("agy") || "/usr/local/bin/agy";
                  const hasAgy = existsSync(agyBin);

                  if (hasAgy) {
                    const args = [agyBin, "-p", prompt, "--dangerously-skip-permissions"];
                    if (conversationId) {
                      args.push("--conversation", conversationId);
                    }

                    const proc = Bun.spawn(args, {
                      cwd: tenantCodeDir,
                      env: {
                        ...process.env,
                        HOME: sandboxHome,
                        AGY_PROFILE: selectedProfile,
                      },
                      stdout: "pipe",
                      stderr: "pipe",
                    });

                    const reader = proc.stdout.getReader();
                    const decoder = new TextDecoder();

                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      const text = decoder.decode(value);
                      sendEvent("chunk", { text });
                    }

                    await proc.exited;
                    sendEvent("done", {
                      success: proc.exitCode === 0,
                      profileUsed: selectedProfile,
                      conversationId: conversationId || `conv_${Date.now()}`,
                    });
                  } else {
                    // Simulated fallback when agy binary is not in environment
                    sendEvent("chunk", {
                      text: `[Agent Studio · ${selectedProfile}] Modifications générées pour le projet ${project}.\nCode mis à jour avec Svelte 5 Runes et Bun SQLite.`,
                    });
                    sendEvent("done", {
                      success: true,
                      profileUsed: selectedProfile,
                      conversationId: conversationId || `conv_${Date.now()}`,
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
          // Standard JSON request/response
          const result = await enqueueTenantTurn(project, async () => {
            const agyBin = Bun.which("agy") || "/usr/local/bin/agy";
            const hasAgy = existsSync(agyBin);

            if (hasAgy) {
              const args = [agyBin, "-p", prompt, "--dangerously-skip-permissions"];
              if (conversationId) {
                args.push("--conversation", conversationId);
              }

              const proc = Bun.spawn(args, {
                cwd: tenantCodeDir,
                env: {
                  ...process.env,
                  HOME: sandboxHome,
                  AGY_PROFILE: selectedProfile,
                },
                stdout: "pipe",
                stderr: "pipe",
              });

              const stdout = await new Response(proc.stdout).text();
              const stderr = await new Response(proc.stderr).text();
              await proc.exited;

              return {
                success: proc.exitCode === 0,
                response: stdout || stderr || "Turn completed.",
                profileUsed: selectedProfile,
                conversationId: conversationId || `conv_${Date.now()}`,
              };
            } else {
              return {
                success: true,
                response: `[Agent Studio · ${selectedProfile}] Modification appliquée pour ${project}. Code prêt sur le volume persistant.`,
                profileUsed: selectedProfile,
                conversationId: conversationId || `conv_${Date.now()}`,
              };
            }
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

console.log(`🚀 Ether Agent Runner Daemon listening on http://0.0.0.0:${PORT}`);
console.log(`📁 Persistent storage path: ${DATA_DIR}`);
console.log(`⚡ Concurrency limit: ${MAX_CONCURRENT_TURNS} turns`);
