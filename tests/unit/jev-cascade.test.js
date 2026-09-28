import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  handleDifficultyChat,
  classifyWithJev,
  TYPESAFE_SYSTEMONE_URL,
  ZEN_SYSTEMONE_URL,
} from "../../open-sse/services/combo.js";
import { setJevConnectionLoader } from "../../open-sse/services/jevUpstream.js";
import { getRoutingMetrics } from "../../open-sse/services/routingMetrics.js";

function okRes(text = "ok") {
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    clone() {
      return {
        json: async () => ({ choices: [{ message: { content: text } }] }),
        text: async () => text,
      };
    },
    json: async () => ({ choices: [{ message: { content: text } }] }),
    text: async () => text,
  };
}

function judgeRes(content) {
  const envelope = JSON.stringify({ choices: [{ message: { content } }] });
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    clone() {
      return {
        json: async () => JSON.parse(envelope),
        text: async () => envelope,
      };
    },
    json: async () => JSON.parse(envelope),
    text: async () => envelope,
  };
}

function jevMockRes({
  difficulty = "medium",
  ambiguity = "low",
  domain = "coding",
  confidence = 0.95,
  status = 200,
} = {}) {
  if (status !== 200) {
    return {
      ok: false,
      status,
      headers: new Map(),
      text: async () => `HTTP ${status} error from TypeSafe`,
      json: async () => ({ error: `HTTP ${status}` }),
    };
  }
  const payload = {
    model: "jev-latest",
    answers: {
      difficulty: {
        type: "choice",
        choice: difficulty,
        confidence,
        probabilities: { [difficulty]: confidence },
      },
      ambiguity: {
        type: "choice",
        choice: ambiguity,
        confidence: 0.9,
      },
      domain: {
        type: "choice",
        choice: domain,
        confidence: 0.9,
      },
    },
    usage: { input_tokens: 15, output_tokens: 4 },
  };
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  };
}

const quietLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("Jev Decision Cascade & Fail-Open Verification", () => {
  let savedApiKey;

  beforeEach(() => {
    savedApiKey = process.env.TYPESAFE_API_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setJevConnectionLoader(null);
    if (savedApiKey === undefined) {
      delete process.env.TYPESAFE_API_KEY;
    } else {
      process.env.TYPESAFE_API_KEY = savedApiKey;
    }
  });

  describe("Multi-Upstream & Model Resolution", () => {
    it("routes to OpenCode Zen with default jevModel = jev-1.13-free and asserts URL & model", async () => {
      setJevConnectionLoader(async (provider) => {
        if (provider === "opencode-zen") return [{ id: "zen-1", isActive: true, apiKey: "zen-test-key" }];
        return [];
      });
      let capturedUrl = "";
      let capturedBody = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(init?.body || "{}");
        return jevMockRes({ difficulty: "easy", confidence: 0.95 });
      });

      const executedModels = [];
      const decisions = [];
      const res = await handleDifficultyChat({
        body: { messages: [{ role: "user", content: "What is 2 + 2?" }], stream: false },
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel: async (b, m) => { executedModels.push(m); return okRes("ans"); },
        log: quietLog,
        comboName: "default-zen-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          // jevModel omitted -> defaults to jev-1.13-free
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
        onDecision: (d) => decisions.push(d),
      });

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe(ZEN_SYSTEMONE_URL);
      expect(capturedUrl).toBe("https://opencode.ai/zen/v1/systemone");
      expect(capturedBody.model).toBe("jev-1.13-free");
      expect(executedModels).toEqual(["model-easy-1"]);
      expect(executedModels).not.toContain("judge-llm-model");
      expect(decisions[0].source).toBe("jev");
      expect(decisions[0].jevUsed).toBe(true);
      expect(decisions[0].judgeUsed).toBe(false);
    });

    it("routes to TypeSafe when jevModel = jev-latest and asserts URL & model", async () => {
      setJevConnectionLoader(async (provider) => {
        if (provider === "typesafe") return [{ id: "ts-1", isActive: true, apiKey: "ts-pool-key" }];
        if (provider === "opencode-zen") return [{ id: "zen-1", isActive: true, apiKey: "zen-pool-key" }];
        return [];
      });
      let capturedUrl = "";
      let capturedBody = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(init?.body || "{}");
        return jevMockRes({ difficulty: "hard", confidence: 0.95 });
      });

      const executedModels = [];
      const decisions = [];
      const res = await handleDifficultyChat({
        body: { messages: [{ role: "user", content: "Optimize complex database indexes" }], stream: false },
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel: async (b, m) => { executedModels.push(m); return okRes("ans"); },
        log: quietLog,
        comboName: "typesafe-latest-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          jevModel: "jev-latest",
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
        onDecision: (d) => decisions.push(d),
      });

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe(TYPESAFE_SYSTEMONE_URL);
      expect(capturedUrl).toBe("https://api.typesafe.ai/v1/systemone");
      expect(capturedBody.model).toBe("jev-latest");
      expect(executedModels).toEqual(["model-hard-1"]);
      expect(executedModels).not.toContain("judge-llm-model");
      expect(decisions[0].source).toBe("jev");
      expect(decisions[0].jevUsed).toBe(true);
      expect(decisions[0].judgeUsed).toBe(false);
    });

    it("degrades two-layer to llm-only with 0 fetch when the pinned TypeSafe upstream has no key and no connection", async () => {
      // A keyless default upstream (OpenCode Free) always exists, so degradation
      // only happens when the pinned provider itself is unusable.
      setJevConnectionLoader(async () => []);

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const executedModels = [];
      const decisions = [];

      const res = await handleDifficultyChat({
        body: { messages: [{ role: "user", content: "Describe the event loop in Node.js" }], stream: false },
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel: async (b, m) => {
          executedModels.push(m);
          if (m === "judge-llm-model") {
            return judgeRes('{"difficulty":"medium","ambiguity":"low","domain":"coding","confidence":0.9}');
          }
          return okRes("ans");
        },
        log: quietLog,
        comboName: "pinned-unusable-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          jevProvider: "typesafe",
          jevApiKeys: {},
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
        onDecision: (d) => decisions.push(d),
      });

      expect(res.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(0);
      expect(executedModels[0]).toBe("judge-llm-model");
      expect(executedModels[1]).toBe("model-hard-1");
      expect(decisions[0].source).toBe("judge");
      expect(decisions[0].judgeUsed).toBe(true);
      expect(decisions[0].jevUsed).toBe(false);
    });
  });

  describe("Kasus 1: Confidence tinggi -> LLM judge TIDAK dipanggil", () => {
    it("routes directly via Jev when confidence >= threshold, completely bypassing LLM judge", async () => {
      const beforeMetrics = getRoutingMetrics();
      const executedModels = [];
      const decisions = [];

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jevMockRes({
          difficulty: "easy",
          ambiguity: "low",
          domain: "general",
          confidence: 0.96, // > 0.7 default threshold
        })
      );

      const handleSingleModel = vi.fn(async (body, model) => {
        executedModels.push(model);
        return okRes("primary-model-response");
      });

      const body = {
        messages: [
          {
            role: "user",
            content: "Explain the main differences between relational and document databases in high-level terms.",
          },
        ],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel,
        log: quietLog,
        comboName: "cascade-high-conf-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          jevProvider: "typesafe",
          jevApiKeys: { typesafe: "ts-live-key" },
          jevConfidenceThreshold: 0.7,
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
        onDecision: (d) => {
          decisions.push(d);
        },
      });

      expect(res.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // LLM judge must NOT be called at all
      expect(executedModels).not.toContain("judge-llm-model");
      expect(executedModels).toEqual(["model-easy-1"]);

      // Verify routing decision payload metadata
      const routeDecision = decisions[0];
      expect(routeDecision).toBeDefined();
      expect(routeDecision.source).toBe("jev");
      expect(routeDecision.tier).toBe("easy");
      expect(routeDecision.confidence).toBe(0.96);
      expect(routeDecision.judgeUsed).toBe(false);
      expect(routeDecision.jevUsed).toBe(true);
      expect(routeDecision.jevProvider).toBe("typesafe");
      expect(routeDecision.judgeModel).toBeNull();

      // Verify routing metrics
      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevUsed).toBe(beforeMetrics.jevUsed + 1);
      expect(afterMetrics.jevEscalated).toBe(beforeMetrics.jevEscalated);
      expect(afterMetrics.jevFallback).toBe(beforeMetrics.jevFallback);
    });

    it("respects custom jevConfidenceThreshold (confidence 0.88 >= custom threshold 0.85 -> no judge)", async () => {
      const executedModels = [];
      const decisions = [];

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jevMockRes({
          difficulty: "medium",
          ambiguity: "low",
          domain: "coding",
          confidence: 0.88,
        })
      );

      const handleSingleModel = vi.fn(async (body, model) => {
        executedModels.push(model);
        return okRes("response");
      });

      const body = {
        messages: [
          {
            role: "user",
            content: "Write a function to validate semantic version strings according to semver 2.0 specification.",
          },
        ],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel,
        log: quietLog,
        comboName: "custom-threshold-high-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          jevProvider: "typesafe",
          jevApiKeys: { typesafe: "ts-key-abc" },
          jevConfidenceThreshold: 0.85,
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
        onDecision: (d) => {
          decisions.push(d);
        },
      });

      expect(res.ok).toBe(true);
      expect(executedModels).toEqual(["model-hard-1"]);
      expect(executedModels).not.toContain("judge-llm-model");
      const routeDecision = decisions[0];
      expect(routeDecision.source).toBe("jev");
      expect(routeDecision.confidence).toBe(0.88);
      expect(routeDecision.judgeUsed).toBe(false);
    });
  });

  describe("Kasus 2: Confidence rendah -> fallback LLM judge", () => {
    it("escalates to LLM judge when Jev confidence is below default threshold (0.55 < 0.70)", async () => {
      const beforeMetrics = getRoutingMetrics();
      const callLog = [];
      const decisions = [];

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jevMockRes({
          difficulty: "easy",
          ambiguity: "medium",
          domain: "coding",
          confidence: 0.55, // Low confidence: below 0.70 threshold
        })
      );

      const handleSingleModel = vi.fn(async (body, model) => {
        callLog.push({ model, role: body?.messages?.[0]?.role });
        if (model === "judge-llm-model") {
          return judgeRes('{"difficulty":"hard","ambiguity":"low","domain":"coding","confidence":0.92}');
        }
        return okRes("routed-response");
      });

      const body = {
        messages: [
          {
            role: "user",
            content: "Design a fault-tolerant leader election protocol using Paxos and compare it with Raft.",
          },
        ],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel,
        log: quietLog,
        comboName: "cascade-low-conf-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          jevProvider: "typesafe",
          jevApiKeys: { typesafe: "ts-live-key" },
          jevConfidenceThreshold: 0.7,
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
        onDecision: (d) => {
          decisions.push(d);
        },
      });

      expect(res.ok).toBe(true);
      expect(callLog.length).toBe(2);
      expect(callLog[0].model).toBe("judge-llm-model"); // 1st: LLM judge called as fallback
      expect(callLog[1].model).toBe("model-hard-1"); // 2nd: hard model selected by judge

      const routeDecision = decisions[0];
      expect(routeDecision).toBeDefined();
      expect(routeDecision.source).toBe("judge");
      expect(routeDecision.tier).toBe("hard");
      expect(routeDecision.judgeUsed).toBe(true);
      expect(routeDecision.jevUsed).toBe(false);
      expect(routeDecision.judgeModel).toBe("judge-llm-model");

      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevEscalated).toBe(beforeMetrics.jevEscalated + 1);
    });

    it("escalates to LLM judge when custom threshold is raised (0.75 < custom threshold 0.80)", async () => {
      const callLog = [];

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jevMockRes({
          difficulty: "easy",
          ambiguity: "low",
          domain: "general",
          confidence: 0.75, // Lower than custom 0.80
        })
      );

      const handleSingleModel = vi.fn(async (body, model) => {
        callLog.push(model);
        if (model === "judge-llm-model") {
          return judgeRes('{"difficulty":"medium","ambiguity":"low","domain":"general","confidence":0.85}');
        }
        return okRes("ok");
      });

      const body = {
        messages: [
          {
            role: "user",
            content: "Synthesize the historical causes leading to the fall of the Western Roman Empire.",
          },
        ],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel,
        log: quietLog,
        comboName: "custom-threshold-low-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          jevProvider: "typesafe",
          jevApiKeys: { typesafe: "ts-key" },
          jevConfidenceThreshold: 0.80,
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
      });

      expect(res.ok).toBe(true);
      expect(callLog[0]).toBe("judge-llm-model");
      expect(callLog[1]).toBe("model-hard-1");
    });
  });

  describe("Kasus 3: Timeout / Error Jev -> fallback LLM judge", () => {
    it("falls back to LLM judge on Jev HTTP error (500 Internal Server Error)", async () => {
      const beforeMetrics = getRoutingMetrics();
      const callLog = [];
      const decisions = [];

      vi.spyOn(globalThis, "fetch").mockResolvedValue(jevMockRes({ status: 500 }));

      const handleSingleModel = vi.fn(async (body, model) => {
        callLog.push(model);
        if (model === "judge-llm-model") {
          return judgeRes('{"difficulty":"medium","ambiguity":"low","domain":"coding","confidence":0.88}');
        }
        return okRes("data");
      });

      const body = {
        messages: [
          {
            role: "user",
            content: "Implement an LRU cache with O(1) get and put operations in Python.",
          },
        ],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel,
        log: quietLog,
        comboName: "jev-http-error-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          jevProvider: "typesafe",
          jevApiKeys: { typesafe: "ts-key-live" },
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
        onDecision: (d) => {
          decisions.push(d);
        },
      });

      expect(res.ok).toBe(true);
      expect(callLog[0]).toBe("judge-llm-model"); // LLM judge invoked
      expect(callLog[1]).toBe("model-hard-1");
      const routeDecision = decisions[0];
      expect(routeDecision.source).toBe("judge");
      expect(routeDecision.judgeUsed).toBe(true);
      expect(routeDecision.jevUsed).toBe(false);

      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevFallback).toBe(beforeMetrics.jevFallback + 1);
    });

    it("falls back to LLM judge on network connection error (rejection)", async () => {
      const beforeMetrics = getRoutingMetrics();
      const callLog = [];

      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:443"));

      const handleSingleModel = vi.fn(async (body, model) => {
        callLog.push(model);
        if (model === "judge-llm-model") {
          return judgeRes('{"difficulty":"hard","ambiguity":"low","domain":"coding","confidence":0.95}');
        }
        return okRes("data");
      });

      const body = {
        messages: [
          {
            role: "user",
            content: "Write a high-performance memory allocator in C++ using arenas.",
          },
        ],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel,
        log: quietLog,
        comboName: "jev-network-error-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          jevProvider: "typesafe",
          jevApiKeys: { typesafe: "ts-key-live" },
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
      });

      expect(res.ok).toBe(true);
      expect(callLog[0]).toBe("judge-llm-model");
      expect(callLog[1]).toBe("model-hard-1");

      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevFallback).toBe(beforeMetrics.jevFallback + 1);
    });

    it("falls back to LLM judge on Jev client timeout", async () => {
      const beforeMetrics = getRoutingMetrics();
      const callLog = [];

      // Simulate a fetch that times out / aborts
      vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
        return new Promise((resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted due to timeout", "AbortError"));
            });
          }
          // Do not resolve normally within timeout window
        });
      });

      const handleSingleModel = vi.fn(async (body, model) => {
        callLog.push(model);
        if (model === "judge-llm-model") {
          return judgeRes('{"difficulty":"easy","ambiguity":"low","domain":"general","confidence":0.8}');
        }
        return okRes("ok");
      });

      const body = {
        messages: [
          {
            role: "user",
            content: "Explain the significance of the Rosetta Stone in modern linguistic decipherment.",
          },
        ],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel,
        log: quietLog,
        comboName: "jev-timeout-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          jevProvider: "typesafe",
          jevApiKeys: { typesafe: "ts-key-live" },
          jevTimeoutMs: 50, // Short timeout for rapid test
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
      });

      expect(res.ok).toBe(true);
      expect(callLog[0]).toBe("judge-llm-model");
      expect(callLog[1]).toBe("model-easy-1");

      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevFallback).toBe(beforeMetrics.jevFallback + 1);
    });
  });

  describe("Kasus 4: pinned provider without credentials -> mode llm-only (fail-open)", () => {
    it("degrades a pinned TypeSafe provider with no key to llm-only and still runs the LLM judge", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const callLog = [];
      const decisions = [];

      const handleSingleModel = vi.fn(async (body, model) => {
        callLog.push(model);
        if (model === "judge-llm-model") {
          return judgeRes('{"difficulty":"medium","ambiguity":"low","domain":"coding","confidence":0.9}');
        }
        return okRes("pong");
      });

      const body = {
        messages: [
          {
            role: "user",
            content: "Summarize the typical responsibilities of an authentication service in a web platform.",
          },
        ],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel,
        log: quietLog,
        comboName: "failopen-no-key-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          jevProvider: "typesafe",
          jevApiKeys: {},
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
        onDecision: (d) => {
          decisions.push(d);
        },
      });

      expect(res.ok).toBe(true);

      // fetch (TypeSafe Jev) was NEVER called — avoided doomed round-trip
      expect(fetchSpy).not.toHaveBeenCalled();

      // Directly called the LLM judge
      expect(callLog[0]).toBe("judge-llm-model");
      expect(callLog[1]).toBe("model-hard-1");

      const routeDecision = decisions[0];
      expect(routeDecision).toBeDefined();
      expect(routeDecision.source).toBe("judge");
      expect(routeDecision.tier).toBe("hard");
      expect(routeDecision.judgeUsed).toBe(true);
      expect(routeDecision.jevUsed).toBe(false);
      expect(routeDecision.judgeModel).toBe("judge-llm-model");
    });

    it("degrades to llm-only when the pinned TypeSafe provider has no jevApiKeys entry and env var is not set", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const callLog = [];

      const handleSingleModel = vi.fn(async (body, model) => {
        callLog.push(model);
        if (model === "judge-llm-model") {
          return judgeRes('{"difficulty":"hard","ambiguity":"low","domain":"coding","confidence":0.9}');
        }
        return okRes("response");
      });

      const body = {
        messages: [
          {
            role: "user",
            content: "Analyze performance bottlenecks in an asynchronous event dispatch loop.",
          },
        ],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel,
        log: quietLog,
        comboName: "failopen-omitted-key-combo",
        judgeModel: "judge-llm-model",
        tuning: {
          judgeMode: "two-layer",
          jevProvider: "typesafe",
          // jevApiKeys omitted
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
      });

      expect(res.ok).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(callLog[0]).toBe("judge-llm-model");
      expect(callLog[1]).toBe("model-hard-1");
    });

    it("operates fail-open even when neither TypeSafe key nor judgeModel is provided (policy fallback)", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const callLog = [];
      const decisions = [];

      const handleSingleModel = vi.fn(async (body, model) => {
        callLog.push(model);
        return okRes("fallback-response");
      });

      const body = {
        messages: [
          {
            role: "user",
            content: "Discuss the architectural patterns of asynchronous streaming servers.",
          },
        ],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["model-easy-1", "model-med-1", "model-hard-1"],
        handleSingleModel,
        log: quietLog,
        comboName: "no-key-no-judge-combo",
        judgeModel: null, // No LLM judge either
        tuning: {
          judgeMode: "two-layer",
          jevProvider: "typesafe",
          jevApiKeys: {},
          policy: "balanced", // balanced two-tier default: easy
          easyModels: ["model-easy-1"],
          hardModels: ["model-hard-1"],
        },
        onDecision: (d) => {
          decisions.push(d);
        },
      });

      expect(res.ok).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
      // Routed directly to policy default (easy under 2-tier balanced) without throwing
      expect(callLog).toEqual(["model-easy-1"]);
      expect(decisions[0].tier).toBe("easy");
    });
  });

  describe("Direct classifyWithJev fail-open validation", () => {
    it("handles missing API key gracefully by not throwing and returning null on 401 from server", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jevMockRes({ status: 401 })
      );

      const res = await classifyWithJev("Analyze this query", {
        apiKey: "",
        log: quietLog,
      });

      expect(res).toBeNull();
    });

    it("handles malformed JSON response from server fail-open", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "application/json"]]),
        text: async () => "Not Valid JSON",
        json: async () => {
          throw new SyntaxError("Unexpected token in JSON");
        },
      });

      const res = await classifyWithJev("Explain quantum computing basics", {
        apiKey: "some-key",
        log: quietLog,
      });

      expect(res).toBeNull();
    });
  });
});
