# Usage Worker Unification Plan

## Summary

Refactor the AxonRouter usage system so every provider uses one canonical
pipeline for refresh, check, cache, status update, and observability. The
target architecture is a unified queue-based worker model for all providers,
with provider-specific behavior isolated to fetcher/normalizer strategy modules.

This is a hard cutover plan: legacy usage paths should be removed after callers
are moved to the canonical worker path. Temporary adapters are acceptable only
as migration scaffolding inside the same slice.

## Goals

- All providers use the same usage refresh/check worker flow.
- Manual refresh, scheduled refresh, and API-triggered refresh use the same
  queue, dedupe, timeout, retry, backoff, and status persistence behavior.
- Provider-specific differences live only in provider strategy modules.
- Dashboard/API usage consumers read from one canonical usage source.
- Legacy provider-limits/batch refresh paths are removed once migrated.

## Current Baseline

AxonRouter currently has a stronger per-connection worker model than OmniRoute:

- `src/lib/usageRefreshQueue.ts` provides in-memory FIFO queueing, bounded
  concurrency, wait timeout, overload protection, instrumentation, and
  per-connection in-flight dedupe.
- `src/lib/connectionUsageRefresh.ts` performs usage refresh, credential refresh,
  retry, status updates, and provider-specific recovery behavior.
- `src/lib/usageCheckScheduler.ts` runs scheduled refreshes through the queue,
  but currently processes connections serially with a short yield between jobs.
- `/api/usage/[connectionId]` uses the queue for manual refresh.

OmniRoute has a more efficient batch/cache model for provider limits:

- Batch sync refreshes active connections with configurable concurrency.
- Successful quota results are persisted with a batch DB write.
- UI reads cached provider-limit state without forcing live upstream calls.

The target should keep AxonRouter's queue/dedupe correctness and add the
efficiency and cache consistency benefits from the OmniRoute design.

## Target Architecture

### Canonical Worker

Create one usage worker service that owns all refresh/check jobs:

- Input: `connectionId`, trigger source, force/test flags, timeout policy, and
  optional caller metadata.
- Execution: queue enqueue, per-connection dedupe, bounded concurrency, timeout,
  retry/backoff, provider strategy execution, normalization, persistence.
- Output: normalized usage payload, canonical status update result, worker
  metadata, and error classification.

All usage refresh entry points must call this worker:

- manual connection refresh
- scheduled usage checks
- dashboard refresh buttons
- API-key self-service usage checks
- provider quota widgets
- any future usage/quota preflight refresh

### Provider Strategy Layer

Move provider-specific behavior behind one strategy contract:

- `fetchUsage(connection, options)`
- `normalizeUsage(rawUsage, connection)`
- `requiresQuota`
- `timeoutMs`
- `isRetryable(error, context)`
- `refreshCredentialsOnFailure`
- `onSuccess(connection, normalizedUsage)`
- `onFailure(connection, error)`
- optional provider cooldown or special state updates

Provider strategies may contain special cases, but orchestration must not.
The worker should not branch directly on provider except to load a strategy.

### Canonical Usage State

Persist usage state with one canonical shape:

- normalized quota windows
- plan/account metadata
- checked timestamp
- refresh source
- provider raw details only when needed for diagnostics
- error classification and retry metadata
- stale marker when serving last known good data after fetch failure

Connection status updates must use one path:

- eligible/healthy/ok on valid usage
- exhausted/degraded with `resetAt` and `nextRetryAt` on quota exhaustion
- blocked/degraded on auth or permanent provider failure
- preserved eligible state for transient failures when configured
- explicit stale usage state when the last known good cache is served

### Scheduler

Replace serial scheduler behavior with the canonical worker in controlled
parallelism:

- load active eligible connections
- skip disabled/invalid/backoff connections
- enqueue worker jobs with global concurrency limits
- dedupe with manual/API-triggered jobs for the same connection
- persist one scheduler run summary with total, refreshed, failed, skipped,
  duration, and error counts

The scheduler must not directly fetch provider usage or update provider-specific
status outside the worker.

### API and Dashboard Cutover

Rewire usage endpoints and UI consumers to the canonical state:

- `/api/usage/[connectionId]` remains the direct manual refresh endpoint, backed
  by the worker.
- Provider limits endpoints should read canonical cached usage data or become
  adapters over the canonical worker.
- Dashboard usage/provider limits pages should render normalized canonical quota
  windows.
- Any old API response shape needed by existing UI can be produced as a thin
  adapter, but the persisted source of truth must be canonical.

## Implementation Phases

### Phase 1: Define Contracts

- Add canonical worker input/output types.
- Add normalized usage snapshot types.
- Add provider strategy interface.
- Add error classification types for transient, auth, quota, provider, timeout,
  overload, and unknown failures.

### Phase 2: Build Canonical Service

- Extract orchestration from `connectionUsageRefresh` into a service that uses
  strategies instead of provider-specific branches.
- Keep `usageRefreshQueue` as the queue foundation and extend it only as needed
  for metrics and scheduler-friendly bulk enqueue.
- Implement canonical persistence for usage snapshot, cache, and status updates.

### Phase 3: Migrate Providers

- Move existing provider-specific behavior into strategy modules.
- Migrate OAuth providers first because they already depend on usage refresh.
- Add API-key provider support through the same worker path.
- Preserve existing provider usage fetchers where possible; wrap them in
  strategies instead of rewriting fetch logic.

### Phase 4: Cut Over Callers

- Move manual refresh, scheduler refresh, provider limits refresh, API-key
  self-service usage checks, and dashboard refresh actions to the canonical
  worker.
- Replace cache reads with canonical usage cache reads.
- Delete old direct provider-limits orchestration once all callers are migrated.

### Phase 5: Cleanup

- Remove duplicate refresh helpers and old provider-limits worker behavior.
- Remove obsolete cache paths and any unused status update helpers.
- Inventory remaining legacy usage files and document why any retained file
  still exists.

## Testing Plan

### Unit Tests

- Queue dedupe returns the same in-flight promise for the same connection.
- Queue overload and wait timeout return the expected status/error class.
- Strategy normalization produces the same canonical shape across providers.
- Error classification maps provider failures to canonical retry/status updates.
- Stale cache behavior preserves last known good quota data after fetch failure.

### Integration Tests

- Manual refresh for OAuth provider uses the canonical worker.
- Manual refresh for API-key provider uses the canonical worker.
- Scheduler refresh uses the same worker path as manual refresh.
- Concurrent scheduler and manual refresh for the same connection dedupe.
- Quota exhaustion updates routing status, quota state, reset time, and retry
  time consistently.
- Transient connectivity failures do not incorrectly disable otherwise healthy
  connections.

### UI/API Tests

- Provider limits UI renders canonical quota windows.
- Usage endpoint returns existing dashboard-compatible response data after the
  internal cutover.
- Worker status endpoint reports scheduler and queue state from the canonical
  worker.

### Standard Validation

Run after implementation:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

## Acceptance Criteria

- No provider bypasses the canonical usage worker for refresh/check behavior.
- Scheduled and manual refresh dedupe for the same connection.
- Usage status and cache persistence are provider-independent.
- Old split provider-limits refresh orchestration is removed or reduced to a
  compatibility adapter over the canonical state.
- Dashboard usage data and routing eligibility use the same canonical snapshot.
- Standard validation passes, or any failure is classified as pre-existing,
  environmental, or introduced.

## Assumptions

- The final target is a unified queue worker model, not a batch-only model.
- The refactor is end-to-end across core usage, worker/scheduler, APIs, cache,
  status handling, and dashboard consumers.
- Legacy paths should not remain as first-class behavior after cutover.
- Provider-specific quirks are allowed only inside strategy modules.
