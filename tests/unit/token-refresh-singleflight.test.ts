import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

vi.mock("../../open-sse/index.ts", () => ({}));

describe("token refresh single-flight", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("dedupes overlapping getAccessToken refreshes for the same provider credentials", async () => {
    let calls = 0;
    let release;

    global.fetch = vi.fn(() => new Promise((resolve) => {
      calls += 1;
      release = () => resolve({
        ok: true,
        json: async () => ({ access_token: "fresh-token", expires_in: 3600 }),
      });
    }));

    const mod = await import("../../open-sse/services/tokenRefresh.ts");
    mod.__resetTokenRefreshSingleFlightForTests();

    const credentials = {
      refreshToken: "shared-refresh-token",
      providerSpecificData: {},
    };

    const first = mod.getAccessToken("codex", credentials, null);
    const second = mod.getAccessToken("codex", credentials, null);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);

    release();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(calls).toBe(1);
  });
});
