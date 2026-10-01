// A dead proxy pool was the single most common classifier failure, and the
// executor gave up on the whole provider for it — the caller then escalated
// straight to the LLM judge. The fix retries through a DIFFERENT egress first
// (excluding the pool that just failed) and only escalates once that is spent.
//
// 429/503 deliberately still skip the rotation: those park the entire classifier
// via the Retry-After cooldown, so a new IP cannot help.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { classifyWithJev } from "../../open-sse/services/combo.js";

const quietLog = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function jevOk(difficulty = "hard") {
  return {
    ok: true, status: 200, headers: new Map([["content-type", "application/json"]]),
    json: async () => ({
      answers: {
        difficulty: { type: "choice", choice: difficulty, confidence: 0.9 },
        ambiguity: { type: "choice", choice: "low", confidence: 0.9 },
        domain: { type: "choice", choice: "coding", confidence: 0.9 },
      },
      usage: { input_tokens: 10, output_tokens: 2 },
    }),
    text: async () => "{}",
  };
}

function netFail() {
  return { __error: new Error("proxy fetch failed"), __timeout: false, status: 0, text: async () => "proxy fetch failed" };
}

const POOL_A = "11111111-1111-1111-1111-111111111111";
const POOL_B = "22222222-2222-2222-2222-222222222222";

// jevCooldowns is module-level and keyed by provider+model, so the 429 test would
// otherwise park the classifier for every later test in this file. Give each test
// its own model id.
let seq = 0;
function baseOptions(extra = {}) {
  return {
    apiKey: "k",
    log: quietLog,
    recordUsage: false,
    target: {
      // classifyWithJev bails on !target.available, which resolveJevTarget normally
      // sets. The direct-caller path supplies the target itself, so it must too.
      available: true,
      provider: "opencode", model: `jev-1.13-free#${++seq}`,
      endpoint: "https://example.invalid/v1/systemone",
      connectionId: "conn-1",
      proxyOptions: {
        connectionProxyEnabled: true,
        connectionProxyUrl: "http://proxy-a",
        connectionNoProxy: "",
        proxyPoolId: POOL_A,
      },
    },
    ...extra,
  };
}

describe("JEV egress rotation before escalating", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("retries on a second pool when the first egress dies", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(netFail())
      .mockResolvedValueOnce(jevOk("hard"));

    const resolveProxy = vi.fn(async () => ({
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://proxy-b",
      connectionNoProxy: "",
      proxyPoolId: POOL_B,
    }));

    const res = await classifyWithJev("Explain recursion", baseOptions({ resolveProxy }));

    expect(res).not.toBeNull();
    expect(res.difficulty).toBe("hard");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("excludes the failed pool when resolving the replacement egress", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(netFail())
      .mockResolvedValueOnce(jevOk());

    const resolveProxy = vi.fn(async () => ({
      connectionProxyEnabled: true, connectionProxyUrl: "http://proxy-b",
      connectionNoProxy: "", proxyPoolId: POOL_B,
    }));

    await classifyWithJev("Explain recursion", baseOptions({ resolveProxy }));

    expect(resolveProxy).toHaveBeenCalledTimes(1);
    expect(resolveProxy.mock.calls[0][1]).toContain(POOL_A);
  });

  it("does not re-pick the same pool it just failed on", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(netFail());

    const resolveProxy = vi.fn(async () => ({
      connectionProxyEnabled: true, connectionProxyUrl: "http://proxy-a",
      connectionNoProxy: "", proxyPoolId: POOL_A, // same pool — must be refused
    }));

    const res = await classifyWithJev("Explain recursion", baseOptions({ resolveProxy }));
    expect(res).toBeNull();
    // Only the original attempt: the "replacement" was the dead pool, so it stops.
    expect(resolveProxy).toHaveBeenCalledTimes(1);
  });

  it("escalates (null) once the egress attempts are spent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(netFail());
    const resolveProxy = vi.fn(async () => ({
      connectionProxyEnabled: true, connectionProxyUrl: "http://proxy-b",
      connectionNoProxy: "", proxyPoolId: POOL_B,
    }));

    const res = await classifyWithJev("Explain recursion", baseOptions({ resolveProxy }));

    expect(res).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2); // A then B, then give up
  });

  it("does NOT rotate on 429 — that parks the classifier via Retry-After", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false, status: 429, headers: new Map(),
      text: async () => "rate_limit_exceeded", json: async () => ({}),
    });
    const resolveProxy = vi.fn();

    const res = await classifyWithJev("Explain recursion", baseOptions({ resolveProxy }));

    expect(res).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(resolveProxy).not.toHaveBeenCalled();
  });

  it("still returns null with no resolver configured (single attempt)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(netFail());
    const res = await classifyWithJev("Explain recursion", baseOptions());
    expect(res).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("succeeds on the first attempt without touching the resolver", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jevOk("easy"));
    const resolveProxy = vi.fn();
    const res = await classifyWithJev("Explain recursion", baseOptions({ resolveProxy }));
    expect(res.difficulty).toBe("easy");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(resolveProxy).not.toHaveBeenCalled();
  });
});
