/**
 * Shared /v1/models snapshot cache.
 *
 * A models list build costs seconds (live upstream catalog fetches per
 * connection). With a multi-worker cluster each worker would pay that cost
 * independently on cold start, and concurrent builds dogpile the same upstream
 * endpoints. The snapshot is therefore persisted in PostgreSQL `kv` so exactly
 * one build is paid cluster-wide and every worker (plus every separate
 * container: gateway + web dashboard) serves the same list from one row.
 *
 * Concurrency: cold builds serialize on a transaction-scoped advisory lock and
 * re-check the snapshot after acquiring it. A caller that loses the race reads
 * the row the winner just wrote instead of building a second copy.
 *
 * Freshness: readers serve the snapshot while younger than FRESH_MS and kick a
 * background refresh once stale. Beyond MAX_STALE_MS the request path waits for
 * a real rebuild so an ancient catalog is never served indefinitely.
 */

import { getAdapter } from "../db/driver.js";

const SCOPE = "models_snapshot";
const KEY = "llm";
const FRESH_MS = 5 * 60 * 1000;
const MAX_STALE_MS = 6 * 60 * 60 * 1000;
const LOCK_NAME = "axonrouter:models-snapshot";

async function readSnapshot(db) {
  try {
    const row = await db.get(
      `SELECT value FROM kv WHERE scope = $1 AND key = $2`,
      [SCOPE, KEY]
    );
    if (!row?.value) return null;
    const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    if (!Array.isArray(parsed?.data) || parsed.data.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeSnapshot(db, data) {
  try {
    // Pass the object itself: postgres.js serializes it into the JSONB column.
    // JSON.stringify here would store a JSON *string* inside jsonb (double
    // encoded), forcing every reader to unwrap it.
    await db.run(
      `INSERT INTO kv (scope, key, value) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value`,
      [SCOPE, KEY, { data, builtAt: new Date().toISOString() }]
    );
  } catch {
    /* fail-open: caller still returns the freshly built list */
  }
}

/**
 * Resolve the shared models snapshot.
 *
 * @param {(opts: {skipDynamicFetch: boolean}) => Promise<Array>} build - cold builder
 * @returns {Promise<{data: Array, source: "pg"|"stale"|"built"|"error"}>}
 */
export async function resolveModelsSnapshot(build) {
  let db = null;
  try {
    db = await getAdapter();
  } catch {
    db = null;
  }

  // No DB: degrade to a plain build (single-process correctness preserved).
  if (!db) {
    try {
      return { data: await build({ skipDynamicFetch: false }), source: "built" };
    } catch {
      return { data: [], source: "error" };
    }
  }

  const snapshot = await readSnapshot(db);
  const age = snapshot ? Date.now() - new Date(snapshot.builtAt).getTime() : Infinity;

  if (snapshot && age < FRESH_MS) {
    return { data: snapshot.data, source: "pg" };
  }

  // Stale but usable: serve now, rebuild in the background.
  if (snapshot && age < MAX_STALE_MS) {
    refreshInBackground(build);
    return { data: snapshot.data, source: "stale" };
  }

  // Cold or expired: serialize builders on an advisory lock, then re-check so
  // a loser of the race reads what the winner wrote instead of building again.
  let result = null;
  let didBuild = false;
  try {
    await db.transaction(async (tx) => {
      await tx.run("SELECT pg_advisory_xact_lock(hashtext($1))", [LOCK_NAME]);
      const fresh = await readSnapshot(tx);
      const freshAge = fresh ? Date.now() - new Date(fresh.builtAt).getTime() : Infinity;
      if (fresh && freshAge < FRESH_MS) {
        result = fresh.data;
        return;
      }
      const data = await build({ skipDynamicFetch: false });
      if (Array.isArray(data) && data.length > 0) {
        await writeSnapshot(tx, data);
        result = data;
        didBuild = true;
      } else if (fresh) {
        result = fresh.data;
      }
    });
  } catch (err) {
    console.log("[ModelsSnapshot] build failed:", err?.message || err);
  }

  // The advisory lock made another caller wait; `didBuild` separates the one
  // process that actually paid the build cost from the readers behind it.
  if (Array.isArray(result) && result.length > 0) {
    return { data: result, source: didBuild ? "built" : "pg" };
  }
  if (snapshot) return { data: snapshot.data, source: "stale" };
  return { data: [], source: "error" };
}

let backgroundRefreshRunning = false;

function refreshInBackground(build) {
  if (backgroundRefreshRunning) return;
  backgroundRefreshRunning = true;
  (async () => {
    try {
      const { getAdapter: getDb } = await import("../db/driver.js");
      const db = await getDb();
      await db.transaction(async (tx) => {
        await tx.run("SELECT pg_advisory_xact_lock(hashtext($1))", [LOCK_NAME]);
        const fresh = await readSnapshot(tx);
        const freshAge = fresh ? Date.now() - new Date(fresh.builtAt).getTime() : Infinity;
        if (fresh && freshAge < FRESH_MS) return;
        const data = await build({ skipDynamicFetch: false });
        if (Array.isArray(data) && data.length > 0) await writeSnapshot(tx, data);
      });
    } catch {
      /* fail-open */
    } finally {
      backgroundRefreshRunning = false;
    }
  })();
}