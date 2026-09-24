import { describe, it, expect } from "vitest";
import { resolveProviderIconId, getProviderIconSrc } from "../../src/shared/utils/providerIcon.js";
import { getExecutor } from "../../open-sse/executors/index.js";
import { resolveProviderAlias, parseModel } from "../../open-sse/services/model.js";
import { KiloCodeFreeExecutor } from "../../open-sse/executors/kilocode-free.js";
import { PROVIDERS } from "../../open-sse/providers/index.js";
import { FREE_PROVIDERS } from "../../src/shared/constants/providers.js";
import { NEVER_ACCOUNT_EXHAUSTED_PROVIDERS, providerAllowsAccountExhausted } from "../../src/sse/services/accountExhaustionPolicy.js";
import { FILTERS } from "../../src/app/api/providers/suggested-models/filters.js";

describe("KiloCode Free Provider & Executor", () => {
  it("registers correctly in PROVIDERS registry", () => {
    expect(PROVIDERS["kilocode-free"]).toBeDefined();
    expect(PROVIDERS["kilocode-free"].baseUrl).toBe("https://api.kilo.ai/api/gateway/chat/completions");
    expect(PROVIDERS["kilocode-free"].noAuth).toBe(true);
  });

  it("is present in FREE_PROVIDERS with alias kcf", () => {
    const entry = FREE_PROVIDERS["kilocode-free"];
    expect(entry).toBeDefined();
    expect(entry.alias).toBe("kcf");
    expect(entry.noAuth).toBe(true);
  });

  it("is exempt from account exhaustion", () => {
    expect(NEVER_ACCOUNT_EXHAUSTED_PROVIDERS.has("kilocode-free")).toBe(true);
    expect(providerAllowsAccountExhausted("kilocode-free")).toBe(false);
  });

  it("builds headers properly with stream and without credentials", () => {
    const executor = new KiloCodeFreeExecutor();
    const headers = executor.buildHeaders({}, true);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Accept"]).toBe("text/event-stream");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("includes Authorization header if credentials are provided (BYOK)", () => {
    const executor = new KiloCodeFreeExecutor();
    const headers = executor.buildHeaders({ apiKey: "test-api-key" }, false);
    expect(headers["Authorization"]).toBe("Bearer test-api-key");
    expect(headers["Accept"]).toBe("application/json");
  });

  it("transforms streaming request to include include_usage in stream_options", () => {
    const executor = new KiloCodeFreeExecutor();
    const body = { model: "kilo-auto/free", messages: [{ role: "user", content: "hi" }] };
    const transformed = executor.transformRequest("kilo-auto/free", body, true);
    expect(transformed.stream_options).toEqual({ include_usage: true });
  });

  it("identifies IP rate limits and tags them as poolScoped", () => {
    const executor = new KiloCodeFreeExecutor();
    const err429 = executor.parseError({ status: 429 }, JSON.stringify({ error: { message: "rate limit exceeded" } }));
    expect(err429.status).toBe(429);
    expect(err429.poolScoped).toBeDefined();
    expect(err429.poolScoped.reason).toBe("ip-limit");

    const errUpstreamPool = executor.parseError(
      { status: 500 },
      JSON.stringify({ error: { message: "qwen/qwen3.8-27b:free is temporarily rate-limited upstream", metadata: { limit_source: "upstream_provider_shared_pool" } } })
    );
    expect(errUpstreamPool.poolScoped).toBeDefined();
    expect(errUpstreamPool.poolScoped.reason).toBe("ip-limit");
  });

  it("identifies paid model auth requirements gracefully", () => {
    const executor = new KiloCodeFreeExecutor();
    const errPaid = executor.parseError({ status: 401 }, JSON.stringify({ error: { code: "PAID_MODEL_AUTH_REQUIRED", message: "You need to sign in to use this model." } }));
    expect(errPaid.status).toBe(401);
    expect(errPaid.message).toContain("Kilo Code Free only supports free models");
    expect(errPaid.poolScoped).toBeUndefined();
  });

  it("filters suggested models correctly", () => {
    const filter = FILTERS["kilocode-free"];
    expect(filter).toBeDefined();

    const mockModels = [
      { id: "kilo-auto/free", name: "Auto Free", isFree: true, context_length: 256000, top_provider: { max_completion_tokens: 10000 } },
      { id: "qwen/qwen3.8-27b:free", name: "Qwen 3.8 27B (free)", isFree: true, context_length: 262144, top_provider: { max_completion_tokens: 235929 } },
      { id: "openai/gpt-4.1", name: "GPT-4.1", isFree: false, context_length: 1000000 },
    ];

    const result = filter(mockModels);
    expect(result.length).toBe(2);
    expect(result.find((m) => m.id === "kilo-auto/free")).toBeDefined();
    expect(result.find((m) => m.id === "qwen/qwen3.8-27b:free")).toBeDefined();
    expect(result.find((m) => m.id === "openai/gpt-4.1")).toBeUndefined();
    expect(result[0].maxTokens).toBeDefined();
  });

  it("resolves alias and model string correctly", () => {
    expect(resolveProviderAlias("kcf")).toBe("kilocode-free");
    expect(resolveProviderAlias("kilocode-free")).toBe("kilocode-free");

    const parsed1 = parseModel("kcf/kilo-auto/free");
    expect(parsed1.provider).toBe("kilocode-free");
    expect(parsed1.model).toBe("kilo-auto/free");

    const parsed2 = parseModel("kcf/qwen/qwen3.8-27b:free");
    expect(parsed2.provider).toBe("kilocode-free");
    expect(parsed2.model).toBe("qwen/qwen3.8-27b:free");
  });

  it("getExecutor returns KiloCodeFreeExecutor for kcf and kilocode-free", () => {
    expect(getExecutor("kcf")).toBeInstanceOf(KiloCodeFreeExecutor);
    expect(getExecutor("kilocode-free")).toBeInstanceOf(KiloCodeFreeExecutor);
  });

  it("resolves provider icon properly", () => {
    expect(resolveProviderIconId("kilocode-free")).toBe("kilocode");
    expect(resolveProviderIconId("kcf")).toBe("kilocode");
    expect(getProviderIconSrc("kilocode-free")).toBe("/providers/kilocode.png");
    expect(getProviderIconSrc("kcf")).toBe("/providers/kilocode.png");
  });
});
