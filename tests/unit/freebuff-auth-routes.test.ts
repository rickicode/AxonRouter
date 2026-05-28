import { beforeEach, describe, expect, it, vi } from "vitest";

const createProviderConnection = vi.fn(async (data) => ({ id: "conn-freebuff", ...data }));
const finalizePostConnectValidation = vi.fn(async (connection) => ({
  ...connection,
  routingStatus: connection.routingStatus ?? "eligible",
  healthStatus: connection.healthStatus ?? "healthy",
  quotaState: connection.quotaState ?? "ok",
  authState: connection.authState ?? "ok",
  reasonCode: connection.reasonCode ?? null,
  reasonDetail: connection.reasonDetail ?? null,
  lastCheckedAt: connection.lastCheckedAt,
}));
const getFreebuffSession = vi.fn();

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: any, init?: any) => ({
      status: init?.status || 200,
      body,
      json: async () => body,
    }),
  },
}));

vi.mock("@/lib/connectionAccess", () => ({
  createCurrentProviderConnection: createProviderConnection,
}));

vi.mock("@/lib/oauth/postConnectValidation", () => ({
  finalizePostConnectValidation,
}));

vi.mock("@/lib/freebuff/probe", () => ({
  getFreebuffSession,
}));

describe("Freebuff auth routes", () => {
  beforeEach(() => {
    vi.resetModules();
    createProviderConnection.mockClear();
    finalizePostConnectValidation.mockClear();
    getFreebuffSession.mockReset();
  });

  it("imports detected credentials and preserves fingerprint metadata", async () => {
    getFreebuffSession.mockResolvedValue({
      response: { ok: true, status: 200 },
      data: { status: "none" },
    });

    const { POST } = await import("../../src/app/api/oauth/freebuff/import/route.ts");
    const response = await POST(new Request("http://localhost/api/oauth/freebuff/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authToken: "token-123",
        name: "Rick",
        accountId: "ricki@hijitoko.com",
        fingerprintId: "instance-1",
        fingerprintHash: "hash-1",
        instanceId: "instance-1",
        authMethod: "import-session",
      }),
    }));

    expect(response.status).toBe(200);
    expect(createProviderConnection).toHaveBeenCalledWith(expect.objectContaining({
      provider: "freebuff",
      authType: "apikey",
      apiKey: "token-123",
      providerSpecificData: expect.objectContaining({
        authMethod: "import-session",
        accountId: "ricki@hijitoko.com",
        fingerprint: "instance-1",
        fingerprintHash: "hash-1",
        instanceId: "instance-1",
      }),
    }));
  });

  it("treats 429 session responses as valid token with cooldown", async () => {
    getFreebuffSession.mockResolvedValue({
      response: { ok: false, status: 429 },
      data: { resetAt: "2026-05-28T07:00:00.000Z", message: "limit" },
    });

    const { POST } = await import("../../src/app/api/oauth/freebuff/import/route.ts");
    const response = await POST(new Request("http://localhost/api/oauth/freebuff/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authToken: "token-123" }),
    }));

    expect(response.status).toBe(200);
    expect(createProviderConnection).toHaveBeenCalledWith(expect.objectContaining({
      quotaState: "cooldown",
      reasonCode: "quota_exhausted",
      resetAt: "2026-05-28T07:00:00.000Z",
    }));
  });
});
