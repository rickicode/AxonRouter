import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.useRealTimers();

const getSettings = vi.fn();
const sdkStart = vi.fn();
const sdkShutdown = vi.fn();
const endSpy = vi.fn();
const setAttributeSpy = vi.fn();
const recordExceptionSpy = vi.fn();
const setStatusSpy = vi.fn();
const startSpanSpy = vi.fn();

vi.mock("@/lib/localDb", () => ({
  getSettings,
}));

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: class MockNodeSDK {
    start = sdkStart;
    shutdown = sdkShutdown;
  },
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: class MockOTLPTraceExporter {},
}));

vi.mock("@opentelemetry/resources", () => ({
  Resource: class MockResource {
    constructor(_attrs: unknown) {}
  },
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
  ATTR_SERVICE_NAME: "service.name",
}));

vi.mock("@opentelemetry/api", () => ({
  SpanStatusCode: {
    ERROR: 2,
  },
  context: {
    active: vi.fn(() => ({ trace: "ctx" })),
    with: vi.fn((_ctx, fn) => fn()),
  },
  trace: {
    getTracer: vi.fn(() => ({
      startSpan: startSpanSpy,
    })),
    setSpan: vi.fn((_ctx, span) => ({ span })),
  },
}));

function createSpan() {
  return {
    setAttribute: setAttributeSpy,
    recordException: recordExceptionSpy,
    setStatus: setStatusSpy,
    end: endSpy,
  };
}

describe("OpenTelemetry instrumentation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSettings.mockResolvedValue({
      observability: {
        otel: {
          enabled: true,
          jaegerOtlpHttpEndpoint: "http://localhost:4318/v1/traces",
        },
      },
    });
    startSpanSpy.mockImplementation(() => createSpan());
  });

  afterEach(async () => {
    const { resetOtelStateForTests, shutdownOtel } = await import("../../src/lib/observability/otel.ts");
    resetOtelStateForTests();
    await shutdownOtel();
  });

  it("cancels the upstream reader and ends the span only once on client cancel", async () => {
    const { instrumentRequest } = await import("../../src/lib/observability/otel.ts");

    const upstreamCancelSpy = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      start() {
        // Keep the stream open so client cancellation drives the lifecycle.
      },
      cancel(reason) {
        upstreamCancelSpy(reason);
      },
    });

    const response = await instrumentRequest(
      new Request("http://localhost/v1/test", { method: "GET" }),
      "test",
      async () => new Response(source, { status: 200 }),
      { routePrefix: "/v1" },
    );

    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();

    await reader!.cancel("client closed");
    await Promise.resolve();

    expect(upstreamCancelSpy).toHaveBeenCalledTimes(1);
    expect(endSpy).toHaveBeenCalledTimes(1);
    expect(setAttributeSpy).toHaveBeenCalledWith("axonrouter.stream_cancelled", true);
    expect(setAttributeSpy).toHaveBeenCalledWith("axonrouter.duration_ms", expect.any(Number));
  });

  it("records duration and ends once for responses without a body", async () => {
    const { instrumentRequest } = await import("../../src/lib/observability/otel.ts");

    const response = await instrumentRequest(
      new Request("http://localhost/api/usage-worker/status", { method: "GET" }),
      "status",
      async () => new Response(null, { status: 204 }),
      { routePrefix: "/api/usage-worker" },
    );

    expect(response.status).toBe(204);
    expect(endSpy).toHaveBeenCalledTimes(1);
    expect(setAttributeSpy).toHaveBeenCalledWith("axonrouter.duration_ms", expect.any(Number));
  });

  it("keeps OTEL state initialization single-flight under concurrent calls", async () => {
    const { withOtelSpan } = await import("../../src/lib/observability/otel.ts");

    await Promise.all([
      withOtelSpan("first", {}, async () => "ok"),
      withOtelSpan("second", {}, async () => "ok"),
    ]);

    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(sdkStart).toHaveBeenCalledTimes(1);
  });

  it("dedupes shutdown work while a flush is already in flight", async () => {
    let resolveShutdown: (() => void) | null = null;
    sdkShutdown.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveShutdown = resolve;
        }),
    );

    const { withOtelSpan, shutdownOtel } = await import("../../src/lib/observability/otel.ts");
    await withOtelSpan("warmup", {}, async () => "ok");

    const first = shutdownOtel();
    const second = shutdownOtel();

    expect(sdkShutdown).toHaveBeenCalledTimes(1);

    resolveShutdown?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(sdkShutdown).toHaveBeenCalledTimes(1);
  });
});
