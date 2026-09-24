import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock("../../open-sse/services/usage/shared.js", () => ({
  U: () => ({ url: "https://www.codebuff.com/api/v1/freebuff/session" }),
  fetchWithTimeout: mocks.fetchWithTimeout,
}));

// Registry import pulls the whole provider graph; stub it out.
vi.mock("../../open-sse/providers/registry/index.js", () => ({
  default: [{ id: "freebuff", models: [{ id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash" }] }],
}));

import { verifyFreebuffAccountDirect } from "../../open-sse/services/usage/freebuff.js";

function res(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifyFreebuffAccountDirect (direct-egress ban verification)", () => {
  it("returns banned when upstream reports {status:'banned'} regardless of HTTP code", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(res(403, { status: "banned" }));
    expect(await verifyFreebuffAccountDirect("tok")).toBe("banned");
  });

  it("returns quota on rate_limited so the caller never disables the account", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(res(429, { status: "rate_limited", resetAt: "2026-09-08T07:00:00Z" }));
    expect(await verifyFreebuffAccountDirect("tok")).toBe("quota");
  });

  it("returns active on a healthy session (200)", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(res(200, { status: "active", rateLimitsByModel: {} }));
    expect(await verifyFreebuffAccountDirect("tok")).toBe("active");
  });

  it("returns unknown on 401 (credential problem, not a ban verdict)", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(res(401, { error: "unauthorized" }));
    expect(await verifyFreebuffAccountDirect("tok")).toBe("unknown");
  });

  it("returns unknown on network failure — never disables on a flaky check", async () => {
    mocks.fetchWithTimeout.mockRejectedValue(new Error("fetch failed"));
    expect(await verifyFreebuffAccountDirect("tok")).toBe("unknown");
  });

  it("uses direct egress: no proxy url, no relay, noFitPool=true", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(res(200, { status: "active" }));
    await verifyFreebuffAccountDirect("tok");
    const proxyOptions = mocks.fetchWithTimeout.mock.calls[0][3];
    expect(proxyOptions).toEqual({
      connectionProxyEnabled: false,
      connectionProxyUrl: "",
      vercelRelayUrl: "",
      proxyPoolId: null,
      noFitPool: true,
    });
  });

  it("returns unknown for a missing token without making any request", async () => {
    expect(await verifyFreebuffAccountDirect(null)).toBe("unknown");
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
  });
});
