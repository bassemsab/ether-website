import { env } from "$env/dynamic/private";
import Stripe from "stripe";
import {
  updateDomainOrderStatus,
  getTenantById,
  getTenantBySlug,
  updateTenantStatus,
  addTenantExtraPrompts,
  isStripeSessionProcessed,
  recordProcessedStripeSession,
} from "./db";
import { updateTenantCustomDomainIngress } from "./k8s-tenant";
import { provisionBookedDomain } from "./domains";
import {
  sendPromptTopupConfirmationEmail,
  sendDomainPurchaseConfirmationEmail,
} from "./email";

const STRIPE_SECRET_KEY =
  env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET =
  env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || "";

export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" as any })
  : null;

export interface CreateCheckoutParams {
  tenantId: number;
  domain: string;
  provider: "ovh" | "cloudflare";
  priceCents: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export type TopupPackId =
  | "starter"
  | "creator"
  | "agency"
  | "pack_20"
  | "pack_50"
  | "pack_150";

export interface CreateTopupCheckoutParams {
  tenantSlug: string;
  tenantId: number;
  packId: TopupPackId;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export const TOPUP_PACKS: Record<
  TopupPackId,
  {
    id: TopupPackId;
    name: string;
    prompts: number;
    priceCents: number;
    description: string;
  }
> = {
  starter: {
    id: "starter",
    name: "Pack Starter · 20 Prompts Studio",
    prompts: 20,
    priceCents: 500, // 5.00 €
    description:
      "20 modifications IA supplémentaires sans expiration pour continuer à faire évoluer votre site.",
  },
  pack_20: {
    id: "starter",
    name: "Pack Starter · 20 Prompts Studio",
    prompts: 20,
    priceCents: 500, // 5.00 €
    description:
      "20 modifications IA supplémentaires sans expiration pour continuer à faire évoluer votre site.",
  },
  creator: {
    id: "creator",
    name: "Pack Créateur · 50 Prompts Studio (Populaire)",
    prompts: 50,
    priceCents: 1000, // 10.00 €
    description:
      "50 modifications IA supplémentaires pour concevoir, peaufiner et publier un site complet.",
  },
  pack_50: {
    id: "creator",
    name: "Pack Créateur · 50 Prompts Studio (Populaire)",
    prompts: 50,
    priceCents: 1000, // 10.00 €
    description:
      "50 modifications IA supplémentaires pour concevoir, peaufiner et publier un site complet.",
  },
  agency: {
    id: "agency",
    name: "Pack Agence · 150 Prompts Studio",
    prompts: 150,
    priceCents: 2500, // 25.00 €
    description:
      "150 modifications IA au tarif préférentiel pour les projets ambitieux et créateurs exigeants.",
  },
  pack_150: {
    id: "agency",
    name: "Pack Agence · 150 Prompts Studio",
    prompts: 150,
    priceCents: 2500, // 25.00 €
    description:
      "150 modifications IA au tarif préférentiel pour les projets ambitieux et créateurs exigeants.",
  },
};

/**
 * Creates a Stripe Checkout Session for one-time prompt top-up purchase.
 */
export async function createPromptTopupCheckoutSession(
  params: CreateTopupCheckoutParams,
): Promise<{ url: string; sessionId: string }> {
  const pack = TOPUP_PACKS[params.packId] || TOPUP_PACKS.starter;

  if (!stripe) {
    console.warn(
      "[Stripe] STRIPE_SECRET_KEY not set, auto-crediting and generating mock checkout link for dev",
    );
    addTenantExtraPrompts(params.tenantSlug, pack.prompts);

    // Send confirmation email in mock mode too if customer email is provided
    if (params.customerEmail) {
      sendPromptTopupConfirmationEmail({
        email: params.customerEmail,
        tenantSlug: params.tenantSlug,
        packName: pack.name,
        prompts: pack.prompts,
        priceFormatted: `${(pack.priceCents / 100).toFixed(2).replace(".", ",")} €`,
      }).catch((e) =>
        console.warn("[Stripe Mock] Confirmation email error:", e.message),
      );
    }

    return {
      url: `${params.successUrl}&mock_topup=true&prompts=${pack.prompts}`,
      sessionId: `mock_topup_${Date.now()}`,
    };
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    customer_email: params.customerEmail,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: pack.name,
            description: pack.description,
          },
          unit_amount: pack.priceCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "prompt_topup",
      tenant_id: params.tenantId.toString(),
      tenant_slug: params.tenantSlug,
      pack_id: params.packId,
      prompts: pack.prompts.toString(),
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  return {
    url: session.url || params.successUrl,
    sessionId: session.id,
  };
}

/**
 * Creates a Stripe Checkout Session for annual recurring domain subscription.
 */
export async function createDomainCheckoutSession(
  params: CreateCheckoutParams,
): Promise<{ url: string; sessionId: string }> {
  if (!stripe) {
    console.warn(
      "[Stripe] STRIPE_SECRET_KEY not set, auto-fulfilling domain purchase in mock mode for dev",
    );
    const mockSessionId = `mock_sess_${Date.now()}`;
    await fulfillDomainPurchase({
      tenantId: params.tenantId,
      domain: params.domain,
      provider: params.provider,
      sessionId: mockSessionId,
      customerEmail: params.customerEmail,
      priceCents: params.priceCents,
    });
    return {
      url: `${params.successUrl}&mock_session_id=${mockSessionId}&domain=${encodeURIComponent(params.domain)}`,
      sessionId: mockSessionId,
    };
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    customer_email: params.customerEmail,
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `Nom de domaine : ${params.domain}`,
            description: `Enregistrement annuel, DNS Cloudflare haute performance et redirection email contact@${params.domain}`,
          },
          unit_amount: params.priceCents,
          recurring: {
            interval: "year",
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      tenant_id: params.tenantId.toString(),
      domain: params.domain,
      provider: params.provider,
      price_cents: params.priceCents.toString(),
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  return {
    url: session.url || params.successUrl,
    sessionId: session.id,
  };
}

/**
 * Processes and credits a prompt topup session safely and idempotently.
 * Can be called by the Stripe webhook or synchronously by the success return redirect.
 */
export async function processPromptTopupCheckoutSession(
  sessionOrId: Stripe.Checkout.Session | string,
): Promise<{
  success: boolean;
  tenantSlug?: string;
  promptsAdded?: number;
  alreadyProcessed?: boolean;
}> {
  if (!stripe) return { success: false };

  try {
    let session: Stripe.Checkout.Session;
    if (typeof sessionOrId === "string") {
      session = await stripe.checkout.sessions.retrieve(sessionOrId);
    } else {
      session = sessionOrId;
    }

    if (session.payment_status !== "paid" || session.status !== "complete") {
      return { success: false };
    }

    if (session.metadata?.type !== "prompt_topup") {
      return { success: false };
    }

    const tenantSlug = session.metadata.tenant_slug;
    const promptsToAdd = parseInt(session.metadata.prompts || "0", 10);
    const packId = session.metadata.pack_id as TopupPackId;
    const pack = TOPUP_PACKS[packId] || TOPUP_PACKS.starter;

    if (!tenantSlug || promptsToAdd <= 0) {
      return { success: false };
    }

    // Idempotency check
    if (isStripeSessionProcessed(session.id)) {
      return {
        success: true,
        tenantSlug,
        promptsAdded: promptsToAdd,
        alreadyProcessed: true,
      };
    }

    // Credit extra prompts in DB
    addTenantExtraPrompts(tenantSlug, promptsToAdd);
    recordProcessedStripeSession(
      session.id,
      "prompt_topup",
      tenantSlug,
      promptsToAdd,
    );
    console.log(
      `[Stripe Top-Up] Credited +${promptsToAdd} prompts for ${tenantSlug} (session ${session.id})`,
    );

    // Send purchase confirmation email
    const tenant = await getTenantBySlug(tenantSlug);
    const customerEmail =
      session.customer_details?.email ||
      session.customer_email ||
      tenant?.email;

    if (customerEmail) {
      const userLocale =
        session.locale?.toLowerCase().startsWith("en") ||
        session.metadata?.locale === "en"
          ? "en"
          : "fr";
      try {
        await sendPromptTopupConfirmationEmail({
          email: customerEmail,
          tenantSlug,
          packName: pack.name,
          prompts: promptsToAdd,
          priceFormatted: `${(pack.priceCents / 100).toFixed(2).replace(".", ",")} €`,
          locale: userLocale,
        });
        console.log(
          `[Stripe Top-Up] Sent confirmation email to ${customerEmail}`,
        );
      } catch (emailErr: any) {
        console.error(
          `[Stripe Top-Up] Failed to send email to ${customerEmail}:`,
          emailErr.message,
        );
      }
    }

    return { success: true, tenantSlug, promptsAdded: promptsToAdd };
  } catch (err: any) {
    console.error("[Stripe Top-Up] Error processing session:", err.message);
    return { success: false };
  }
}

/**
 * Centrally fulfills a domain purchase:
 * 1. Activates domain order in SQLite
 * 2. Assigns custom_domain to tenant in DB
 * 3. Reconfigures Kubernetes Ingress & TLS Let's Encrypt certificate
 * 4. Configures Cloudflare DNS (A records to 135.181.95.61 + email routing)
 * 5. Sends confirmation email
 */
export async function fulfillDomainPurchase({
  tenantId,
  domain,
  provider = "cloudflare",
  subscriptionId = null,
  sessionId = null,
  customerEmail = null,
  priceCents = 0,
  locale = "fr",
}: {
  tenantId: number;
  domain: string;
  provider?: "ovh" | "cloudflare";
  subscriptionId?: string | null;
  sessionId?: string | null;
  customerEmail?: string | null;
  priceCents?: number;
  locale?: string;
}): Promise<{
  success: boolean;
  domain: string;
  dnsResult?: any;
  error?: string;
}> {
  console.log(
    `[fulfillDomainPurchase] Fulfilling domain for ${domain} (tenant ${tenantId}, provider ${provider})`,
  );

  const cleanDomain = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/^www\./, "");

  try {
    // 1. Update order status in DB if sessionId provided
    if (sessionId) {
      await updateDomainOrderStatus(
        sessionId,
        "active",
        subscriptionId || undefined,
      );
    }

    // 2. Fetch tenant
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      throw new Error(`Site avec l'ID ${tenantId} introuvable`);
    }

    // 3. Update tenant with custom domain
    await updateTenantStatus(tenant.domain, tenant.status, {
      custom_domain: cleanDomain,
      stripe_subscription_id: subscriptionId || undefined,
    });

    // 4. Update Ingress with custom domain on Kubernetes
    const namespace = tenant.k8s_namespace || `tenant-${tenant.slug}`;
    const subdomain = tenant.subdomain || `${tenant.slug}.ether.paris`;
    if (tenant.slug) {
      await updateTenantCustomDomainIngress(
        tenant.slug,
        namespace,
        subdomain,
        cleanDomain,
      );
    }

    // 5. Automate domain provisioning, DNS, Inbound Email routing, and Outbound Maddy SMTP
    const targetEmail = tenant.email || customerEmail || "contact@ether.paris";
    const dnsResult = await provisionBookedDomain(
      cleanDomain,
      provider,
      targetEmail,
    );

    // Save generated SMTP credentials in tenant database record
    if (dnsResult.details?.smtp) {
      await updateTenantStatus(tenant.domain, tenant.status, {
        stalwart_user_created: true,
        stalwart_username: dnsResult.details.smtp.username,
        stalwart_password: dnsResult.details.smtp.password,
      });
    }

    // 6. Send domain purchase confirmation email with SMTP credentials
    if (customerEmail || tenant.email) {
      try {
        await sendDomainPurchaseConfirmationEmail({
          email: (customerEmail || tenant.email)!,
          domain: cleanDomain,
          tenantSlug: tenant.slug || "",
          forwardToEmail: targetEmail,
          locale,
          priceFormatted:
            priceCents > 0
              ? `${(priceCents / 100).toFixed(2).replace(".", ",")} € / an`
              : "inclus",
        });
      } catch (emailErr: any) {
        console.warn(
          "[fulfillDomainPurchase] Could not send confirmation email:",
          emailErr.message,
        );
      }
    }

    return { success: true, domain: cleanDomain, dnsResult };
  } catch (err: any) {
    console.error("[fulfillDomainPurchase] Error:", err);
    return { success: false, domain: cleanDomain, error: err.message };
  }
}

/**
 * Verifies and fulfills a domain checkout session synchronously upon return.
 */
export async function processDomainCheckoutSession(
  sessionOrId: Stripe.Checkout.Session | string,
): Promise<{ success: boolean; domain?: string; alreadyProcessed?: boolean }> {
  if (!stripe) return { success: false };

  try {
    let session: Stripe.Checkout.Session;
    if (typeof sessionOrId === "string") {
      session = await stripe.checkout.sessions.retrieve(sessionOrId);
    } else {
      session = sessionOrId;
    }

    if (session.payment_status !== "paid" || session.status !== "complete") {
      return { success: false };
    }

    const tenantIdStr = session.metadata?.tenant_id;
    const domain = session.metadata?.domain;
    const provider =
      (session.metadata?.provider as "ovh" | "cloudflare") || "cloudflare";
    const priceCents = parseInt(session.metadata?.price_cents || "0", 10);
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || undefined;

    if (!tenantIdStr || !domain) {
      return { success: false };
    }

    const tenantId = parseInt(tenantIdStr, 10);
    const customerEmail =
      session.customer_details?.email || session.customer_email;
    const userLocale =
      session.locale?.toLowerCase().startsWith("en") ||
      session.metadata?.locale === "en"
        ? "en"
        : "fr";

    const res = await fulfillDomainPurchase({
      tenantId,
      domain,
      provider,
      subscriptionId,
      sessionId: session.id,
      customerEmail,
      priceCents,
      locale: userLocale,
    });

    return { success: res.success, domain: res.domain };
  } catch (err: any) {
    console.error("[processDomainCheckoutSession] Error:", err);
    return { success: false };
  }
}

/**
 * Handles incoming Stripe Webhook events.
 */
export async function handleStripeWebhookEvent(
  rawBody: string,
  signature: string,
): Promise<{ received: boolean; action?: string; error?: string }> {
  if (!stripe) {
    return { received: true, action: "mock_stripe_disabled" };
  }

  const webhookSecret =
    env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret,
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // A. Handle Prompt Topup purchase
    if (
      session.mode === "payment" &&
      session.metadata?.type === "prompt_topup"
    ) {
      const topupResult = await processPromptTopupCheckoutSession(session);
      return {
        received: true,
        action: topupResult.alreadyProcessed
          ? "prompt_topup_already_processed"
          : "prompt_topup_credited",
      };
    }

    // B. Handle Domain subscription order
    if (session.mode === "subscription" && session.metadata?.domain) {
      const tenantIdStr = session.metadata.tenant_id;
      const domain = session.metadata.domain;
      const provider =
        (session.metadata.provider as "ovh" | "cloudflare") || "cloudflare";
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id || undefined;
      const customerEmail =
        session.customer_details?.email || session.customer_email;
      const priceCents = parseInt(session.metadata.price_cents || "0", 10);

      if (tenantIdStr && domain) {
        const tenantId = parseInt(tenantIdStr, 10);
        const userLocale =
          session.locale?.toLowerCase().startsWith("en") ||
          session.metadata?.locale === "en"
            ? "en"
            : "fr";
        await fulfillDomainPurchase({
          tenantId,
          domain,
          provider,
          subscriptionId,
          sessionId: session.id,
          customerEmail,
          priceCents,
          locale: userLocale,
        });

        return { received: true, action: "domain_activated" };
      }
    }
  }

  return { received: true, action: event.type };
}
