import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { invalidateCachedConnections, setAccountCooldown, clearBatchAccountCooldown, getCatalog, invalidateCatalog } from "@/lib/cache/client.js";

const MODEL_LOCK_PREFIX = "modelLock_";
const MODEL_LOCK_ALL = "__all";

const CONNECTION_FIELDS = new Set([
  "id",
  "provider",
  "authType",
  "name",
  "email",
  "priority",
  "isActive",
  "testStatus",
  "lockedAllUntil",
  "rateLimitedUntil",
  "lockedToModel",
  "lockedToModelUntil",
  "tokenExpiresAt",
  "lastUsedAt",
  "modelLocks",
  "lastError",
  "errorCode",
  "lastErrorAt",
  "createdAt",
  "updatedAt",
]);

const CONNECTION_SNAKE_FIELDS = {
  auth_type: "authType",
  is_active: "isActive",
  test_status: "testStatus",
  locked_all_until: "lockedAllUntil",
  rate_limited_until: "rateLimitedUntil",
  locked_to_model: "lockedToModel",
  locked_to_model_until: "lockedToModelUntil",
  token_expires_at: "tokenExpiresAt",
  last_used_at: "lastUsedAt",
  model_locks: "modelLocks",
  last_error: "lastError",
  error_code: "errorCode",
  last_error_at: "lastErrorAt",
  created_at: "createdAt",
  updated_at: "updatedAt",
};

const DATA_FIELDS_TO_CLEAN = [
  "displayName",
  "email",
  "globalPriority",
  "defaultModel",
  "accessToken",
  "refreshToken",
  "expiresAt",
  "tokenType",
  "scope",
  "projectId",
  "apiKey",
  "testStatus",
  "lastTested",
  "lastError",
  "lastErrorAt",
  "rateLimitedUntil",
  "expiresIn",
  "errorCode",
  "consecutiveUseCount",
  "idToken",
  "lastRefreshAt",
  "backoffLevel",
  "proxyRotationStrategy",
  "proxyPoolIds",
];

function resetHealthStateOnActivation(existing, patch) {
  if (patch?.testStatus !== "active") return patch;

  const normalized = {
    ...patch,
    testStatus: "active",
    lastError: Object.hasOwn(patch, "lastError") ? patch.lastError : null,
    lastErrorAt: Object.hasOwn(patch, "lastErrorAt") ? patch.lastErrorAt : null,
    errorCode: null,
    rateLimitedUntil: null,
    lockedAllUntil: null,
    lockedToModel: null,
    lockedToModelUntil: null,
    backoffLevel: 0,
    // Re-activation must clear disabled markers or rowToConnection keeps
    // reporting isActive=false from the stale data.disabledAt.
    disabledAt: null,
    disabledReason: null,
    disabledBy: null,
  };

  for (const key of Object.keys(existing || {})) {
    if (key.startsWith(MODEL_LOCK_PREFIX)) normalized[key] = null;
  }

  return normalized;
}

function jsonObject(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function jsonString(value) {
  return JSON.stringify(value ?? {});
}

function booleanValue(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1;
}

function modelLocksFromRow(row, rowData) {
  const locks = { ...jsonObject(row.model_locks, {}) };
  const data = jsonObject(rowData, {});

  if (data.modelLocks && typeof data.modelLocks === "object") {
    Object.assign(locks, data.modelLocks);
  }
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith(MODEL_LOCK_PREFIX)) {
      const model = key.slice(MODEL_LOCK_PREFIX.length);
      if (value === null || value === undefined) delete locks[model];
      else locks[model] = value;
    }
  }
  return locks;
}

function rowToConnection(row) {
  if (!row) return null;

  const rowData = jsonObject(row.data, {});
  if (rowData.providerSpecificData && typeof rowData.providerSpecificData === "object") {
    if (typeof rowData.providerSpecificData.proxyPoolIds === "string") {
      try {
        rowData.providerSpecificData.proxyPoolIds = JSON.parse(rowData.providerSpecificData.proxyPoolIds);
      } catch {
        rowData.providerSpecificData.proxyPoolIds = [];
      }
    }
  }
  const { modelLocks: _dataModelLocks, ...data } = rowData;
  const modelLocks = modelLocksFromRow(row, rowData);
  const disabledAt = data.disabledAt || null;
  const connection = {
    ...data,
    id: row.id,
    provider: row.provider,
    authType: row.auth_type,
    name: row.name,
    email: row.email,
    priority: row.priority,
    // disabledAt is a persisted system/user block marker. Treat it as
    // inactive everywhere, even if an older write left is_active=true.
    isActive: booleanValue(row.is_active) && !disabledAt && row.test_status !== "disabled",
    testStatus: row.test_status,
    lockedAllUntil: row.locked_all_until,
    rateLimitedUntil: row.rate_limited_until,
    lockedToModel: row.locked_to_model || data.lockedToModel || null,
    lockedToModelUntil: row.locked_to_model_until ? new Date(row.locked_to_model_until).toISOString() : (data.lockedToModelUntil || null),
    tokenExpiresAt: row.token_expires_at,
    lastUsedAt: row.last_used_at,
    modelLocks,
    lastError: row.last_error,
    errorCode: row.error_code,
    lastErrorAt: row.last_error_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  // Keep the old flat lock names available to the existing routing/UI code.
  for (const [model, until] of Object.entries(modelLocks)) {
    if (until !== null && until !== undefined) {
      connection[`${MODEL_LOCK_PREFIX}${model}`] = until;
    }
  }
  return connection;
}

function normalizePatch(data = {}) {
  const patch = { ...data };
  for (const [snake, camel] of Object.entries(CONNECTION_SNAKE_FIELDS)) {
    if (patch[camel] === undefined && patch[snake] !== undefined) patch[camel] = patch[snake];
    delete patch[snake];
  }
  if (patch.tokenExpiresAt === undefined && patch.expiresAt !== undefined) {
    patch.tokenExpiresAt = patch.expiresAt;
  }
  return patch;
}

function modelLocksFromConnection(connection, baseLocks = {}) {
  const locks = { ...baseLocks };
  if (connection.modelLocks && typeof connection.modelLocks === "object") {
    Object.assign(locks, connection.modelLocks);
  }
  for (const [key, value] of Object.entries(connection)) {
    if (!key.startsWith(MODEL_LOCK_PREFIX)) continue;
    const model = key.slice(MODEL_LOCK_PREFIX.length);
    if (value === null || value === undefined) delete locks[model];
    else locks[model] = value;
  }
  return locks;
}

function connectionData(connection) {
  const data = { ...connection };
  for (const field of CONNECTION_FIELDS) delete data[field];
  for (const key of Object.keys(data)) {
    if (key.startsWith(MODEL_LOCK_PREFIX)) delete data[key];
  }
  return data;
}

function connectionValues(connection, { createdAt } = {}) {
  const data = connectionData(connection);
  // Sync invariant: the disabled marker and the column move together. Any
  // write carrying data.disabledAt (or testStatus disabled) forces
  // is_active=false, so the DISABLED bucket (purely is_active=false) can
  // never miss a disabled row. Enable paths clear both (see
  // resetHealthStateOnActivation and the SQL enable branches).
  const isDisabled = data.disabledAt != null || connection.testStatus === "disabled";
  const rawExpires = connection.tokenExpiresAt ?? connection.expiresAt ?? data.expiresAt ?? null;
  const tokenExpiresAt = rawExpires ? new Date(rawExpires).toISOString() : null;
  return {
    id: connection.id,
    provider: connection.provider,
    authType: connection.authType || "oauth",
    name: connection.name ?? null,
    email: connection.email ?? null,
    priority: connection.priority ?? 999,
    isActive: isDisabled ? false : booleanValue(connection.isActive),
    testStatus: connection.testStatus ?? "active",
    lockedAllUntil: connection.lockedAllUntil ?? null,
    rateLimitedUntil: connection.rateLimitedUntil ?? null,
    lockedToModel: connection.lockedToModel ?? null,
    lockedToModelUntil: connection.lockedToModelUntil ?? null,
    tokenExpiresAt,
    lastUsedAt: connection.lastUsedAt ?? null,
    modelLocks: modelLocksFromConnection(connection),
    lastError: connection.lastError ?? null,
    errorCode: connection.errorCode ?? null,
    lastErrorAt: connection.lastErrorAt ?? null,
    data,
    createdAt: createdAt ?? connection.createdAt ?? new Date().toISOString(),
    updatedAt: connection.updatedAt ?? new Date().toISOString(),
  };
}

async function writeConnection(db, connection, options = {}) {
  const values = connectionValues(connection, options);
  const row = await db.get(
    `INSERT INTO provider_connections
       (id, provider, auth_type, name, email, priority, is_active, test_status,
        locked_all_until, rate_limited_until, locked_to_model, locked_to_model_until,
        token_expires_at, last_used_at, model_locks, last_error, error_code,
        last_error_at, data, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15::jsonb, $16, $17, $18, $19::jsonb, $20, $21)
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
       locked_to_model = EXCLUDED.locked_to_model,
       locked_to_model_until = EXCLUDED.locked_to_model_until,
       token_expires_at = EXCLUDED.token_expires_at,
       last_used_at = EXCLUDED.last_used_at,
       model_locks = EXCLUDED.model_locks,
       last_error = EXCLUDED.last_error,
       error_code = EXCLUDED.error_code,
       last_error_at = EXCLUDED.last_error_at,
       data = EXCLUDED.data,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      values.id,
      values.provider,
      values.authType,
      values.name,
      values.email,
      values.priority,
      values.isActive,
      values.testStatus,
      values.lockedAllUntil,
      values.rateLimitedUntil,
      values.lockedToModel,
      values.lockedToModelUntil,
      values.tokenExpiresAt,
      values.lastUsedAt,
      values.modelLocks,
      values.lastError,
      values.errorCode,
      values.lastErrorAt,
      values.data,
      values.createdAt,
      values.updatedAt,
    ],
  );
  return rowToConnection(row);
}

async function reorderInTransaction(db, provider) {
  const result = await db.run(
    `WITH ranked AS (
       SELECT id,
              ROW_NUMBER() OVER (
                ORDER BY priority ASC NULLS LAST, updated_at DESC NULLS LAST, id ASC
              ) AS new_priority
       FROM provider_connections
       WHERE provider = $1
     )
     UPDATE provider_connections AS pc
     SET priority = ranked.new_priority,
         updated_at = NOW()
     FROM ranked
     WHERE pc.id = ranked.id`,
    [provider],
  );
  return Number(result?.changes ?? 0);
}

function deriveConnectionName(data, fallbackName) {
  if (data.provider === "github") {
    return data.providerSpecificData?.githubLogin
      || data.providerSpecificData?.githubEmail
      || data.email
      || data.providerSpecificData?.githubName
      || fallbackName;
  }
  return fallbackName;
}

const FATAL_CONNECTION_ERROR_SQL = "(last_error IS NOT NULL AND last_error ~* '(banned|account has been banned|account has been deleted|suspended|revoked|invalid_grant|invalid token|invalid api key|unauthorized|forbidden)')";
const CONNECTION_UNAVAILABLE_DATA_SQL = "(data->'providerSpecificData'->>'refreshBlocked' IS NOT NULL AND data->'providerSpecificData'->>'refreshBlocked' <> 'false' AND data->'providerSpecificData'->>'refreshBlocked' <> '')";
const safeTimestampSql = (expression) => `(CASE WHEN (${expression}) IS NOT NULL THEN safe_input_timestamptz((${expression})::text) ELSE NULL END)`;
const FUTURE_ACCOUNT_LOCK_SQL = `(
  (locked_all_until IS NOT NULL AND locked_all_until > NOW())
  OR (COALESCE(${safeTimestampSql("model_locks->>'__all'")}, '-infinity'::timestamptz) > NOW())
  OR (rate_limited_until IS NOT NULL AND rate_limited_until > NOW())
)`;
// Per-model locks only exhaust the affected model. Account-wide locks make
// account unavailable because no model can safely use it until reset.
const FUTURE_MODEL_LOCK_SQL = `EXISTS (
  SELECT 1 FROM jsonb_each_text(
    CASE WHEN jsonb_typeof(model_locks) = 'object' THEN model_locks ELSE '{}'::jsonb END
  ) AS kv(k, v)
  WHERE k <> '__all' AND COALESCE(${safeTimestampSql('kv.v')}, '-infinity'::timestamptz) > NOW()
)`;
// Status semantics:
// - "exhausted": global terminal state (test_status = 'exhausted') where all
//   models/quota on the account are fully depleted. Antigravity is the
//   exception: Gemini and Claude are separate pools, so the account is
//   exhausted only when the latest snapshot shows BOTH families at 0%.
// - "unavailable": transient cooldowns (account-wide lock or per-model lock) or
//   permanent failures (fatal errors, bad test_status, refreshBlocked).
//   Antigravity model locks stay on the model; they do not move the account.
// - "active": healthy and free of any locks.
// Buckets partition every row: DISABLED is purely is_active=false.
const BAD_TEST_STATUS_SQL = "COALESCE(test_status, 'active') IN ('unavailable', 'error', 'expired', 'invalid', 'disabled')";
const DISABLED_DATA_SQL = "data->>'disabledAt' IS NOT NULL";
const PERMANENT_UNAVAILABLE_SQL = `(
  ${BAD_TEST_STATUS_SQL}
  OR ${DISABLED_DATA_SQL}
  OR ${CONNECTION_UNAVAILABLE_DATA_SQL}
  OR ${FATAL_CONNECTION_ERROR_SQL}
)`;
const ANTIGRAVITY_FAMILY_ZERO_SQL = (prefix) => `EXISTS (
  SELECT 1 FROM usage_snapshots us
  WHERE us.connection_id = provider_connections.id
    AND us.provider = 'antigravity'
    AND EXISTS (
      SELECT 1 FROM jsonb_each(COALESCE(us.quotas, '{}'::jsonb)) q(k, v)
      WHERE q.k LIKE '${prefix}%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(COALESCE(us.quotas, '{}'::jsonb)) q(k, v)
      WHERE q.k LIKE '${prefix}%'
        AND COALESCE((q.v->>'remainingPercentage')::numeric, 0) > 0
    )
)`;
const ANTIGRAVITY_BOTH_FAMILIES_EXHAUSTED_SQL = `(
  provider = 'antigravity'
  AND ${ANTIGRAVITY_FAMILY_ZERO_SQL("gemini")}
  AND ${ANTIGRAVITY_FAMILY_ZERO_SQL("claude")}
)`;
const ACTIVE_CONNECTION_SQL = `(
  is_active = true
  AND NOT ${PERMANENT_UNAVAILABLE_SQL}
  AND NOT ${FUTURE_ACCOUNT_LOCK_SQL}
  AND NOT (provider <> 'antigravity' AND ${FUTURE_MODEL_LOCK_SQL})
  AND NOT (
    COALESCE(test_status, 'active') = 'exhausted'
    AND (provider <> 'antigravity' OR ${ANTIGRAVITY_BOTH_FAMILIES_EXHAUSTED_SQL})
  )
)`;
const EXHAUSTED_CONNECTION_SQL = `(
  is_active = true
  AND COALESCE(test_status, 'active') = 'exhausted'
  AND (provider <> 'antigravity' OR ${ANTIGRAVITY_BOTH_FAMILIES_EXHAUSTED_SQL})
)`;
const UNAVAILABLE_CONNECTION_SQL = `(
  is_active = true
  AND NOT ${EXHAUSTED_CONNECTION_SQL}
  AND (
    ${PERMANENT_UNAVAILABLE_SQL}
    OR ${FUTURE_ACCOUNT_LOCK_SQL}
    OR (provider <> 'antigravity' AND ${FUTURE_MODEL_LOCK_SQL})
  )
)`;
const ROUTABLE_CONNECTION_SQL = `(
  is_active = true
  AND NOT ${BAD_TEST_STATUS_SQL}
  AND NOT ${CONNECTION_UNAVAILABLE_DATA_SQL}
  AND NOT ${FATAL_CONNECTION_ERROR_SQL}
  AND NOT ${FUTURE_ACCOUNT_LOCK_SQL}
  AND (
    COALESCE(test_status, 'active') <> 'exhausted'
    OR (provider = 'antigravity' AND NOT ${ANTIGRAVITY_BOTH_FAMILIES_EXHAUSTED_SQL})
  )
)`;

function buildConnectionFilterConditions(filter, params) {
  const where = [];
  if (filter.provider) {
    params.push(filter.provider);
    where.push(`provider = $${params.length}`);
  }
  if (filter.providers && Array.isArray(filter.providers) && filter.providers.length > 0) {
    params.push(filter.providers);
    where.push(`provider = ANY($${params.length})`);
  }
  if (filter.email) {
    params.push(filter.email);
    where.push(`email = $${params.length}`);
  }
  if (filter.emails && Array.isArray(filter.emails) && filter.emails.length > 0) {
    params.push(filter.emails);
    where.push(`email = ANY($${params.length})`);
  }
  if (filter.authType) {
    params.push(filter.authType);
    where.push(`auth_type = $${params.length}`);
  }
  if (filter.tokenExpiresBefore) {
    params.push(filter.tokenExpiresBefore);
    const threeDaysAgoIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    params.push(threeDaysAgoIso);
    where.push(`(
      (token_expires_at IS NOT NULL AND token_expires_at <= $${params.length - 1})
      OR
      (token_expires_at IS NULL AND data->>'expiresAt' IS NOT NULL AND ${safeTimestampSql("data->>'expiresAt'")} <= $${params.length - 1})
      OR
      (token_expires_at IS NULL AND (data->>'expiresAt' IS NULL OR data->>'expiresAt' = ''))
      OR
      (data->>'lastRefreshAt' IS NOT NULL AND ${safeTimestampSql("data->>'lastRefreshAt'")} <= $${params.length})
    )`);
  }
  if (filter.isActive !== undefined) {
    params.push(filter.isActive);
    where.push(filter.isActive
      ? `(is_active = true)`
      : `(is_active = false)`);
  }
  if (filter.search && typeof filter.search === "string" && filter.search.trim()) {
    params.push(`%${filter.search.trim()}%`);
    where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (filter.status && !filter.routingModel) {
    if (filter.status === "active") {
      where.push(ACTIVE_CONNECTION_SQL);
    } else if (filter.status === "exhausted") {
      where.push(EXHAUSTED_CONNECTION_SQL);
    } else if (filter.status === "unavailable") {
      where.push(UNAVAILABLE_CONNECTION_SQL);
    } else if (filter.status === "disabled") {
      where.push(`(is_active = false)`);
    }
  }
  // Routing uses a model-specific durable eligibility predicate. Do not use
  // status=active here: that status intentionally excludes an account when
  // any other model is locked, while routing must only exclude this model.
  if (filter.routingModel) {
    params.push(filter.routingModel);
    where.push(`(
      NOT ${FUTURE_ACCOUNT_LOCK_SQL}
      AND (
        model_locks IS NULL
        OR jsonb_typeof(model_locks) <> 'object'
        OR model_locks->>$${params.length} IS NULL
        OR COALESCE(${safeTimestampSql(`model_locks->>$${params.length}`)}, '-infinity'::timestamptz) <= NOW()
      )
    )`);
  }
  if (Array.isArray(filter.excludeIds) && filter.excludeIds.length > 0) {
    params.push(filter.excludeIds.filter(Boolean));
    where.push(`id <> ALL($${params.length}::text[])`);
  }
  return where;
}

export async function getProviderConnections(filter = {}) {
  const normFilter = typeof filter === "string" ? { provider: filter } : (filter || {});
  const db = await getAdapter();
  const params = [];
  const where = buildConnectionFilterConditions(normFilter, params);

  let limitClause = "";
  if (normFilter.limit) {
    params.push(Math.max(1, Number(normFilter.limit)));
    limitClause = ` LIMIT $${params.length}`;
    if (normFilter.offset) {
      params.push(Math.max(0, Number(normFilter.offset)));
      limitClause += ` OFFSET $${params.length}`;
    }
  }

  const distinctClause = normFilter.distinctByProvider ? "DISTINCT ON (provider)" : "";
  const orderClause = normFilter.distinctByProvider
    ? "ORDER BY provider, is_active DESC, priority ASC NULLS LAST, updated_at DESC NULLS LAST"
    : (normFilter.tokenExpiresBefore
      ? `ORDER BY COALESCE(token_expires_at, ${safeTimestampSql("data->>'expiresAt'")}) ASC NULLS FIRST, id ASC`
      : (normFilter.routingModel
        ? "ORDER BY priority ASC NULLS LAST, last_used_at ASC NULLS FIRST, id ASC"
        : "ORDER BY is_active DESC, priority ASC NULLS LAST, updated_at DESC NULLS LAST"));

  const rows = await db.all(
    `SELECT ${distinctClause} id, provider, auth_type, name, email, priority, is_active, test_status,
            locked_all_until, rate_limited_until, locked_to_model, locked_to_model_until,
            token_expires_at, last_used_at, model_locks, last_error, error_code,
            last_error_at, data, created_at, updated_at
       FROM provider_connections
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ${orderClause}
      ${limitClause}`,
    params,
  );
  return rows.map(rowToConnection);
}

export async function countProviderConnections(filter = {}) {
  const db = await getAdapter();
  const params = [];
  const where = buildConnectionFilterConditions(filter, params);

  const row = await db.get(
    `SELECT COUNT(*)::int AS count
       FROM provider_connections
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    params,
  );
  return Number(row?.count || 0);
}

export async function getProviderConnectionById(id) {
  return getCatalog(`axon:connection:${id}`, 15, async () => {
    const db = await getAdapter();
    const row = await db.get(
      `SELECT id, provider, auth_type, name, email, priority, is_active, test_status,
              locked_all_until, rate_limited_until, locked_to_model, locked_to_model_until,
              token_expires_at, last_used_at, model_locks, last_error, error_code,
              last_error_at, data, created_at, updated_at
         FROM provider_connections
        WHERE id = $1`,
      [id],
    );
    return rowToConnection(row);
  });
}

export async function getProviderSummaryStats() {
  const db = await getAdapter();
  const rows = await db.all(`
    SELECT
      provider,
      auth_type,
      COUNT(*)::int AS total,
       COUNT(CASE WHEN is_active = false THEN 1 END)::int AS disabled_count,
      COUNT(CASE WHEN ${UNAVAILABLE_CONNECTION_SQL} THEN 1 END)::int AS unavailable_count,
      COUNT(CASE WHEN ${EXHAUSTED_CONNECTION_SQL} THEN 1 END)::int AS exhausted_count,
      COUNT(CASE WHEN ${ACTIVE_CONNECTION_SQL} THEN 1 END)::int AS active_count,
      MAX(last_error_at) AS latest_error_at
    FROM provider_connections
    GROUP BY provider, auth_type
  `);

  const stats = {};
  for (const r of rows) {
    const provider = r.provider;
    const authType = r.auth_type;
    stats[provider] ||= {};
    stats[provider][authType] = {
      total: Number(r.total || 0),
      connected: Number(r.active_count || 0),
      exhausted: Number(r.exhausted_count || 0),
      error: Number(r.unavailable_count || 0),
      allDisabled: Number(r.total || 0) > 0 && Number(r.disabled_count || 0) === Number(r.total || 0),
      lastErrorAt: r.latest_error_at || null,
    };
  }
  return stats;
}

export async function getProxyPoolBoundCounts() {
  const db = await getAdapter();
  const rows = await db.all(`
    WITH individual_pools AS (
      SELECT data->'providerSpecificData'->>'proxyPoolId' AS pool_id
        FROM provider_connections
       WHERE data->'providerSpecificData'->>'proxyPoolId' IS NOT NULL
         AND data->'providerSpecificData'->>'proxyPoolId' != ''
      UNION ALL
      SELECT elem.pool_id
        FROM provider_connections,
             LATERAL jsonb_array_elements_text(
               CASE 
                 WHEN jsonb_typeof(data->'providerSpecificData'->'proxyPoolIds') = 'array' 
                 THEN data->'providerSpecificData'->'proxyPoolIds' 
                 ELSE '[]'::jsonb 
               END
             ) AS elem(pool_id)
       WHERE elem.pool_id IS NOT NULL AND elem.pool_id != ''
    )
    SELECT pool_id, COUNT(*)::int AS count
      FROM individual_pools
     GROUP BY pool_id
  `);
  const map = {};
  for (const r of rows) {
    if (r.pool_id) map[r.pool_id] = Number(r.count || 0);
  }
  return map;
}

export async function countProxyPoolBoundConnections(proxyPoolId) {
  if (!proxyPoolId) return 0;
  const db = await getAdapter();
  const row = await db.get(
    `SELECT COUNT(*)::int AS count
       FROM provider_connections
      WHERE data->'providerSpecificData'->>'proxyPoolId' = $1
         OR (
           jsonb_typeof(data->'providerSpecificData'->'proxyPoolIds') = 'array'
           AND data->'providerSpecificData'->'proxyPoolIds' @> jsonb_build_array($1::text)
         )`,
    [proxyPoolId],
  );
  return Number(row?.count || 0);
}

export async function countProxyGroupBoundConnections(groupIdOrName) {
  if (!groupIdOrName) return 0;
  const db = await getAdapter();
  const row = await db.get(
    `SELECT COUNT(*)::int AS count
       FROM provider_connections
      WHERE data->'providerSpecificData'->>'proxyGroup' = $1`,
    [groupIdOrName],
  );
  return Number(row?.count || 0);
}

export async function getUnavailableOrLockedConnections() {
  const db = await getAdapter();
  const rows = await db.all(`
    SELECT id, provider, name, email, test_status, last_error, model_locks, locked_all_until
      FROM provider_connections
     WHERE ${UNAVAILABLE_CONNECTION_SQL}
        OR EXISTS (
          SELECT 1 FROM jsonb_each_text(
            CASE WHEN jsonb_typeof(model_locks) = 'object' THEN model_locks ELSE '{}'::jsonb END
          ) AS kv(k, v)
          WHERE ${safeTimestampSql('kv.v')} > NOW()
        )
  `);
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    name: row.name,
    email: row.email,
    testStatus: row.test_status,
    lastError: row.last_error,
    modelLocks: jsonObject(row.model_locks, {}),
    lockedAllUntil: row.locked_all_until,
  }));
}

export async function getClientUsageConnections({
  provider = "all",
  accountStatus = "all",
  sort = "priority",
  search = "",
  limit = 20,
  offset = 0,
  supportedProviders = [],
  apiKeyProviders = [],
}) {
  const db = await getAdapter();
  const where = [];
  const params = [];

  // Eligibility condition
  params.push(supportedProviders);
  const suppIdx = params.length;
  params.push(apiKeyProviders);
  const apiIdx = params.length;
  where.push(`(provider = ANY($${suppIdx}) AND (auth_type = 'oauth' OR provider = ANY($${apiIdx})))`);

  if (provider && provider !== "all") {
    params.push(provider);
    where.push(`provider = $${params.length}`);
  }

  if (accountStatus === "active") {
    where.push(ACTIVE_CONNECTION_SQL);
  } else if (accountStatus === "exhausted") {
    where.push(EXHAUSTED_CONNECTION_SQL);
  } else if (accountStatus === "unavailable") {
    where.push(UNAVAILABLE_CONNECTION_SQL);
  } else if (accountStatus === "disabled" || accountStatus === "inactive") {
    where.push(`(is_active = false)`);
  } else if (accountStatus !== "all_with_disabled") {
    // Default / "all": routable baseline — only depends on the canonical column.
    where.push(`is_active = true`);
  }

  if (search && typeof search === "string" && search.trim()) {
    params.push(`%${search.trim()}%`);
    const searchIdx = params.length;
    where.push(`(name ILIKE $${searchIdx} OR email ILIKE $${searchIdx} OR id ILIKE $${searchIdx} OR provider ILIKE $${searchIdx} OR data->>'displayName' ILIKE $${searchIdx} OR data->>'username' ILIKE $${searchIdx} OR data->>'githubLogin' ILIKE $${searchIdx})`);
  }

  let orderClause = `ORDER BY is_active DESC, priority ASC NULLS LAST, provider ASC, updated_at DESC NULLS LAST`;
  if (sort === "provider") {
    orderClause = `ORDER BY is_active DESC, provider ASC, priority ASC NULLS LAST, updated_at DESC NULLS LAST`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Count filtered
  const countRow = await db.get(
    `SELECT COUNT(*)::int AS count FROM provider_connections ${whereSql}`,
    params,
  );
  const total = Number(countRow?.count || 0);

  // Get paged rows
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const rows = await db.all(
    `SELECT id, provider, auth_type, name, email, priority, is_active, test_status,
            locked_all_until, rate_limited_until, locked_to_model, locked_to_model_until,
            token_expires_at, last_used_at, model_locks, last_error, error_code,
            last_error_at, data, created_at, updated_at
       FROM provider_connections
      ${whereSql}
      ${orderClause}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  return {
    total,
    connections: rows.map(rowToConnection),
  };
}

export async function getClientUsageMeta({
  supportedProviders = [],
  apiKeyProviders = [],
  provider = "all",
  search = "",
}) {
  const db = await getAdapter();
  const rows = await db.all(
    `SELECT DISTINCT provider
       FROM provider_connections
      WHERE (provider = ANY($1) AND (auth_type = 'oauth' OR provider = ANY($2)))
      ORDER BY provider ASC`,
    [supportedProviders, apiKeyProviders],
  );
  const countRow = await db.get(
    `SELECT COUNT(*)::int AS count
       FROM provider_connections
      WHERE (provider = ANY($1) AND (auth_type = 'oauth' OR provider = ANY($2)))`,
    [supportedProviders, apiKeyProviders],
  );

  const statusWhere = [
    `(provider = ANY($1) AND (auth_type = 'oauth' OR provider = ANY($2)))`,
  ];
  const statusParams = [supportedProviders, apiKeyProviders];
  if (provider && provider !== "all") {
    statusParams.push(provider);
    statusWhere.push(`provider = $${statusParams.length}`);
  }
  if (search && typeof search === "string" && search.trim()) {
    statusParams.push(`%${search.trim()}%`);
    const searchIdx = statusParams.length;
    statusWhere.push(`(name ILIKE $${searchIdx} OR email ILIKE $${searchIdx} OR id ILIKE $${searchIdx} OR provider ILIKE $${searchIdx} OR data->>'displayName' ILIKE $${searchIdx} OR data->>'username' ILIKE $${searchIdx} OR data->>'githubLogin' ILIKE $${searchIdx})`);
  }
  const statusWhereSql = `WHERE ${statusWhere.join(" AND ")}`;

  const statsRow = await db.get(
    `SELECT
        COUNT(*)::int AS total,
       COUNT(CASE WHEN ${ACTIVE_CONNECTION_SQL} THEN 1 END)::int AS active,
       COUNT(CASE WHEN ${EXHAUSTED_CONNECTION_SQL} THEN 1 END)::int AS exhausted,
       COUNT(CASE WHEN ${UNAVAILABLE_CONNECTION_SQL} THEN 1 END)::int AS unavailable,
        COUNT(CASE WHEN is_active = false THEN 1 END)::int AS disabled
     FROM provider_connections
     ${statusWhereSql}`,
    statusParams,
  );

  return {
    providers: rows.map((r) => r.provider),
    eligibleCount: Number(countRow?.count || 0),
    statusCounts: {
      total: Number(statsRow?.total || 0),
      active: Number(statsRow?.active || 0),
      exhausted: Number(statsRow?.exhausted || 0),
      unavailable: Number(statsRow?.unavailable || 0),
      disabled: Number(statsRow?.disabled || 0),
    },
  };
}

export async function getAvailableAccountsForRouting({ provider, model, limit = 100, offset = 0, excludeIds = [] }) {
  const db = await getAdapter();
  const excluded = Array.isArray(excludeIds) ? excludeIds.filter(Boolean) : [];
  const rows = await db.all(
    `SELECT id, provider, auth_type, name, email, priority, is_active, test_status,
            locked_all_until, rate_limited_until, locked_to_model, locked_to_model_until,
            token_expires_at, last_used_at, model_locks, last_error, error_code,
            last_error_at, data, created_at, updated_at
       FROM provider_connections
       WHERE provider = $1 AND ${ROUTABLE_CONNECTION_SQL}
         AND (cardinality($4::text[]) = 0 OR id <> ALL($4::text[]))
        AND (
          $2::text IS NULL
          OR model_locks->>$2 IS NULL
          OR ${safeTimestampSql('model_locks->>$2')} IS NULL
          OR ${safeTimestampSql('model_locks->>$2')} <= NOW()
        )
       ORDER BY priority ASC NULLS LAST, last_used_at ASC NULLS FIRST, id ASC
       LIMIT $3 OFFSET $5`,
    [provider, model ?? null, Math.min(Math.max(Number(limit) || 100, 1), 1000), excluded, Math.max(Number(offset) || 0, 0)],
  );
  return rows.map(rowToConnection);
}

export async function touchAccountLastUsed(id) {
  const db = await getAdapter();
  const result = await db.run(
    `UPDATE provider_connections SET last_used_at = NOW() WHERE id = $1`,
    [id],
  );
  return Number(result?.changes ?? 0) > 0;
}

export async function setModelCooldown(id, model, untilIso) {
  const db = await getAdapter();
  const row = await db.get(
    `UPDATE provider_connections
        SET model_locks = jsonb_set(
              CASE WHEN jsonb_typeof(model_locks) = 'object' THEN model_locks ELSE '{}'::jsonb END,
              ARRAY[$2],
              to_jsonb($3::text),
              true
            ),
            updated_at = NOW()
      WHERE id = $1
      RETURNING provider`,
    [id, model, untilIso],
  );
  if (row?.provider) invalidateCachedConnections(row.provider).catch(() => {});
  invalidateCatalog(`axon:connection:${id}`).catch(() => {});
  return Boolean(row);
}

export async function clearModelCooldown(id, model) {
  const db = await getAdapter();
  const row = await db.get(
    `UPDATE provider_connections
        SET model_locks = (CASE WHEN jsonb_typeof(model_locks) = 'object' THEN model_locks ELSE '{}'::jsonb END) - $2,
            updated_at = NOW()
      WHERE id = $1
      RETURNING provider`,
    [id, model],
  );
  if (row?.provider) invalidateCachedConnections(row.provider).catch(() => {});
  invalidateCatalog(`axon:connection:${id}`).catch(() => {});
  return Boolean(row);
}

export async function createProviderConnection(data = {}) {
  if (!data.provider) throw new Error("provider is required");
  const db = await getAdapter();
  const input = normalizePatch(data);
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    let existing = null;
    if (input.authType === "oauth" && input.email) {
      const rows = await tx.all(
        `SELECT id, provider, auth_type, name, email, priority, is_active, test_status,
                locked_all_until, rate_limited_until, locked_to_model, locked_to_model_until,
                token_expires_at, last_used_at, model_locks, last_error, error_code,
                last_error_at, data, created_at, updated_at
           FROM provider_connections
          WHERE provider = $1 AND auth_type = 'oauth' AND email = $2`,
        [input.provider, input.email],
      );
      const candidates = rows.map(rowToConnection);
      const incomingUsername = input.providerSpecificData?.username;
      const incomingWorkspace = input.providerSpecificData?.chatgptAccountId;
      existing = candidates.find((connection) => {
        if (input.provider === "codex") {
          const currentWorkspace = connection.providerSpecificData?.chatgptAccountId;
          return Boolean(incomingWorkspace && currentWorkspace && incomingWorkspace === currentWorkspace);
        }
        const currentWorkspace = connection.providerSpecificData?.chatgptAccountId;
        if (incomingWorkspace && currentWorkspace) return incomingWorkspace === currentWorkspace;
        if (incomingWorkspace || currentWorkspace) return false;
        const currentUsername = connection.providerSpecificData?.username;
        if (incomingUsername && currentUsername) return incomingUsername === currentUsername;
        if (incomingUsername || currentUsername) return false;
        return true;
      });
    } else if (input.authType === "apikey" && input.name) {
      const row = await tx.get(
        `SELECT id, provider, auth_type, name, email, priority, is_active, test_status,
                locked_all_until, rate_limited_until, locked_to_model, locked_to_model_until,
                token_expires_at, last_used_at, model_locks, last_error, error_code,
                last_error_at, data, created_at, updated_at
           FROM provider_connections
          WHERE provider = $1 AND auth_type = 'apikey' AND name = $2
          LIMIT 1`,
        [input.provider, input.name],
      );
      if (row) existing = rowToConnection(row);
    }

    if (existing) {
      const normalized = resetHealthStateOnActivation(existing, input);
      const merged = {
        ...existing,
        ...normalized,
        modelLocks: modelLocksFromConnection(normalized, existing.modelLocks),
        updatedAt: now,
      };
      const saved = await writeConnection(tx, merged, { createdAt: existing.createdAt });
      invalidateCachedConnections(input.provider).catch(() => {});
      invalidateCatalog(`axon:connection:${saved.id}`).catch(() => {});
      return saved;
    }

    let priority = input.priority;
    if (priority === undefined) {
      const maxRow = await tx.get(
        `SELECT COALESCE(MAX(priority), 0) AS max_p FROM provider_connections WHERE provider = $1`,
        [input.provider],
      );
      priority = (Number(maxRow?.max_p) || 0) + 1;
    }

    let fallbackName = input.name;
    if (!fallbackName && (input.authType === "oauth" || input.authType === "access_token")) {
      const countRow = await tx.get(
        `SELECT COUNT(*)::int AS cnt FROM provider_connections WHERE provider = $1`,
        [input.provider],
      );
      fallbackName = deriveConnectionName(input, input.email || `Account ${(Number(countRow?.cnt) || 0) + 1}`);
    }

    const connection = {
      ...input,
      id: input.id || uuidv4(),
      authType: input.authType || "oauth",
      name: fallbackName || null,
      email: input.email ?? null,
      priority,
      isActive: input.isActive !== undefined ? input.isActive : true,
      testStatus: input.testStatus || "active",
      modelLocks: modelLocksFromConnection(input),
      createdAt: now,
      updatedAt: now,
    };

    const saved = await writeConnection(tx, connection);
    invalidateCachedConnections(connection.provider).catch(() => {});
    return saved;
  });
}

export async function updateProviderConnection(id, data = {}) {
  const db = await getAdapter();
  const patch = normalizePatch(data);

  return db.transaction(async (tx) => {
     // Health updates are concurrent by design: different models/accounts can
     // fail at the same time. Lock the row before read-merge-write so one
     // model lock cannot overwrite another model's lock.
     const row = await tx.get(`SELECT * FROM provider_connections WHERE id = $1 FOR UPDATE`, [id]);
    if (!row) return null;

    const existing = rowToConnection(row);
    const normalized = resetHealthStateOnActivation(existing, patch);
    const merged = {
      ...existing,
      ...normalized,
      modelLocks: modelLocksFromConnection(normalized, existing.modelLocks),
      updatedAt: new Date().toISOString(),
    };
    const updated = await writeConnection(tx, merged, { createdAt: existing.createdAt });
    invalidateCachedConnections(existing.provider).catch(() => {});
    invalidateCatalog(`axon:connection:${id}`).catch(() => {});
    if (patch.priority !== undefined) {
      await reorderInTransaction(tx, existing.provider);
      return rowToConnection(await tx.get(`SELECT * FROM provider_connections WHERE id = $1`, [id]));
    }
    return updated;
  });
}

export async function setProviderConnectionsActive(provider, authTypes, isActive) {
  const db = await getAdapter();
  const types = Array.isArray(authTypes) ? authTypes : [authTypes];
  const now = new Date().toISOString();
  let result;

  if (!isActive) {
    result = await db.run(
      `UPDATE provider_connections
          SET is_active = false,
              data = jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(CASE WHEN jsonb_typeof(data) = 'object' THEN data ELSE '{}'::jsonb END, '{previousStatus}', to_jsonb(COALESCE(test_status, 'active')), true),
                    '{disabledReason}', '"Manually disabled by user"'::jsonb, true
                  ),
                  '{disabledAt}', to_jsonb($3::text), true
                ),
                '{disabledBy}', '"user"'::jsonb, true
              ),
              updated_at = NOW()
        WHERE provider = $1 AND auth_type = ANY($2::text[])`,
      [provider, types, now],
    );
  } else {
    result = await db.run(
      `UPDATE provider_connections
          SET is_active = true,
              test_status = CASE WHEN test_status = 'disabled' THEN COALESCE((CASE WHEN jsonb_typeof(data) = 'object' THEN data ELSE '{}'::jsonb END)->>'previousStatus', 'active') ELSE test_status END,
              data = ((CASE WHEN jsonb_typeof(data) = 'object' THEN data ELSE '{}'::jsonb END) - 'disabledReason' - 'disabledAt' - 'disabledBy'),
              updated_at = NOW()
        WHERE provider = $1 AND auth_type = ANY($2::text[])`,
      [provider, types],
    );
  }

  invalidateCachedConnections(provider).catch(() => {});
  return Number(result?.changes ?? 0);
}

export async function setConnectionsActiveByIds(ids, isActive) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const db = await getAdapter();
  const now = new Date().toISOString();
  let rows;

  if (!isActive) {
    rows = await db.all(
      `UPDATE provider_connections
          SET is_active = false,
              data = jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(CASE WHEN jsonb_typeof(data) = 'object' THEN data ELSE '{}'::jsonb END, '{previousStatus}', to_jsonb(COALESCE(test_status, 'active')), true),
                    '{disabledReason}', '"Manually disabled by user"'::jsonb, true
                  ),
                  '{disabledAt}', to_jsonb($2::text), true
                ),
                '{disabledBy}', '"user"'::jsonb, true
              ),
              updated_at = NOW()
        WHERE id = ANY($1::text[])
         RETURNING provider`,
      [ids, now],
    );
  } else {
    rows = await db.all(
      `UPDATE provider_connections
          SET is_active = true,
              test_status = CASE WHEN test_status = 'disabled' THEN COALESCE((CASE WHEN jsonb_typeof(data) = 'object' THEN data ELSE '{}'::jsonb END)->>'previousStatus', 'active') ELSE test_status END,
              data = ((CASE WHEN jsonb_typeof(data) = 'object' THEN data ELSE '{}'::jsonb END) - 'disabledReason' - 'disabledAt' - 'disabledBy'),
              updated_at = NOW()
        WHERE id = ANY($1::text[])
         RETURNING provider`,
      [ids],
    );
  }

  const affected = new Set(rows.map((row) => row?.provider).filter(Boolean));
  for (const provider of affected) {
    invalidateCachedConnections(provider).catch(() => {});
  }
  invalidateCatalog(...ids.map((connectionId) => `axon:connection:${connectionId}`)).catch(() => {});
  return rows.length;
}

export async function deleteProviderConnection(id) {
  const db = await getAdapter();
  return db.transaction(async (tx) => {
    const row = await tx.get(`SELECT provider FROM provider_connections WHERE id = $1`, [id]);
    if (!row) return false;
    await tx.run(`DELETE FROM provider_connections WHERE id = $1`, [id]);
    invalidateCachedConnections(row.provider).catch(() => {});
    invalidateCatalog(`axon:connection:${id}`).catch(() => {});
    return true;
  });
}

export async function deleteProviderConnectionsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const db = await getAdapter();
  const rows = await db.all(
    `DELETE FROM provider_connections WHERE id = ANY($1::text[]) RETURNING provider`,
    [ids],
  );
  const affected = new Set(rows.map((r) => r.provider).filter(Boolean));
  for (const p of affected) {
    invalidateCachedConnections(p).catch(() => {});
  }
  invalidateCatalog(...ids.map((connectionId) => `axon:connection:${connectionId}`)).catch(() => {});
  return rows.length;
}

export async function lockAccountToModel(connectionId, model, durationMs = 3600000) {
  if (!connectionId || !model) return null;
  const db = await getAdapter();
  const until = new Date(Date.now() + durationMs).toISOString();

  const row = await db.get(
    `UPDATE provider_connections
        SET locked_to_model = $2,
            locked_to_model_until = $3,
            updated_at = NOW()
      WHERE id = $1
  RETURNING *`,
    [connectionId, model, until],
  );

  if (row?.provider) {
    invalidateCachedConnections(row.provider).catch(() => {});
  }
  invalidateCatalog(`axon:connection:${connectionId}`).catch(() => {});
  return rowToConnection(row);
}

export async function unlockAccountModel(connectionId) {
  if (!connectionId) return null;
  const db = await getAdapter();

  const row = await db.get(
    `UPDATE provider_connections
        SET locked_to_model = NULL,
            locked_to_model_until = NULL,
            updated_at = NOW()
      WHERE id = $1
  RETURNING *`,
    [connectionId],
  );

  if (row?.provider) {
    invalidateCachedConnections(row.provider).catch(() => {});
  }
  invalidateCatalog(`axon:connection:${connectionId}`).catch(() => {});
  return rowToConnection(row);
}

export async function deleteProviderConnectionsByProvider(provider) {
  const db = await getAdapter();
  return db.transaction(async (tx) => {
    const result = await tx.run(`DELETE FROM provider_connections WHERE provider = $1`, [provider]);
    invalidateCachedConnections(provider).catch(() => {});
    return Number(result?.changes ?? 0);
  });
}

export async function reorderProviderConnections(provider) {
  const db = await getAdapter();
  return reorderInTransaction(db, provider);
}

export async function cleanupProviderConnections() {
  const db = await getAdapter();
  const result = await db.run(
    `UPDATE provider_connections
        SET data = (CASE WHEN jsonb_typeof(data) = 'object' THEN data ELSE '{}'::jsonb END) - 'id' - 'provider' - 'authType' - 'name' - 'email' - 'priority' - 'isActive' - 'testStatus' - 'lockedAllUntil' - 'rateLimitedUntil' - 'tokenExpiresAt' - 'lastUsedAt' - 'lastError' - 'errorCode' - 'lastErrorAt' - 'createdAt' - 'updatedAt',
            updated_at = NOW()
      WHERE jsonb_typeof(data) = 'object'
        AND (data ? 'id' OR data ? 'provider' OR data ? 'authType' OR data ? 'name')`,
  );
  return Number(result?.changes ?? 0);
}

export async function bulkResetProviderConnectionsStatus({ provider, ids } = {}) {
  const db = await getAdapter();
  const params = [];
  let whereClause = "";

  if (Array.isArray(ids) && ids.length > 0) {
    params.push(ids);
    whereClause = `WHERE id = ANY($${params.length}::text[])`;
  } else if (provider) {
    params.push(provider);
    whereClause = `WHERE provider = $${params.length}`;
  } else {
    return { ok: true, count: 0 };
  }

  const rows = await db.all(
    `UPDATE provider_connections
        SET is_active = true,
            test_status = 'active',
            last_error = NULL,
            last_error_at = NULL,
            error_code = NULL,
            rate_limited_until = NULL,
            locked_all_until = NULL,
            locked_to_model = NULL,
            locked_to_model_until = NULL,
            model_locks = '{}'::jsonb,
            data = (
              CASE
                WHEN jsonb_typeof(data->'providerSpecificData') = 'object' THEN
                  jsonb_set(
                    (CASE WHEN jsonb_typeof(data) = 'object' THEN data ELSE '{}'::jsonb END) - 'disabledReason' - 'disabledAt' - 'disabledBy',
                    '{providerSpecificData}',
                    (data->'providerSpecificData') - 'refreshBlocked' - 'refreshBlockedAt' - 'validationUrl' - 'validationMessage' - 'validationAt'
                  )
                WHEN jsonb_typeof(data) = 'object' THEN
                  data - 'disabledReason' - 'disabledAt' - 'disabledBy'
                ELSE '{}'::jsonb
              END
            ),
            updated_at = NOW()
      ${whereClause}
      RETURNING id, provider`,
    params,
  );

  const affectedProviders = new Set(rows.map((r) => r.provider));
  for (const p of affectedProviders) {
    invalidateCachedConnections(p).catch(() => {});
  }

  clearBatchAccountCooldown(rows.map((r) => r.id)).catch(() => {});
  invalidateCatalog(...rows.map((row) => `axon:connection:${row.id}`)).catch(() => {});

  return { ok: true, count: rows.length };
}

export async function autoRecoverExpiredExhaustedConnections() {
  const db = await getAdapter();
  const rows = await db.all(
    `UPDATE provider_connections
        SET test_status = 'active',
            locked_all_until = NULL,
            rate_limited_until = NULL,
            last_error = NULL,
            error_code = NULL,
            updated_at = NOW()
      WHERE is_active = true
        AND test_status IN ('exhausted', 'unavailable')
        AND locked_all_until IS NOT NULL
        AND locked_all_until <= NOW()
        AND (rate_limited_until IS NULL OR rate_limited_until <= NOW())
      RETURNING id, provider`
  );
  if (rows && rows.length > 0) {
    const affectedProviders = new Set(rows.map((r) => r.provider));
    for (const p of affectedProviders) {
      invalidateCachedConnections(p).catch(() => {});
    }
    invalidateCatalog(...rows.map((row) => `axon:connection:${row.id}`)).catch(() => {});
    clearBatchAccountCooldown(rows.map((r) => r.id)).catch(() => {});
  }
  return Number(rows?.length || 0);
}

export async function bulkUpdateProviderProxy({
  provider,
  ids,
  action,
  proxyPoolId,
  proxyGroup,
  proxyRotationStrategy,
  proxyPoolIds,
  activePoolIds,
} = {}) {
  const db = await getAdapter();
  const params = [];
  let whereClause = "";

  if (Array.isArray(ids) && ids.length > 0) {
    params.push(ids);
    whereClause = `WHERE id = ANY($${params.length}::text[])`;
  } else if (provider) {
    params.push(provider);
    whereClause = `WHERE provider = $${params.length}`;
  } else {
    return { ok: false, error: "provider or ids is required" };
  }

  let rows = [];
  const safeData = `CASE
    WHEN jsonb_typeof(data) = 'object' THEN data
    WHEN jsonb_typeof(data) = 'string' AND (data #>> '{}') LIKE '{%' THEN (data #>> '{}')::jsonb
    ELSE '{}'::jsonb
  END`;
  const safePsd = `CASE
    WHEN jsonb_typeof(data->'providerSpecificData') = 'object' THEN data->'providerSpecificData'
    ELSE '{}'::jsonb
  END`;
  const safePcData = `CASE
    WHEN jsonb_typeof(pc.data) = 'object' THEN pc.data
    WHEN jsonb_typeof(pc.data) = 'string' AND (pc.data #>> '{}') LIKE '{%' THEN (pc.data #>> '{}')::jsonb
    ELSE '{}'::jsonb
  END`;
  const safePcPsd = `CASE
    WHEN jsonb_typeof(pc.data->'providerSpecificData') = 'object' THEN pc.data->'providerSpecificData'
    ELSE '{}'::jsonb
  END`;

  if (action === "one-to-one") {
    if (!Array.isArray(activePoolIds) || activePoolIds.length === 0) {
      return { ok: false, error: "No active proxy pools provided" };
    }
    const poolCountParam = params.length + 1;
    const poolArrParam = params.length + 2;
    params.push(activePoolIds.length, activePoolIds);

    rows = await db.all(
      `WITH numbered AS (
        SELECT id, ((row_number() OVER (ORDER BY priority ASC, created_at ASC) - 1) % $${poolCountParam}::int) AS pool_idx
        FROM provider_connections
        ${whereClause}
      )
      UPDATE provider_connections pc
      SET data = jsonb_set(
        ${safePcData},
        '{providerSpecificData}',
        ((${safePcPsd} - 'proxyPoolIds' - 'proxyRotationStrategy' - 'proxyGroup') || jsonb_build_object('proxyPoolId', ($${poolArrParam}::text[])[numbered.pool_idx + 1]))
      ),
      updated_at = NOW()
      FROM numbered
      WHERE pc.id = numbered.id
      RETURNING pc.id, pc.provider`,
      params,
    );
  } else if (action === "group") {
    params.push(proxyGroup, proxyRotationStrategy || "round-robin");
    const grpParam = params.length - 1;
    const stratParam = params.length;

    rows = await db.all(
      `UPDATE provider_connections
          SET data = jsonb_set(
            ${safeData},
            '{providerSpecificData}',
            ((${safePsd} - 'proxyPoolId' - 'proxyPoolIds') || jsonb_build_object('proxyGroup', $${grpParam}::text, 'proxyRotationStrategy', $${stratParam}::text, 'proxyPoolIds', '[]'::jsonb))
          ),
          updated_at = NOW()
        ${whereClause}
        RETURNING id, provider`,
      params,
    );
  } else if (action === "strategy") {
    const poolIdsJson = JSON.stringify(proxyPoolIds || []);
    params.push(poolIdsJson, proxyRotationStrategy || "round-robin");
    const poolIdsParam = params.length - 1;
    const stratParam = params.length;

    rows = await db.all(
      `UPDATE provider_connections
          SET data = jsonb_set(
            ${safeData},
            '{providerSpecificData}',
            ((${safePsd} - 'proxyPoolId' - 'proxyGroup') || jsonb_build_object('proxyPoolIds', $${poolIdsParam}::jsonb, 'proxyRotationStrategy', $${stratParam}::text))
          ),
          updated_at = NOW()
        ${whereClause}
        RETURNING id, provider`,
      params,
    );
  } else if (action === "unbind") {
    rows = await db.all(
      `UPDATE provider_connections
          SET data = jsonb_set(
            ${safeData},
            '{providerSpecificData}',
            (${safePsd} - 'proxyPoolId' - 'proxyPoolIds' - 'proxyRotationStrategy' - 'proxyGroup' - 'connectionProxyEnabled' - 'connectionProxyUrl' - 'connectionNoProxy')
          ),
          updated_at = NOW()
        ${whereClause}
        RETURNING id, provider`,
      params,
    );
  } else if (action === "single") {
    if (!proxyPoolId) {
      return { ok: false, error: "proxyPoolId is required for single proxy action" };
    }
    params.push(proxyPoolId);
    const poolParam = params.length;

    rows = await db.all(
      `UPDATE provider_connections
          SET data = jsonb_set(
            ${safeData},
            '{providerSpecificData}',
            ((${safePsd} - 'proxyPoolIds' - 'proxyRotationStrategy' - 'proxyGroup') || jsonb_build_object('proxyPoolId', $${poolParam}::text))
          ),
          updated_at = NOW()
        ${whereClause}
        RETURNING id, provider`,
      params,
    );
  } else {
    return { ok: false, error: `Unsupported bulk proxy action: ${action}` };
  }

  const affectedProviders = new Set(rows.map((r) => r.provider));
  for (const p of affectedProviders) {
    invalidateCachedConnections(p).catch(() => {});
  }
  invalidateCatalog(...rows.map((row) => `axon:connection:${row.id}`)).catch(() => {});

  return { ok: true, updatedCount: rows.length };
}
