import { env } from "$env/dynamic/private";
import Stripe from "stripe";
import {
  updateDomainOrderStatus,
  getTenantById,
  updateTenantStatus,
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
