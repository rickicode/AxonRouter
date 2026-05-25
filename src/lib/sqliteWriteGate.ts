/**
 * SQLite Write Gate - serializes ALL writes to db.sqlite.
 *
 * Prevents concurrent write conflicts when multiple synchronous operations
 * attempt to write at the same time on the same connection.
 * This gate ensures only one write runs at a time.
 *
 * The gate is RE-ENTRANT: nested calls within the same synchronous stack
 * pass through without queuing (since better-sqlite3 is synchronous, nested
 * calls within a single gate invocation are safe).
 */

let active = false;

/**
 * Execute a synchronous write operation exclusively.
 * Re-entrant: if already inside a gate, executes directly.
 */
export function sqliteWriteGate<T>(fn: () => T): T {
  if (active) {
    // Re-entrant call — already inside a gate, safe to proceed
    return fn();
  }
  active = true;
  try {
    return fn();
  } finally {
    active = false;
  }
}
