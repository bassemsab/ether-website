import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, symlinkSync, unlinkSync, lstatSync } from "fs";
import { join } from "path";

const DB_PATH = process.env.DB_PATH || "visitors.sqlite";
const db = new Database(DB_PATH);

console.log(`[Import] Connecting to SQLite database at: ${DB_PATH}`);

// Ensure users table exists and insert / retrieve users
function ensureUser(email: string, username: string) {
  const normEmail = email.trim().toLowerCase();
  let user = db.query("SELECT * FROM users WHERE email = ?").get(normEmail) as any;
  if (!user) {
    console.log(`[Import] Creating user for ${normEmail}...`);
    const insert = db.prepare(`
      INSERT INTO users (email, github_id, github_username, github_access_token, last_login_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      RETURNING *
    `);
    user = insert.get(
      normEmail,
      `email:${normEmail}`,
      username,
      `otp:${Date.now()}`
    );
  } else {
    console.log(`[Import] User found: ID ${user.id} (${user.email})`);
  }
  return user;
}

// Ensure tenant record exists or is updated
function ensureTenant({
  userId,
  slug,
  brandName,
  domain,
  customDomain,
  email,
}: {
  userId: number;
  slug: string;
  brandName: string;
  domain: string;
  customDomain: string | null;
  email: string;
}) {
  let tenant = db.query("SELECT * FROM tenants WHERE slug = ?").get(slug) as any;
  if (!tenant) {
    console.log(`[Import] Creating tenant for ${slug}...`);
    const insert = db.prepare(`
      INSERT INTO tenants (
        user_id, slug, brand_name, domain, subdomain, custom_domain, email,
        k8s_namespace, status, plan, extra_prompts
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'custom', 50)
      RETURNING *
    `);
    tenant = insert.get(
      userId,
      slug,
      brandName,
      domain,
      domain,
      customDomain,
      email,
      `tenant-${slug}`
    );
    console.log(`[Import] Tenant created: ID ${tenant.id} (${tenant.slug})`);
  } else {
    console.log(`[Import] Updating existing tenant ${slug}...`);
    db.prepare(`
      UPDATE tenants
      SET user_id = ?, brand_name = ?, domain = ?, subdomain = ?, custom_domain = ?, email = ?, status = 'active', plan = 'custom'
      WHERE slug = ?
    `).run(userId, brandName, domain, domain, customDomain, email, slug);
    tenant = db.query("SELECT * FROM tenants WHERE slug = ?").get(slug);
  }
  return tenant;
}

// Ensure local-data workspace symlink exists
function linkWorkspace(slug: string, targetProjectPath: string) {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), ".local-data");
  const tenantDir = join(dataDir, "tenants", slug);
  const codeDir = join(tenantDir, "code");

  mkdirSync(tenantDir, { recursive: true });

  if (existsSync(codeDir)) {
    try {
      const stat = lstatSync(codeDir);
      if (stat.isSymbolicLink()) {
        console.log(`[Import] Removing previous symlink at ${codeDir}`);
        unlinkSync(codeDir);
      }
    } catch {}
  }

  if (!existsSync(codeDir)) {
    console.log(`[Import] Symlinking ${codeDir} -> ${targetProjectPath}`);
    symlinkSync(targetProjectPath, codeDir, "dir");
  } else {
    console.log(`[Import] Directory ${codeDir} already exists.`);
  }
}

// 1. Ensure Bassem admin user
const bassemUser = ensureUser("bassem.bme@gmail.com", "bassem");

// 2. Corine Barrett (Rosée Minérale)
const corineUser = ensureUser("cbarrett320@gmail.com", "corine-barrett");
const roseeTenant = ensureTenant({
  userId: corineUser.id,
  slug: "rosee-minerale",
  brandName: "Rosée Minérale",
  domain: "rosee-minerale.ether.paris",
  customDomain: "rosee-minerale.fr",
  email: "cbarrett320@gmail.com",
});
linkWorkspace("rosee-minerale", "/Users/bassem/Documents/projects/rosee-minerale-web");

// 3. Simon Nicole (Artist's Inner Realm / Le Chat Perdu)
const simonUser = ensureUser("simon431998@gmail.com", "simon-nicole");
const simonTenant = ensureTenant({
  userId: simonUser.id,
  slug: "lechatperdu",
  brandName: "Artist's Inner Realm",
  domain: "lechatperdu.ether.paris",
  customDomain: null,
  email: "simon431998@gmail.com",
});
linkWorkspace("lechatperdu", "/Users/bassem/Documents/projects/artist-s-inner-realm");

console.log("\n✅ Import completed successfully!");
console.log(`- Rosée Minérale: Tenant ID ${roseeTenant.id}, Domain: ${roseeTenant.domain}, Custom: ${roseeTenant.custom_domain}`);
console.log(`- Le Chat Perdu: Tenant ID ${simonTenant.id}, Domain: ${simonTenant.domain}, Custom: ${simonTenant.custom_domain || "None yet"}`);
