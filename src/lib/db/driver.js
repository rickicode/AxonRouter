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

  // Optional indexes are deliberately NOT built here.
  //
  // Two ways this went wrong in one sitting, both of which took the process down
  // rather than merely costing a query plan:
  //
  //   * inside the bootstrap transaction, an unparseable statement aborts the
  //     transaction, initAdapter rejects, getAdapter never resolves, and every
  //     database-backed route in the process fails at once. Postgres rejects
  //     `USING GIN (expr)` without the inner parentheses, at "->", and the index
  //     shipped with exactly that.
  //   * outside it but still awaited, CREATE INDEX CONCURRENTLY waits for every
  //     other transaction on the table to finish. On a busy table that wait is open
  //     ended, so awaiting it at boot left getAdapter pending forever: no error, no
  //     log, every request hung, and both containers failed their health check
  //     without restarting.
  //
  // PG_OPTIONAL_INDEX_SQL is kept for operators to apply deliberately, during a
  // maintenance window. The boot path must only ever do work whose failure or slowness
  // is bounded and local.
  if (process.env.APPLY_OPTIONAL_INDEXES === "true") {
    try {
      await adapter.exec(PG_OPTIONAL_INDEX_SQL);
    } catch (err) {
      console.error(`[DB] Optional index bootstrap skipped:`, err.message);
    }
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
