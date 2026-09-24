import { getAdapter } from "../driver.js";
import { cacheGetRaw, cacheSetRaw, cacheDelRaw, isCacheAvailable } from "@/lib/cache/client.js";

// Short-TTL cache for the full-provider quota join: the routing hot path
// calls getBatchProviderQuotas on EVERY antigravity selection, and the join
// over thousands of snapshot rows is the most expensive per-request query.
// 20s TTL bounds staleness (quota resets are minutes/hours away); upserts
// invalidate immediately below. Fail-open without cache.
const SNAPSHOT_CACHE_TTL_S = 20;
const snapshotCacheKey = (provider) => `agqsnap:${provider}`;

async function readSnapshotCache(provider) {
  if (!isCacheAvailable()) return null;
  try {
    const raw = await cacheGetRaw(snapshotCacheKey(provider));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeSnapshotCache(provider, value) {
  if (!isCacheAvailable()) return;
  try {
    await cacheSetRaw(snapshotCacheKey(provider), JSON.stringify(value), SNAPSHOT_CACHE_TTL_S);
  } catch {}
}

async function invalidateSnapshotCache(provider) {
  if (!isCacheAvailable() || !provider) return;
  try {
    await cacheDelRaw(snapshotCacheKey(provider));
  } catch {}
}

function jsonValue(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function snapshotFromRow(row) {
  if (!row) return null;
  return {
    connectionId: row.connection_id,
    provider: row.provider,
    plan: row.plan,
    quotas: row.quotas ?? {},
    rateLimits: row.rate_limits ?? null,
    remainingPct: row.remaining_pct === null || row.remaining_pct === undefined
      ? null
      : Number(row.remaining_pct),
    rawDosage: row.raw_dosage === null || row.raw_dosage === undefined
      ? null
      : Number(row.raw_dosage),
    resetAt: row.reset_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertUsageSnapshot({
  connectionId,
  provider,
  plan = null,
  quotas = {},
  rateLimits = null,
  remainingPct = null,
  rawDosage = null,
  resetAt = null,
}) {
  if (!connectionId) throw new Error("connectionId is required");
  if (!provider) throw new Error("provider is required");

  const db = await getAdapter();
  // Write-through invalidation so the routing hot path never serves a quota
  // state that a fresh refresh just overwrote.
  await invalidateSnapshotCache(provider);
  const row = await db.get(
    `INSERT INTO usage_snapshots
       (connection_id, provider, plan, quotas, rate_limits, remaining_pct, raw_dosage, reset_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, NOW())
     ON CONFLICT (connection_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       plan = EXCLUDED.plan,
       quotas = EXCLUDED.quotas,
       rate_limits = EXCLUDED.rate_limits,
       remaining_pct = EXCLUDED.remaining_pct,
       raw_dosage = EXCLUDED.raw_dosage,
       reset_at = EXCLUDED.reset_at,
       updated_at = NOW()
     RETURNING *`,
    [
      connectionId,
      provider,
      plan,
      jsonValue(quotas, {}),
      jsonValue(rateLimits, null),
      remainingPct,
      rawDosage,
      resetAt,
    ],
  );
  return snapshotFromRow(row);
}

export async function getUsageSnapshotByConnectionId(connectionId) {
  if (!connectionId) return null;
  const db = await getAdapter();
  const row = await db.get(
    `SELECT * FROM usage_snapshots WHERE connection_id = $1`,
    [connectionId],
  );
  return snapshotFromRow(row);
}

export async function getUsageSnapshotsByProvider(provider) {
  if (!provider) return [];
  const db = await getAdapter();
  const rows = await db.all(
    `SELECT * FROM usage_snapshots WHERE provider = $1
     ORDER BY remaining_pct ASC NULLS LAST, updated_at DESC`,
    [provider],
  );
  return rows.map(snapshotFromRow);
}

export async function getBatchProviderQuotas(provider) {
  if (!provider) return [];
  const cached = await readSnapshotCache(provider);
  if (cached) return cached;
  const db = await getAdapter();
  const rows = await db.all(
    `SELECT
       s.connection_id,
       s.provider,
       s.plan,
       s.quotas,
       s.rate_limits,
       s.remaining_pct,
       s.raw_dosage,
       s.reset_at,
       s.updated_at,
       c.name,
       c.email,
       c.priority,
       c.is_active,
       c.test_status,
       c.locked_all_until,
       c.data->'providerSpecificData' AS provider_specific_data
     FROM usage_snapshots AS s
     INNER JOIN provider_connections AS c ON c.id = s.connection_id
     WHERE s.provider = $1
     ORDER BY s.remaining_pct ASC NULLS LAST, c.priority ASC NULLS LAST, s.updated_at DESC`,
    [provider],
  );

  const mapped = rows.map((row) => ({
    ...snapshotFromRow(row),
    name: row.name,
    email: row.email,
    priority: row.priority,
    isActive: row.is_active === true || row.is_active === 1,
    testStatus: row.test_status || "active",
    lockedAllUntil: row.locked_all_until,
    providerSpecificData: row.provider_specific_data || {},
  }));
  await writeSnapshotCache(provider, mapped);
  return mapped;
}

/**
 * Delete persisted quota snapshots for the given connections.
 * Used by status-reset paths: without this, the next routing selection
 * re-hydrates the stale exhausted snapshot into RAM and the account is
 * immediately blocked again (top-ups / manual resets never stick).
 * Also invalidates the short-TTL provider snapshot cache so the routing
 * hot path cannot re-serve the just-deleted rows.
 * Fail-open callers only — throws on DB errors.
 * @returns number of deleted rows
 */
export async function deleteUsageSnapshotsByConnectionIds(connectionIds) {
  const ids = [...new Set((connectionIds || []).filter(Boolean))];
  if (ids.length === 0) return 0;
  const db = await getAdapter();
  const rows = await db.all(
    `DELETE FROM usage_snapshots WHERE connection_id = ANY($1::text[]) RETURNING provider`,
    [ids],
  );
  for (const provider of new Set(rows.map((r) => r?.provider).filter(Boolean))) {
    await invalidateSnapshotCache(provider);
  }
  return rows.length;
}
