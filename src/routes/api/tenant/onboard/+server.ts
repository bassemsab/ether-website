import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { UserRecord } from "$lib/server/db";
import {
  createTenant,
  getTenantByDomain,
  updateTenantStatus,
  getUserById,
} from "$lib/server/db";
import {
  createMailDNSRecord,
} from "$lib/server/cloudflare";
import { initializeTenantRepo } from "$lib/server/github";
import {
  createDomain,
  createUser,
  generateSecurePassword,
} from "$lib/server/stalwart";
import { createMailIngress } from "$lib/server/kubernetes";
import { generateK8sManifest } from "$lib/server/github";
import { uploadConfig } from "$lib/server/s3";
import { env } from "$env/dynamic/private";

const SERVER_IP = env.SERVER_IP || "135.181.95.61";
const S3_BUCKET = env.AWS_S3_BUCKET || "ether-yamls";

interface OnboardRequest {
  domain: string;
  email: string;
  brandName: string;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Check authentication
    const user = locals.user;
    if (!user) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: OnboardRequest = await request.json();
    const { domain, email, brandName } = body;

    // Validation
    if (!domain || !email || !brandName) {
      return json(
        { error: "Missing required fields: domain, email, brandName" },
        { status: 400 },
      );
    }

    // Validate domain format
    const domainRegex =
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return json({ error: "Invalid domain format" }, { status: 400 });
    }

    // Check if tenant already exists
    const existingTenant = await getTenantByDomain(domain);
    if (existingTenant) {
      return json(
        { error: "Domain already registered", tenant: existingTenant },
        { status: 409 },
      );
    }

    // Create tenant record
    const tenant = await createTenant(user.id, domain, email, brandName);
    if (!tenant) {
      return json({ error: "Failed to create tenant record" }, { status: 500 });
    }

    // Start async onboarding process
    await onboardTenant(
      domain,
      email,
      brandName,
      user.id,
      user.github_username,
    ).catch((error) => {
      console.error(`Onboarding failed for ${domain}:`, error);
      updateTenantStatus(domain, "failed", { error_message: error.message });
    });

    return json({
      success: true,
      message: "Tenant onboarding started",
      tenant: {
        domain,
        email,
        brandName,
        status: "pending",
      },
    });
  } catch (error: any) {
    console.error("Onboarding error:", error);
    return json(
      { error: "Internal server error", details: error.message },
      { status: 500 },
    );
  }
};

async function onboardTenant(
  domain: string,
  email: string,
  brandName: string,
  userId: number,
  githubUsername: string,
) {
  const steps = [];

  try {
    // Get user's GitHub access token
    const user: UserRecord | null = await getUserById(userId);
    if (!user || !user.github_access_token) {
      throw new Error("User GitHub access token not found");
    }

    // Step 1: Create GitHub Repository in user's account
    console.log(
      `[${domain}] Creating GitHub repository in ${githubUsername}'s account...`,
    );
    const repo = await initializeTenantRepo(
      user.github_access_token,
      domain,
      brandName,
      githubUsername,
    );
    steps.push({ step: "github", status: "success", repo: repo.html_url });
    await updateTenantStatus(domain, "in_progress", {
      github_repo: repo.html_url,
    });

    // Step 2: Create DNS records in Cloudflare
    console.log(`[${domain}] Creating DNS records in Cloudflare...`);
    await createMailDNSRecord(domain, SERVER_IP);

    steps.push({ step: "cloudflare_dns", status: "success" });
    await updateTenantStatus(domain, "in_progress", {
      cloudflare_dns_records: JSON.stringify({
        mail: `mail.${domain}`,
      }),
    });

    // Step 4: Create domain in Stalwart
    console.log(`[${domain}] Creating domain in Stalwart...`);
    await createDomain(domain);
    steps.push({ step: "stalwart_domain", status: "success" });

    // Step 5: Create user in Stalwart
    console.log(`[${domain}] Creating Stalwart user...`);
    const username = email.split("@")[0] || "admin";
    const password = generateSecurePassword();
    await createUser(username, domain, password);
    steps.push({ step: "stalwart_user", status: "success" });
    await updateTenantStatus(domain, "in_progress", {
      stalwart_user_created: true,
      stalwart_username: `${username}@${domain}`,
      stalwart_password: password,
    });

    // Step 6: Generate Kubernetes manifest
    console.log(`[${domain}] Generating Kubernetes manifest...`);
    const k8sManifest = generateK8sManifest(domain);
    steps.push({ step: "k8s_manifest", status: "success" });

    // Step 7: Upload manifest to S3
    console.log(`[${domain}] Uploading manifest to S3...`);
    const s3VersionId = await uploadConfig({
      domain: domain,
      filename: "k8s-manifest.yaml",
      content: k8sManifest,
      contentType: "application/yaml",
    });
    steps.push({ step: "s3_upload", status: "success" });
    await updateTenantStatus(domain, "in_progress", {
      k8s_manifest_generated: true,
      s3_version_id: s3VersionId,
    });

    // Step 8: Create Kubernetes Ingress
    console.log(`[${domain}] Creating Kubernetes ingress...`);
    await createMailIngress(domain);
    steps.push({ step: "k8s_ingress", status: "success" });
    await updateTenantStatus(domain, "in_progress", {
      k8s_ingress_created: true,
    });

    // Mark as completed
    await updateTenantStatus(domain, "completed", {
      aws_ses_verified: true,
      steps_completed: JSON.stringify(steps),
    });

    console.log(`[${domain}] Onboarding completed successfully!`);
  } catch (error: any) {
    console.error(`[${domain}] Onboarding failed:`, error);
    await updateTenantStatus(domain, "failed", {
      error_message: error.message,
    });
    throw error;
  }
}

// GET endpoint to check tenant status
export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    // Check authentication
    const user = locals.user;
    if (!user) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const domain = url.searchParams.get("domain");

    if (domain) {
      // Get specific tenant
      const tenant = await getTenantByDomain(domain);
      if (!tenant) {
        return json({ error: "Tenant not found" }, { status: 404 });
      }

      // Ensure user owns this tenant
      if (tenant.user_id !== user.id) {
        return json({ error: "Unauthorized" }, { status: 403 });
      }

      return json({ tenant });
    } else {
      return json({ error: "Domain parameter required" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Error fetching tenant:", error);
    return json({ error: error.message }, { status: 500 });
  }
};
