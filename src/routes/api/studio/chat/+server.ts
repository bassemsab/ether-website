import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { dispatchAgyPrompt, streamAgyPrompt } from "$lib/server/agent-bridge";
import {
  getTenantBySlug,
  checkTenantPromptLimit,
  incrementTenantPromptCount,
  saveStudioChatMessage,
  getStudioChatHistory,
  getStudioConversations,
  resolveUserWorkspace,
} from "$lib/server/db";

function isUserAuthorizedForTenant(locals: App.Locals, tenant: any): boolean {
  if (!locals.user) return false;
  const adminEmails = [
    process.env.ADMIN_EMAIL,
    process.env.RESEND_CONTACT_EMAIL,
  ]
    .filter(Boolean)
    .map((e) => e!.trim().toLowerCase());
  const userEmail = (locals.user.email || "").trim().toLowerCase();
  const isAdmin =
    adminEmails.includes(userEmail) || userEmail.endsWith("@ether.paris");
  const isOwner =
    tenant.user_id === locals.user.id ||
    (tenant.email && tenant.email.trim().toLowerCase() === userEmail);
  return isOwner || isAdmin;
}

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
  if (!locals.user) {
    return json(
      { success: false, error: "Non autorisé. Veuillez vous connecter." },
      { status: 401 },
    );
  }

  const requestedSlug = url.searchParams.get("project");
  const tenant = await resolveUserWorkspace(locals.user, cookies, requestedSlug);
  const projectSlug = tenant.slug || "workspace";

  const conversationsOnly = url.searchParams.get("conversations") === "true";
  const conversationId = url.searchParams.get("conversationId");

  if (conversationsOnly) {
    const conversations = getStudioConversations(projectSlug);
    return json({ success: true, conversations });
  }

  const history = getStudioChatHistory(projectSlug, 100, conversationId);
  return json({ success: true, history });
};

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user) {
    return json(
      { success: false, error: "Non autorisé. Veuillez vous connecter." },
      { status: 401 },
    );
  }

  try {
    const isStream = request.headers.get("accept") === "text/event-stream";
    const body = await request.json();
    const prompt = (body.prompt || "").trim();
    const image = body.image; // Optional image attachment { name, type, base64, dataUrl }
    const requestedSlug = body.projectSlug;
    const tenant = await resolveUserWorkspace(locals.user, cookies, requestedSlug);
    const projectSlug = tenant.slug || "workspace";
    const conversationId =
      (body.conversationId && typeof body.conversationId === "string" && body.conversationId.trim())
        ? body.conversationId.trim()
        : `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const preferredProfile = body.profile === "auto" ? undefined : body.profile;

    if (!prompt && !image) {
      return json(
        { success: false, error: "Prompt ou image requis" },
        { status: 400 },
      );
    }

    const effectivePrompt =
      prompt ||
      "Voici une image jointe. Intègre-la dans le site ou adapte le design en fonction.";

    // 1. Tenant Fair-Use Quota Check
    const plan = tenant?.plan || "demo";
    const quota = checkTenantPromptLimit(projectSlug, plan);

    if (!quota.allowed) {
      const errorMsg = `Vous avez atteint votre quota de ${quota.limit} prompts quotidiens gratuits pour ce site. Rechargez des prompts pour continuer immédiatement sans attendre demain.`;

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
            sendEvent("error", { message: errorMsg, quotaExceeded: true, quota });
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
        { success: false, error: errorMsg, quotaExceeded: true, quota },
        { status: 429 },
      );
    }

    // 2. Increment prompt counter and save user prompt to SQLite
    incrementTenantPromptCount(projectSlug);
    saveStudioChatMessage(
      projectSlug,
      "user",
      effectivePrompt,
      preferredProfile || "auto",
      conversationId,
      undefined,
      image?.dataUrl || (image?.name ? `/uploads/${image.name}` : null),
    );

    // 3. Dispatch prompt to agent runner daemon
    if (isStream || body.stream) {
      const runnerRes = await streamAgyPrompt({
        tenantSlug: projectSlug,
        userPrompt: effectivePrompt,
        conversationId,
        preferredProfile,
        image: image
          ? {
              name: image.name,
              type: image.type,
              base64: image.base64,
            }
          : undefined,
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
      userPrompt: effectivePrompt,
      conversationId,
      preferredProfile,
      image: image
        ? {
            name: image.name,
            type: image.type,
            base64: image.base64,
          }
        : undefined,
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
