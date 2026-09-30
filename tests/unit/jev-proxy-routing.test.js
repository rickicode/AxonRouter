// Regression coverage for the classifier (Jev) proxy/cooldown path and the
// non-chat capability egress sweep. See
// docs/audits/proxy-routing-non-chat-upstreams-20260930.md.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
  buildProxyOptions: (psd = {}) => ({
    connectionProxyEnabled: psd?.connectionProxyEnabled === true,
    connectionProxyUrl: psd?.connectionProxyUrl || "",
    connectionNoProxy: psd?.connectionNoProxy || "",
    strictProxy: psd?.strictProxy === true,
    failClosedProxy: psd?.failClosedProxy === true,
    proxyPoolId: psd?.proxyPoolId || null,
  }),
}));

const {
  classifyWithJev,
  jevClassifierCooldownKey,
  getJevCooldownUntilMs,
  clearJevCooldowns,
} = await import("../../open-sse/services/combo.js");
const { isPoolFit } = await import("../../open-sse/services/proxyPoolFitness.js");
const { handleFetchCore } = await import("../../open-sse/handlers/fetch/index.js");
const { handleTtsCore } = await import("../../open-sse/handlers/ttsCore.js");
const { handleEmbeddingsCore } = await import("../../open-sse/handlers/embeddingsCore.js");

const quietLog = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function jevOk({ difficulty = "easy", ambiguity = "low", domain = "general", confidence = 0.95 } = {}) {
  const payload = {
    answers: {
      difficulty: { choice: difficulty, confidence },
      ambiguity: { choice: ambiguity, confidence: 0.9 },
      domain: { choice: domain, confidence: 0.9 },
    },
    usage: { input_tokens: 7, output_tokens: 2 },
  };
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  };
}

function jevRateLimited({ retryAfter = "120" } = {}) {
  return {
    ok: false,
    status: 429,
    headers: new Map([["retry-after", retryAfter], ["content-type", "application/json"]]),
    get: undefined,
    text: async () => JSON.stringify({ error: { message: "rate limited" } }),
    json: async () => ({ error: { message: "rate limited" } }),
  };
}

// Response shape the classifier's extractQuotaResetMs() expects.
function withHeaders(res, entries) {
  const map = new Map(entries);
  return { ...res, headers: { get: (k) => map.get(String(k).toLowerCase()) ?? map.get(k) ?? null } };
}

const directTarget = (extra = {}) => ({
  available: true,
  provider: "opencode",
  model: "jev-latest",
  endpoint: "https://example.invalid/jev",
  apiKey: "",
  keyless: true,
  proxyOptions: null,
  ...extra,
});

beforeEach(() => {
  fetchMock.mockReset();
  clearJevCooldowns();
});

afterEach(() => {
  clearJevCooldowns();
  vi.restoreAllMocks();
});

describe("classifyWithJev egress + failure handling", () => {
  it("routes the classifier through proxyAwareFetch with the resolved proxyOptions", async () => {
    const proxyOptions = {
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://127.0.0.1:7890",
      proxyPoolId: "pool-1",
      failClosedProxy: true,
    };
    fetchMock.mockResolvedValue(jevOk({ difficulty: "hard", domain: "coding" }));

    const res = await classifyWithJev("Design a distributed queue", {
      target: directTarget({ proxyOptions }),
      log: quietLog,
    });

    expect(res?.difficulty).toBe("hard");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][2]).toEqual(proxyOptions);
  });

  it("parks the classifier on 429 and honours Retry-After, then skips the network call", async () => {
    fetchMock.mockResolvedValue(withHeaders(jevRateLimited({ retryAfter: "90" }), [["retry-after", "90"]]));

    const target = directTarget();
    const first = await classifyWithJev("Any task", { target, log: quietLog });
    expect(first).toBeNull();

    const key = jevClassifierCooldownKey(target);
    const until = getJevCooldownUntilMs(key);
    expect(until).toBeGreaterThan(Date.now() + 80_000);
    expect(until).toBeLessThanOrEqual(Date.now() + 91_000);

    // Second call must be answered from memory, not the network.
    const second = await classifyWithJev("Any task", { target, log: quietLog });
    expect(second?.cooldownActive).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks the pool unfit for the classifier scope on a rate-limited response", async () => {
    fetchMock.mockResolvedValue(withHeaders(jevRateLimited({ retryAfter: "30" }), [["retry-after", "30"]]));
    const proxyOptions = { connectionProxyEnabled: true, connectionProxyUrl: "http://127.0.0.1:7890", proxyPoolId: "pool-jevs" };

    await classifyWithJev("Any task", { target: directTarget({ proxyOptions }), log: quietLog });

    expect(isPoolFit("pool-jevs", "opencode::jev")).toBe(false);
  });

  it("does not park the classifier on a client-side 4xx", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Map(),
      text: async () => "bad request",
      json: async () => ({ error: "bad request" }),
    });

    const target = directTarget();
    expect(await classifyWithJev("Any task", { target, log: quietLog })).toBeNull();
    // getJevCooldownUntilMs returns 0 (falsy) when no cooldown is parked.
    expect(getJevCooldownUntilMs(jevClassifierCooldownKey(target))).toBeFalsy();
  });
});

describe("non-chat capability egress plumbing", () => {
  const proxyOptions = { connectionProxyEnabled: true, connectionProxyUrl: "http://127.0.0.1:7890", proxyPoolId: "p" };

  it("handleFetchCore forwards proxyOptions to the provider upstream call", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ data: { markdown: "# hi", metadata: { title: "t" } } }),
      text: async () => JSON.stringify({ data: { markdown: "# hi" } }),
    });

    const result = await handleFetchCore({
      url: "https://example.com",
      provider: "firecrawl",
      providerConfig: {},
      credentials: { apiKey: "k" },
      log: () => {},
      proxyOptions,
    });

    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls[0][2]).toEqual(proxyOptions);
  });

  it("handleTtsCore forwards proxyOptions into the generic TTS handler", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "audio/mpeg" },
      arrayBuffer: async () => new Uint8Array(2048).buffer,
      text: async () => "",
      json: async () => ({}),
    });

    const result = await handleTtsCore({
      provider: "openai",
      model: "alloy",
      input: "hello",
      credentials: { apiKey: "k", providerSpecificData: {} },
      proxyOptions,
    });

    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls[0][2]).toEqual(proxyOptions);
  });

  it("handleEmbeddingsCore forwards proxyOptions to the embedding upstream call", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
      text: async () => "",
    });

    const result = await handleEmbeddingsCore({
      body: { input: "hello", model: "openai/text-embedding-3-small" },
      modelInfo: { provider: "openai", model: "text-embedding-3-small" },
      credentials: { apiKey: "k" },
      log: quietLog,
      proxyOptions,
    });

    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls[0][2]).toEqual(proxyOptions);
  });
});