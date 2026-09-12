import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTenantBySlug } from "$lib/server/db";
import { getTenantCodeDir } from "$lib/server/tenant-files";
import { existsSync } from "fs";
import { resolve } from "path";

function isUserAuthorizedForTenant(locals: App.Locals, tenant: any): boolean {
  if (!locals.user) return false;
  const adminEmails = [
    "bassem.bme@gmail.com",
    "bassem1alsa@gmail.com",
    process.env.ADMIN_EMAIL,
    process.env.RESEND_CONTACT_EMAIL,
  ]
    .filter(Boolean)
    .map((e) => e!.trim().toLowerCase());
  const userEmail = (locals.user.email || "").trim().toLowerCase();
  const isAdmin =
    adminEmails.includes(userEmail) || userEmail.endsWith("@ether.paris");
  return tenant.user_id === locals.user.id || isAdmin;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json(
      { success: false, error: "Non autorisé. Veuillez vous connecter." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const projectSlug = (body.projectSlug || "tester").trim();
    const tenant = await getTenantBySlug(projectSlug);
    if (!tenant) {
      return json({ success: false, error: "Site introuvable." }, { status: 404 });
    }

    if (!isUserAuthorizedForTenant(locals, tenant)) {
      return json(
        {
          success: false,
          error: "Accès refusé : vous n'êtes pas autorisé à inspecter la base de données de ce site.",
        },
        { status: 403 },
      );
    }

    const runnerUrl =
      process.env.RUNNER_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "http://agent-runner:8080"
        : "http://localhost:8085");

    try {
      const res = await fetch(`${runnerUrl}/sqlite/${projectSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        return json(await res.json());
      }
      const errJson = await res.json().catch(() => null);
      if (errJson) return json(errJson, { status: res.status });
    } catch {}

    // Local fallback using bun:sqlite (for local development or testing)
    try {
      const { Database } = await import("bun:sqlite");
      const codeDir = getTenantCodeDir(projectSlug);
      const dbRelPath = (body.dbPath || "data.db").trim().replace(/^\/+/, "");
      const fullDbPath = resolve(codeDir, dbRelPath);

      if (!existsSync(fullDbPath)) {
        return json(
          { success: false, error: `Base de données introuvable : ${dbRelPath}` },
          { status: 404 },
        );
      }

      const action = body.action || "schema";
      if (action === "schema") {
        const db = new Database(fullDbPath, { readonly: true });
        try {
          const rawTables = db
            .query(
              `SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`,
            )
            .all() as Array<{ name: string; type: string; sql: string }>;

          const tables = rawTables.map((t) => {
            let columns: any[] = [];
            let rowCount = 0;
            try {
              columns = db
                .query(`PRAGMA table_info("${t.name.replace(/"/g, '""')}")`)
                .all();
            } catch {}
            try {
              const countRes = db
                .query(
                  `SELECT COUNT(*) as count FROM "${t.name.replace(/"/g, '""')}"`,
                )
                .get() as any;
              rowCount = countRes ? countRes.count : 0;
            } catch {}
            return {
              name: t.name,
              type: t.type,
              sql: t.sql,
              columns,
              rowCount,
            };
          });

          return json({
            success: true,
            projectSlug,
            dbPath: dbRelPath,
            tables,
          });
        } finally {
          db.close();
        }
      }

      if (action === "query") {
        const sqlQuery = (body.sql || "").trim();
        if (!sqlQuery) {
          return json({ success: false, error: "Requête SQL requise" }, { status: 400 });
        }

        const isReadOnly = /^\s*(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(sqlQuery);
        const db = new Database(fullDbPath, { readonly: isReadOnly });
        try {
          const startTime = performance.now();
          if (isReadOnly) {
            let finalQuery = sqlQuery;
            if (/^\s*SELECT\b/i.test(finalQuery) && !/\bLIMIT\b/i.test(finalQuery)) {
              finalQuery += " LIMIT 100";
            }
            const stmt = db.query(finalQuery);
            const rows = stmt.all() as Record<string, any>[];
            const columns = rows.length > 0 ? Object.keys(rows[0]) : stmt.columnNames || [];
            const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
            return json({
              success: true,
              columns,
              rows,
              rowCount: rows.length,
              executionTimeMs,
              readonly: true,
            });
          } else {
            const stmt = db.query(sqlQuery);
            const result = stmt.run();
            const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
            return json({
              success: true,
              columns: [],
              rows: [],
              changes: result.changes,
              lastInsertRowid: result.lastInsertRowid,
              executionTimeMs,
              readonly: false,
            });
          }
        } finally {
          db.close();
        }
      }

      return json({ success: false, error: `Action inconnue : ${action}` }, { status: 400 });
    } catch (dbErr: any) {
      return json({ success: false, error: dbErr.message }, { status: 500 });
    }
  } catch (err: any) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
