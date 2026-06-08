# Workflow Plan: Antigravity Usage Check Consistency

## Objective
Align the Antigravity usage checking system (both manual refresh and background worker scheduler) in AxonRouter with the implementation in `Antigravity-Manager` to ensure consistency, correct tier resolution, and robust 403 Forbidden handling.

## Scope of Changes
1. **`open-sse/services/usage.ts`**:
   - Update `getAntigravitySubscriptionInfo` to query sandbox API.
   - Update `getAntigravityUsage` to attempt three endpoints sequentially (Sandbox Daily → Daily → Prod).
   - Implement project ID stripping retry on 403 Forbidden.
   - If 403 Forbidden persists, return immediately with `isForbidden: true` and `validationUrl`.
   - Skip `loadCodeAssist` call on scheduled worker runs if project ID is cached.
   - Implement multi-level fallback for subscription tier extraction.
2. **`src/lib/connectionUsageRefresh.ts`**:
   - Pass options/trigger into `fetchUsageWithTransientRetry` and down to `getUsageForProvider`.
   - Detect `isForbidden` error from quota fetches, immediately transition connection to `disabled` state with `authState: "invalid"`, and stop further retries.

## Verification Checklist
- Run typecheck: `pnpm run typecheck`
- Run lint: `pnpm run lint`
- Run unit tests: `pnpm run test`
