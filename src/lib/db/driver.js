import { createPostgresAdapter } from "./adapters/postgresAdapter.js";
import { PG_SCHEMA_SQL, PG_OPTIONAL_INDEX_SQL, ensureMonthlyPartitions, pruneStalePartitions, repairLegacyJsonbOnce, repairUsageHistoryMetaOnce } from "./schema.pg.js";
import { ANALYTICS_SCHEMA_SQL } from "./analyticsSchema.js";

// Singleton adapter state
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = global._dbAdapter;

async function initAdapter() {
  const adapter = createPostgresAdapter();

  if (!state.logged) {
    console.log(`[DB] PostgreSQL Engine Initialized`);
    state.logged = true;
  }

  // Serialize bootstrap across application replicas. PostgreSQL advisory locks
  // prevent concurrent DDL and partition creation during deploy/restart.
  try {
    await adapter.transaction(async (tx) => {
      await tx.run("SELECT pg_advisory_xact_lock(hashtext('axonrouter:schema-bootstrap'))");
      await tx.exec(PG_SCHEMA_SQL);
      await tx.exec(ANALYTICS_SCHEMA_SQL);
      await ensureMonthlyPartitions(tx);
      await repairLegacyJsonbOnce(tx);
      await repairUsageHistoryMetaOnce(tx).catch(() => {});
      await pruneStalePartitions(tx).catch(() => {});
    });
  } catch (err) {
    console.error(`[DB] Bootstrap schema error:`, err.message);
    throw err;
  }

  // Optional indexes run outside the bootstrap transaction, on purpose.
  //
  // PG_SCHEMA_SQL is executed as one multi-statement exec, so a single unparseable
  // statement aborts the whole transaction, initAdapter rejects, getAdapter never
  // resolves, and every database-backed feature in the process fails at once. That
  // is what happened: a GIN index over a jsonb expression missing its inner
  // parentheses took /api/proxy-pools down with a 500 while the rest of the schema
  // was perfectly valid.
  //
  // An index that only makes something faster must never be able to stop the
  // application from booting. A failure here costs the query plan, nothing else, and
  // says so in the log rather than taking the process down.
  try {
    await adapter.exec(PG_OPTIONAL_INDEX_SQL);
  } catch (err) {
    console.error(`[DB] Optional index bootstrap skipped:`, err.message);
  }

  return adapter;
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) {
    state.initPromise = initAdapter().then((a) => {
      state.instance = a;
      return a;
    });
  }
  return state.initPromise;
}
