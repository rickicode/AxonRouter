import { beforeEach, describe, expect, it, vi } from "vitest";

const allSpy = vi.fn();
const getSpy = vi.fn();

vi.mock("@/lib/requestDetailsDb/core", () => ({
  prepareRequestDetailsStatement: vi.fn((sql: string) => ({
    all: allSpy,
    get: getSpy,
    sql,
  })),
}));

vi.mock("@/lib/requestDetailsDb/writer", () => ({
  hydrateRequestDetailRecord: vi.fn(),
}));

describe("requestDetailsDb query contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSpy.mockReturnValue({ totalItems: 1 });
    allSpy.mockReturnValue([
      {
        id: "detail-1",
        provider: "openai",
        model: "gpt-4.1",
        connection_id: "conn-1",
        timestamp: "2026-05-25T10:00:00.000Z",
        status: "success",
        correlation_id: "corr-1",
        latency_ttft_ms: 15,
        latency_total_ms: 45,
        prompt_tokens: null,
        completion_tokens: 12,
        trace_mode: "router",
        trace_last_event_type: "provider-picked",
        trace_event_count: 3,
      },
    ]);
  });

  it("returns summary rows without fake payload objects and with trace summary", async () => {
    const { getRequestDetailsIndex } = await import("../../src/lib/requestDetailsDb/queries");

    const result = await getRequestDetailsIndex({ page: 1, pageSize: 20 });
    expect(result.details[0]).toEqual({
      id: "detail-1",
      provider: "openai",
      model: "gpt-4.1",
      connectionId: "conn-1",
      timestamp: "2026-05-25T10:00:00.000Z",
      status: "success",
      correlationId: "corr-1",
      latency: { ttft: 15, total: 45 },
      tokens: { completion_tokens: 12 },
      traceSummary: {
        mode: "router",
        lastEventType: "provider-picked",
        eventCount: 3,
      },
      request: null,
      providerRequest: null,
      providerResponse: null,
      response: null,
    });
  });

  it("keeps missing latency missing in summary rows", async () => {
    allSpy.mockReturnValueOnce([
      {
        id: "detail-2",
        provider: "openai",
        model: "gpt-4.1",
        connection_id: "conn-2",
        timestamp: "2026-05-25T10:00:00.000Z",
        status: "success",
        correlation_id: null,
        latency_ttft_ms: null,
        latency_total_ms: null,
        prompt_tokens: null,
        completion_tokens: null,
        trace_mode: null,
        trace_last_event_type: null,
        trace_event_count: 0,
      },
    ]);

    const { getRequestDetailsIndex } = await import("../../src/lib/requestDetailsDb/queries");

    const result = await getRequestDetailsIndex({ page: 1, pageSize: 20 });
    expect(result.details[0]).toEqual({
      id: "detail-2",
      provider: "openai",
      model: "gpt-4.1",
      connectionId: "conn-2",
      timestamp: "2026-05-25T10:00:00.000Z",
      status: "success",
      correlationId: null,
      latency: {},
      tokens: {},
      traceSummary: null,
      request: null,
      providerRequest: null,
      providerResponse: null,
      response: null,
    });
  });
});
