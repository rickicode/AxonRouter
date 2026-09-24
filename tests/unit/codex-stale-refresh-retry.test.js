/**
 * Rotation-race self-heal in checkAndRefreshToken (src/sse/services/tokenRefresh.js):
 * rotating providers (Codex, xAI) invalidate a superseded refresh token, so a
 * stale in-memory copy must never be fired upstream nor disable the connection.
 * - pre-refresh: adopt fresher DB token instead of the stale copy
 * - on unrecoverable: re-read once, retry with the fresh token; only mark
 *   blocked when the DB token is the same one that just failed.
 *
 * No network access in this file (upstream refresh is mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const NOW = Date.now();

vi.mock("../../src/lib/localDb.js", () => ({
  updateProviderConnection: vi.fn(async () => true),
  getProviderConnectionById: vi.fn(),
}));

vi.mock("open-sse/services/oauthCredentialManager.js", () => ({
  refreshProviderCredentials: vi.fn(),
  shouldRefreshCredentials: () => true,
}));

vi.mock("open-sse/services/tokenRefresh.js", () => ({
  TOKEN_EXPIRY_BUFFER_MS: 5 * 60 * 1000,
  getRefreshLeadMs: () => 5 * 60 * 1000,
  isUnrecoverableRefreshError: (r) =>
    !!r && typeof r === "object" &&
    (r.error === "unrecoverable_refresh_error" ||
      r.error === "refresh_token_reused" ||
      r.error === "invalid_request" ||
      r.error === "invalid_grant"),
}));

vi.mock("open-sse/services/projectId.js", () => ({
  getProjectIdForConnection: vi.fn(async () => null),
  invalidateProjectId: vi.fn(),
  removeConnection: vi.fn(),
}));

import { checkAndRefreshToken } from "../../src/sse/services/tokenRefresh.js";
import { refreshProviderCredentials } from "open-sse/services/oauthCredentialManager.js";
import { updateProviderConnection, getProviderConnectionById } from "../../src/lib/localDb.js";

const creds = (refreshToken) => ({
  connectionId: "cx-1",
  id: "cx-1",
  provider: "codex",
  refreshToken,
  accessToken: "expired",
  expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
  providerSpecificData: {},
});

describe("checkAndRefreshToken rotation-race self-heal", () => {
  beforeEach(() => {
    refreshProviderCredentials.mockReset();
    updateProviderConnection.mockClear();
    getProviderConnectionById.mockReset();
  });

  it("adopts the fresher DB token before refreshing (never fires stale)", async () => {
    getProviderConnectionById.mockResolvedValue({ id: "cx-1", refreshToken: "T2", accessToken: "a2" });
    refreshProviderCredentials.mockResolvedValue({ accessToken: "a3", refreshToken: "T3", expiresIn: 3600 });

    const out = await checkAndRefreshToken("codex", creds("T1"));

    expect(refreshProviderCredentials).toHaveBeenCalledTimes(1);
    expect(refreshProviderCredentials.mock.calls[0][1].refreshToken).toBe("T2");
    expect(out.refreshError).toBeUndefined();
    expect(out.refreshToken).toBe("T3");
  });

  it("retries once with the fresh DB token after unrecoverable instead of disabling", async () => {
    // Pre-refresh read still shows T1 (we fire it); the winner persists T2
    // before our grace-period re-read.
    getProviderConnectionById
      .mockResolvedValueOnce({ id: "cx-1", refreshToken: "T1" })
      .mockResolvedValue({ id: "cx-1", refreshToken: "T2" });
    refreshProviderCredentials
      .mockResolvedValueOnce({ error: "unrecoverable_refresh_error", code: "refresh_token_invalidated" })
      .mockResolvedValueOnce({ accessToken: "a3", refreshToken: "T3", expiresIn: 3600 });

    const out = await checkAndRefreshToken("codex", creds("T1"));

    expect(refreshProviderCredentials).toHaveBeenCalledTimes(2);
    expect(refreshProviderCredentials.mock.calls[1][1].refreshToken).toBe("T2");
    expect(out.refreshError).toBeUndefined();
    expect(out.accessToken).toBe("a3");
    // Success persists new tokens…
    expect(updateProviderConnection).toHaveBeenCalledWith(
      "cx-1",
      expect.objectContaining({ accessToken: "a3", refreshToken: "T3" })
    );
  });

  it("still marks blocked when the DB token is the same one that failed (genuinely dead)", async () => {
    getProviderConnectionById.mockResolvedValue({ id: "cx-1", refreshToken: "T1" });
    refreshProviderCredentials.mockResolvedValue({ error: "unrecoverable_refresh_error", code: "invalid_grant" });

    const out = await checkAndRefreshToken("codex", creds("T1"));

    expect(refreshProviderCredentials).toHaveBeenCalledTimes(1); // no retry with identical token
    expect(out.refreshError).toBe("unrecoverable_refresh_error");
    expect(updateProviderConnection).toHaveBeenCalledWith(
      "cx-1",
      expect.objectContaining({
        providerSpecificData: expect.objectContaining({ refreshBlocked: "unrecoverable_refresh_error" }),
      })
    );
  });
});
