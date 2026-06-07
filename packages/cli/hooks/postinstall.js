#!/usr/bin/env node

/**
 * AxonRouter CLI — Postinstall Runtime Setup
 *
 * Pre-warms SQLite and system tray runtimes in the user's ~/.axonrouter/runtime
 * directory so the first startup is fast.
 */

async function main() {
  try {
    const { ensureSqliteRuntime } = await import("./sqliteRuntime.js");
    const { ensureTrayRuntime } = await import("./trayRuntime.js");

    await ensureSqliteRuntime().catch(() => {});
    await ensureTrayRuntime().catch(() => {});
  } catch (err) {
    console.warn(`  ⚠️  postinstall runtime warm-up skipped: ${err.message}`);
  }

  process.exit(0);
}

main();
