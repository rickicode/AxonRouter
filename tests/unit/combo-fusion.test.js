import { describe, it, expect, vi } from "vitest";

import { handleFusionChat } from "../../open-sse/services/combo.js";

const log = { info: () => {}, warn: () => {}, debug: () => {} };

// Minimal OpenAI-chat Response stub with the .ok + .clone().json() surface the engine uses.
function okResponse(content, { delayMs = 0 } = {}) {
  const json = { choices: [{ message: { role: "assistant", content } }] };
  const make = () => ({ ok: true, status: 200, clone: make, json: async () => json });
  const res = make();
  return delayMs > 0 ? new Promise((r) => setTimeout(() => r(res), delayMs)) : res;
}

function errResponse(status = 500) {
  const make = () => ({ ok: false, status, clone: make, json: async () => ({ error: { message: "boom" } }) });
  return make();
}

describe("fusion combo", () => {
  it("reuses the sole panel response for non-streaming (no double pay)", async () => {
    const panel = okResponse("only-answer");
    const handleSingleModel = vi.fn(async (body, model) =>
      model === "p/a" ? panel : errResponse(500));
    const res = await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }] },
      models: ["p/a", "p/b"],
      handleSingleModel,
      log,
    });
    // 2 panel calls, zero refetch.
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
    expect(res).toBe(panel);
  });

  it("refetches the sole survivor when the client streams", async () => {
    const handleSingleModel = vi.fn(async (body) =>
      body.stream === true ? okResponse("STREAMED") : okResponse("panel-ans"));
    const res = await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }], stream: true },
      models: ["p/a", "p/b"],
      handleSingleModel,
      log,
    });
    expect(handleSingleModel).toHaveBeenCalledTimes(3);
    expect(await res.clone().json()).toEqual(
      expect.objectContaining({ choices: expect.any(Array) }));
  });

  it("falls back to the next panel member when the judge fails", async () => {
    const seen = [];
    const handleSingleModel = vi.fn(async (body, model) => {
      seen.push(model);
      if (model === "p/judge") return errResponse(429);
      if (body.messages?.some((m) => m.content === "Q")) return okResponse(`ans-${model}`);
      return okResponse("FINAL");
    });
    const res = await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }] },
      models: ["p/a", "p/b"],
      handleSingleModel,
      log,
      judgeModel: "p/judge",
    });
    expect(res.ok).toBe(true);
    // judge 429 -> backup judge p/a succeeds.
    expect(seen).toContain("p/judge");
    expect(seen.filter((m) => m === "p/a").length).toBeGreaterThanOrEqual(1);
  });

  it("truncates huge panel answers in the judge prompt", async () => {
    const big = "A".repeat(30000);
    const seen = [];
    const handleSingleModel = vi.fn(async (body, model, isPanel) => {
      if (isPanel) return okResponse(big);
      seen.push(body.messages[body.messages.length - 1].content.length);
      return okResponse("FINAL");
    });
    await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }] },
      models: ["p/a", "p/b"],
      handleSingleModel,
      log,
    });
    // 2 sources × capped each, well under raw 60000 chars.
    expect(seen[0]).toBeLessThan(30000);
  });

  it("honors minPanel:1 without waiting for stragglers", async () => {
    const handleSingleModel = vi.fn(async (body, model) =>
      model === "p/fast" ? okResponse("fast-ans") : okResponse("slow-ans", { delayMs: 30000 }));
    const t0 = Date.now();
    await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }] },
      models: ["p/fast", "p/slow"],
      handleSingleModel,
      log,
      tuning: { minPanel: 1, stragglerGraceMs: 50, panelHardTimeoutMs: 5000 },
    });
    // Quorum=1 + short grace: must finish far below the 30s straggler.
    expect(Date.now() - t0).toBeLessThan(15000);
    expect(handleSingleModel).toHaveBeenCalled();
  });

  it("aborts unfinished panel upstreams once the panel is decided", async () => {
    const signals = {};
    const handleSingleModel = vi.fn(async (body, m, opts) => {
      signals[m] = opts?.signal || null;
      if (m === "p/slow") {
        await new Promise((r) => setTimeout(r, 30000));
        return okResponse("too-late");
      }
      return okResponse("fast-ans");
    });
    await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }] },
      models: ["p/fast", "p/slow"],
      handleSingleModel,
      log,
      tuning: { minPanel: 1, stragglerGraceMs: 20, panelHardTimeoutMs: 5000 },
    });
    expect(signals["p/fast"]).toBeInstanceOf(AbortSignal);
    expect(signals["p/slow"]).toBeInstanceOf(AbortSignal);
    expect(signals["p/slow"].aborted).toBe(true);
  });

  it("clones the panel body per member (no shared mutation)", async () => {
    const bodies = [];
    const handleSingleModel = vi.fn(async (body) => {
      bodies.push(body);
      body.messages.push({ role: "user", content: "MUT" });
      return okResponse("ans");
    });
    await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }] },
      models: ["p/a", "p/b"],
      handleSingleModel,
      log,
    });
    expect(bodies[0]).not.toBe(bodies[1]);
    expect(bodies[0].messages.filter((m) => m.content === "MUT")).toHaveLength(1);
    expect(bodies[1].messages.filter((m) => m.content === "MUT")).toHaveLength(1);
  });

  it("answers directly with a single-model panel (nothing to fuse)", async () => {
    const handleSingleModel = vi.fn(async () => okResponse("solo"));
    await handleFusionChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["p/only"],
      handleSingleModel,
      log,
    });
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
    expect(handleSingleModel.mock.calls[0][1]).toBe("p/only");
  });

  it("fans out to the panel then routes a synthesis turn to the judge", async () => {
    const seen = [];
    const handleSingleModel = vi.fn(async (body, model, isPanel) => {
      seen.push(model);
      if (model === "p/judge") return okResponse("FINAL");
      return okResponse(`ans-${model}`);
    });

    const res = await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }], stream: true, tools: [{ name: "x" }] },
      models: ["p/a", "p/b", "p/c"],
      handleSingleModel,
      log,
      judgeModel: "p/judge",
    });

    // 3 panel calls + 1 judge call.
    expect(handleSingleModel).toHaveBeenCalledTimes(4);
    expect(seen.slice(0, 3).sort()).toEqual(["p/a", "p/b", "p/c"]);
    expect(seen[3]).toBe("p/judge");

    // Panel calls are non-streaming with tools stripped.
    for (const [body, model, isPanel] of handleSingleModel.mock.calls.filter(([, m]) => m !== "p/judge")) {
      expect(body.stream).toBe(false);
      expect(body.tools).toBeUndefined();
      expect(isPanel === true || isPanel?.isPanel === true).toBe(true);
    }

    // Judge call carries every panel answer + keeps the client's stream flag.
    const [judgeBody, , isPanel] = handleSingleModel.mock.calls.find(([, m]) => m === "p/judge");
    const judgeText = judgeBody.messages.at(-1).content;
    expect(judgeText).toContain("ans-p/a");
    expect(judgeText).toContain("ans-p/b");
    expect(judgeText).toContain("ans-p/c");
    expect(judgeText).toContain('<source id="1">');
    expect(judgeText).toContain("SECURITY BOUNDARY");
    expect(judgeText).not.toContain("[Source 1]");
    expect(judgeBody.stream).toBe(true);
    expect(isPanel).toBeUndefined();

    expect(res.ok).toBe(true);
  });

  it("defaults the judge to the first panel model when none is set", async () => {
    const seen = [];
    const handleSingleModel = vi.fn(async (_body, model) => { seen.push(model); return okResponse(`ans-${model}`); });
    await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }] },
      models: ["p/first", "p/second"],
      handleSingleModel,
      log,
    });
    // Last call is the judge; defaults to panel[0].
    expect(seen.at(-1)).toBe("p/first");
  });

  it("proceeds on quorum without waiting for a straggler (grace window)", async () => {
    const handleSingleModel = vi.fn(async (_body, model) => {
      if (model === "p/slow") return okResponse("slow", { delayMs: 5000 });
      if (model === "p/judge") return okResponse("FINAL");
      return okResponse(`fast-${model}`);
    });

    const t0 = Date.now();
    await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }] },
      models: ["p/x", "p/y", "p/slow"],
      handleSingleModel,
      log,
      judgeModel: "p/judge",
      tuning: { minPanel: 2, stragglerGraceMs: 50, panelHardTimeoutMs: 10000 },
    });
    const elapsed = Date.now() - t0;

    // Two fast answers reach quorum; grace is 50ms, so we never wait ~5s for p/slow.
    expect(elapsed).toBeLessThan(2000);

    const judgeCall = handleSingleModel.mock.calls.find(([, m]) => m === "p/judge");
    const judgeText = judgeCall[0].messages.at(-1).content;
    expect(judgeText).toContain("fast-p/x");
    expect(judgeText).toContain("fast-p/y");
    expect(judgeText).not.toContain("slow");
  });

  it("returns the lone survivor directly when only one panel model succeeds", async () => {
    const handleSingleModel = vi.fn(async (_body, model) => {
      if (model === "p/ok") return okResponse("lone");
      return errResponse(500);
    });
    await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }] },
      models: ["p/ok", "p/bad"],
      handleSingleModel,
      log,
      judgeModel: "p/judge",
      tuning: { minPanel: 2, stragglerGraceMs: 50, panelHardTimeoutMs: 5000 },
    });
    // No judge call — single answer means there is nothing to fuse.
    const judged = handleSingleModel.mock.calls.some(([, m]) => m === "p/judge");
    expect(judged).toBe(false);
  });

  it("returns 503 when the whole panel fails", async () => {
    const handleSingleModel = vi.fn(async () => errResponse(500));
    const res = await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }] },
      models: ["p/a", "p/b"],
      handleSingleModel,
      log,
      tuning: { minPanel: 2, stragglerGraceMs: 50, panelHardTimeoutMs: 5000 },
    });
    expect(res.status).toBe(503);
  });

  it("flattens previous tool history and assistant tool_calls into prose for panel calls", async () => {
    const handleSingleModel = vi.fn(async () => okResponse("ans"));
    await handleFusionChat({
      body: {
        messages: [
          { role: "user", content: "find files" },
          { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "find" } }] },
          { role: "tool", tool_call_id: "c1", content: "['a.js']" },
          { role: "user", content: "describe it" }
        ],
        tools: [{ type: "function" }]
      },
      models: ["p/a", "p/b"],
      handleSingleModel,
      log,
      judgeModel: "p/judge"
    });

    // Panel calls keep every turn but tool turns are flattened to assistant prose.
    const panelCalls = handleSingleModel.mock.calls.filter(([,, isPanel]) => isPanel === true || isPanel?.isPanel === true);
    expect(panelCalls.length).toBe(2);
    for (const [panelBody] of panelCalls) {
      expect(panelBody.tools).toBeUndefined();
      expect(panelBody.messages.length).toBe(4);
      expect(panelBody.messages[0]).toEqual({ role: "user", content: "find files" });
      expect(panelBody.messages[1].tool_calls).toBeUndefined();
      expect(panelBody.messages[1].content).toContain("find");
      expect(panelBody.messages[2].role).toBe("assistant");
      expect(panelBody.messages[2].content).toContain("['a.js']");
      expect(panelBody.messages[3]).toEqual({ role: "user", content: "describe it" });
    }

    // Judge call still receives the unmodified history + synthesis prompt.
    const judgeCall = handleSingleModel.mock.calls.find(([, m]) => m === "p/judge");
    expect(judgeCall).toBeDefined();
    const judgeBody = judgeCall[0];
    expect(judgeBody.messages.length).toBe(5); // original 4 + judge prompt turn
    expect(judgeBody.messages[1].tool_calls).toBeDefined();
    expect(judgeBody.messages[2].role).toBe("tool");
  });

  it("flattens Anthropic-style tool_use and tool_result blocks in arrays", async () => {
    const handleSingleModel = vi.fn(async () => okResponse("ans"));
    await handleFusionChat({
      body: {
        messages: [
          { role: "user", content: "do it" },
          { role: "assistant", content: [{ type: "text", text: "ok" }, { type: "tool_use", id: "t1", name: "run" }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "done" }] }
        ],
        tools: [{ name: "run", description: "d" }]
      },
      models: ["p/a", "p/b"],
      handleSingleModel,
      log,
      judgeModel: "p/judge"
    });

    const panelCalls = handleSingleModel.mock.calls.filter(([,, isPanel]) => isPanel === true || isPanel?.isPanel === true);
    expect(panelCalls.length).toBe(2);
    const panelBody = panelCalls[0][0];
    
    expect(panelBody.tools).toBeUndefined();
    expect(panelBody.messages.length).toBe(3);
    
    // Flattened tool_use
    expect(panelBody.messages[1].content).toBe("ok\n[Called tools: run]");
    
    // Flattened tool_result
    expect(panelBody.messages[2].content).toBe("[Tool result: done]");
  });

  it("skips exhausted panel members via memberHealth.checkAvailability", async () => {
    const handleSingleModel = vi.fn(async (body, model) => {
      return okResponse(`ans-${model}`);
    });
    const memberHealth = {
      checkAvailability: vi.fn(async (m) => {
        if (m === "p/exhausted") return { available: false, code: "ACCOUNT_EXHAUSTED" };
        return { available: true };
      }),
      onSuccess: vi.fn(),
      onFailure: vi.fn(),
    };
    const res = await handleFusionChat({
      body: { messages: [{ role: "user", content: "Q" }] },
      models: ["p/exhausted", "p/healthy-1", "p/healthy-2"],
      handleSingleModel,
      log,
      judgeModel: "p/healthy-1",
      memberHealth,
    });
    expect(res.ok).toBe(true);
    expect(memberHealth.checkAvailability).toHaveBeenCalledWith("p/exhausted");
    const calledModels = handleSingleModel.mock.calls.map(([_, m]) => m);
    expect(calledModels).not.toContain("p/exhausted");
    expect(calledModels).toContain("p/healthy-1");
    expect(calledModels).toContain("p/healthy-2");
  });
});
