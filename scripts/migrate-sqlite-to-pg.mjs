#!/usr/bin/env node
/**
 * Standalone Data Migration Script: SQLite -> PostgreSQL (AxonRouter)
 * Usage:
 *   DATABASE_URL="postgres://axonrouter:password123@localhost:5432/axonrouter" node scripts/migrate-sqlite-to-pg.mjs [path/to/data.sqlite]
 */

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const sqlitePath = process.argv[2] || process.env.DATA_FILE || path.join(process.env.DATA_DIR || path.join(process.env.HOME || "", "\.axonrouter"), "data.sqlite");
const pgUrl = process.env.DATABASE_URL || "postgres://axonrouter:password123@localhost:5432/axonrouter";

if (!fs.existsSync(sqlitePath)) {
  console.error(`[MIGRATE] SQLite file not found at: ${sqlitePath}`);
  process.exit(1);
}

console.log(`[MIGRATE] Source SQLite: ${sqlitePath}`);
console.log(`[MIGRATE] Target PostgreSQL: ${pgUrl.replace(/:[^:@]+@/, ":***@")}`);

// Load SQLite reader (try better-sqlite3, then node:sqlite)
let sqliteDb = null;
try {
  const Database = (await import("better-sqlite3")).default;
  sqliteDb = new Database(sqlitePath, { readonly: true });
} catch {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    sqliteDb = new DatabaseSync(sqlitePath, { readOnly: true });
  } catch (err) {
    console.error(`[MIGRATE] Failed to open SQLite: ${err.message}`);
    process.exit(1);
  }
}

function querySqlite(sql) {
  if (typeof sqliteDb.prepare === "function") {
    const stmt = sqliteDb.prepare(sql);
    return typeof stmt.all === "function" ? stmt.all() : stmt.all();
  }
  return [];
}

const sql = postgres(pgUrl, { max: 10, idle_timeout: 30, transform: { undefined: null } });

function parseJsonSafe(val, fallback = {}) {
  if (!val) return fallback;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

async function migrate() {
  console.log("\n--- Starting Data Migration ---");

  // 1. Settings
  try {
    const rows = querySqlite("SELECT * FROM settings");
    if (rows.length > 0) {
      for (const r of rows) {
        const dataObj = parseJsonSafe(r.data);
        await sql`
          INSERT INTO settings (id, data, updated_at)
          VALUES (1, ${sql.json(dataObj)}, NOW())
          ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `;
      }
      console.log(`✓ Settings migrated: ${rows.length} row(s)`);
    }
  } catch (e) {
    console.warn(`! Settings skipped/error: ${e.message}`);
  }

  // 2. Provider Connections (Batch 500 rows)
  try {
    const rows = querySqlite("SELECT * FROM providerConnections");
    console.log(`\nFound ${rows.length} provider connections in SQLite. Migrating...`);

    const BATCH_SIZE = 500;
    let count = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      const values = chunk.map((r) => {
        const extra = parseJsonSafe(r.data, {});
        return {
          id: String(r.id),
          provider: String(r.provider),
          auth_type: String(r.authType || "api_key"),
          name: r.name || null,
          email: r.email || null,
          priority: Number(r.priority) || 999,
          is_active: r.isActive === 1 || r.isActive === true || r.isActive === "1",
          test_status: extra.testStatus || "active",
          locked_all_until: extra.lockedAllUntil ? new Date(extra.lockedAllUntil) : null,
          rate_limited_until: extra.rateLimitedUntil ? new Date(extra.rateLimitedUntil) : null,
          token_expires_at: extra.expiresAt ? new Date(extra.expiresAt) : null,
          last_used_at: extra.lastUsedAt ? new Date(extra.lastUsedAt) : null,
          model_locks: sql.json(extra.modelLocks || {}),
          last_error: extra.lastError || null,
          error_code: extra.errorCode !== undefined && extra.errorCode !== null ? String(extra.errorCode) : null,
          last_error_at: extra.lastErrorAt ? new Date(extra.lastErrorAt) : null,
          data: sql.json(extra),
          created_at: r.createdAt ? new Date(r.createdAt) : new Date(),
          updated_at: r.updatedAt ? new Date(r.updatedAt) : new Date(),
        };
      });

      await sql`
        INSERT INTO provider_connections ${sql(values)}
        ON CONFLICT (id) DO UPDATE SET
          provider = EXCLUDED.provider,
          auth_type = EXCLUDED.auth_type,
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          priority = EXCLUDED.priority,
          is_active = EXCLUDED.is_active,
          test_status = EXCLUDED.test_status,
          locked_all_until = EXCLUDED.locked_all_until,
          rate_limited_until = EXCLUDED.rate_limited_until,
          token_expires_at = EXCLUDED.token_expires_at,
          last_used_at = EXCLUDED.last_used_at,
          model_locks = EXCLUDED.model_locks,
          last_error = EXCLUDED.last_error,
          error_code = EXCLUDED.error_code,
          last_error_at = EXCLUDED.last_error_at,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
      `;
      count += chunk.length;
      process.stdout.write(`\r  Progress: ${count}/${rows.length} accounts`);
    }
    console.log(`\n✓ Provider connections migrated: ${count} row(s)`);
  } catch (e) {
    console.warn(`! Provider connections skipped/error: ${e.message}`);
  }

  // 3. Provider Nodes
  try {
    const rows = querySqlite("SELECT * FROM providerNodes");
    if (rows.length > 0) {
      const values = rows.map((r) => ({
        id: String(r.id),
        type: r.type || null,
        name: r.name || null,
        data: sql.json(parseJsonSafe(r.data, {})),
        created_at: r.createdAt ? new Date(r.createdAt) : new Date(),
        updated_at: r.updatedAt ? new Date(r.updatedAt) : new Date(),
      }));

      await sql`
        INSERT INTO provider_nodes ${sql(values)}
        ON CONFLICT (id) DO UPDATE SET
          type = EXCLUDED.type,
          name = EXCLUDED.name,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
      `;
      console.log(`✓ Provider nodes migrated: ${rows.length} row(s)`);
    }
  } catch (e) {
    console.warn(`! Provider nodes skipped/error: ${e.message}`);
  }

  // 4. Proxy Pools
  try {
    const rows = querySqlite("SELECT * FROM proxyPools");
    if (rows.length > 0) {
      const values = rows.map((r) => {
        const extra = parseJsonSafe(r.data, {});
        return {
          id: String(r.id),
          name: extra.name || r.name || "Default Pool",
          proxy_url: extra.proxyUrl || extra.url || "",
          no_proxy: extra.noProxy || "",
          type: extra.type || "http",
          group: extra.group || "",
          is_active: r.isActive === 1 || r.isActive === true,
          strict_proxy: !!extra.strictProxy,
          test_status: r.testStatus || "unknown",
          last_tested_at: extra.lastTestedAt ? new Date(extra.lastTestedAt) : null,
          last_error: extra.lastError || null,
          data: sql.json(extra),
          created_at: r.createdAt ? new Date(r.createdAt) : new Date(),
          updated_at: r.updatedAt ? new Date(r.updatedAt) : new Date(),
        };
      });

      await sql`
        INSERT INTO proxy_pools ${sql(values)}
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          proxy_url = EXCLUDED.proxy_url,
          is_active = EXCLUDED.is_active,
          test_status = EXCLUDED.test_status,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
      `;
      console.log(`✓ Proxy pools migrated: ${rows.length} row(s)`);
    }
  } catch (e) {
    console.warn(`! Proxy pools skipped/error: ${e.message}`);
  }

  // 4. API Keys
  try {
    const rows = querySqlite("SELECT * FROM apiKeys");
    if (rows.length > 0) {
      const values = rows.map((r) => ({
        id: String(r.id),
        key: String(r.key),
        name: r.name || null,
        machine_id: r.machineId || null,
        is_active: r.isActive === 1 || r.isActive === true,
        created_at: r.createdAt ? new Date(r.createdAt) : new Date(),
      }));

      await sql`
        INSERT INTO api_keys ${sql(values)}
        ON CONFLICT (id) DO NOTHING
      `;
      console.log(`✓ API keys migrated: ${rows.length} row(s)`);
    }
  } catch (e) {
    console.warn(`! API keys skipped/error: ${e.message}`);
  }

  // 5. Combos
  try {
    const rows = querySqlite("SELECT * FROM combos");
    if (rows.length > 0) {
      const values = rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        kind: r.kind || null,
        models: sql.json(parseJsonSafe(r.models, [])),
        created_at: r.createdAt ? new Date(r.createdAt) : new Date(),
        updated_at: r.updatedAt ? new Date(r.updatedAt) : new Date(),
      }));

      await sql`
        INSERT INTO combos ${sql(values)}
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          models = EXCLUDED.models,
          updated_at = EXCLUDED.updated_at
      `;
      console.log(`✓ Combos migrated: ${rows.length} row(s)`);
    }
  } catch (e) {
    console.warn(`! Combos skipped/error: ${e.message}`);
  }

  // 6. KV Store
  try {
    const rows = querySqlite("SELECT * FROM kv");
    if (rows.length > 0) {
      const values = rows.map((r) => ({
        scope: String(r.scope),
        key: String(r.key),
        value: sql.json(parseJsonSafe(r.value, r.value)),
      }));

      await sql`
        INSERT INTO kv ${sql(values)}
        ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value
      `;
      console.log(`✓ KV store migrated: ${rows.length} row(s)`);
    }
  } catch (e) {
    console.warn(`! KV store skipped/error: ${e.message}`);
  }

  // 7. Daily Usage
  try {
    const rows = querySqlite("SELECT * FROM usageDaily");
    if (rows.length > 0) {
      const values = rows.map((r) => ({
        date_key: r.dateKey,
        data: sql.json(parseJsonSafe(r.data, {})),
      }));

      await sql`
        INSERT INTO usage_daily ${sql(values)}
        ON CONFLICT (date_key) DO UPDATE SET data = EXCLUDED.data
      `;
      console.log(`✓ Usage daily migrated: ${rows.length} row(s)`);
    }
  } catch (e) {
    console.warn(`! Usage daily skipped/error: ${e.message}`);
  }

  console.log("\n--- Verification Check ---");
  const pcCount = await sql`SELECT COUNT(*) as c FROM provider_connections`;
  console.log(`Postgres provider_connections total: ${pcCount[0].c}`);

  console.log("\n[MIGRATE] Migration completed successfully.");
  await sql.end({ timeout: 2 });
  process.exit(0);
}

migrate().catch(async (err) => {
  console.error(`\n[MIGRATE FATAL] ${err.stack}`);
  try { await sql.end({ timeout: 2 }); } catch {}
  process.exit(1);
});
