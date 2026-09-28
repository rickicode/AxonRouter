import { describe, it, expect, vi, afterEach } from "vitest";
import {
  handleDifficultyChat,
  classifyWithJev,
  TYPESAFE_SYSTEMONE_URL,
  ZEN_SYSTEMONE_URL,
} from "../../open-sse/services/combo.js";
import { setJevConnectionLoader } from "../../open-sse/services/jevUpstream.js";
import { getRoutingMetrics } from "../../open-sse/services/routingMetrics.js";

const quietLog = { info: () => {}, warn: () => {}, error: () => {} };

function okRes(text = "pong") {
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    clone() { return { json: async () => ({ choices: [{ message: { content: text } }] }), text: async () => text }; },
    json: async () => ({ choices: [{ message: { content: text } }] }),
    text: async () => text,
  };
}

function jevMockRes({ difficulty = "medium", confidence = 0.95, status = 200 } = {}) {
  if (status !== 200) {
    return {
      ok: false,
      status,
      headers: new Map(),
      text: async () => `HTTP ${status} error`,
      json: async () => ({ error: `HTTP ${status}` }),
    };
  }
  const payload = {
    answers: {
      difficulty: { type: "choice", choice: difficulty, confidence, probabilities: { [difficulty]: confidence } },
      ambiguity: { type: "choice", choice: "low", confidence: 0.9 },
      domain: { type: "choice", choice: "coding", confidence: 0.9 },
    },
    usage: { input_tokens: 10, output_tokens: 3 },
  };
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  };
}

/** In-memory connection pools keyed by provider id (no DB involved). */
function poolLoader(pools) {
  return async (provider) => pools[provider] || [];
}

function captureFetch() {
  const calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    calls.push({
      url: String(url),
      headers: init?.headers || {},
      body: JSON.parse(init?.body || "{}"),
    });
    return jevMockRes({ difficulty: "medium", confidence: 0.95 });
  });
  return calls;
}

afterEach(() => {
  setJevConnectionLoader(null); // restore the default connectionsRepo reader
  vi.restoreAllMocks();
});

describe("Jev upstream resolution across providers", () => {
  it("uses the TypeSafe connection pool round-robin for jev-latest", async () => {
    setJevConnectionLoader(
      poolLoader({
        typesafe: [
          { id: "c1", isActive: true, apiKey: "ts-key-1" },
          { id: "c2", isActive: true, apiKey: "ts-key-2" },
        ],
      })
    );
    const calls = captureFetch();

    const first = await classifyWithJev("Refactor the PostgreSQL partition pruning logic to respect the planner GUC.", {
      model: "jev-latest",
      log: quietLog,
    });
    const second = await classifyWithJev("Refactor the PostgreSQL partition pruning logic to respect the planner GUC.", {
      model: "jev-latest",
      log: quietLog,
    });

    expect(first?.source).toBe("jev");
    expect(second?.source).toBe("jev");
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.url).toBe(TYPESAFE_SYSTEMONE_URL);
      expect(call.body.model).toBe("jev-latest");
    }
    // round-robin: one key per classification, both pool keys used
    const keys = calls.map((c) => c.headers["Authorization"]);
    expect(new Set(keys)).toEqual(new Set(["Bearer ts-key-1", "Bearer ts-key-2"]));
  });

  it("routes to OpenCode Zen with jev-1.13-free when a Zen connection is active", async () => {
    setJevConnectionLoader(
      poolLoader({
        "opencode-zen": [{ id: "z1", isActive: true, apiKey: "zen-key" }],
        // a TypeSafe key exists too, but the Zen connection wins for a Zen model
        typesafe: [{ id: "t1", isActive: true, apiKey: "ts-key" }],
      })
    );
    const calls = captureFetch();

    const res = await classifyWithJev("Design a round-robin key rotation strategy for the classifier pool.", {
      model: "jev-1.13-free",
      provider: "opencode-zen",
      log: quietLog,
    });

    expect(res?.source).toBe("jev");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ZEN_SYSTEMONE_URL);
    expect(calls[0].body.model).toBe("jev-1.13-free");
    expect(calls[0].headers["Authorization"]).toBe("Bearer zen-key");
  });

  it("keeps an explicitly selected jev-latest on TypeSafe even when a Zen connection exists", async () => {
    setJevConnectionLoader(
      poolLoader({
        "opencode-zen": [{ id: "z1", isActive: true, apiKey: "zen-key" }],
        typesafe: [{ id: "t1", isActive: true, apiKey: "ts-key" }],
      })
    );
    const calls = captureFetch();

    await classifyWithJev("Explain how the judge threshold interacts with the escalation matrix.", {
      model: "jev-latest",
      log: quietLog,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(TYPESAFE_SYSTEMONE_URL);
    expect(calls[0].body.model).toBe("jev-latest");
    expect(calls[0].headers["Authorization"]).toBe("Bearer ts-key");
  });

  it("falls back to the settings/env key when no connection pool exists", async () => {
    setJevConnectionLoader(poolLoader({}));
    const calls = captureFetch();

    const res = await classifyWithJev("Summarize the incident timeline for the outage review.", {
      apiKey: "settings-key",
      log: quietLog,
    });

    expect(res?.source).toBe("jev");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(TYPESAFE_SYSTEMONE_URL);
    expect(calls[0].headers["Authorization"]).toBe("Bearer settings-key");
  });

  it("sends no request at all when the pinned upstream is unusable", async () => {
    setJevConnectionLoader(poolLoader({}));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await classifyWithJev("Explain how the judge threshold interacts with the escalation matrix.", {
      provider: "typesafe",
      apiKeys: {},
      log: quietLog,
    });

    expect(res).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("handleDifficultyChat model picker", () => {
  const runDifficulty = (tuning) =>
    handleDifficultyChat({
      body: {
        messages: [{ role: "user", content: "Optimize this PostgreSQL join query across large partitions." }],
        stream: false,
      },
      models: ["easy-a", "hard-a"],
      handleSingleModel: vi.fn(async () => okRes("pong")),
      log: quietLog,
      comboName: "picker-combo",
      judgeModel: "judge-model",
      tuning: {
        judgeMode: "jev-only",
        easyModels: ["easy-a"],
        hardModels: ["hard-a"],
        ...tuning,
      },
    });

  it("posts the selected Zen model to the OpenCode Zen endpoint", async () => {
    setJevConnectionLoader(
      poolLoader({ "opencode-zen": [{ id: "z1", isActive: true, apiKey: "zen-key" }] })
    );
    const calls = captureFetch();
    const before = getRoutingMetrics();

    const res = await runDifficulty({ jevModel: "jev-1.13-free" });

    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ZEN_SYSTEMONE_URL);
    expect(calls[0].body.model).toBe("jev-1.13-free");
    expect(getRoutingMetrics().jevUsed).toBe(before.jevUsed + 1);
  });

  it("posts the selected TypeSafe model to the TypeSafe endpoint", async () => {
    setJevConnectionLoader(
      poolLoader({ typesafe: [{ id: "t1", isActive: true, apiKey: "ts-key" }] })
    );
    const calls = captureFetch();

    const res = await runDifficulty({
      jevModel: "jev-latest",
      // would point at TypeSafe even though the picker model already decides it
      jevEndpoint: TYPESAFE_SYSTEMONE_URL,
    });

    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(TYPESAFE_SYSTEMONE_URL);
    expect(calls[0].body.model).toBe("jev-latest");
    expect(calls[0].headers["Authorization"]).toBe("Bearer ts-key");
  });

  it("routes to the keyless default upstream with no Authorization header when nothing is configured", async () => {
    setJevConnectionLoader(poolLoader({}));
    const calls = captureFetch();
    const decisions = [];

    const res = await handleDifficultyChat({
      body: {
        messages: [{ role: "user", content: "Walk through the retry budget semantics for the gateway." }],
        stream: false,
      },
      models: ["easy-a", "hard-a"],
      handleSingleModel: vi.fn(async () => okRes("pong")),
      log: quietLog,
      comboName: "keyless-default-combo",
      judgeModel: "judge-model",
      tuning: {
        judgeMode: "two-layer",
        easyModels: ["easy-a"],
        hardModels: ["hard-a"],
      },
      onDecision: (d) => decisions.push(d),
    });

    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://opencode.ai/zen/v1/systemone");
    expect(calls[0].body.model).toBe("jev-1.13-free");
    // keyless upstream: no credential is attached at all
    expect(Object.keys(calls[0].headers)).toEqual(["Content-Type"]);
    expect(calls[0].headers["Authorization"]).toBeUndefined();
    expect(decisions[0].source).toBe("jev");
    expect(decisions[0].jevProvider).toBe("opencode");
    expect(decisions[0].jevUsed).toBe(true);
  });

  it("uses the OpenCode Zen key pool when that provider is pinned", async () => {
    setJevConnectionLoader(
      poolLoader({ "opencode-zen": [{ id: "z1", isActive: true, apiKey: "zen-key" }] })
    );
    const calls = captureFetch();

    const res = await runDifficulty({ jevProvider: "opencode-zen" });

    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://opencode.ai/zen/v1/systemone");
    expect(calls[0].body.model).toBe("jev-1.13-free");
    expect(calls[0].headers["Authorization"]).toBe("Bearer zen-key");
  });

  it("degrades two-layer to llm-only when the pinned provider has no upstream", async () => {
    setJevConnectionLoader(poolLoader({}));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await handleDifficultyChat({
      body: {
        messages: [{ role: "user", content: "Walk through the retry budget semantics for the gateway." }],
        stream: false,
      },
      models: ["easy-a", "hard-a"],
      handleSingleModel: vi.fn(async (b, m) => okRes("pong")),
      log: quietLog,
      comboName: "no-upstream-combo",
      judgeModel: "judge-model",
      tuning: {
        judgeMode: "two-layer",
        jevProvider: "typesafe",
        jevApiKeys: {},
        easyModels: ["easy-a"],
        hardModels: ["hard-a"],
      },
    });

    expect(res.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
