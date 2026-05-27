# Workspace packages to escape Turbopack NFT tracing

The entire tunnel system and all filesystem/child_process operations are extracted into two new workspace packages (`@axonrouter/data-dir`, `@axonrouter/tunnel`) and listed in `serverExternalPackages`. This makes Turbopack skip NFT tracing for those paths entirely. The `createRequire` trick in `data-dir` makes node built-in access opaque to static analysis, and pre-compiled `.js` files in `packages/tunnel/dist/` prevent Turbopack from following TypeScript source. All `turbopackIgnore` comments and the `ignoreIssue` config block are removed — zero suppression remains.

**Watch for:** `tailscaleFunnelRuntime.ts` imports `os` and `path` directly (not through the opaque wrapper), duplicating the data-dir logic and potentially re-introducing NFT warnings if Turbopack ever traces into the dist `.js` files (likely). Committed `dist/` artifacts have no build step wired into the repo workflow, so they can silently drift from source (confirmed). The dependency injection via `configureTunnelDeps()` runs at module-level in `initializeApp.ts` but any API route that imports a tunnel subpath *before* that module executes will throw at runtime (possible).

## High-level view

The `@axonrouter/data-dir` package wraps `fs`, `child_process`, and `https` behind `createRequire`-based indirection so Turbopack's static analyzer can't see the built-in module names. The old `DATA_DIR` top-level constant is gone — replaced by lazy `getDataDir()` calls everywhere, which also eliminates the module-evaluation-time side effects that confused the tracer.

The tunnel system moves wholesale into `packages/tunnel/`. Because `serverExternalPackages` alone doesn't suppress NFT tracing of TypeScript source, the package ships pre-compiled `.js` in `dist/` with the exports map pointing there. A dependency injection layer (`deps.ts`) replaces the hard imports of `@/lib/settingsAccess`, `@/lib/sqliteHelpers`, and `@/mitm/` modules — the main app calls `configureTunnelDeps()` at startup to wire these in.

Several files inside `packages/tunnel/src/` (notably `tailscaleFunnelRuntime.ts` and `tailscaleInstallRuntime.ts`) still import `os` and `path` directly and re-derive the data directory from `os.homedir()`, bypassing the `@axonrouter/data-dir` abstraction. If the data directory derivation changes, these modules will silently produce wrong paths.

The `dist/` directory is committed without a CI build step or pre-commit hook to regenerate it, creating a maintenance risk where source and compiled output can diverge without anyone noticing.

<details>
<summary>Issues (5)</summary>

1. **Committed dist/ with no build pipeline** — `packages/tunnel/dist/` is checked into git but no CI step or npm script rebuilds it. Add a `build` script in `packages/tunnel/package.json` and either a pre-commit hook or CI check that verifies dist is up to date. (confirmed)
2. **tailscaleFunnelRuntime bypasses data-dir abstraction** — Imports `os` and `path` directly, re-derives data dir from `os.homedir()`. Should use `resolveDataPath` from `@axonrouter/data-dir` like the other tunnel modules. (confirmed)
3. **tailscaleInstallRuntime uses raw path.join** — Uses `path.join(os.tmpdir(), ...)` (fine for temp paths) but also declares `WINDOWS_TAILSCALE_BIN` duplicating path knowledge that other modules derive from `@axonrouter/data-dir`. (confirmed)
4. **DI ordering risk** — `configureTunnelDeps()` executes in `initializeApp.ts` at module level. If any API route's static import chain resolves `@axonrouter/tunnel/*` before `initializeApp.ts` runs, `getTunnelDeps()` will throw. Currently safe because routes use dynamic `import()`, but a future static import would break silently. (possible)
5. **No dist/ rebuild in CI** — Without a `verify-dist` step, a developer who edits `packages/tunnel/src/` and forgets to recompile ships stale `.js`. The root tsconfig excludes `packages/tunnel`, so type-checking won't catch behavioral drift. (confirmed)

</details>

<details>
<summary>Details</summary>

## Inconsistent abstraction in tailscaleFunnelRuntime

`tailscaleFunnelRuntime.ts` imports `os` and `path` at the top level and re-derives the data directory:

```typescript
import os from "os";
import path from "path";

function getTunnelDataDir() {
  if (IS_WINDOWS) {
    _tunnelDataDir = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "axonrouter");
  } else {
    _tunnelDataDir = path.join(os.homedir(), ".axonrouter");
  }
  return _tunnelDataDir;
}
```

Sibling files (`tailscaleStatus.ts`, `tailscaleDaemonRuntime.ts`, `cloudflared.ts`) all use `resolveDataPath` from `@axonrouter/data-dir`. This file should do the same. The `path` and `os` imports also appear in the compiled `dist/tailscaleFunnelRuntime.js`, meaning if Turbopack ever traces into `dist/` (e.g., if `serverExternalPackages` behavior changes in a future Next.js version), these imports would trigger NFT warnings again.

## Committed dist/ with no rebuild mechanism

The `dist/` files are compiled TypeScript output checked into the repo — this is the mechanism that makes the approach work (Turbopack won't trace `.js` files in an external package). However:

- There is no `build` or `compile` script in `packages/tunnel/package.json`
- There is no CI job that rebuilds dist and checks for drift
- The root `tsconfig.json` excludes `packages/tunnel`, so `npm run typecheck` won't flag source/dist mismatches

If a developer modifies `packages/tunnel/src/cloudflared.ts` and forgets to recompile, the runtime will use the stale `.js` file. This produces silent behavioral divergence. Add `"build": "tsc"` to `packages/tunnel/package.json` and a CI step: `npm run build -w packages/tunnel && git diff --exit-code packages/tunnel/dist/`.

## Dependency injection timing

`configureTunnelDeps()` is called at the top of `src/shared/services/initializeApp.ts`, which runs when that module is first imported (early in the app lifecycle). The tunnel API routes use dynamic `import()`:

```typescript
const { enableTunnelRuntime } = await import("@axonrouter/tunnel/tunnelConnectionRuntime");
```

Because routes lazily import at request time, `configureTunnelDeps` will have already run. But if future code adds a static `import` from `@axonrouter/tunnel/tunnelConnectionRuntime` in a module that loads before `initializeApp.ts`, `getTunnelDeps()` throws "Tunnel deps not configured." The failure mode is "crash on first tunnel request" rather than "crash at startup" — harder to catch in testing.

## Port number inlining

Both `tunnelConnectionRuntime.ts` and `tunnelManager.ts` inline `const DEFAULT_AXONROUTER_PORT = "12711"` rather than importing from `@/shared/constants/runtimeDefaults` (which the package can't access). If the default port changes in `runtimeDefaults.json`, the tunnel package will silently use the old value. Consider reading this from an environment variable or injecting it through `configureTunnelDeps()`.

</details>

<details>
<summary>Files changed (131 total — key files below)</summary>

| File | Change |
|------|--------|
| `next.config.ts` | Added `@axonrouter/data-dir` and `@axonrouter/tunnel` to serverExternalPackages; removed turbopack ignoreIssue |
| `package.json` | Added `"workspaces": ["packages/*"]` |
| `tsconfig.json` | Excluded `packages/tunnel` from root compilation |
| `packages/data-dir/src/index.js` | New: createRequire-based wrappers for fs, child_process, https |
| `packages/data-dir/src/index.d.ts` | New: type declarations for all wrappers |
| `packages/data-dir/package.json` | New: workspace package definition |
| `packages/tunnel/src/deps.ts` | New: DI container for cross-cutting concerns |
| `packages/tunnel/src/cloudflared.ts` | Moved from src/lib/tunnel/; uses @axonrouter/data-dir wrappers |
| `packages/tunnel/src/tunnelConnectionRuntime.ts` | Moved; uses DI for settings/sqlite |
| `packages/tunnel/src/tunnelManager.ts` | Moved; inlines port constant |
| `packages/tunnel/src/tailscaleFunnelRuntime.ts` | Moved; still uses raw os/path imports |
| `packages/tunnel/src/tailscaleStatus.ts` | Moved; uses @axonrouter/data-dir properly |
| `packages/tunnel/src/state.ts` | Moved; uses DI for sqlite access |
| `packages/tunnel/dist/*` | Pre-compiled .js + .d.ts for all tunnel modules |
| `packages/tunnel/package.json` | 22 subpath exports pointing to dist/ |
| `src/lib/dataDir.ts` | Now re-exports from @axonrouter/data-dir |
| `src/shared/services/initializeApp.ts` | Calls configureTunnelDeps(); imports from @axonrouter/tunnel |
| `src/app/api/tunnel/*.ts` | All routes: imports changed from @/lib/tunnel to @axonrouter/tunnel |
| `src/lib/sqliteHelpers.ts` | Replaced path.join/fs with dataDir wrappers |
| `src/lib/sqliteBootstrap.ts` | Same |
| `src/lib/localDbStorage.ts` | Same |
| `src/lib/requestDetailsDb/*.ts` | Same |
| `src/lib/usageDb/*.ts` | Same |
| `src/mitm/paths.ts` | Lazy getters instead of top-level const |
| `src/lib/tunnel/` | Entire directory deleted (12 files) |
| `tests/unit/*.test.ts` | Mocks updated: `DATA_DIR` -> `getDataDir()` |

[Full diff: `git diff main`]

</details>
