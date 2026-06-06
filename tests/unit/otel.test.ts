import { afterEach, describe, expect, it, vi } from "vitest";

vi.useRealTimers();

describe("Lightweight observability timing", () => {
  afterEach(async () => {
    const { resetOtelStateForTests, shutdownOtel } = await import("../../src/lib/observability/otel.ts");
    resetOtelStateForTests();
    await shutdownOtel();
  });

  it("wraps a handler and returns the response", async () => {
    const { instrumentRequest } = await import("../../src/lib/observability/otel.ts");

    const response = await instrumentRequest(
      new Request("http://localhost/v1/test", { method: "GET" }),
      "test",
      async () => new Response("ok", { status: 200 }),
      { routePrefix: "/v1" },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("propagates handler errors", async () => {
    const { instrumentRequest } = await import("../../src/lib/observability/otel.ts");

    await expect(
      instrumentRequest(
        new Request("http://localhost/v1/fail", { method: "POST" }),
        "fail",
        async () => { throw new Error("boom"); },
      ),
    ).rejects.toThrow("boom");
  });

  it("withOtelSpan returns the handler result", async () => {
    const { withOtelSpan } = await import("../../src/lib/observability/otel.ts");

    const result = await withOtelSpan("test", {}, async () => 42);
    expect(result).toBe(42);
  });

  it("instrumentV1Request works end-to-end", async () => {
    const { instrumentV1Request } = await import("../../src/lib/observability/otel.ts");

    const response = await instrumentV1Request(
      new Request("http://localhost/v1/chat", { method: "POST" }),
      "chat",
      async () => new Response(JSON.stringify({ result: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ result: "ok" });
  });

  it("instrumentUsageWorker wraps a sync handler", async () => {
    const { instrumentUsageWorker } = await import("../../src/lib/observability/otel.ts");

    const result = await instrumentUsageWorker("sync", {}, () => "done");
    expect(result).toBe("done");
  });

  it("shutdownOtel is safe to call multiple times", async () => {
    const { shutdownOtel } = await import("../../src/lib/observability/otel.ts");

    await shutdownOtel();
    await shutdownOtel();
    // No crash = success
  });

  it("getCachedSettings returns null when no settings are cached", async () => {
    const { getCachedSettings } = await import("../../src/lib/observability/otel.ts");
    expect(getCachedSettings()).toBeNull();
  });
});
