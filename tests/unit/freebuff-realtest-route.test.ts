import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureFreebuffSession = vi.fn();
const startFreebuffRun = vi.fn();
const sendFreebuffCompletion = vi.fn();
const explainFreebuffError = vi.fn((payload) => payload?.error || payload?.status || null);

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: any, init?: any) => ({
      status: init?.status || 200,
      body,
      json: async () => body,
    }),
  },
}));

vi.mock("@/lib/freebuff/probe", () => ({
  FREEBUFF_DEFAULT_CLIENT_ID: "axonrouter-freebuff-probe",
  FREEBUFF_DEFAULT_MODEL: "deepseek/deepseek-v4-flash",
  ensureFreebuffSession,
  startFreebuffRun,
  sendFreebuffCompletion,
  explainFreebuffError,
  extractFreebuffFingerprint: (payload: any) => payload?.instanceId,
}));

describe("Freebuff realtest route", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureFreebuffSession.mockReset();
    startFreebuffRun.mockReset();
    sendFreebuffCompletion.mockReset();
    explainFreebuffError.mockClear();
  });

  it("runs session, run, and completion probes in one request", async () => {
    ensureFreebuffSession.mockResolvedValue({
      active: true,
      session: {
        response: { status: 200 },
        data: { status: "active", instanceId: "session-inst-123" },
      },
      join: null,
    });
    startFreebuffRun.mockResolvedValue({
      response: { status: 200 },
      data: { runId: "run-123" },
    });
    sendFreebuffCompletion.mockResolvedValue({
      response: { status: 200 },
      data: { id: "cmpl-1" },
    });

    const { POST } = await import("../../src/app/api/oauth/freebuff/realtest/route.ts");
    const response = await POST(new Request("http://localhost/api/oauth/freebuff/realtest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authToken: "token-123", clientId: "fp-123" }),
    }));

    expect(response.status).toBe(200);
    expect(ensureFreebuffSession).toHaveBeenCalledWith("token-123", {
      model: "deepseek/deepseek-v4-flash",
      forceJoin: true,
    });
    expect(startFreebuffRun).toHaveBeenCalledWith("token-123", undefined);
    expect(sendFreebuffCompletion).toHaveBeenCalledWith("token-123", expect.objectContaining({
      runId: "run-123",
      clientId: "session-inst-123",
      freebuffInstanceId: "session-inst-123",
    }));
    expect(response.body).toMatchObject({
      ok: true,
      session: { status: 200 },
      run: { status: 200 },
      completion: { status: 200 },
    });
  });
});
