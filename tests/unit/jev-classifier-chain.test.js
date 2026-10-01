// Operator-configurable classifier chain: an ordered ladder of classifier
// upstreams tried left to right until one answers.
//
// The contract under test:
//   • any model on any provider is selectable (mode "judge"), alongside the
//     registry-declared System One upstreams (mode "jev");
//   • a hop only hands over to the next one on a real failure (dead call, parked
//     cooldown, unusable upstream, throwing hop) — never on a valid-but-low
//     confidence answer, which is escalated by the caller instead;
//   • with no chain configured, the legacy single (model, provider) pair still
//     resolves, so nothing that worked before changes behaviour.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { classifyWithJevChain } from "../../open-sse/services/combo.js";
import { resolveJevChainTargets, setJevConnectionLoader } from "../../open-sse/services/jevUpstream.js";
import {
  JEV_CHAIN_MAX_ENTRIES,
  jevChainEntryLabel,
  jevChainFromLegacy,
  normalizeJevChain,
  resolveJevChainConfig,
} from "../../open-sse/config/jevChain.js";

const quietLog = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

// jevCooldowns is module-level and keyed by endpoint+model, so give each test its
// own model id to keep a 429 in one test from parking the classifier elsewhere.
let seq = 0;
const uniq = (p) => `${p}#${++seq}`;

function jevOk(difficulty = "hard", confidence = 0.9) {
  return {
    ok: true, status: 200, headers: new Map([["content-type", "application/json"]]),
    json: async () => ({
      answers: {
        difficulty: { type: "choice", choice: difficulty, confidence },
        ambiguity: { type: "choice", choice: "low", confidence: 0.9 },
        domain: { type: "choice", choice: "coding", confidence: 0.9 },
      },
      usage: { input_tokens: 10, output_tokens: 2 },
    }),
    text: async () => "{}",
  };
}

const netFail = () => ({
  __error: new Error("proxy fetch failed"), __timeout: false, status: 0, text: async () => "proxy fetch failed",
});

const rateLimited = () => ({
  ok: false, status: 429, headers: new Map(), text: async () => "rate_limit_exceeded", json: async () => ({}),
});

/** A resolved System One hop, shaped like what resolveJevTarget hands over. */
function hopTarget(provider, model) {
  return {
    available: true,
    provider,
    model,
    endpoint: `https://${provider}.invalid/v1/systemone`,
    connectionId: `conn-${provider}`,
    // No proxyOptions + no resolveProxy => a single attempt per hop, which keeps
    // the "one fetch per hop" assertions exact.
  };
}

/** classifyWithJudge reads the verdict out of an OpenAI-shaped chat response. */
function judgeOk({ difficulty = "easy", ambiguity = "low", domain = "coding", confidence = 0.9 } = {}) {
  const verdict = JSON.stringify({ difficulty, ambiguity, domain, confidence });
  return async () => ({ ok: true, clone: () => ({ text: async () => JSON.stringify({ choices: [{ message: { content: verdict } }] }) }) });
}

const usableFor = (chain) =>
  chain.filter((e) => e.mode === "jev").map((entry) => ({ entry, target: hopTarget(entry.provider, entry.model) }));

function runChain(chain, extra = {}) {
  return classifyWithJevChain("Explain recursion in one paragraph", {
    chain,
    usable: usableFor(chain),
    log: quietLog,
    comboName: "chain-test",
    recordUsage: false,
    ...extra,
  });
}

describe("jevChain normalization", () => {
  it("keeps registry-declared jev entries and drops the rest", () => {
    const out = normalizeJevChain([
      { mode: "jev", provider: "typesafe", model: "jev-latest" },
      { mode: "jev", provider: "not-a-provider", model: "jev-latest" },
      { mode: "jev", provider: "typesafe", model: "not-a-jev-model" },
      { model: "" },
      null,
      "nope",
    ]);
    expect(out).toEqual([{ mode: "jev", provider: "typesafe", model: "jev-latest" }]);
  });

  it("parses a provider-qualified model and the systemone synonym", () => {
    expect(normalizeJevChain([{ mode: "systemone", model: "typesafe/jev-latest" }])).toEqual([
      { mode: "jev", provider: "typesafe", model: "jev-latest" },
    ]);
  });

  it("accepts ANY model on ANY provider in judge mode", () => {
    const out = normalizeJevChain([
      { mode: "judge", model: "gpt-5.6-luna" },
      { mode: "judge", provider: "openrouter", model: "qwen3.8-27b" },
      { mode: "judge", model: "some/unlisted/model-from-a-compat-node" },
    ]);
    // The point of the mode: none of these are registry classifier models.
    expect(out).toHaveLength(3);
    expect(out.every((e) => e.mode === "judge")).toBe(true);
    expect(out[1]).toEqual({ mode: "judge", provider: "openrouter", model: "qwen3.8-27b" });
  });

  it("rejects an unknown mode", () => {
    expect(normalizeJevChain([{ mode: "psychic", model: "gpt-5.6-luna" }])).toEqual([]);
  });

  it("de-duplicates identical hops so a fallback cannot retry a dead endpoint", () => {
    const out = normalizeJevChain([
      { mode: "jev", provider: "typesafe", model: "jev-latest" },
      { mode: "jev", provider: "typesafe", model: "jev-latest" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("caps the ladder so one request can never fan out unbounded", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ mode: "judge", model: `judge-model-${i}` }));
    expect(normalizeJevChain(many).length).toBeLessThanOrEqual(JEV_CHAIN_MAX_ENTRIES);
  });

  it("labels entries as provider/model, or bare model when unpinned", () => {
    expect(jevChainEntryLabel({ mode: "jev", provider: "typesafe", model: "jev-latest" })).toBe("typesafe/jev-latest");
    expect(jevChainEntryLabel({ mode: "judge", provider: "", model: "gpt-5.6-luna" })).toBe("gpt-5.6-luna");
  });
});

describe("chain config resolution (backward compatible)", () => {
  it("prefers an explicit chain over the legacy pair", () => {
    const { chain, source } = resolveJevChainConfig({
      jevChain: [{ mode: "judge", model: "gpt-5.6-luna" }],
      jevModel: "typesafe/jev-latest",
      jevProvider: "typesafe",
    });
    expect(source).toBe("chain");
    expect(chain).toEqual([{ mode: "judge", provider: "", model: "gpt-5.6-luna" }]);
  });

  it("derives a one-entry chain from the legacy pair when no chain is set", () => {
    const { chain, source } = resolveJevChainConfig({ jevModel: "jev-latest", jevProvider: "typesafe" });
    expect(source).toBe("legacy");
    expect(chain).toEqual([{ mode: "jev", provider: "typesafe", model: "jev-latest" }]);
  });

  it("leaves resolution to the registry when nothing is configured", () => {
    expect(resolveJevChainConfig({})).toEqual({ chain: [], source: "auto" });
    expect(jevChainFromLegacy({ jevModel: "", jevProvider: "" })).toEqual([]);
  });
});

describe("resolveJevChainTargets", () => {
  afterEach(() => setJevConnectionLoader(null));

  it("resolves each jev hop independently and drops the ones with no key", async () => {
    // typesafe is keyPool-backed: one connection makes it usable, none makes it not.
    setJevConnectionLoader(async (provider) =>
      // loadPool keeps a connection only when it carries a non-empty apiKey.
      provider === "typesafe" ? [{ id: "conn-1", name: "ts", apiKey: "ts-key", providerSpecificData: {} }] : []
    );
    const chain = normalizeJevChain([
      { mode: "jev", provider: "typesafe", model: "jev-latest" },
      { mode: "jev", provider: "beatapi", model: "jev-1.13-free" },
      { mode: "judge", model: "gpt-5.6-luna" },
    ]);
    const { usable, skipped } = await resolveJevChainTargets({ chain }, quietLog);

    expect(usable.map((u) => u.entry.provider)).toEqual(["typesafe"]);
    expect(usable[0].target.endpoint).toBeTruthy();
    // The judge hop is not a System One upstream, so there is nothing to resolve —
    // it is reported as skipped with a distinct reason rather than silently lost.
    expect(skipped.find((s) => s.mode === "judge")?.reason).toBe("judge-entry");
    expect(skipped.find((s) => s.provider === "beatapi")?.reason).toMatch(/key|connection/i);
  });

  it("returns empty lists for a blank chain instead of throwing", async () => {
    await expect(resolveJevChainTargets({ chain: [] }, quietLog)).resolves.toEqual({ usable: [], skipped: [] });
    await expect(resolveJevChainTargets({}, quietLog)).resolves.toEqual({ usable: [], skipped: [] });
  });
});

describe("classifyWithJevChain fallback", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("answers from the first hop when it succeeds", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jevOk("easy"));
    const res = await runChain([{ mode: "jev", provider: "opencode", model: uniq("jev-1.13-free") }]);

    expect(res.difficulty).toBe("easy");
    expect(res.chainSource).toMatch(/^opencode\//);
    expect(res.chainAttempts).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls through to the next System One hop when the first one's call dies", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(netFail()).mockResolvedValueOnce(jevOk("hard"));
    const res = await runChain([
      { mode: "jev", provider: "opencode", model: uniq("jev-1.13-free") },
      { mode: "jev", provider: "typesafe", model: uniq("jev-latest") },
    ]);

    expect(res).not.toBeNull();
    expect(res.difficulty).toBe("hard");
    expect(res.chainAttempts).toBe(1);
    expect(res.chainSource).toMatch(/^typesafe\//);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("stops re-calling a rate-limited hop once it is parked", async () => {
    // A 429 parks the upstream via Retry-After, so the next classification sees
    // cooldownActive without spending a request. That is the fallback the chain
    // exists for: the ladder moves on instead of every request eating a 429.
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValue(jevOk("hard"));
    const chain = [
      { mode: "jev", provider: "opencode", model: uniq("jev-1.13-free") },
      { mode: "jev", provider: "typesafe", model: uniq("jev-latest") },
    ];

    // First pass: hop 1 is 429'd, hop 2 answers.
    const first = await runChain(chain);
    expect(first.chainSource).toMatch(/^typesafe\//);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Second pass: hop 1 is parked, so it is skipped WITHOUT a request and only
    // hop 2 is called — one fetch, not two.
    const second = await runChain(chain);
    expect(second).not.toBeNull();
    expect(second.chainSource).toMatch(/^typesafe\//);
    expect(second.chainAttempts).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("skips a hop with no resolved upstream without spending a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jevOk("hard"));
    const chain = [{ mode: "jev", provider: "typesafe", model: uniq("jev-latest") }];
    // Empty `usable`: as if resolveJevChainTargets found no key for that provider.
    const res = await classifyWithJevChain("Explain recursion", {
      chain, usable: [], log: quietLog, comboName: "chain-test", recordUsage: false,
    });

    expect(res).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("routes a judge hop through the normal chat path with any model", async () => {
    const handleSingleModel = vi.fn(judgeOk({ difficulty: "easy" }));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await runChain([{ mode: "judge", model: "some-provider/some-model" }], { handleSingleModel });

    expect(handleSingleModel).toHaveBeenCalledTimes(1);
    // The hop's model reaches the chat router untouched — that is what makes
    // "any provider" work rather than only registry classifier models.
    expect(handleSingleModel.mock.calls[0][1]).toBe("some-provider/some-model");
    expect(fetchSpy).not.toHaveBeenCalled(); // judge hops never touch System One
    expect(res.tier).toBe("easy");
    expect(res.chainSource).toBe("some-provider/some-model");
  });

  it("preserves the operator's order across mixed jev and judge hops", async () => {
    // Hop 1 (System One) dies, hop 2 is the judge — so the judge must answer, and
    // hop 3 must never be reached.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(netFail());
    const handleSingleModel = vi.fn(judgeOk({ difficulty: "hard" }));
    const res = await runChain(
      [
        { mode: "jev", provider: "opencode", model: uniq("jev-1.13-free") },
        { mode: "judge", model: "judge-model-a" },
        { mode: "judge", model: "judge-model-b" },
      ],
      { handleSingleModel }
    );

    expect(handleSingleModel).toHaveBeenCalledTimes(1);
    expect(handleSingleModel.mock.calls[0][1]).toBe("judge-model-a");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.chainSource).toBe("judge-model-a");
  });

  it("keeps a low-confidence answer instead of laundering it through another hop", async () => {
    // A valid-but-uncertain verdict is escalated by the caller, not re-asked: a
    // second classifier's higher number would be a fabricated confidence.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jevOk("easy", 0.2));
    const handleSingleModel = vi.fn();
    const res = await runChain(
      [
        { mode: "jev", provider: "opencode", model: uniq("jev-1.13-free") },
        { mode: "judge", model: "judge-model-a" },
      ],
      { handleSingleModel }
    );

    expect(res).not.toBeNull();
    expect(res.confidence).toBe(0.2);
    expect(res.chainSource).toMatch(/^opencode\//);
    expect(res.chainAttempts).toBe(0);
    expect(handleSingleModel).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("contains a throwing hop and keeps going", async () => {
    const handleSingleModel = vi
      .fn()
      .mockRejectedValueOnce(new Error("judge exploded"))
      .mockImplementationOnce(judgeOk({ difficulty: "easy" }));
    const res = await runChain(
      [
        { mode: "judge", model: "judge-model-a" },
        { mode: "judge", model: "judge-model-b" },
      ],
      { handleSingleModel }
    );

    expect(handleSingleModel).toHaveBeenCalledTimes(2);
    expect(res).not.toBeNull();
    expect(res.chainSource).toBe("judge-model-b");
    expect(res.chainAttempts).toBe(1);
  });

  it("returns null when every hop is spent, so the caller can escalate", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(netFail());
    const res = await runChain([
      { mode: "jev", provider: "opencode", model: uniq("jev-1.13-free") },
      { mode: "jev", provider: "typesafe", model: uniq("jev-latest") },
    ]);
    expect(res).toBeNull();
  });

  it("returns null for an empty chain without touching the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(classifyWithJevChain("x", { chain: [], usable: [], log: quietLog })).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
