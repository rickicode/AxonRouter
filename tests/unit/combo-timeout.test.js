import { describe, it, expect, vi } from "vitest";
import { handleComboChat } from "../../open-sse/services/combo.js";

const log = { info: () => {}, warn: () => {}, debug: () => {} };
const never = () => new Promise(() => {});
const fail503 = () => {
  const make = () => ({ ok: false, status: 503, statusText: "busy",
    clone: make, json: async () => ({ error: { message: "busy" } }) });
  return make();
};
const okText = (text) => {
  const json = { choices: [{ message: { role: "assistant", content: text } }] };
  const make = () => ({ ok: true, status: 200, clone: make, json: async () => json });
  return make();
};
const okEmpty = () => {
  const json = { choices: [{ message: { role: "assistant", content: "  " } }] };
  const make = () => ({ ok: true, status: 200, clone: make, json: async () => json });
  return make();
};
const okTools = () => {
  const json = { choices: [{ message: { role: "assistant", content: "",
    tool_calls: [{ id: "call_1", type: "function", function: { name: "x", arguments: "{}" } }] } }] };
  const make = () => ({ ok: true, status: 200, clone: make, json: async () => json });
  return make();
};
const BODY = { messages: [{ role: "user", content: "hi" }] };

describe("combo target timeout + loop safety + quality gate", () => {
  it("moves to the next member when one hangs past targetTimeoutMs", async () => {
    const tried = [];
    const t0 = Date.now();
    const res = await handleComboChat({
      body: BODY,
      models: ["a/hang", "b/ok"],
      handleSingleModel: async (b, m, opts) => {
        tried.push(m);
        if (m === "a/hang") { await never(); return fail503(); }
        return okText("fine");
      },
      log,
      comboName: "test",
      comboStrategy: "fallback",
      targetTimeoutMs: 50,
    });
    expect(res.ok).toBe(true);
    expect(tried).toEqual(["a/hang", "b/ok"]);
    expect(Date.now() - t0).toBeLessThan(5000);
  }, 15000);

  it("hands an AbortSignal to member attempts", async () => {
    const signals = [];
    await handleComboChat({
      body: BODY,
      models: ["a/ok"],
      handleSingleModel: async (b, m, opts) => {
        signals.push(opts?.signal);
        return okText("fine");
      },
      log,
      comboName: "test",
      comboStrategy: "fallback",
      targetTimeoutMs: 1000,
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0].aborted).toBe(false);
  });

  it("returns 504 COMBO_TIMEOUT when the whole pass exceeds loopSafetyMs", async () => {
    const res = await handleComboChat({
      body: BODY,
      models: ["a/hang", "b/hang"],
      handleSingleModel: async () => { await never(); return fail503(); },
      log,
      comboName: "test",
      comboStrategy: "fallback",
      targetTimeoutMs: 30000,
      loopSafetyMs: 80,
    });
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error.code).toBe("COMBO_TIMEOUT");
  }, 15000);

  it("quality gate: empty ok-content fails over, tool-calls-only passes", async () => {
    const tried = [];
    const res = await handleComboChat({
      body: BODY,
      models: ["a/empty", "b/tools"],
      handleSingleModel: async (b, m) => {
        tried.push(m);
        return m === "a/empty" ? okEmpty() : okTools();
      },
      log,
      comboName: "test",
      comboStrategy: "fallback",
      targetTimeoutMs: 1000,
    });
    expect(tried).toEqual(["a/empty", "b/tools"]);
    expect(res.ok).toBe(true);
  });

  it("quality gate never blocks streaming-shaped results", async () => {
    const sseLike = { ok: true, status: 200, clone: () => { throw new Error("no json"); } };
    const res = await handleComboChat({
      body: { ...BODY, stream: true },
      models: ["a/sse"],
      handleSingleModel: async () => sseLike,
      log,
      comboName: "test",
      comboStrategy: "fallback",
      targetTimeoutMs: 1000,
    });
    expect(res).toBe(sseLike);
  });
});
