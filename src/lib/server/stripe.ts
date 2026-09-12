import { env } from "$env/dynamic/private";
import Stripe from "stripe";
import {
  updateDomainOrderStatus,
  getTenantById,
  updateTenantStatus,
  addTenantExtraPrompts,
} from "./db";
import { updateTenantCustomDomainIngress } from "./k8s-tenant";
import { provisionBookedDomain } from "./domains";

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

export interface CreateTopupCheckoutParams {
  tenantSlug: string;
  tenantId: number;
  packId: "pack_20" | "pack_50" | "pack_150";
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export const TOPUP_PACKS: Record<
  "pack_20" | "pack_50" | "pack_150",
  { name: string; prompts: number; priceCents: number; description: string }
> = {
  pack_20: {
    name: "Pack Starter · 20 Prompts Studio",
    prompts: 20,
    priceCents: 500, // 5.00 €
    description:
      "20 modifications IA supplémentaires sans expiration pour continuer à faire évoluer votre site.",
  },
  pack_50: {
    name: "Pack Créateur · 50 Prompts Studio (Populaire)",
    prompts: 50,
    priceCents: 1000, // 10.00 €
    description:
      "50 modifications IA supplémentaires pour concevoir, peaufiner et publier un site complet.",
  },
  pack_150: {
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
  const pack = TOPUP_PACKS[params.packId] || TOPUP_PACKS.pack_20;

  if (!stripe) {
    console.warn(
      "[Stripe] STRIPE_SECRET_KEY not set, auto-crediting and generating mock checkout link for dev",
    );
    addTenantExtraPrompts(params.tenantSlug, pack.prompts);
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
      "[Stripe] STRIPE_SECRET_KEY not set, generating mock checkout link for dev",
    );
    return {
      url: `${params.successUrl}&mock_session_id=mock_sub_${Date.now()}`,
      sessionId: `mock_sess_${Date.now()}`,
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
 * Handles Stripe webhook events.
 */
export async function handleStripeWebhookEvent(
  payload: string,
  signature: string,
): Promise<{ received: boolean; action?: string }> {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return { received: true, action: "skipped_no_stripe_key" };
  }

  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    STRIPE_WEBHOOK_SECRET,
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Handle prompt topup purchase
    if (session.metadata?.type === "prompt_topup") {
      const tenantSlug = session.metadata.tenant_slug;
      const promptsToAdd = parseInt(session.metadata.prompts || "0", 10);
      if (tenantSlug && promptsToAdd > 0) {
        console.log(
          `[Stripe Webhook] Processing prompt top-up: +${promptsToAdd} prompts for ${tenantSlug}`,
        );
        addTenantExtraPrompts(tenantSlug, promptsToAdd);
        return { received: true, action: "prompt_topup_credited" };
      }
    }

    const tenantIdStr = session.metadata?.tenant_id;
    const domain = session.metadata?.domain;
    const provider = (session.metadata?.provider || "cloudflare") as
      | "ovh"
      | "cloudflare";
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : undefined;

    if (tenantIdStr && domain) {
      const tenantId = parseInt(tenantIdStr, 10);
      console.log(
        `[Stripe Webhook] Processing domain payment completed for ${domain} (tenant ${tenantId})`,
      );

      // 1. Update order status in DB
      await updateDomainOrderStatus(session.id, "active", subscriptionId);

      // 2. Fetch tenant to get slug and user email
      const tenant = await getTenantById(tenantId);
      if (tenant) {
        // 3. Update tenant with custom domain
        await updateTenantStatus(tenant.domain, tenant.status, {
          custom_domain: domain,
          stripe_subscription_id: subscriptionId,
        });

        // 4. Update Ingress with custom domain on Kubernetes
        if (tenant.slug && tenant.k8s_namespace) {
          await updateTenantCustomDomainIngress(
            tenant.slug,
            tenant.k8s_namespace,
            tenant.subdomain || `${tenant.slug}.ether.paris`,
            domain,
          );
        }

        // 5. Automate domain provisioning, DNS and Email routing
        await provisionBookedDomain(domain, provider, tenant.email);
      }

      return { received: true, action: "domain_activated" };
    }
  }

  return { received: true, action: event.type };
}
