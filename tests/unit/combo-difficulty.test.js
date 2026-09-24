/**
 * handleDifficultyChat: judge picks a tier (easy/medium/hard), then ONLY that
 * tier runs sequentially with escalation easy→medium→hard. Session-cache +
 * context lock (Morph router pattern) so ambiguous turns are judged once and
 * expensive contexts pin the route.
 */
import { describe, it, expect, vi } from "vitest";
import { handleDifficultyChat } from "../../open-sse/services/combo.js";

function judgeRes(judgeContent) {
  const envelope = JSON.stringify({ choices: [{ message: { content: judgeContent } }] });
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    clone() { return { json: async () => JSON.parse(envelope), text: async () => envelope }; },
    json: async () => JSON.parse(envelope),
    text: async () => envelope,
  };
}

function okRes(text = "hello") {
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    clone() { return { json: async () => ({ choices: [{ message: { content: text } }] }), text: async () => text }; },
    json: async () => ({ choices: [{ message: { content: text } }] }),
    text: async () => text,
  };
}

function errRes(status = 500) {
  return { ok: false, status, headers: new Map() };
}

const quietLog = { info: () => {}, warn: () => {}, error: () => {} };

describe("handleDifficultyChat (smart routing)", () => {
  it("obvious-easy body runs the easy tier without calling the judge", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      return okRes("pong");
    });
    const body = { messages: [{ role: "user", content: "halo" }], stream: false };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["easy-a"]); // judge never called
  });

  it("tool history without an error asks the judge", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      if (m === "judge-model") return judgeRes('{"difficulty":"medium","ambiguity":"low","domain":"coding","confidence":0.9}');
      return okRes("pong");
    });
    const body = {
      messages: [
        { role: "user", content: "do things" },
        { role: "assistant", tool_calls: [{ id: "1", type: "function", function: { name: "x", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "1", content: "done" },
        { role: "user", content: "now write the next helper" },
      ],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "med-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls[0]).toBe("judge-model");
    expect(calls).toContain("med-a");
    expect(calls).not.toContain("hard-a");
  });

  it("tool history plus an explicit error stays hard without the judge", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      return okRes("pong");
    });
    const body = {
      messages: [
        { role: "user", content: "do things" },
        { role: "assistant", tool_calls: [{ id: "1", type: "function", function: { name: "x", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "1", content: "done" },
        { role: "user", content: "the last command crashed with an exception" },
      ],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["hard-a"]);
  });

  it("an old screenshot does not lock a later text turn to hard", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      if (m === "judge-model") return judgeRes('{"difficulty":"easy","ambiguity":"low","domain":"general","confidence":0.9}');
      return okRes("pong");
    });
    const body = {
      messages: [
        { role: "user", content: [{ type: "text", text: "lihat ini" }, { type: "image_url", image_url: { url: "data:image/png;base64,aa" } }] },
        { role: "assistant", content: "sudah" },
        { role: "user", content: "tulis ringkasan singkat dari hasil itu untuk catatan" },
      ],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls[0]).toBe("judge-model");
    expect(calls).toContain("easy-a");
  });

  it("a large follow-up keeps the cached tier without calling the judge", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      if (m === "judge-model") return judgeRes('{"difficulty":"medium","ambiguity":"low","domain":"coding","confidence":0.9}');
      return okRes("pong");
    });
    const big = "x".repeat(250000);
    await handleDifficultyChat({
      body: { session_id: "lock-session", messages: [{ role: "user", content: "Help me design the pagination contract for this API." }], stream: false },
      models: ["easy-a", "med-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"] },
    });
    calls.length = 0;
    const res = await handleDifficultyChat({
      body: { session_id: "lock-session", messages: [{ role: "user", content: big }], stream: false },
      models: ["easy-a", "med-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["med-a"]);
  });

  it("ambiguous body asks the judge, then runs the judged tier", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      if (m === "judge-model") return judgeRes('{"difficulty":"medium","ambiguity":"low"}');
      return okRes("pong");
    });
    const body = {
      messages: [{ role: "user", content: "Help me refactor this API endpoint handler to add pagination." }],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "med-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls[0]).toBe("judge-model"); // judge called first
    expect(calls).toContain("med-a");     // medium tier runs
    expect(calls).not.toContain("easy-a");
    expect(calls).not.toContain("hard-a");
  });

  it("escalates easy→medium→hard on consecutive tier failure", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      if (m === "easy-a") return errRes(500);
      if (m === "med-a") return errRes(500);
      return okRes("pong");
    });
    const body = { messages: [{ role: "user", content: "hi" }], stream: false };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "med-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["easy-a", "med-a", "hard-a"]);
  });

  it("fails open to hard tier when judge is unusable", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      if (m === "judge-model") throw new Error("judge down");
      return okRes("pong");
    });
    const body = {
      messages: [{ role: "user", content: "Help me refactor this API endpoint handler with retries." }],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls).toContain("hard-a");
  });

  it("high ambiguity escalates to hard tier (Morph core principle)", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      if (m === "judge-model") return judgeRes('{"difficulty":"easy","ambiguity":"high","domain":"coding"}');
      return okRes("pong");
    });
    const body = {
      messages: [{ role: "user", content: "Please help optimize this nested loop implementation for performance across large inputs." }],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "med-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"], policy: "balanced" },
    });
    expect(res.ok).toBe(true);
    expect(calls[0]).toBe("judge-model");
    expect(calls).toContain("hard-a"); // escalated from easy to hard due to high ambiguity
  });

  it("cost_efficient policy drops medium to easy when ambiguity is low", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      if (m === "judge-model") return judgeRes('{"difficulty":"medium","ambiguity":"low","domain":"summary"}');
      return okRes("pong");
    });
    const body = {
      messages: [{ role: "user", content: "Summarize this article section by section with takeaways." }],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "med-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"], policy: "cost_efficient" },
    });
    expect(res.ok).toBe(true);
    expect(calls[0]).toBe("judge-model");
    expect(calls).toContain("easy-a"); // dropped to easy under cost_efficient
  });
  it("heuristic-trivial: trivial typo/formatting queries route directly to easy tier without judge", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      return okRes("fixed");
    });
    const body = {
      messages: [{ role: "user", content: "Please fix typo in this variable name" }],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "med-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["easy-a"]); // judge never called
  });

  it("heuristic-complex: concurrency/race-condition queries route directly to hard tier without judge", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      return okRes("analyzed");
    });
    const body = {
      messages: [{ role: "user", content: "Investigate this race condition and deadlock in the worker mutex" }],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "med-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["hard-a"]); // judge bypassed, direct to hard
  });

  it("prompt-cache affinity: multi-turn conversation sticks to winning model across turns", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      return okRes("turn response");
    });
    // Turn 1
    const bodyTurn1 = {
      session_id: "test-affinity-sess-1",
      messages: [
        { role: "user", content: "hi" },
      ],
      stream: false,
    };
    await handleDifficultyChat({
      body: bodyTurn1,
      models: ["easy-1", "easy-2"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      tuning: { easyModels: ["easy-1", "easy-2"] },
    });
    expect(calls).toEqual(["easy-1"]);

    // Turn 2 with same session_id - easy-1 was winning model, should stay first even if easy-2 exists
    const bodyTurn2 = {
      session_id: "test-affinity-sess-1",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "turn response" },
        { role: "user", content: "second question" },
      ],
      stream: false,
    };
    await handleDifficultyChat({
      body: bodyTurn2,
      models: ["easy-2", "easy-1"], // user swapped default order
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      tuning: { easyModels: ["easy-2", "easy-1"] },
    });
    // Should prioritize sticky winning model "easy-1" from turn 1
    expect(calls[1]).toBe("easy-1");
  });

  it("health-aware sorting: deprioritizes recently failed model within the tier", async () => {
    const calls = [];
    let callCount = 0;
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      callCount++;
      // First request: easy-1 fails with 500, easy-2 succeeds
      if (m === "easy-fail" && callCount === 1) return errRes(500);
      return okRes("pong");
    });

    // Request 1: easy-fail is tried first, fails, then easy-ok succeeds
    await handleDifficultyChat({
      body: { messages: [{ role: "user", content: "hi" }], stream: false },
      models: ["easy-fail", "easy-ok"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      tuning: { easyModels: ["easy-fail", "easy-ok"] },
    });
    expect(calls).toEqual(["easy-fail", "easy-ok"]);

    // Request 2 immediately after: easy-fail should be deprioritized behind healthy easy-ok
    calls.length = 0;
    await handleDifficultyChat({
      body: { messages: [{ role: "user", content: "hi" }], stream: false },
      models: ["easy-fail", "easy-ok"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      tuning: { easyModels: ["easy-fail", "easy-ok"] },
    });
    // easy-ok is healthy and must be tried first without wasting a call on easy-fail
    expect(calls).toEqual(["easy-ok"]);
  });

  it("skips exhausted member via memberHealth.checkAvailability in difficulty tier", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      return okRes("pong");
    });
    const memberHealth = {
      checkAvailability: vi.fn(async (m) => {
        if (m === "easy-exhausted") return { available: false, code: "ACCOUNT_EXHAUSTED" };
        return { available: true };
      }),
      onSuccess: vi.fn(),
      onFailure: vi.fn(),
    };
    const res = await handleDifficultyChat({
      body: { messages: [{ role: "user", content: "hi" }], stream: false },
      models: ["easy-exhausted", "easy-ok"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      tuning: { easyModels: ["easy-exhausted", "easy-ok"] },
      memberHealth,
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["easy-ok"]);
    expect(memberHealth.checkAvailability).toHaveBeenCalledWith("easy-exhausted");
    expect(memberHealth.onSuccess).toHaveBeenCalledWith("easy-ok");
  });
});
