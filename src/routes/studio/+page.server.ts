import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import {
  getTenantBySlug,
  checkTenantPromptLimit,
  getStudioChatHistory,
  getStudioConversations,
  getUserOwnedTenants,
  resolveUserWorkspace,
} from "$lib/server/db";
import {
  processPromptTopupCheckoutSession,
  processDomainCheckoutSession,
} from "$lib/server/stripe";
import { getRunnerProfiles } from "$lib/server/agent-bridge";
import { listTenantFiles } from "$lib/server/tenant-files";
import { getSessionCookieDomain } from "$lib/server/auth";

export const load: PageServerLoad = async ({ url, locals, cookies, request }) => {
  if (!locals.user) {
    const returnUrl = url.pathname + url.search;
    throw redirect(302, `/login?redirect=${encodeURIComponent(returnUrl)}`);
  }

  const explicitProject = url.searchParams.get("project");
  if (explicitProject) {
    const tenant = await resolveUserWorkspace(locals.user, cookies, explicitProject);
    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      url.hostname;
    const cookieDomain = getSessionCookieDomain(host);

    cookies.set("ether_active_workspace", tenant.slug || explicitProject, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      domain: cookieDomain,
    });

    const cleanParams = new URLSearchParams(url.searchParams);
    cleanParams.delete("project");
    const cleanSearch = cleanParams.toString() ? `?${cleanParams.toString()}` : "";
    throw redirect(302, `/studio${cleanSearch}`);
  }

  const adminEmails = [
    process.env.ADMIN_EMAIL,
    process.env.RESEND_CONTACT_EMAIL,
  ]
    .filter(Boolean)
    .map((e) => e!.trim().toLowerCase());

  const userEmail = (locals.user?.email || "").trim().toLowerCase();
  const isAdmin =
    adminEmails.includes(userEmail) ||
    cookies.get("ether_admin_auth") === "true" ||
    userEmail.endsWith("@ether.paris");

  const ownedTenants = await getUserOwnedTenants(locals.user.id, locals.user.email);

  // Resolve user workspace from session / active workspace cookie / personal tenant (Zero URL params)
  const tenant = await resolveUserWorkspace(locals.user, cookies, null);
  const projectSlug = tenant.slug || "workspace";
  const tenantData = tenant;

  // If returning from Stripe top-up checkout, synchronously verify and credit session
  const topupSessionId = url.searchParams.get("session_id");
  if (topupSessionId && url.searchParams.get("topup_success") === "true") {
    try {
      await processPromptTopupCheckoutSession(topupSessionId);
    } catch (err: any) {
      console.warn(`[Studio Load] Could not verify topup session ${topupSessionId}:`, err.message);
    }
  }

  // If returning from Stripe domain checkout, synchronously verify and fulfill domain
  if (topupSessionId && url.searchParams.get("domain_success") === "true") {
    try {
      await processDomainCheckoutSession(topupSessionId);
    } catch (err: any) {
      console.warn(`[Studio Load] Could not verify domain session ${topupSessionId}:`, err.message);
    }
  }

  const plan = tenant?.plan || "demo";
  const promptQuota = checkTenantPromptLimit(projectSlug, plan);

  let rawProfiles: { name: string; email: string | null }[] = [
    { name: "primary", email: null },
    { name: "secondary", email: null },
  ];
  try {
    const runnerProfiles = await getRunnerProfiles();
    if (runnerProfiles && runnerProfiles.length > 0) {
      rawProfiles = runnerProfiles.map((p) => ({
        name: p.name,
        email: p.email,
      }));
    }
  } catch (e) {}

  const availableProfiles = rawProfiles.map((p, idx) => ({
    name: p.name,
    label: `Agent ${idx + 1}`,
  }));

  // Real files loaded from tenant codebase (from runner API or local fallback)
  let initialFiles = listTenantFiles(projectSlug);
  try {
    const runnerUrl =
      process.env.RUNNER_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "http://agent-runner.ether.svc.cluster.local:8080"
        : "http://localhost:8085");
    const filesRes = await fetch(`${runnerUrl}/files/${projectSlug}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (filesRes.ok) {
      const filesJson = await filesRes.json();
      if (
        filesJson.success &&
        filesJson.files &&
        Object.keys(filesJson.files).length > 0
      ) {
        initialFiles = filesJson.files;
      }
    }
  } catch {}

  // Chat history and conversations list from SQLite
  const conversations = getStudioConversations(projectSlug);
  const activeConvId = url.searchParams.get("conversation") || (conversations.length > 0 ? conversations[0].conversationId : null);
  const chatHistory = activeConvId ? getStudioChatHistory(projectSlug, 50, activeConvId) : getStudioChatHistory(projectSlug, 50);
  const lastConversationId = activeConvId || (chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].conversationId || null : null);

  const displayTenants = [...ownedTenants];
  if (!displayTenants.some((t) => t.slug === tenant.slug)) {
    displayTenants.unshift(tenant);
  }

  const formattedUserTenants = displayTenants
    .filter((t) => Boolean(t.slug))
    .map((t) => ({
      slug: t.slug as string,
      brand_name: t.brand_name || t.slug || "Site",
      domain: t.custom_domain || t.subdomain || t.domain,
      isOwner: true,
    }));

  return {
    tenant: tenantData,
    projectSlug,
    user: locals.user,
    isAdmin,
    userTenants: formattedUserTenants,
    promptQuota: {
      ...promptQuota,
      plan,
    },
    availableProfiles,
    conversations,
    chatHistory,
    lastConversationId,
    initialFiles,
    sessionToken: cookies.get("session") || null,
  };
};
