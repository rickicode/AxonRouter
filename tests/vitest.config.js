import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.js"],
    // Redirect DATA_DIR to a throwaway temp dir so route-level tests that call
    // createProviderConnection never touch the user's real ~/.axonrouter DB.
    // RUN_REAL=1 or an explicit DATA_DIR opts out (see setup/isolateDataDir.js).
    setupFiles: ["./setup/isolateDataDir.js"],
    // Don't scan into git worktrees nested under .claude/ — they carry their
    // own copies of the test files but lack an installed node_modules (open-sse,
    // etc.), which makes provider imports fail during collection.
    exclude: ["**/node_modules/**", "**/.claude/**", "**/dist/**", "**/*.live.test.js", "**/*.real.test.js", "**/*.cloud.test.js", "**/auth/saml.test.js", "**/docker-build.test.mjs"],
    // Allow many it.concurrent cases (real provider smoke runs ~50 providers in parallel)
    maxConcurrency: 60,
    // Host CPU is a 4-core Celeron N5105 (15-20W PL1) shared with agent
    // processes. Default = all 4 forks pegged the box at 100% and starved the
    // running agent; cap at 2 so half the cores stay available. Override per
    // run with VITEST_MAX_THREADS / --maxWorkers when benchmarking.
    maxWorkers: 2,
    minWorkers: 1,
    // Route-level tests that dynamically import the Next.js route graph
    // (`@/app/api/providers/route.js` pulls the whole model + provider layer)
    // need far more than 20s on this host: measured ~75s for that graph alone
    // under vitest's transform pipeline. The old 20000ms default failed those
    // tests deterministically even on a clean checkout, which made the whole
    // file look "flaky" when it was simply over-budget.
    testTimeout: 180000,
    // Suppress noisy console output from handlers under test
    silent: false,
  },
  resolve: {
    // Use array form so subpath aliases (e.g. "@/lib/db/index.js") resolve correctly.
    alias: [
      { find: /^open-sse\//, replacement: resolve(__dirname, "../open-sse") + "/" },
      { find: "open-sse", replacement: resolve(__dirname, "../open-sse") },
      { find: /^@\//, replacement: resolve(__dirname, "../src") + "/" },
    ],
  },
});
