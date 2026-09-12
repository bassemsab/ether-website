import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import {
  getTenantBySlug,
  checkTenantPromptLimit,
  getStudioChatHistory,
  getStudioConversations,
} from "$lib/server/db";
import {
  processPromptTopupCheckoutSession,
  processDomainCheckoutSession,
} from "$lib/server/stripe";
import { getRunnerProfiles } from "$lib/server/agent-bridge";
import { listTenantFiles } from "$lib/server/tenant-files";

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
  if (!locals.user) {
    const returnUrl = url.pathname + url.search;
    throw redirect(302, `/login?redirect=${encodeURIComponent(returnUrl)}`);
  }

  const projectSlug = url.searchParams.get("project") || "tester";

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

  let tenant = await getTenantBySlug(projectSlug);

  const tenantData = tenant || {
    id: 0,
    slug: projectSlug,
    subdomain: `${projectSlug}.ether.paris`,
    brand_name: projectSlug,
    domain: `${projectSlug}.ether.paris`,
    custom_domain: null,
    k8s_namespace: `tenant-${projectSlug}`,
    git_repo_url: `https://git.ether.paris/${projectSlug}/${projectSlug}.git`,
    plan: "demo",
    status: "active",
  };

  const plan = tenant?.plan || "demo";
  const promptQuota = checkTenantPromptLimit(projectSlug, plan);

  const adminEmails = [
    "bassem.bme@gmail.com",
    "bassem1alsa@gmail.com",
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

  let rawProfiles: { name: string; email: string | null }[] = [
    { name: "primary", email: "bassem1alsa@gmail.com" },
    { name: "secondary", email: "bassem.bme@gmail.com" },
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

  return {
    tenant: tenantData,
    projectSlug,
    user: locals.user,
    isAdmin,
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
