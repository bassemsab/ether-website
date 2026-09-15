import { env } from "$env/dynamic/private";
import { Database } from "bun:sqlite";

export interface SessionWithUser {
  // Session fields
  id: number;
  user_id: number;
  session_token: string;
  expires_at: string;
  created_at: string;

  // User fields (from join)
  email?: string | null;
  gitea_username?: string | null;
  gitea_token?: string | null;
  github_id?: string | null;
  github_username?: string | null;
  github_email?: string | null;
  github_access_token?: string | null;
  github_refresh_token?: string | null;
  avatar_url?: string | null;
  last_login_at?: string | null;
}

export interface UserRecord {
  id: number;
  email: string | null;
  gitea_username: string | null;
  gitea_token: string | null;
  github_id: string | null;
  github_username: string | null;
  github_email: string | null;
  github_access_token: string | null;
  github_refresh_token: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface TenantRecord {
  id: number;
  user_id: number;
  domain: string;
  slug: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  email: string;
  brand_name: string | null;
  k8s_namespace: string | null;
  git_repo_url: string | null;
  git_access_token: string | null;
  stripe_subscription_id: string | null;
  plan: string;
  github_repo: string | null;
  aws_ses_verified: boolean;
  aws_ses_token: string | null;
  stalwart_user_created: boolean;
  stalwart_username: string | null;
  stalwart_password: string | null;
  k8s_ingress_created: boolean;
  cloudflare_dns_records: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DomainOrderRecord {
  id: number;
  tenant_id: number;
  domain: string;
  provider: string;
  stripe_session_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  price_cents: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface StudioChatMessageRecord {
  id: number;
  tenant_slug: string;
  conversation_id: string | null;
  role: "user" | "assistant";
  content: string;
  profile: string | null;
  steps_json: string | null;
  image_url: string | null;
  created_at: string;
}

const DB_PATH = env.DB_PATH || "visitors.sqlite";
let db: Database;

try {
  db = new Database(DB_PATH, { create: true });
  console.log(`✅ Using bun:sqlite driver at ${DB_PATH}`);

  // Base visitors table
  db.run(`
    CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT,
      user_agent TEXT,
      path TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Email login codes (AMI frontend architecture)
  db.run(`
    CREATE TABLE IF NOT EXISTS email_login_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      gitea_username TEXT,
      gitea_token TEXT,
      github_id TEXT UNIQUE,
      github_username TEXT,
      github_email TEXT,
      github_access_token TEXT,
      github_refresh_token TEXT,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME
    )
  `);

  // Tenants table
  db.run(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      domain TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE,
      subdomain TEXT,
      custom_domain TEXT,
      email TEXT NOT NULL,
      brand_name TEXT,
      k8s_namespace TEXT,
      git_repo_url TEXT,
      git_access_token TEXT,
      stripe_subscription_id TEXT,
      plan TEXT DEFAULT 'free',
      github_repo TEXT,
      aws_ses_verified BOOLEAN DEFAULT FALSE,
      aws_ses_token TEXT,
      stalwart_user_created BOOLEAN DEFAULT FALSE,
      stalwart_username TEXT,
      stalwart_password TEXT,
      k8s_ingress_created BOOLEAN DEFAULT FALSE,
      cloudflare_dns_records TEXT,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Domain orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS domain_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      domain TEXT NOT NULL,
      provider TEXT NOT NULL,
      stripe_session_id TEXT,
      stripe_subscription_id TEXT,
      status TEXT DEFAULT 'pending',
      price_cents INTEGER,
      currency TEXT DEFAULT 'eur',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    )
  `);

  // Tenant daily prompt usage tracking (Fair-use protection)
  db.run(`
    CREATE TABLE IF NOT EXISTS tenant_prompt_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_slug TEXT NOT NULL,
      date TEXT NOT NULL,
      prompt_count INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_slug, date)
    )
  `);

  // Studio persistent chat history
  db.run(`
    CREATE TABLE IF NOT EXISTS studio_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_slug TEXT NOT NULL,
      conversation_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      profile TEXT,
      steps_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_studio_chat_tenant ON studio_chat_messages(tenant_slug)",
    );
  } catch {}

  // Processed Stripe events for idempotency
  db.run(`
    CREATE TABLE IF NOT EXISTS processed_stripe_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      event_type TEXT NOT NULL,
      tenant_slug TEXT,
      prompts INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Safe migrations for existing SQLite schemas
  const safeAddColumn = (table: string, columnDef: string) => {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
    } catch {
      // Column already exists or table doesn't support
    }
  };

  safeAddColumn("users", "email TEXT");
  try {
    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)");
  } catch {}
  safeAddColumn("users", "gitea_username TEXT");
  safeAddColumn("users", "gitea_token TEXT");

  safeAddColumn("tenants", "user_id INTEGER");
  safeAddColumn("tenants", "slug TEXT");
  try {
    db.run(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)",
    );
  } catch {}
  safeAddColumn("tenants", "subdomain TEXT");
  safeAddColumn("tenants", "custom_domain TEXT");
  safeAddColumn("tenants", "k8s_namespace TEXT");
  safeAddColumn("tenants", "git_repo_url TEXT");
  safeAddColumn("tenants", "git_access_token TEXT");
  safeAddColumn("tenants", "stripe_subscription_id TEXT");
  safeAddColumn("tenants", "plan TEXT DEFAULT 'free'");
  safeAddColumn("tenants", "extra_prompts INTEGER DEFAULT 0");
  safeAddColumn("studio_chat_messages", "image_url TEXT");
} catch (error) {
  console.error(`❌ Failed to initialize bun:sqlite at ${DB_PATH}:`, error);
}

// Optimized writer
export async function logVisitor(ip: string, userAgent: string, path: string) {
  if (!db) return;

  try {
    const insertStmt = db.prepare(`
      INSERT INTO visitors (ip, user_agent, path, timestamp)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);

    insertStmt.run(ip, userAgent, path);
  } catch (error) {
    console.error("Failed to log visitor:", error);
  }
}

// Admin / General Helper
export async function executeQuery(sql: string, params: any[] = []) {
  if (!db) {
    console.warn("executeQuery called but DB is not initialized");
    return [];
  }

  const stmt = db.prepare(sql);

  if (sql.trim().toUpperCase().startsWith("SELECT")) {
    return stmt.all(...params);
  } else {
    return stmt.run(...params);
  }
}

// Tenant Helpers
export async function createTenant(
  userId: number,
  domain: string,
  email: string,
  brandName: string,
): Promise<TenantRecord | null> {
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      INSERT INTO tenants (user_id, domain, email, brand_name, status)
      VALUES (?, ?, ?, ?, 'pending')
      ON CONFLICT(domain) DO UPDATE SET
        email = excluded.email,
        brand_name = excluded.brand_name,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `);

    const result = stmt.get(userId, domain, email, brandName);
    return result as TenantRecord | null;
  } catch (error) {
    console.error("Failed to create tenant:", error);
    return null;
  }
}

export async function createTenantWebsite(
  userId: number,
  slug: string,
  brandName: string,
  email: string,
  customDomain?: string,
): Promise<TenantRecord | null> {
  if (!db) return null;

  try {
    const subdomain = `${slug}.ether.paris`;
    const domain = customDomain || subdomain;
    const k8sNamespace = `tenant-${slug}`;

    const stmt = db.prepare(`
      INSERT INTO tenants (
        user_id, slug, subdomain, custom_domain, domain, email, brand_name, k8s_namespace, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'provisioning')
      ON CONFLICT(domain) DO UPDATE SET
        slug = excluded.slug,
        subdomain = excluded.subdomain,
        brand_name = excluded.brand_name,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `);

    const result = stmt.get(
      userId,
      slug,
      subdomain,
      customDomain || null,
      domain,
      email,
      brandName,
      k8sNamespace,
    );
    return result as TenantRecord | null;
  } catch (error) {
    console.error("Failed to create tenant website:", error);
    return null;
  }
}

export async function getTenantByDomain(
  domain: string,
): Promise<TenantRecord | null> {
  if (!db) return null;

  try {
    const cleanDomain = domain.toLowerCase().trim();
    const strippedWww = cleanDomain.replace(/^www\./, "");
    const withWww = cleanDomain.startsWith("www.")
      ? cleanDomain
      : `www.${cleanDomain}`;
    const stmt = db.prepare(
      `SELECT * FROM tenants WHERE LOWER(domain) = ? OR LOWER(subdomain) = ? OR LOWER(custom_domain) = ? OR LOWER(custom_domain) = ? OR LOWER(custom_domain) = ?`,
    );
    const result = stmt.get(
      cleanDomain,
      cleanDomain,
      cleanDomain,
      strippedWww,
      withWww,
    );
    return result as TenantRecord | null;
  } catch (error) {
    console.error("Failed to get tenant:", error);
    return null;
  }
}

export async function getTenantBySlug(
  slug: string,
): Promise<TenantRecord | null> {
  if (!db) return null;

  try {
    const stmt = db.prepare(`SELECT * FROM tenants WHERE slug = ?`);
    const result = stmt.get(slug);
    return result as TenantRecord | null;
  } catch (error) {
    console.error("Failed to get tenant by slug:", error);
    return null;
  }
}

export async function getTenantById(id: number): Promise<TenantRecord | null> {
  if (!db) return null;

  try {
    const stmt = db.prepare(`SELECT * FROM tenants WHERE id = ?`);
    const result = stmt.get(id);
    return result as TenantRecord | null;
  } catch (error) {
    console.error("Failed to get tenant by ID:", error);
    return null;
  }
}

export async function updateTenantStatus(
  domainOrSlug: string,
  status: string,
  updates: Record<string, any> = {},
): Promise<TenantRecord | null> {
  if (!db) return null;

  try {
    const setKeys = Object.keys(updates);
    const setClause =
      setKeys.length > 0
        ? ", " + setKeys.map((key) => `${key} = ?`).join(", ")
        : "";

    const stmt = db.prepare(`
      UPDATE tenants
      SET status = ? ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE domain = ? OR slug = ?
      RETURNING *
    `);

    const result = stmt.get(
      status,
      ...Object.values(updates),
      domainOrSlug,
      domainOrSlug,
    );
    return result as TenantRecord | null;
  } catch (error) {
    console.error("Failed to update tenant:", error);
    return null;
  }
}

export async function getAllTenants(): Promise<TenantRecord[]> {
  if (!db) return [];

  try {
    const stmt = db.prepare(`SELECT * FROM tenants ORDER BY created_at DESC`);
    return stmt.all() as TenantRecord[];
  } catch (error) {
    console.error("Failed to get tenants:", error);
    return [];
  }
}

export async function getUserOwnedTenants(
  userId: number,
  userEmail?: string | null,
): Promise<TenantRecord[]> {
  if (!db) return [];

  try {
    const normalizedEmail = (userEmail || "").trim().toLowerCase();
    const stmt = db.prepare(
      `SELECT * FROM tenants 
       WHERE user_id = ? OR (email IS NOT NULL AND LOWER(email) = ? AND ? != '') 
       ORDER BY created_at DESC`,
    );
    return stmt.all(userId, normalizedEmail, normalizedEmail) as TenantRecord[];
  } catch (error) {
    console.error("Failed to get user owned tenants:", error);
    return [];
  }
}

export async function getTenantsByUserId(
  userId: number,
  userEmail?: string | null,
): Promise<TenantRecord[]> {
  return getUserOwnedTenants(userId, userEmail);
}

export async function createDefaultTenantForUser(
  userId: number,
  userEmail: string,
): Promise<TenantRecord | null> {
  if (!db) return null;
  const normalizedEmail = userEmail.trim().toLowerCase();
  const rawPrefix =
    normalizedEmail
      .split("@")[0]
      .replace(/[^a-z0-9]/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "site";

  // Find an available slug
  let candidateSlug = rawPrefix;
  let counter = 1;
  while (true) {
    const existing = db
      .prepare(`SELECT id FROM tenants WHERE slug = ?`)
      .get(candidateSlug);
    if (!existing) break;
    counter++;
    candidateSlug = `${rawPrefix}-${counter}`;
  }

  const brandName = candidateSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const subdomain = `${candidateSlug}.ether.paris`;
  const domain = subdomain;
  const k8sNamespace = `tenant-${candidateSlug}`;

  try {
    const stmt = db.prepare(`
      INSERT INTO tenants (
        user_id, slug, subdomain, domain, email, brand_name, k8s_namespace, status, plan
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'free')
      RETURNING *
    `);
    const tenant = stmt.get(
      userId,
      candidateSlug,
      subdomain,
      domain,
      normalizedEmail,
      brandName,
      k8sNamespace,
    ) as TenantRecord | null;

    return tenant;
  } catch (err) {
    console.error("Failed to create default tenant for user:", err);
    return null;
  }
}

export async function getUserPersonalTenant(
  userId: number,
  userEmail?: string | null,
): Promise<TenantRecord | null> {
  if (!db) return null;
  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  try {
    const stmt = db.prepare(`
      SELECT * FROM tenants 
      WHERE user_id = ? OR (email IS NOT NULL AND LOWER(email) = ?) 
      ORDER BY id ASC LIMIT 1
    `);
    const row = stmt.get(userId, normalizedEmail) as TenantRecord | null;
    return row || null;
  } catch (err) {
    console.error("Failed to get personal tenant:", err);
    return null;
  }
}

export async function ensureUserPersonalWorkspace(user: {
  id: number;
  email?: string | null;
}): Promise<TenantRecord> {
  const email = (user.email || `user-${user.id}@ether.paris`)
    .trim()
    .toLowerCase();
  const existing = await getUserPersonalTenant(user.id, email);
  if (existing && existing.slug) {
    return existing;
  }

  // Return an in-memory/ephemeral workspace WITHOUT saving to the tenants database table
  const fallbackSlug =
    email
      .split("@")[0]
      .replace(/[^a-z0-9]/g, "-")
      .slice(0, 20) || `user-${user.id}`;
  return {
    id: user.id,
    user_id: user.id,
    slug: fallbackSlug,
    subdomain: `${fallbackSlug}.ether.paris`,
    brand_name: fallbackSlug,
    domain: `${fallbackSlug}.ether.paris`,
    email,
    custom_domain: null,
    k8s_namespace: `tenant-${fallbackSlug}`,
    git_repo_url: null,
    git_access_token: null,
    stripe_subscription_id: null,
    plan: "demo",
    github_repo: null,
    aws_ses_verified: false,
    aws_ses_token: null,
    stalwart_user_created: false,
    stalwart_username: null,
    stalwart_password: null,
    k8s_ingress_created: false,
    cloudflare_dns_records: null,
    status: "active",
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function deleteTenantBySlug(slug: string): Promise<boolean> {
  if (!db) return false;
  try {
    const cleanSlug = slug.trim().toLowerCase();
    // Note: studio_chat_messages and tenant_prompt_usage are intentionally preserved
    // to maintain historical token accounting, audit logs, and billing session records.
    db.run(`DELETE FROM tenants WHERE slug = ?`, [cleanSlug]);
    return true;
  } catch (err) {
    console.error(`Failed to delete tenant ${slug}:`, err);
    return false;
  }
}

export async function resolveUserWorkspace(
  localsUser: any,
  cookies: any,
  explicitSlug?: string | null,
): Promise<TenantRecord> {
  if (!localsUser) {
    throw new Error("Unauthorized: user is required to resolve workspace");
  }

  const userEmail = (localsUser.email || "").trim().toLowerCase();
  const adminEmails = [
    process.env.ADMIN_EMAIL,
    process.env.RESEND_CONTACT_EMAIL,
  ]
    .filter(Boolean)
    .map((e) => e!.trim().toLowerCase());

  const isAdmin =
    adminEmails.includes(userEmail) ||
    cookies?.get?.("ether_admin_auth") === "true" ||
    userEmail.endsWith("@ether.paris");

  // 1. If explicitSlug provided (e.g. from URL parameter or link), verify authorization
  if (explicitSlug && explicitSlug.trim()) {
    const cleanSlug = explicitSlug.trim();
    const tenant = await getTenantBySlug(cleanSlug);
    if (tenant) {
      const isOwner =
        tenant.user_id === localsUser.id ||
        (tenant.email && tenant.email.trim().toLowerCase() === userEmail);
      if (isOwner || isAdmin) {
        return tenant;
      }
    }
  }

  // 2. Check active workspace cookie (set when switching workspace via clean session API)
  const cookieWorkspace = cookies?.get?.("ether_active_workspace");
  if (cookieWorkspace && cookieWorkspace.trim()) {
    const cleanCookieSlug = cookieWorkspace.trim();
    const tenant = await getTenantBySlug(cleanCookieSlug);
    if (tenant) {
      const isOwner =
        tenant.user_id === localsUser.id ||
        (tenant.email && tenant.email.trim().toLowerCase() === userEmail);
      if (isOwner) {
        return tenant;
      }
    }
  }

  // 3. Guaranteed personal isolated workspace for this user
  return ensureUserPersonalWorkspace(localsUser);
}

// User Helpers
export async function getOrCreateUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  if (!db) return null;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const selectStmt = db.prepare(`SELECT * FROM users WHERE email = ?`);
    let user = selectStmt.get(normalizedEmail) as UserRecord | null;

    if (!user) {
      const username = normalizedEmail
        .split("@")[0]
        .replace(/[^a-z0-9_-]/g, "-")
        .slice(0, 32);
      const insertStmt = db.prepare(`
        INSERT INTO users (email, github_id, github_username, github_access_token, last_login_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        RETURNING *
      `);
      user = insertStmt.get(
        normalizedEmail,
        `email:${normalizedEmail}`,
        username,
        `otp:${Date.now()}`,
      ) as UserRecord | null;
    } else {
      db.prepare(
        `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(user.id);
    }

    return user;
  } catch (error) {
    console.error("Failed in getOrCreateUserByEmail:", error);
    return null;
  }
}

export async function updateUserGitea(
  userId: number,
  giteaUsername: string,
  giteaToken: string,
): Promise<boolean> {
  if (!db) return false;
  try {
    db.prepare(
      `
      UPDATE users 
      SET gitea_username = ?, gitea_token = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(giteaUsername, giteaToken, userId);
    return true;
  } catch (error) {
    console.error("Failed to update user Gitea info:", error);
    return false;
  }
}

export async function createOrUpdateUser(
  githubId: string,
  githubUsername: string,
  githubEmail: string | null,
  githubAccessToken: string,
  githubRefreshToken: string | null,
  avatarUrl: string | null,
): Promise<UserRecord | null> {
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      INSERT INTO users (github_id, github_username, github_email, github_access_token, github_refresh_token, avatar_url, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(github_id) DO UPDATE SET
        github_username = excluded.github_username,
        github_email = excluded.github_email,
        github_access_token = excluded.github_access_token,
        github_refresh_token = excluded.github_refresh_token,
        avatar_url = excluded.avatar_url,
        last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `);

    const result = stmt.get(
      githubId,
      githubUsername,
      githubEmail,
      githubAccessToken,
      githubRefreshToken,
      avatarUrl,
    );
    return result as UserRecord | null;
  } catch (error) {
    console.error("Failed to create/update user:", error);
    return null;
  }
}

export async function getUserById(id: number): Promise<UserRecord | null> {
  if (!db) return null;

  try {
    const stmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
    const result = stmt.get(id);
    return result as UserRecord | null;
  } catch (error) {
    console.error("Failed to get user:", error);
    return null;
  }
}

export async function getUserByGithubId(
  githubId: string,
): Promise<UserRecord | null> {
  if (!db) return null;

  try {
    const stmt = db.prepare(`SELECT * FROM users WHERE github_id = ?`);
    return stmt.get(githubId) as UserRecord | null;
  } catch (error) {
    console.error("Failed to get user by GitHub ID:", error);
    return null;
  }
}

// Session Helpers
export async function createSession(
  userId: number,
  sessionToken: string,
  expiresAt: Date,
) {
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      INSERT INTO sessions (user_id, session_token, expires_at)
      VALUES (?, ?, ?)
      RETURNING *
    `);

    return stmt.get(userId, sessionToken, expiresAt.toISOString());
  } catch (error) {
    console.error("Failed to create session:", error);
    return null;
  }
}

export async function getSessionByToken(
  sessionToken: string,
): Promise<SessionWithUser | null> {
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      SELECT 
        s.id, s.user_id, s.session_token, s.expires_at, s.created_at,
        u.email, u.gitea_username, u.gitea_token,
        u.github_id, u.github_username, u.github_email, u.github_access_token,
        u.github_refresh_token, u.avatar_url, u.last_login_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ? AND s.expires_at > datetime('now')
    `);
    const result = stmt.get(sessionToken);
    return result as SessionWithUser | null;
  } catch (error) {
    console.error("Failed to get session:", error);
    return null;
  }
}

export async function deleteSession(sessionToken: string) {
  if (!db) return false;

  try {
    const stmt = db.prepare(`DELETE FROM sessions WHERE session_token = ?`);
    stmt.run(sessionToken);
    return true;
  } catch (error) {
    console.error("Failed to delete session:", error);
    return false;
  }
}

export async function cleanupExpiredSessions() {
  if (!db) return;

  try {
    const stmt = db.prepare(
      `DELETE FROM sessions WHERE expires_at < datetime('now')`,
    );
    stmt.run();
  } catch (error) {
    console.error("Failed to cleanup sessions:", error);
  }
}

// Domain Orders Helpers
export async function recordDomainOrder(
  tenantId: number,
  domain: string,
  provider: string,
  stripeSessionId: string | null,
  priceCents: number,
  currency = "eur",
): Promise<DomainOrderRecord | null> {
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      INSERT INTO domain_orders (
        tenant_id, domain, provider, stripe_session_id, price_cents, currency, status
      )
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
      RETURNING *
    `);

    const result = stmt.get(
      tenantId,
      domain,
      provider,
      stripeSessionId,
      priceCents,
      currency,
    );
    return result as DomainOrderRecord | null;
  } catch (error) {
    console.error("Failed to record domain order:", error);
    return null;
  }
}

export async function updateDomainOrderStatus(
  stripeSessionId: string,
  status: string,
  stripeSubscriptionId?: string,
): Promise<DomainOrderRecord | null> {
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      UPDATE domain_orders
      SET status = ?, stripe_subscription_id = COALESCE(?, stripe_subscription_id), updated_at = CURRENT_TIMESTAMP
      WHERE stripe_session_id = ?
      RETURNING *
    `);

    const result = stmt.get(
      status,
      stripeSubscriptionId || null,
      stripeSessionId,
    );
    return result as DomainOrderRecord | null;
  } catch (error) {
    console.error("Failed to update domain order status:", error);
    return null;
  }
}

export interface OwnedDomainItem {
  id: number;
  domain: string;
  provider: string;
  status: string;
  created_at: string;
}

export function getTenantOwnedDomains(tenantId: number): OwnedDomainItem[] {
  if (!db) return [];

  try {
    const tenant = db
      .prepare(`SELECT user_id FROM tenants WHERE id = ?`)
      .get(tenantId) as { user_id: number } | undefined;
    const userId = tenant?.user_id;

    let rows: OwnedDomainItem[] = [];
    if (userId) {
      const stmt = db.prepare(`
        SELECT do.id, do.domain, do.provider, do.status, do.created_at
        FROM domain_orders do
        JOIN tenants t ON do.tenant_id = t.id
        WHERE (do.tenant_id = ? OR t.user_id = ?) AND do.status = 'active'
        GROUP BY do.domain
        ORDER BY do.id DESC
      `);
      rows = stmt.all(tenantId, userId) as OwnedDomainItem[];
    } else {
      const stmt = db.prepare(`
        SELECT id, domain, provider, status, created_at
        FROM domain_orders
        WHERE tenant_id = ? AND status = 'active'
        GROUP BY domain
        ORDER BY id DESC
      `);
      rows = stmt.all(tenantId) as OwnedDomainItem[];
    }
    return rows;
  } catch (err: any) {
    console.error("Failed to get owned domains:", err.message);
    return [];
  }
}

export function isDomainOwnedByTenant(
  tenantId: number,
  domain: string,
): boolean {
  if (!db) return false;
  try {
    const clean = domain
      .toLowerCase()
      .trim()
      .replace(/^www\./, "");
    const tenant = db
      .prepare(`SELECT user_id FROM tenants WHERE id = ?`)
      .get(tenantId) as { user_id: number } | undefined;
    const userId = tenant?.user_id;

    if (userId) {
      const row = db
        .prepare(
          `
        SELECT do.id
        FROM domain_orders do
        JOIN tenants t ON do.tenant_id = t.id
        WHERE (do.tenant_id = ? OR t.user_id = ?) AND LOWER(do.domain) = ? AND do.status = 'active'
      `,
        )
        .get(tenantId, userId, clean);
      return Boolean(row);
    } else {
      const row = db
        .prepare(
          `
        SELECT id
        FROM domain_orders
        WHERE tenant_id = ? AND LOWER(domain) = ? AND status = 'active'
      `,
        )
        .get(tenantId, clean);
      return Boolean(row);
    }
  } catch {
    return false;
  }
}

/**
 * Checks if a domain is already registered to or linked by another tenant / user.
 * Prevents cross-tenant domain hijacking.
 */
export function getDomainOwnershipConflict(
  domain: string,
  tenantId: number,
  userId?: number | null,
): { conflict: boolean; message?: string } {
  if (!db) return { conflict: false };
  try {
    const clean = domain
      .toLowerCase()
      .trim()
      .replace(/^www\./, "");

    // 1. Check if another tenant (with a different user_id) already purchased this domain in domain_orders
    const orderRow = db
      .prepare(
        `
      SELECT do.id, do.tenant_id, t.user_id, t.slug
      FROM domain_orders do
      JOIN tenants t ON do.tenant_id = t.id
      WHERE LOWER(do.domain) = ? AND do.status = 'active'
    `,
      )
      .get(clean) as
      | { id: number; tenant_id: number; user_id: number; slug: string }
      | undefined;

    if (orderRow) {
      const isSameUser = userId && orderRow.user_id === userId;
      const isSameTenant = orderRow.tenant_id === tenantId;
      if (!isSameUser && !isSameTenant) {
        return {
          conflict: true,
          message: `Ce nom de domaine (${clean}) appartient à un autre compte et ne peut pas être relié à ce site.`,
        };
      }
    }

    // 2. Check if another tenant (different user) has already linked this domain as custom_domain
    const linkedTenant = db
      .prepare(
        `
      SELECT id, user_id, slug
      FROM tenants
      WHERE LOWER(custom_domain) = ? AND id != ?
    `,
      )
      .get(clean, tenantId) as
      | { id: number; user_id: number; slug: string }
      | undefined;

    if (linkedTenant) {
      const isSameUser = userId && linkedTenant.user_id === userId;
      if (!isSameUser) {
        return {
          conflict: true,
          message: `Ce domaine est déjà relié à un autre site (${linkedTenant.slug}).`,
        };
      }
    }

    return { conflict: false };
  } catch (err: any) {
    console.error("Error checking domain conflict:", err);
    return { conflict: false };
  }
}

// Tenant Fair-Use Prompt Tracking Helpers
export function getTenantDailyLimit(plan?: string | null): number {
  const normalized = (plan || "demo").toLowerCase().trim();
  if (normalized === "enterprise" || normalized === "unlimited") return 1000;
  if (normalized === "pro" || normalized === "paid") return 100;
  if (normalized === "starter") return 20;
  return 3; // demo / free tier: strictly 3 prompts per day
}

export function checkTenantPromptLimit(
  tenantSlug: string,
  plan: string = "demo",
): {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  dailyRemaining: number;
  extraPrompts: number;
  totalRemaining: number;
} {
  const limit = getTenantDailyLimit(plan);
  if (!db) {
    return {
      allowed: true,
      current: 0,
      limit,
      remaining: limit,
      dailyRemaining: limit,
      extraPrompts: 0,
      totalRemaining: limit,
    };
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const row = db
      .prepare(
        `SELECT prompt_count FROM tenant_prompt_usage WHERE tenant_slug = ? AND date = ?`,
      )
      .get(tenantSlug, today) as { prompt_count: number } | undefined;

    const tenantRow = db
      .prepare(`SELECT extra_prompts FROM tenants WHERE slug = ?`)
      .get(tenantSlug) as { extra_prompts: number } | undefined;

    const extraPrompts = Math.max(0, tenantRow?.extra_prompts || 0);
    const current = row?.prompt_count || 0;
    const dailyRemaining = Math.max(0, limit - current);
    const totalRemaining = dailyRemaining + extraPrompts;
    const allowed = totalRemaining > 0;

    return {
      allowed,
      current,
      limit,
      remaining: totalRemaining,
      dailyRemaining,
      extraPrompts,
      totalRemaining,
    };
  } catch (error) {
    console.error("Failed to check tenant prompt limit:", error);
    return {
      allowed: true,
      current: 0,
      limit,
      remaining: limit,
      dailyRemaining: limit,
      extraPrompts: 0,
      totalRemaining: limit,
    };
  }
}

export function isStripeSessionProcessed(sessionId: string): boolean {
  if (!db) return false;
  try {
    const row = db
      .prepare(`SELECT id FROM processed_stripe_events WHERE session_id = ?`)
      .get(sessionId);
    return Boolean(row);
  } catch {
    return false;
  }
}

export function recordProcessedStripeSession(
  sessionId: string,
  eventType: string,
  tenantSlug: string,
  prompts: number = 0,
): void {
  if (!db) return;
  try {
    db.prepare(
      `
      INSERT OR IGNORE INTO processed_stripe_events (session_id, event_type, tenant_slug, prompts)
      VALUES (?, ?, ?, ?)
    `,
    ).run(sessionId, eventType, tenantSlug, prompts);
  } catch (err: any) {
    console.error("Failed to record processed stripe session:", err.message);
  }
}

export function incrementTenantPromptCount(tenantSlug: string): number {
  if (!db) return 1;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const row = db
      .prepare(
        `SELECT prompt_count FROM tenant_prompt_usage WHERE tenant_slug = ? AND date = ?`,
      )
      .get(tenantSlug, today) as { prompt_count: number } | undefined;

    const tenantRow = db
      .prepare(`SELECT plan, extra_prompts FROM tenants WHERE slug = ?`)
      .get(tenantSlug) as { plan: string; extra_prompts: number } | undefined;

    const current = row?.prompt_count || 0;
    const limit = getTenantDailyLimit(tenantRow?.plan || "demo");

    // If daily limit has been exhausted, consume from extra_prompts
    if (current >= limit && (tenantRow?.extra_prompts || 0) > 0) {
      db.prepare(
        `UPDATE tenants SET extra_prompts = MAX(0, extra_prompts - 1) WHERE slug = ?`,
      ).run(tenantSlug);
    }

    // Always increment usage count for today's analytics
    const stmt = db.prepare(`
      INSERT INTO tenant_prompt_usage (tenant_slug, date, prompt_count, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_slug, date) DO UPDATE SET
        prompt_count = prompt_count + 1,
        updated_at = CURRENT_TIMESTAMP
      RETURNING prompt_count
    `);

    const result = stmt.get(tenantSlug, today) as
      | { prompt_count: number }
      | undefined;
    return result?.prompt_count || 1;
  } catch (error) {
    console.error("Failed to increment tenant prompt count:", error);
    return 1;
  }
}

export function addTenantExtraPrompts(
  tenantSlug: string,
  count: number,
): number {
  if (!db) return 0;
  try {
    const stmt = db.prepare(`
      UPDATE tenants SET extra_prompts = COALESCE(extra_prompts, 0) + ? WHERE slug = ? RETURNING extra_prompts
    `);
    const row = stmt.get(count, tenantSlug) as
      | { extra_prompts: number }
      | undefined;
    return row?.extra_prompts || 0;
  } catch (err) {
    console.error("Failed to add extra prompts:", err);
    return 0;
  }
}

// Studio Chat History Helpers
export interface StudioChatMessageUI {
  role: "user" | "assistant";
  content: string;
  profile: string;
  time: string;
  steps?: {
    id: number | string;
    name: string;
    state: "running" | "completed";
  }[];
  conversationId?: string | null;
  imageUrl?: string | null;
}

export interface StudioConversationSummary {
  conversationId: string;
  title: string;
  messageCount: number;
  lastMessageAt: string;
  firstMessageAt: string;
}

export function getStudioChatHistory(
  tenantSlug: string,
  limit = 50,
  conversationId?: string | null,
): StudioChatMessageUI[] {
  if (!db) return [];

  try {
    let query = `SELECT * FROM studio_chat_messages WHERE tenant_slug = ?`;
    const params: any[] = [tenantSlug];
    if (conversationId) {
      if (conversationId === "default") {
        query += ` AND conversation_id IS NULL`;
      } else {
        query += ` AND conversation_id = ?`;
        params.push(conversationId);
      }
    }
    query += ` ORDER BY id ASC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params) as StudioChatMessageRecord[];

    return rows.map((r) => {
      let steps = undefined;
      if (r.steps_json) {
        try {
          steps = JSON.parse(r.steps_json);
        } catch {}
      }

      let time = "";
      try {
        const d = new Date(
          r.created_at + (r.created_at.includes("Z") ? "" : "Z"),
        );
        time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } catch {
        time = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      return {
        role: r.role,
        content: r.content,
        profile: r.profile || "primary",
        time,
        steps,
        conversationId: r.conversation_id,
        imageUrl: r.image_url || undefined,
      };
    });
  } catch (err) {
    console.error("Failed to get studio chat history:", err);
    return [];
  }
}

export function getStudioConversations(
  tenantSlug: string,
): StudioConversationSummary[] {
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        `SELECT 
          COALESCE(conversation_id, 'default') as conv_id,
          MIN(id) as first_id,
          MAX(id) as last_id,
          COUNT(*) as message_count,
          MIN(created_at) as first_at,
          MAX(created_at) as last_at
        FROM studio_chat_messages
        WHERE tenant_slug = ?
        GROUP BY COALESCE(conversation_id, 'default')
        ORDER BY MAX(id) DESC`,
      )
      .all(tenantSlug) as any[];

    return rows.map((r) => {
      const firstUserMsg = db
        .prepare(
          `SELECT content FROM studio_chat_messages
           WHERE tenant_slug = ? AND (conversation_id = ? OR (? = 'default' AND conversation_id IS NULL)) AND role = 'user'
           ORDER BY id ASC LIMIT 1`,
        )
        .get(tenantSlug, r.conv_id, r.conv_id) as any;

      const title = firstUserMsg?.content
        ? firstUserMsg.content.slice(0, 60).replace(/\n/g, " ").trim()
        : "Conversation";

      return {
        conversationId: r.conv_id,
        title,
        messageCount: r.message_count,
        lastMessageAt: r.last_at,
        firstMessageAt: r.first_at,
      };
    });
  } catch (err) {
    console.error("Failed to get studio conversations:", err);
    return [];
  }
}

export function deleteStudioConversation(
  tenantSlug: string,
  conversationId: string,
): boolean {
  if (!db) return false;
  try {
    if (conversationId === "default") {
      db.prepare(
        `DELETE FROM studio_chat_messages WHERE tenant_slug = ? AND conversation_id IS NULL`,
      ).run(tenantSlug);
    } else {
      db.prepare(
        `DELETE FROM studio_chat_messages WHERE tenant_slug = ? AND conversation_id = ?`,
      ).run(tenantSlug, conversationId);
    }
    return true;
  } catch (err) {
    console.error("Failed to delete studio conversation:", err);
    return false;
  }
}

export function saveStudioChatMessage(
  tenantSlug: string,
  role: "user" | "assistant",
  content: string,
  profile?: string | null,
  conversationId?: string | null,
  steps?: any[],
  imageUrl?: string | null,
): void {
  if (!db) return;

  try {
    const stepsJson = steps && steps.length > 0 ? JSON.stringify(steps) : null;
    db.prepare(
      `INSERT INTO studio_chat_messages (tenant_slug, conversation_id, role, content, profile, steps_json, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      tenantSlug,
      conversationId || null,
      role,
      content,
      profile || null,
      stepsJson,
      imageUrl || null,
    );
  } catch (err) {
    console.error("Failed to save studio chat message:", err);
  }
}

export function clearStudioChatHistory(tenantSlug: string): boolean {
  if (!db) return false;

  try {
    db.prepare(`DELETE FROM studio_chat_messages WHERE tenant_slug = ?`).run(
      tenantSlug,
    );
    return true;
  } catch (err) {
    console.error("Failed to clear studio chat history:", err);
    return false;
  }
}
