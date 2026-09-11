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
    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)");
  } catch {}
  safeAddColumn("tenants", "subdomain TEXT");
  safeAddColumn("tenants", "custom_domain TEXT");
  safeAddColumn("tenants", "k8s_namespace TEXT");
  safeAddColumn("tenants", "git_repo_url TEXT");
  safeAddColumn("tenants", "git_access_token TEXT");
  safeAddColumn("tenants", "stripe_subscription_id TEXT");
  safeAddColumn("tenants", "plan TEXT DEFAULT 'free'");
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
    const stmt = db.prepare(
      `SELECT * FROM tenants WHERE LOWER(domain) = ? OR LOWER(subdomain) = ? OR LOWER(custom_domain) = ?`
    );
    const result = stmt.get(cleanDomain, cleanDomain, cleanDomain);
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

export async function getTenantById(
  id: number,
): Promise<TenantRecord | null> {
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
    const setClause = setKeys.length > 0 
      ? ", " + setKeys.map((key) => `${key} = ?`).join(", ")
      : "";

    const stmt = db.prepare(`
      UPDATE tenants
      SET status = ? ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE domain = ? OR slug = ?
      RETURNING *
    `);

    const result = stmt.get(status, ...Object.values(updates), domainOrSlug, domainOrSlug);
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

export async function getTenantsByUserId(userId: number): Promise<TenantRecord[]> {
  if (!db) return [];

  try {
    const stmt = db.prepare(
      `SELECT * FROM tenants WHERE user_id = ? ORDER BY created_at DESC`,
    );
    return stmt.all(userId) as TenantRecord[];
  } catch (error) {
    console.error("Failed to get tenants by user:", error);
    return [];
  }
}

// User Helpers
export async function getOrCreateUserByEmail(email: string): Promise<UserRecord | null> {
  if (!db) return null;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const selectStmt = db.prepare(`SELECT * FROM users WHERE email = ?`);
    let user = selectStmt.get(normalizedEmail) as UserRecord | null;

    if (!user) {
      const username = normalizedEmail.split("@")[0].replace(/[^a-z0-9_-]/g, "-").slice(0, 32);
      const insertStmt = db.prepare(`
        INSERT INTO users (email, github_id, github_username, github_access_token, last_login_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        RETURNING *
      `);
      user = insertStmt.get(
        normalizedEmail,
        `email:${normalizedEmail}`,
        username,
        `otp:${Date.now()}`
      ) as UserRecord | null;
    } else {
      db.prepare(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`).run(user.id);
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
    db.prepare(`
      UPDATE users 
      SET gitea_username = ?, gitea_token = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(giteaUsername, giteaToken, userId);
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

export async function getUserByGithubId(githubId: string): Promise<UserRecord | null> {
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

    const result = stmt.get(tenantId, domain, provider, stripeSessionId, priceCents, currency);
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

    const result = stmt.get(status, stripeSubscriptionId || null, stripeSessionId);
    return result as DomainOrderRecord | null;
  } catch (error) {
    console.error("Failed to update domain order status:", error);
    return null;
  }
}

// Tenant Fair-Use Prompt Tracking Helpers
export function getTenantDailyLimit(plan?: string | null): number {
  const normalized = (plan || "demo").toLowerCase().trim();
  if (normalized === "enterprise" || normalized === "unlimited") return 1000;
  if (normalized === "pro" || normalized === "starter" || normalized === "paid") return 150;
  return 25; // demo / free
}

export function checkTenantPromptLimit(
  tenantSlug: string,
  plan: string = "demo"
): { allowed: boolean; current: number; limit: number; remaining: number } {
  const limit = getTenantDailyLimit(plan);
  if (!db) {
    return { allowed: true, current: 0, limit, remaining: limit };
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const row = db
      .prepare(`SELECT prompt_count FROM tenant_prompt_usage WHERE tenant_slug = ? AND date = ?`)
      .get(tenantSlug, today) as { prompt_count: number } | undefined;

    const current = row?.prompt_count || 0;
    const remaining = Math.max(0, limit - current);
    const allowed = current < limit;

    return { allowed, current, limit, remaining };
  } catch (error) {
    console.error("Failed to check tenant prompt limit:", error);
    return { allowed: true, current: 0, limit, remaining: limit };
  }
}

export function incrementTenantPromptCount(tenantSlug: string): number {
  if (!db) return 1;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const stmt = db.prepare(`
      INSERT INTO tenant_prompt_usage (tenant_slug, date, prompt_count, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_slug, date) DO UPDATE SET
        prompt_count = prompt_count + 1,
        updated_at = CURRENT_TIMESTAMP
      RETURNING prompt_count
    `);

    const result = stmt.get(tenantSlug, today) as { prompt_count: number } | undefined;
    return result?.prompt_count || 1;
  } catch (error) {
    console.error("Failed to increment tenant prompt count:", error);
    return 1;
  }
}
