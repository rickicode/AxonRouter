import { createPostgresAdapter } from "./adapters/postgresAdapter.js";
import { PG_SCHEMA_SQL, ensureMonthlyPartitions } from "./schema.pg.js";
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
    });
  } catch (err) {
    console.error(`[DB] Bootstrap schema error:`, err.message);
    throw err;
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
