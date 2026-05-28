import { beforeEach, describe, expect, it, vi } from "vitest";

const getFreebuffSession = vi.fn();
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
  getFreebuffSession,
  startFreebuffRun,
  sendFreebuffCompletion,
  explainFreebuffError,
}));

describe("Freebuff realtest route", () => {
  beforeEach(() => {
    vi.resetModules();
    getFreebuffSession.mockReset();
    startFreebuffRun.mockReset();
    sendFreebuffCompletion.mockReset();
    explainFreebuffError.mockClear();
  });

  it("runs session, run, and completion probes in one request", async () => {
    getFreebuffSession.mockResolvedValue({
      response: { status: 200 },
      data: { status: "active" },
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
    expect(getFreebuffSession).toHaveBeenCalledWith("token-123");
    expect(startFreebuffRun).toHaveBeenCalledWith("token-123", undefined);
    expect(sendFreebuffCompletion).toHaveBeenCalledWith("token-123", expect.objectContaining({
      runId: "run-123",
      clientId: "fp-123",
    }));
    expect(response.body).toMatchObject({
      ok: true,
      session: { status: 200 },
      run: { status: 200 },
      completion: { status: 200 },
    });
  });
});
