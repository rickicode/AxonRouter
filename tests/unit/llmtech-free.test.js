import { describe, it, expect } from "vitest";
import { PROVIDERS } from "../../open-sse/providers/index.js";
import { getExecutor } from "../../open-sse/executors/index.js";
import { LlmTechFreeExecutor } from "../../open-sse/executors/llmtech-free.js";

const TRIAL_KEY = PROVIDERS["llmtech-free"].headers?.Authorization?.replace("Bearer ", "");

describe("LLM Tech Free Provider & Executor", () => {
  it("registers correctly in PROVIDERS registry", () => {
    expect(PROVIDERS["llmtech-free"]).toBeDefined();
    expect(PROVIDERS["llmtech-free"].baseUrl).toBe("https://api.llmtech.eu/v1/chat/completions");
    expect(PROVIDERS["llmtech-free"].noAuth).toBe(true);
  });

  it("registry carries the shared trial key in Authorization header", () => {
    expect(TRIAL_KEY).toMatch(/^lt-trial-/);
  });

  it("getExecutor returns LlmTechFreeExecutor for llmtech-free and ltf", () => {
    expect(getExecutor("llmtech-free")).toBeInstanceOf(LlmTechFreeExecutor);
    expect(getExecutor("ltf")).toBeInstanceOf(LlmTechFreeExecutor);
  });

  it("buildHeaders preserves registry trial key for virtual noauth credentials", () => {
    const executor = new LlmTechFreeExecutor();
    const headers = executor.buildHeaders({ accessToken: "public", apiKey: undefined }, true);
    expect(headers["Authorization"]).toBe(`Bearer ${TRIAL_KEY}`);
    expect(headers["Accept"]).toBe("text/event-stream");
  });

  it("buildHeaders keeps trial key when apiKey is the 'public' sentinel", () => {
    const executor = new LlmTechFreeExecutor();
    const headers = executor.buildHeaders({ apiKey: "public", accessToken: "public" }, false);
    expect(headers["Authorization"]).toBe(`Bearer ${TRIAL_KEY}`);
    expect(headers["Accept"]).toBeUndefined();
  });

  it("buildHeaders overrides with user key when provided (BYOK via providerStrategies)", () => {
    const executor = new LlmTechFreeExecutor();
    const headers = executor.buildHeaders({ apiKey: "lt-trial-custom123" }, true);
    expect(headers["Authorization"]).toBe("Bearer lt-trial-custom123");
  });

  it("parseError tags 429 as poolScoped for proxy rotation", () => {
    const executor = new LlmTechFreeExecutor();
    const parsed = executor.parseError({ status: 429 }, "concurrency limit");
    expect(parsed.status).toBe(429);
    expect(parsed.poolScoped).toEqual({ reason: "concurrency-limit" });
  });

  it("parseError maps 401 to a trial key guidance message", () => {
    const executor = new LlmTechFreeExecutor();
    const parsed = executor.parseError({ status: 401 }, "Invalid API key");
    expect(parsed.status).toBe(401);
    expect(parsed.message).toContain("Trial key rejected");
  });
});
