import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDifficultyChat, classifyWithJev, TYPESAFE_SYSTEMONE_URL } from "../../open-sse/services/combo.js";
import { getRoutingMetrics } from "../../open-sse/services/routingMetrics.js";

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

function judgeRes(content) {
  const envelope = JSON.stringify({ choices: [{ message: { content } }] });
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    clone() { return { json: async () => JSON.parse(envelope), text: async () => envelope }; },
    json: async () => JSON.parse(envelope),
    text: async () => envelope,
  };
}

function jevMockRes({ difficulty = "easy", ambiguity = "low", domain = "general", confidence = 0.95, status = 200 } = {}) {
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
    model: "jev-latest",
    answers: {
      difficulty: { type: "choice", choice: difficulty, confidence, probabilities: { [difficulty]: confidence } },
      ambiguity: { type: "choice", choice: ambiguity, confidence: 0.9 },
      domain: { type: "choice", choice: domain, confidence: 0.9 },
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

const quietLog = { info: () => {}, warn: () => {}, error: () => {} };

describe("TypeSafe Jev classifier and judgeMode cascade", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("classifyWithJev client", () => {
    it("connects to default TYPESAFE_SYSTEMONE_URL with Bearer token and valid body", async () => {
      let capturedUrl = "";
      let capturedInit = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return jevMockRes({ difficulty: "medium", ambiguity: "low", domain: "coding", confidence: 0.92 });
      });

      const body = {
        messages: [{ role: "user", content: "Implement a binary search algorithm in TypeScript" }],
        stream: false,
      };

      const res = await classifyWithJev(body, {
        apiKey: "ts-test-key-123",
        policy: "balanced",
      });

      expect(res).not.toBeNull();
      expect(capturedUrl).toBe(TYPESAFE_SYSTEMONE_URL);
      expect(capturedInit.method).toBe("POST");
      expect(capturedInit.headers["Authorization"]).toBe("Bearer ts-test-key-123");
      expect(capturedInit.headers["Content-Type"]).toBe("application/json");

      const sentBody = JSON.parse(capturedInit.body);
      expect(sentBody.model).toBe("jev-latest");
      expect(sentBody.state).toContain("Implement a binary search");
      expect(sentBody.questions.difficulty).toBeDefined();

      expect(res.source).toBe("jev");
      expect(res.difficulty).toBe("medium");
      expect(res.ambiguity).toBe("low");
      expect(res.domain).toBe("coding");
      expect(res.confidence).toBe(0.92);
      expect(res.tier).toBe("hard");
    });

    it("handles non-200 HTTP response gracefully and returns null", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jevMockRes({ status: 500 }));

      const res = await classifyWithJev("Explain recursion", {
        apiKey: "test-key",
        log: quietLog,
      });

      expect(res).toBeNull();
    });

    it("handles network error/rejection gracefully and returns null", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network connection refused"));

      const res = await classifyWithJev("Explain recursion", {
        apiKey: "test-key",
        log: quietLog,
      });

      expect(res).toBeNull();
    });

    it("returns null on empty prompt/body", async () => {
      const res = await classifyWithJev({ messages: [] }, { apiKey: "test-key" });
      expect(res).toBeNull();
    });
  });

  describe("judgeMode: 'two-layer' (Jev primary -> LLM fallback)", () => {
    it("primary Jev high confidence (> threshold): routes immediately without calling LLM judge", async () => {
      const beforeMetrics = getRoutingMetrics();
      const calls = [];

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jevMockRes({ difficulty: "medium", ambiguity: "low", domain: "coding", confidence: 0.95 })
      );

      const handleSingleModel = vi.fn(async (b, m) => {
        calls.push(m);
        return okRes("pong");
      });

      const body = {
        messages: [{ role: "user", content: "Optimize this PostgreSQL join query across large partitions." }],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["easy-a", "hard-a"],
        handleSingleModel,
        log: quietLog,
        comboName: "two-layer-combo",
        judgeModel: "judge-model",
        tuning: {
          judgeMode: "two-layer",
          jevConfidenceThreshold: 0.7,
          easyModels: ["easy-a"],
          hardModels: ["hard-a"],
        },
      });

      expect(res.ok).toBe(true);
      expect(calls).toEqual(["hard-a"]); // judge-model was NOT called
      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevUsed).toBe(beforeMetrics.jevUsed + 1);
      expect(afterMetrics.jevEscalated).toBe(beforeMetrics.jevEscalated);
      expect(afterMetrics.jevFallback).toBe(beforeMetrics.jevFallback);
    });

    it("primary Jev low confidence (< threshold): escalates to LLM judge and bumps jevEscalated", async () => {
      const beforeMetrics = getRoutingMetrics();
      const calls = [];

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jevMockRes({ difficulty: "easy", ambiguity: "low", domain: "general", confidence: 0.55 }) // < 0.7
      );

      const handleSingleModel = vi.fn(async (b, m) => {
        calls.push(m);
        if (m === "judge-model") {
          return judgeRes('{"difficulty":"hard","ambiguity":"low","domain":"coding","confidence":0.9}');
        }
        return okRes("pong");
      });

      const body = {
        messages: [{ role: "user", content: "Explain how to handle race conditions in distributed systems." }],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["easy-a", "hard-a"],
        handleSingleModel,
        log: quietLog,
        comboName: "two-layer-combo",
        judgeModel: "judge-model",
        tuning: {
          judgeMode: "two-layer",
          jevConfidenceThreshold: 0.7,
          easyModels: ["easy-a"],
          hardModels: ["hard-a"],
        },
      });

      expect(res.ok).toBe(true);
      expect(calls[0]).toBe("judge-model"); // escalated to judge
      expect(calls).toContain("hard-a");
      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevEscalated).toBe(beforeMetrics.jevEscalated + 1);
    });

    it("primary Jev failure (500 error): falls back to LLM judge and bumps jevFallback", async () => {
      const beforeMetrics = getRoutingMetrics();
      const calls = [];

      vi.spyOn(globalThis, "fetch").mockResolvedValue(jevMockRes({ status: 500 }));

      const handleSingleModel = vi.fn(async (b, m) => {
        calls.push(m);
        if (m === "judge-model") {
          return judgeRes('{"difficulty":"medium","ambiguity":"low","domain":"coding","confidence":0.9}');
        }
        return okRes("pong");
      });

      const body = {
        messages: [{ role: "user", content: "Help me write a Python script for CSV parsing." }],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["easy-a", "hard-a"],
        handleSingleModel,
        log: quietLog,
        comboName: "two-layer-combo",
        judgeModel: "judge-model",
        tuning: {
          judgeMode: "two-layer",
          easyModels: ["easy-a"],
          hardModels: ["hard-a"],
        },
      });

      expect(res.ok).toBe(true);
      expect(calls[0]).toBe("judge-model"); // fell back to judge
      expect(calls).toContain("hard-a");
      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevFallback).toBe(beforeMetrics.jevFallback + 1);
    });
  });

  describe("judgeMode: 'jev-only'", () => {
    it("runs Jev only; on high confidence routes to selected tier without LLM judge", async () => {
      const beforeMetrics = getRoutingMetrics();
      const calls = [];

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jevMockRes({ difficulty: "easy", ambiguity: "low", domain: "general", confidence: 0.95 })
      );

      const handleSingleModel = vi.fn(async (b, m) => {
        calls.push(m);
        return okRes("pong");
      });

      const body = {
        messages: [{ role: "user", content: "Tell me what year was JavaScript created." }],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["easy-a", "hard-a"],
        handleSingleModel,
        log: quietLog,
        comboName: "jev-only-combo",
        judgeModel: "judge-model",
        tuning: {
          judgeMode: "jev-only",
          easyModels: ["easy-a"],
          hardModels: ["hard-a"],
        },
      });

      expect(res.ok).toBe(true);
      expect(calls).toEqual(["easy-a"]); // no judge-model call
      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevUsed).toBe(beforeMetrics.jevUsed + 1);
    });

    it("runs Jev only; on low confidence (< threshold) escalates to hard tier without LLM judge", async () => {
      const beforeMetrics = getRoutingMetrics();
      const calls = [];

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jevMockRes({ difficulty: "easy", ambiguity: "low", domain: "general", confidence: 0.4 }) // low conf
      );

      const handleSingleModel = vi.fn(async (b, m) => {
        calls.push(m);
        return okRes("pong");
      });

      const body = {
        messages: [{ role: "user", content: "Some ambiguous instruction that might need deep review." }],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["easy-a", "hard-a"],
        handleSingleModel,
        log: quietLog,
        comboName: "jev-only-combo",
        judgeModel: "judge-model",
        tuning: {
          judgeMode: "jev-only",
          jevConfidenceThreshold: 0.7,
          easyModels: ["easy-a"],
          hardModels: ["hard-a"],
        },
      });

      expect(res.ok).toBe(true);
      expect(calls).toEqual(["hard-a"]); // escalated to hard without judgeModel
      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevEscalated).toBe(beforeMetrics.jevEscalated + 1);
    });

    it("runs Jev only; on Jev failure falls back to default tier without LLM judge", async () => {
      const beforeMetrics = getRoutingMetrics();
      const calls = [];

      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Jev offline"));

      const handleSingleModel = vi.fn(async (b, m) => {
        calls.push(m);
        return okRes("pong");
      });

      const body = {
        messages: [{ role: "user", content: "General question about history." }],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["easy-a", "hard-a"],
        handleSingleModel,
        log: quietLog,
        comboName: "jev-only-combo",
        judgeModel: "judge-model",
        tuning: {
          judgeMode: "jev-only",
          policy: "cost_efficient", // defaults to easy on fallback
          easyModels: ["easy-a"],
          hardModels: ["hard-a"],
        },
      });

      expect(res.ok).toBe(true);
      expect(calls).toEqual(["easy-a"]); // no judge-model call, fell back to policy default
      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevFallback).toBe(beforeMetrics.jevFallback + 1);
    });
  });

  describe("judgeMode: 'llm-only'", () => {
    it("calls LLM judge directly without invoking Jev", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const beforeMetrics = getRoutingMetrics();
      const calls = [];

      const handleSingleModel = vi.fn(async (b, m) => {
        calls.push(m);
        if (m === "judge-model") {
          return judgeRes('{"difficulty":"medium","ambiguity":"low","domain":"coding","confidence":0.9}');
        }
        return okRes("pong");
      });

      const body = {
        messages: [{ role: "user", content: "Refactor this database connection pool" }],
        stream: false,
      };

      const res = await handleDifficultyChat({
        body,
        models: ["easy-a", "hard-a"],
        handleSingleModel,
        log: quietLog,
        comboName: "llm-only-combo",
        judgeModel: "judge-model",
        tuning: {
          judgeMode: "llm-only",
          easyModels: ["easy-a"],
          hardModels: ["hard-a"],
        },
      });

      expect(res.ok).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled(); // Jev fetch was never called
      expect(calls[0]).toBe("judge-model");
      expect(calls).toContain("hard-a");

      const afterMetrics = getRoutingMetrics();
      expect(afterMetrics.jevUsed).toBe(beforeMetrics.jevUsed);
      expect(afterMetrics.jevEscalated).toBe(beforeMetrics.jevEscalated);
      expect(afterMetrics.jevFallback).toBe(beforeMetrics.jevFallback);
    });
  });

  describe("judgeMode: 'two-layer' without a TypeSafe key", () => {
    it("still classifies through the keyless Jev upstream and skips the LLM judge", async () => {
      const prevKey = process.env.TYPESAFE_API_KEY;
      delete process.env.TYPESAFE_API_KEY;
      let capturedInit = null;
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        capturedInit = init;
        return jevMockRes({ difficulty: "hard", ambiguity: "low", domain: "coding", confidence: 0.9 });
      });
      const calls = [];

      try {
        const handleSingleModel = vi.fn(async (b, m) => {
          calls.push(m);
          return okRes("pong");
        });

        const res = await handleDifficultyChat({
          body: { messages: [{ role: "user", content: "Set up a CI pipeline for a monorepo" }], stream: false },
          models: ["easy-a", "hard-a"],
          handleSingleModel,
          log: quietLog,
          comboName: "no-key-combo",
          judgeModel: "judge-model",
          tuning: {
            judgeMode: "two-layer",
            easyModels: ["easy-a"],
            hardModels: ["hard-a"],
          },
        });

        expect(res.ok).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(1); // keyless upstream answers
        expect(capturedInit.headers["Authorization"]).toBeUndefined(); // no key => no auth header
        expect(calls).not.toContain("judge-model"); // Jev resolved the tier
        expect(calls).toEqual(["hard-a"]);
      } finally {
        if (prevKey === undefined) delete process.env.TYPESAFE_API_KEY;
        else process.env.TYPESAFE_API_KEY = prevKey;
      }
    });
  });
});
