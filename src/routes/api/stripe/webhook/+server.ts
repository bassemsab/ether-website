import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { handleStripeWebhookEvent } from "$lib/server/stripe";

export const POST: RequestHandler = async ({ request }) => {
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return json({ error: "Signature manquante" }, { status: 400 });
  }

  try {
    const rawBody = await request.text();
    const result = await handleStripeWebhookEvent(rawBody, signature);
    return json(result);
  } catch (err: any) {
    console.error("[api/stripe/webhook] Error verifying webhook:", err);
    return json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }
};
