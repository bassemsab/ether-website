import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { dispatchAgyPrompt, streamAgyPrompt } from "$lib/server/agent-bridge";
import {
  getTenantBySlug,
  checkTenantPromptLimit,
  incrementTenantPromptCount,
  saveStudioChatMessage,
} from "$lib/server/db";

export const GET: RequestHandler = async ({ url }) => {
  const projectSlug = url.searchParams.get("project") || "tester";
  const tenant = await getTenantBySlug(projectSlug);
  const plan = tenant?.plan || "demo";
  const quota = checkTenantPromptLimit(projectSlug, plan);

  return json({
    success: true,
    project: projectSlug,
    plan,
    ...quota,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const isStream = request.headers.get("accept") === "text/event-stream";
    const body = await request.json();
    const prompt = (body.prompt || "").trim();
    const projectSlug = (body.projectSlug || "tester").trim();
    const conversationId = body.conversationId;
    const preferredProfile = body.profile === "auto" ? undefined : body.profile;

    if (!prompt) {
      return json({ success: false, error: "Prompt requis" }, { status: 400 });
    }

    // 1. Tenant Fair-Use Quota Check
    const tenant = await getTenantBySlug(projectSlug);
    const plan = tenant?.plan || "demo";
    const quota = checkTenantPromptLimit(projectSlug, plan);

    if (!quota.allowed) {
      const errorMsg = `Vous avez atteint votre quota quotidien de ${quota.limit} prompts pour ce site (${plan}). Votre quota sera réinitialisé demain à minuit.`;

      if (isStream || body.stream) {
        const stream = new ReadableStream({
          start(controller) {
            const sendEvent = (event: string, data: any) => {
              controller.enqueue(
                new TextEncoder().encode(
                  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
                ),
              );
            };
            sendEvent("error", { message: errorMsg, quotaExceeded: true });
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      return json(
        { success: false, error: errorMsg, quotaExceeded: true },
        { status: 429 },
      );
    }

    // 2. Increment prompt counter and save user prompt to SQLite
    incrementTenantPromptCount(projectSlug);
    saveStudioChatMessage(
      projectSlug,
      "user",
      prompt,
      preferredProfile || "auto",
      conversationId,
    );

    // 3. Dispatch prompt to agent runner daemon
    if (isStream || body.stream) {
      const runnerRes = await streamAgyPrompt({
        tenantSlug: projectSlug,
        userPrompt: prompt,
        conversationId,
        preferredProfile,
      });

      if (!runnerRes.body) {
        return runnerRes;
      }

      // Intercept stream to save assistant response in SQLite upon completion
      let assistantText = "";
      let finalProfile = preferredProfile || "primary";
      let finalConvId = conversationId;
      const stepsMap = new Map<
        string | number,
        { id: string | number; name: string; state: "running" | "completed" }
      >();
      const decoder = new TextDecoder();
      let buffer = "";

      const transformStream = new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);
          try {
            buffer += decoder.decode(chunk, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";

            for (const part of parts) {
              const trimmed = part.trim();
              if (!trimmed || trimmed.startsWith(":")) continue;

              const dataMatch = trimmed.match(/data:\s*(.*)/);
              if (dataMatch) {
                const parsed = JSON.parse(dataMatch[1]);
                if (parsed.text) {
                  assistantText += parsed.text;
                }
                if (parsed.profileUsed) {
                  finalProfile = parsed.profileUsed;
                }
                if (parsed.conversationId) {
                  finalConvId = parsed.conversationId;
                }
                if (parsed.id !== undefined && parsed.name) {
                  const existing = stepsMap.get(parsed.id);
                  if (existing) {
                    existing.state = parsed.state;
                  } else {
                    stepsMap.set(parsed.id, {
                      id: parsed.id,
                      name: parsed.name,
                      state: parsed.state || "running",
                    });
                  }
                } else if (
                  parsed.id !== undefined &&
                  parsed.state === "completed"
                ) {
                  const existing = stepsMap.get(parsed.id);
                  if (existing) {
                    existing.state = "completed";
                  }
                }
              }
            }
          } catch {}
        },
        flush() {
          // Persist assistant message in SQLite
          if (assistantText.trim() || stepsMap.size > 0) {
            saveStudioChatMessage(
              projectSlug,
              "assistant",
              assistantText.trim() || "Modifications effectuées.",
              finalProfile,
              finalConvId,
              Array.from(stepsMap.values()),
            );
          }
        },
      });

      return new Response(runnerRes.body.pipeThrough(transformStream), {
        headers: runnerRes.headers,
      });
    }

    const result = await dispatchAgyPrompt({
      tenantSlug: projectSlug,
      userPrompt: prompt,
      conversationId,
      preferredProfile,
    });

    // Save assistant response to SQLite
    saveStudioChatMessage(
      projectSlug,
      "assistant",
      result.output,
      result.profileUsed,
      result.conversationId,
    );

    return json({
      success: true,
      response: result.output,
      profileUsed: result.profileUsed,
      conversationId: result.conversationId || `conv_${Date.now()}`,
      quotaRemaining: Math.max(0, quota.remaining - 1),
    });
  } catch (err: any) {
    console.error("[api/studio/chat] Error:", err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
