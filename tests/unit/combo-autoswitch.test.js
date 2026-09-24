import { describe, it, expect, vi } from "vitest";
import { detectRequiredCapabilities, reorderByCapabilities, handleComboChat } from "../../open-sse/services/combo.js";

describe("detectRequiredCapabilities", () => {
  it("text-only -> empty", () => {
    const r = detectRequiredCapabilities({ messages: [{ role: "user", content: "hi" }] });
    expect(r.size).toBe(0);
  });

  it("openai image_url -> vision", () => {
    const r = detectRequiredCapabilities({ messages: [{ role: "user", content: [
      { type: "image_url", image_url: { url: "x" } },
    ] }] });
    expect(r.has("vision")).toBe(true);
  });

  it("openai file -> pdf", () => {
    const r = detectRequiredCapabilities({ messages: [{ role: "user", content: [
      { type: "file", file: { file_data: "data:application/pdf;base64,x" } },
    ] }] });
    expect(r.has("pdf")).toBe(true);
  });

  it("gemini inlineData image -> vision", () => {
    const r = detectRequiredCapabilities({ contents: [{ role: "user", parts: [
      { inlineData: { mimeType: "image/png", data: "x" } },
    ] }] });
    expect(r.has("vision")).toBe(true);
  });

  it("antigravity request.contents image -> vision", () => {
    const r = detectRequiredCapabilities({ request: { contents: [{ role: "user", parts: [
      { inlineData: { mimeType: "image/jpeg", data: "x" } },
    ] }] } });
    expect(r.has("vision")).toBe(true);
  });

  it("web_search tool -> search", () => {
    const r = detectRequiredCapabilities({ messages: [{ role: "user", content: "q" }], tools: [
      { type: "web_search" },
    ] });
    expect(r.has("search")).toBe(true);
  });

  it("responses input_image -> vision", () => {
    const r = detectRequiredCapabilities({ input: [{ role: "user", content: [
      { type: "input_image", image_url: "x" },
    ] }] });
    expect(r.has("vision")).toBe(true);
  });
});

describe("reorderByCapabilities", () => {
  it("no required -> unchanged", () => {
    const models = ["a/x", "b/y"];
    expect(reorderByCapabilities(models, new Set())).toBe(models);
  });

  it("floats vision-capable model to front, keeps fallback", () => {
    // deepseek-chat = no vision; claude-sonnet = vision
    const models = ["deepseek/deepseek-chat", "anthropic/claude-sonnet-4.6"];
    const out = reorderByCapabilities(models, new Set(["vision"]));
    expect(out[0]).toBe("anthropic/claude-sonnet-4.6");
    expect(out).toContain("deepseek/deepseek-chat"); // not dropped
    expect(out).toHaveLength(2);
  });

  it("keeps order when no model matches", () => {
    const models = ["deepseek/deepseek-chat", "deepseek/deepseek-reasoner"];
    const out = reorderByCapabilities(models, new Set(["vision"]));
    expect(out).toBe(models);
  });

  it("single model -> unchanged", () => {
    const models = ["a/x"];
    expect(reorderByCapabilities(models, new Set(["vision"]))).toBe(models);
  });
});

describe("handleComboChat autoSwitch opt-out", () => {
  const log = { info: () => {}, warn: () => {}, debug: () => {} };
  const visionBody = { messages: [{ role: "user", content: [
    { type: "image_url", image_url: { url: "x" } },
  ] }] };
  const models = ["deepseek/deepseek-chat", "anthropic/claude-sonnet-4.6"];
  const fail503 = () => {
    const make = () => ({ ok: false, status: 503, statusText: "busy",
      clone: make, json: async () => ({ error: { message: "busy" } }) });
    return make();
  };

  async function triedOrder(opts) {
    const tried = [];
    await handleComboChat({
      body: visionBody,
      models,
      handleSingleModel: async (b, m) => { tried.push(m); return fail503(); },
      log,
      comboName: "test",
      comboStrategy: "fallback",
      ...opts,
    });
    return tried;
  }

  it("reorders vision-capable first by default", async () => {
    expect(await triedOrder({})).toEqual([
      "anthropic/claude-sonnet-4.6",
      "deepseek/deepseek-chat",
    ]);
  });

  it("keeps explicit member order with autoSwitch:false", async () => {
    expect(await triedOrder({ autoSwitch: false })).toEqual(models);
  });

  it("short-circuits remaining members once the shared budget is spent", async () => {
    const tried = [];
    const res = await handleComboChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["a/x", "b/y", "c/z"],
      handleSingleModel: async (b, m) => { tried.push(m); return fail503(); },
      log,
      comboName: "test",
      comboStrategy: "fallback",
      rotationBudget: { used: 5, max: 5 },
    });
    expect(tried).toEqual([]);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.message).toContain("Max rotation attempts (5) reached");
  });

});
