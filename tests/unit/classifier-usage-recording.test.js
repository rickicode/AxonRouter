// Task-3 gate coverage: EVERY non-chat upstream call must land a row in
// usage_history, with meta.callKind distinguishing chat / classifier / judge /
// embedding / tts / stt / image / video / search / fetch, and failures included.
//
// The DB layer is mocked at the @/lib/usageDb.js boundary — the same boundary
// the chat path and the embeddings reference implementation use — so the
// assertions are on the exact row shape handed to PostgreSQL.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
const saveRequestUsage = vi.fn(async () => {});
const saveFailedRequest = vi.fn(async () => {});

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
  buildProxyOptions: (psd = {}) => ({
    connectionProxyEnabled: psd?.connectionProxyEnabled === true,
    connectionProxyUrl: psd?.connectionProxyUrl || "",
    strictProxy: psd?.strictProxy === true,
    failClosedProxy: psd?.failClosedProxy === true,
    proxyPoolId: psd?.proxyPoolId || null,
  }),
}));

vi.mock("@/lib/usageDb.js", () => ({
  saveRequestUsage: (...a) => saveRequestUsage(...a),
  saveFailedRequest: (...a) => saveFailedRequest(...a),
  appendRequestLog: () => {},
  saveRequestDetail: async () => {},
  getUsageHistory: async () => [],
}));

const {
  classifyWithJev,
  clearJevCooldowns,
} = await import("../../open-sse/services/combo.js");
const { saveUsageStats } = await import("../../open-sse/handlers/chatCore/requestDetail.js");
const { saveCapabilityUsage } = await import("../../src/sse/services/capabilityUsage.js");

const quietLog = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const target = () => ({
  available: true,
  provider: "typesafe",
  model: "jev-latest",
  endpoint: JEV_ENDPOINT,
  apiKey: "k",
  keyless: false,
  connectionId: "conn-1",
  proxyOptions: null,
});

function jevOk(tokens) {
  const payload = {
    answers: {
      difficulty: { choice: "hard", confidence: 0.93 },
      ambiguity: { choice: "low", confidence: 0.9 },
      domain: { choice: "coding", confidence: 0.9 },
    },
    ...(tokens ? { usage: tokens } : {}),
  };
  return { ok: true, status: 200, headers: new Map(), text: async () => JSON.stringify(payload), json: async () => payload };
}

function jev429(retryAfter = "60") {
  const map = new Map([["retry-after", retryAfter]]);
  return {
    ok: false,
    status: 429,
    headers: { get: (k) => map.get(String(k).toLowerCase()) ?? null },
    text: async () => JSON.stringify({ error: { message: "rate limited" } }),
    json: async () => ({ error: { message: "rate limited" } }),
  };
}

const classifierRows = () => saveRequestUsage.mock.calls.map(([e]) => e).filter((e) => e?.meta?.callKind === "classifier");

beforeEach(() => {
  fetchMock.mockReset();
  saveRequestUsage.mockClear();
  saveFailedRequest.mockClear();
  clearJevCooldowns();
});
afterEach(() => {
  clearJevCooldowns();
  vi.restoreAllMocks();
});

describe("classifier rows reach usage_history", () => {
  it("writes a classifier row on success, with the upstream endpoint and token counts", async () => {
    fetchMock.mockResolvedValue(jevOk({ input_tokens: 41, output_tokens: 9 }));

    const res = await classifyWithJev("Design a queue", { target: target(), log: quietLog });
    expect(res?.difficulty).toBe("hard");

    const rows = classifierRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.provider).toBe("typesafe");
    expect(row.model).toBe("jev-latest");
    expect(row.endpoint).toBe("/v1/systemone"); // path only, groupable
    expect(row.status).toBe("ok");
    expect(row.tokens.prompt_tokens).toBe(41);
    expect(row.tokens.completion_tokens).toBe(9);
    expect(row.meta.callKind).toBe("classifier");
    expect(row.meta.isStream).toBe(false);
  });

  it("writes a classifier row even when the upstream reports no usage at all", async () => {
    fetchMock.mockResolvedValue(jevOk(null));

    await classifyWithJev("Design a queue", { target: target(), log: quietLog });

    const rows = classifierRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokens).toMatchObject({ prompt_tokens: 0, completion_tokens: 0 });
    expect(rows[0].status).toBe("ok");
  });

  it("writes a failure row (error_429) when the classifier is rate limited", async () => {
    fetchMock.mockResolvedValue(jev429("120"));

    expect(await classifyWithJev("Design a queue", { target: target(), log: quietLog })).toBeNull();

    const rows = classifierRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("error_429");
    expect(rows[0].meta.failed).toBe(true);
    expect(rows[0].meta.error).toMatch(/rate limited/i);
    expect(rows[0].endpoint).toBe("/v1/systemone");
  });

  it("writes a failure row when the classifier network call throws/times out", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    expect(await classifyWithJev("Design a queue", { target: target(), log: quietLog })).toBeNull();

    const rows = classifierRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("error_network");
    expect(rows[0].meta.failed).toBe(true);
  });

  it("never writes a row for probes or when recording is disabled", async () => {
    fetchMock.mockResolvedValue(jevOk({ input_tokens: 1, output_tokens: 1 }));

    await classifyWithJev("x", { target: target(), log: quietLog, recordUsage: false });
    await classifyWithJev("x", { target: target(), log: quietLog, isTestRequest: true });

    expect(classifierRows()).toHaveLength(0);
  });
});

describe("saveUsageStats non-chat contract", () => {
  it("keeps zero-token capability rows and stamps status + callKind + failure meta", () => {
    saveUsageStats({
      provider: "typesafe", model: "judge-router", tokens: {}, endpoint: "/v1/chat/completions",
      callKind: "judge", allowZeroTokens: true, status: "error_504", error: "gateway timeout",
      isStream: false, silent: true,
    });

    expect(saveRequestUsage).toHaveBeenCalledTimes(1);
    const row = saveRequestUsage.mock.calls[0][0];
    expect(row.status).toBe("error_504");
    expect(row.meta.callKind).toBe("judge");
    expect(row.meta.failed).toBe(true);
    expect(row.meta.error).toBe("gateway timeout");
    expect(row.meta.isStream).toBe(false);
  });

  it("still drops zero-token chat rows (unchanged legacy behaviour)", () => {
    saveUsageStats({ provider: "openai", model: "gpt-4o", tokens: {}, endpoint: "/v1/chat/completions", callKind: "chat" });
    expect(saveRequestUsage).not.toHaveBeenCalled();
  });

  it("coerces a scalar/array meta payload so jsonb_object_keys cannot fail", () => {
    saveUsageStats({
      provider: "x", model: "y", tokens: { prompt_tokens: 1, completion_tokens: 1 },
      callKind: "chat", meta: ["not", "an", "object"],
    });
    const row = saveRequestUsage.mock.calls[0][0];
    expect(Array.isArray(row.meta)).toBe(false);
    expect(typeof row.meta).toBe("object");
    expect(row.meta.callKind).toBe("chat");
  });
});

describe("capability rows (audio/embed/image/video/search/fetch)", () => {
  it("records a zero-token TTS success row with callKind=tts", () => {
    saveCapabilityUsage({
      provider: "edge-tts", model: "vi-VN-HoaiMyNeural", endpoint: "/v1/audio/speech",
      callKind: "tts", status: "ok", latencyMs: 120,
    });

    expect(saveRequestUsage).toHaveBeenCalledTimes(1);
    const row = saveRequestUsage.mock.calls[0][0];
    expect(row.provider).toBe("edge-tts");
    expect(row.endpoint).toBe("/v1/audio/speech");
    expect(row.meta.callKind).toBe("tts");
    expect(row.meta.isStream).toBe(false);
    expect(row.status).toBe("success");
  });

  it("stamps capability failures with a failure status on the usage row itself", () => {
    saveCapabilityUsage({
      provider: "cloudflare-ai", model: "@cf/baai/bge-m3", endpoint: "/v1/embeddings",
      callKind: "embedding", status: "error_429", error: "quota", connectionId: "c1",
    });

    // One path, one writer: the failure lands in usage_history with its status
    // verbatim and meta.failed set, so the daily rollup counts it as failed
    // while the row keeps whatever tokens the upstream reported.
    expect(saveFailedRequest).not.toHaveBeenCalled();
    expect(saveRequestUsage).toHaveBeenCalledTimes(1);
    const row = saveRequestUsage.mock.calls[0][0];
    expect(row.meta.callKind).toBe("embedding");
    expect(row.status).toBe("error_429");
    expect(row.meta.failed).toBe(true);
    expect(row.meta.error).toBe("quota");
    expect(row.endpoint).toBe("/v1/embeddings");
  });

  it("never records probes", () => {
    saveCapabilityUsage({ provider: "edge-tts", callKind: "tts", isTestRequest: true });
    expect(saveRequestUsage).not.toHaveBeenCalled();
    expect(saveFailedRequest).not.toHaveBeenCalled();
  });
});
