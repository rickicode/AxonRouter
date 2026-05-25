import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseExecutor } from "../../open-sse/executors/base.ts";
import { CodexExecutor } from "../../open-sse/executors/codex.tsx";
import { setChatRuntimeSettings } from "../../open-sse/utils/abort.ts";

vi.mock("../../open-sse/utils/proxyFetch.ts", () => ({
  proxyAwareFetch: vi.fn(),
}));

const { proxyAwareFetch } = await import("../../open-sse/utils/proxyFetch.ts");

describe("BaseExecutor upstream timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    setChatRuntimeSettings({});
    delete process.env.CHAT_UPSTREAM_TIMEOUT_MS;
    delete process.env.CHAT_COMPACT_UPSTREAM_TIMEOUT_MS;
  });

  it("attaches the default AxonRouter upstream timeout", async () => {
    proxyAwareFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const executor = new BaseExecutor("openai-compatible-test", {
      baseUrl: "https://example.test/v1",
    });

    await executor.execute({
      model: "gpt-test",
      body: { messages: [] },
      stream: false,
      credentials: { apiKey: "test", providerSpecificData: { baseUrl: "https://example.test/v1" } },
    });

    expect(proxyAwareFetch).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      null,
    );
  });

  it("passes a merged abort signal to upstream fetch when a hard timeout is configured", async () => {
    setChatRuntimeSettings({ upstreamTimeoutMs: 1000 });
    proxyAwareFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const executor = new BaseExecutor("openai-compatible-test", {
      baseUrl: "https://example.test/v1",
    });

    await executor.execute({
      model: "gpt-test",
      body: { messages: [] },
      stream: false,
      credentials: { apiKey: "test", providerSpecificData: { baseUrl: "https://example.test/v1" } },
    });

    expect(proxyAwareFetch).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      null,
    );
  });

  it("converts deadline aborts into upstream timeout errors", async () => {
    setChatRuntimeSettings({ upstreamTimeoutMs: 10 });
    vi.useFakeTimers();
    proxyAwareFetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }));
    const executor = new BaseExecutor("openai-compatible-test", {
      baseUrl: "https://example.test/v1",
    });

    const request = executor.execute({
      model: "gpt-test",
      body: { messages: [] },
      stream: false,
      credentials: { apiKey: "test", providerSpecificData: { baseUrl: "https://example.test/v1" } },
    });
    request.catch(() => null);

    await vi.advanceTimersByTimeAsync(10);
    await expect(request).rejects.toMatchObject({
      name: "AbortError",
      code: "UPSTREAM_TIMEOUT",
    });
  });

  it("keeps the timeout active until a non-streaming body is consumed", async () => {
    setChatRuntimeSettings({ upstreamTimeoutMs: 10 });
    vi.useFakeTimers();
    proxyAwareFetch.mockResolvedValue(new Response(new ReadableStream({}), { status: 200 }));
    const executor = new BaseExecutor("openai-compatible-test", {
      baseUrl: "https://example.test/v1",
    });

    const { response } = await executor.execute({
      model: "gpt-test",
      body: { messages: [] },
      stream: false,
      credentials: { apiKey: "test", providerSpecificData: { baseUrl: "https://example.test/v1" } },
    });

    const bodyRead = response.json();
    bodyRead.catch(() => null);

    await vi.advanceTimersByTimeAsync(10);
    await expect(bodyRead).rejects.toMatchObject({
      name: "AbortError",
      code: "UPSTREAM_TIMEOUT",
    });
  });

  it("prefers executor-specific timeout overrides over the global timeout", async () => {
    process.env.CHAT_UPSTREAM_TIMEOUT_MS = "10";
    const executor = new BaseExecutor("openai-compatible-test", {
      baseUrl: "https://example.test/v1",
    });
    executor.getTimeoutMs = vi.fn(() => 123456);
    proxyAwareFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await executor.execute({
      model: "gpt-test",
      body: { messages: [] },
      stream: false,
      credentials: { apiKey: "test", providerSpecificData: { baseUrl: "https://example.test/v1" } },
    });

    expect(executor.getTimeoutMs).toHaveBeenCalled();
    expect(proxyAwareFetch).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      null,
    );
  });

  it("uses the compact-specific runtime timeout for compact requests", async () => {
    setChatRuntimeSettings({ upstreamTimeoutMs: 1000, compactUpstreamTimeoutMs: 321000 });
    proxyAwareFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const executor = new BaseExecutor("openai-compatible-test", {
      baseUrl: "https://example.test/v1",
    });

    await executor.execute({
      model: "gpt-test",
      body: { messages: [], _compact: true },
      stream: false,
      credentials: { apiKey: "test", providerSpecificData: { baseUrl: "https://example.test/v1" } },
    });

    expect(proxyAwareFetch).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      null,
    );
  });

  it("attaches the default AxonRouter upstream timeout to Codex requests", async () => {
    proxyAwareFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const executor = new BaseExecutor("codex", {
      baseUrl: "https://chatgpt.com/backend-api/codex",
    });

    await executor.execute({
      model: "gpt-5.3-codex",
      body: { input: [] },
      stream: false,
      credentials: { accessToken: "test" },
    });

    expect(proxyAwareFetch).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/codex",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      null,
    );
  });

  it("uses shorter timeouts for non-compact Codex requests", () => {
    const executor = new CodexExecutor();

    expect(executor.getTimeoutMs({ body: { input: [] }, stream: false })).toBe(75000);
    expect(
      executor.getTimeoutMs({
        body: { input: [], tools: [{ type: "function", function: { name: "ls" } }] },
        stream: false,
      }),
    ).toBe(45000);
    expect(
      executor.getTimeoutMs({
        body: { input: [], reasoning_effort: "high" },
        stream: false,
      }),
    ).toBe(45000);
    expect(executor.getTimeoutMs({ body: { input: [], _compact: true }, stream: false })).toBeNull();
  });

  it("respects runtime-configured Codex timeout overrides", () => {
    setChatRuntimeSettings({
      codexNonCompactTimeoutMs: 17000,
      codexAgenticTimeoutMs: 9000,
    });
    const executor = new CodexExecutor();

    expect(executor.getTimeoutMs({ body: { input: [] }, stream: false })).toBe(17000);
    expect(
      executor.getTimeoutMs({
        body: { input: [], tools: [{ type: "function", function: { name: "ls" } }] },
        stream: false,
      }),
    ).toBe(9000);
  });
});
