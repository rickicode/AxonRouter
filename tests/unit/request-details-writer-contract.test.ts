import { beforeEach, describe, expect, it, vi } from "vitest";

const runSpy = vi.fn();
const getSpy = vi.fn();
const allSpy = vi.fn(() => []);
const readPayloadSpy = vi.fn();
const writePayloadSpy = vi.fn(async () => ({
  paths: {
    request: "/tmp/request.json",
    providerRequest: "/tmp/provider-request.json",
    providerResponse: "/tmp/provider-response.json",
    response: "/tmp/response.json",
  },
  truncated: false,
}));

vi.mock("@/lib/requestDetailsDb/core", () => ({
  prepareRequestDetailsStatement: vi.fn((sql: string) => ({
    run: runSpy,
    get: getSpy,
    all: allSpy,
    sql,
  })),
}));

vi.mock("@/lib/requestDetailsDb/payloadStore", () => ({
  deleteRequestDetailPayloadFiles: vi.fn(),
  readRequestDetailPayloadFile: readPayloadSpy,
  writeRequestDetailPayloadFiles: writePayloadSpy,
}));

describe("requestDetailsDb writer contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSpy.mockReset();
    allSpy.mockReset();
    readPayloadSpy.mockReset();
    writePayloadSpy.mockClear();
    allSpy.mockReturnValue([]);
    getSpy.mockReturnValue({ c: 0 });
  });

  it("indexes trace summary and correlation id from non-providerResponse sources", async () => {
    const { flushRequestDetailBatch } = await import("../../src/lib/requestDetailsDb/writer");

    await flushRequestDetailBatch([
      {
        id: "detail-1",
        timestamp: "2026-05-25T10:00:00.000Z",
        provider: "openai",
        model: "gpt-4.1",
        request: {
          correlationId: "corr-from-request",
          trace: {
            mode: "fallback",
            correlationId: "corr-from-trace",
            events: [{ type: "route-picked" }],
          },
        },
        response: {},
        tokens: {},
        latency: {},
        status: "success",
      },
    ]);

    expect(runSpy).toHaveBeenCalled();
    const args = runSpy.mock.calls[0];
    expect(args[20]).toBe("corr-from-request");
    expect(args[21]).toBe("fallback");
    expect(args[22]).toBe(1);
    expect(args[23]).toBe("route-picked");
  });

  it("writes zero sentinels for missing usage and NOT NULL index latency", async () => {
    const { flushRequestDetailBatch } = await import("../../src/lib/requestDetailsDb/writer");

    await flushRequestDetailBatch([
      {
        id: "detail-2",
        timestamp: "2026-05-25T10:00:00.000Z",
        provider: "openai",
        model: "gpt-4.1",
        request: {},
        response: {},
        tokens: {},
        latency: {},
        status: "success",
      },
    ]);

    const args = runSpy.mock.calls[0];
    expect(args[7]).toBe(0);
    expect(args[8]).toBeNull();
    expect(args[9]).toBe(0);
    expect(args[10]).toBe(0);
  });

  it("hydrates trace and token fallbacks from payload content", async () => {
    readPayloadSpy.mockImplementation(async (path: string) => {
      if (path.includes("request")) {
        return { correlation_id: "corr-request" };
      }
      if (path.includes("provider-response")) {
        return {
          usage: {
            prompt_tokens: 321,
            completion_tokens: 123,
          },
        };
      }
      if (path.includes("response")) {
        return {
          trace: {
            mode: "response-trace",
            events: [{ type: "response-finished" }],
          },
        };
      }
      return null;
    });

    const { hydrateRequestDetailRecord } = await import("../../src/lib/requestDetailsDb/writer");

    const detail = await hydrateRequestDetailRecord({
      id: "detail-3",
      provider: "openai",
      model: "gpt-4.1",
      connection_id: "conn-1",
      timestamp: "2026-05-25T10:00:00.000Z",
      status: "success",
      latency_ttft_ms: 12,
      latency_total_ms: 34,
      prompt_tokens: null,
      completion_tokens: null,
      correlation_id: null,
      trace_mode: null,
      trace_event_count: 0,
      trace_last_event_type: null,
      request_payload_path: "/tmp/request.json",
      provider_request_payload_path: "/tmp/provider-request.json",
      provider_response_payload_path: "/tmp/provider-response.json",
      response_payload_path: "/tmp/response.json",
    });

    expect(detail).toMatchObject({
      correlationId: "corr-request",
      traceSummary: {
        mode: "response-trace",
        lastEventType: "response-finished",
        eventCount: 1,
      },
      tokens: {
        prompt_tokens: 321,
        completion_tokens: 123,
      },
    });
  });
});
