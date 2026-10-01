// Egress rotation must work on the PRODUCTION path.
//
// The rotation inside classifyWithJev is gated on `options.resolveProxy`. The
// production caller is handleDifficultyChat, which resolves the Jev target itself
// and then hands classifyWithJev a pre-built `target` — so `resolveProxy` has to
// be forwarded explicitly. It wasn't: it was passed to resolveJevTarget and then
// dropped, which made `canRotate` permanently falsy and escalated on the first
// dead egress every time. Production ran with a 30% classifier failure rate
// (error_network, all "[ProxyFetch] Proxy failed") while the pools themselves were
// healthy.
//
// The existing unit test could not catch this: it calls classifyWithJev directly
// with resolveProxy in its options, which is a path production never takes. Every
// test here therefore goes through handleDifficultyChat.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleDifficultyChat } from "../../open-sse/services/combo.js";

const quietLog = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

const POOL_A = "11111111-1111-1111-1111-111111111111";
const POOL_B = "22222222-2222-2222-2222-222222222222";

const jevOk = () => ({
  ok: true, status: 200, headers: new Map([["content-type", "application/json"]]),
  json: async () => ({
    answers: {
      difficulty: { type: "choice", choice: "hard", confidence: 0.95 },
      ambiguity: { type: "choice", choice: "low", confidence: 0.95 },
      domain: { type: "choice", choice: "coding", confidence: 0.95 },
    },
    usage: { input_tokens: 10, output_tokens: 2 },
  }),
  text: async () => "{}",
});

const netFail = () => ({
  __error: new Error("[ProxyFetch] Proxy failed, no direct fallback (failClosedProxy=true): fetch failed"),
  __timeout: false, status: 0, text: async () => "proxy fetch failed",
});

const proxyOpts = (poolId) => ({
  connectionProxyEnabled: true,
  connectionProxyUrl: "http://proxy.invalid",
  connectionNoProxy: "",
  proxyPoolId: poolId,
});

/** A Jev upstream that is already resolved — what handleDifficultyChat builds. */
const RESOLVED_TARGET = {
  available: true,
  provider: "opencode",
  model: "jev-1.13-free",
  endpoint: "https://opencode.invalid/v1/systemone",
  proxyOptions: proxyOpts(POOL_A),
};

let seq = 0;
function tuning(extra = {}) {
  return {
    judgeMode: "jev-only",
    jevModel: `jev-1.13-free#${++seq}`,
    jevConfidenceThreshold: 0.5,
    easyModels: ["easy-a"],
    hardModels: ["hard-a"],
    ...extra,
  };
}

function run(tun, resolveProxy) {
  return handleDifficultyChat({
    // The session-tier cache is keyed off a fingerprint of the messages, so an
    // identical body in a later test would hit the cache and never classify at
    // all — the classifier assertions would then pass vacuously. A unique token per
    // call keeps every test on the classification path.
    body: {
      messages: [{ role: "user", content: `Explain recursion across large partitions. nonce-${++seq}` }],
      stream: false,
    },
    models: ["easy-a", "hard-a"],
    handleSingleModel: vi.fn(async () => ({
      ok: true,
      clone: () => ({ text: async () => JSON.stringify({ choices: [{ message: { content: "{}" } }] }) }),
    })),
    log: quietLog,
    comboName: "rotation-combo",
    judgeModel: "judge-model",
    tuning: tun,
    resolveProxy,
  });
}

describe("JEV egress rotation on the production path", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("retries through a different pool instead of escalating on the first dead one", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(netFail())
      .mockResolvedValueOnce(jevOk());

    // First resolution is the one handleDifficultyChat already did; the second is
    // the rotation, which must EXCLUDE the pool that just failed.
    const resolveProxy = vi.fn(async (_target, excludePoolIds) =>
      proxyOpts(excludePoolIds?.includes(POOL_A) ? POOL_B : POOL_A)
    );

    const res = await run(tuning({ jevEndpoint: undefined }), resolveProxy);

    expect(res.ok).toBe(true);
    // Two egress attempts: the regression made this exactly one.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(resolveProxy).toHaveBeenCalled();
    // And the replacement must not be the pool that just failed.
    const rotationCall = resolveProxy.mock.calls[resolveProxy.mock.calls.length - 1];
    expect(rotationCall[1]).toContain(POOL_A);
    expect(rotationCall[1]).not.toContain(POOL_B);
  });

  it("still gives up once the egress attempts are spent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(netFail());
    const resolveProxy = vi.fn(async (_t, exclude) => proxyOpts(exclude?.includes(POOL_A) ? POOL_B : POOL_A));

    await run(tuning(), resolveProxy);

    // Bounded, not infinite: the rotation must not turn one classification into an
    // unbounded retry loop against a proxy account that is refusing everything.
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("does not rotate when the upstream is rate-limited — Retry-After parks it", async () => {
    // 429 parks the whole classifier via cooldown; a new egress IP cannot help, and
    // retrying would just burn the proxy budget.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false, status: 429, headers: new Map([["retry-after", "30"]]),
      text: async () => "rate_limit_exceeded", json: async () => ({}),
    });
    const resolveProxy = vi.fn(async () => proxyOpts(POOL_B));

    await run(tuning(), resolveProxy);

    // Exactly one upstream call, and exactly ONE resolveProxy call: the initial
    // attach. A second call would be the rotation we are asserting does not happen.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(resolveProxy).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a rotation when no proxy resolver is wired at all", async () => {
    // Direct egress / no proxy: a transport failure has nothing to rotate to, and
    // must not throw while discovering that.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(netFail());
    await expect(run(tuning(), undefined)).resolves.toBeDefined();
    // Whatever it attempted, it must not have looped.
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("does not rotate when the first attempt succeeds", async () => {
    // The regression signal is a *rotation* on a healthy call, not a fetch count:
    // pool-fitness marks left by the 429 case above are module-level, so they can
    // make a later call's proxy resolution collapse to direct egress and take the
    // fetch out of the picture entirely. resolveProxy call count is the stable
    // observable: one attach, no rotation.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jevOk());
    const resolveProxy = vi.fn(async () => proxyOpts(POOL_A));

    await run(tuning(), resolveProxy);

    expect(resolveProxy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
