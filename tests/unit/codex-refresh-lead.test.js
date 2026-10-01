import { describe, it, expect } from "vitest";
import { getExecutor } from "../../open-sse/executors/index.js";

// OpenAI rotates the refresh token on every refresh and revokes the whole
// session if a rotated token is reused. A refresh lead longer than the access
// token's own lifetime therefore rotates on every call and logs the account
// out — the codex lead was 5 days against ~1h tokens.
const HOUR_MS = 60 * 60 * 1000;

function codexCreds(msUntilExpiry) {
  return {
    connectionId: "c1",
    accessToken: "tok",
    refreshToken: "rtok",
    expiresAt: new Date(Date.now() + msUntilExpiry).toISOString(),
    // Recently refreshed, so the separate maxRefreshAgeMs staleness path stays
    // out of the way and this exercises the lead window alone.
    lastRefreshAt: new Date(Date.now() - 60 * 1000).toISOString(),
    providerSpecificData: {},
  };
}

describe("codex refresh lead", () => {
  it("does not refresh a token that is still hours from expiry", () => {
    const executor = getExecutor("codex");
    // ~5h left: comfortably valid, and far too early to rotate the refresh
    // token. With a 5-day lead this returned true on every single call.
    expect(executor.needsRefresh(codexCreds(5 * HOUR_MS))).toBe(false);
  });

  it("still refreshes once the token is inside its lead window", () => {
    const executor = getExecutor("codex");
    expect(executor.needsRefresh(codexCreds(5 * 60 * 1000))).toBe(true);
  });
});