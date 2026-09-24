import { describe, it, expect } from "vitest";
import REGISTRY from "open-sse/providers/registry/index.js";
import { PROVIDERS, PROVIDER_OAUTH, PROVIDER_MODELS } from "open-sse/providers/index.js";
import { getExecutor, hasSpecializedExecutor } from "open-sse/executors/index.js";
import { PROVIDER_CAPABILITIES } from "open-sse/providers/capabilities.js";
import { getUsageForProvider } from "open-sse/services/usage.js";
import { PROVIDERS as OAUTH_PROVIDERS } from "@/lib/oauth/providers/index.js";
import { WORKBUDDY_CONFIG } from "@/lib/oauth/constants/oauth.js";

describe("workbuddy provider wiring", () => {
  it("registers a workbuddy registry entry", () => {
    const entry = REGISTRY.find((r) => r.id === "workbuddy");
    expect(entry).toBeTruthy();
    expect(entry.alias).toBe("wb");
    expect(entry.category).toBe("oauth");
    expect(entry.hasOAuth).toBe(true);
  });

  it("exposes the workbuddy.ai gateway baseUrl and billing usage url", () => {
    expect(PROVIDERS.workbuddy.baseUrl).toBe("https://www.workbuddy.ai/v2/chat/completions");
    expect(PROVIDERS.workbuddy.usage.url).toBe("https://www.workbuddy.ai/v2/billing/meter/get-user-resource");
    expect(PROVIDERS.workbuddy.forceStream).toBe(true);
    expect(PROVIDERS.workbuddy.headers["X-Domain"]).toBe("www.workbuddy.ai");
  });

  it("exposes workbuddy.ai OAuth endpoints", () => {
    expect(PROVIDER_OAUTH.workbuddy.tokenUrl).toBe("https://www.workbuddy.ai/v2/plugin/auth/token");
    expect(PROVIDER_OAUTH.workbuddy.stateUrl).toBe("https://www.workbuddy.ai/v2/plugin/auth/state");
    expect(PROVIDER_OAUTH.workbuddy.refreshUrl).toBe("https://www.workbuddy.ai/v2/plugin/auth/token/refresh");
  });

  it("has a specialized executor that forces stream", () => {
    expect(hasSpecializedExecutor("workbuddy")).toBe(true);
    const ex = getExecutor("workbuddy");
    const out = ex.transformRequest("hy3", { messages: [{ role: "user", content: "hi" }] }, false, {});
    expect(out.stream).toBe(true);
    // leading system prompt + typed user block (gateway rejects bare string)
    expect(out.messages[0].role).toBe("system");
    expect(out.messages[1].content[0].type).toBe("text");
  });

  it("mirrors reasoning_summary when reasoning is requested", () => {
    const ex = getExecutor("workbuddy");
    const out = ex.transformRequest("hy3", { messages: [], reasoning_effort: "high" }, false, {});
    expect(out.reasoning_summary).toBe("auto");
    const off = ex.transformRequest("hy3", { messages: [], reasoning_effort: "none" }, false, {});
    expect(off.reasoning_effort).toBeUndefined();
  });

  it("registers model catalog under the wb alias", () => {
    expect(Array.isArray(PROVIDER_MODELS.wb)).toBe(true);
    expect(PROVIDER_MODELS.wb.length).toBeGreaterThan(0);
    expect(PROVIDER_MODELS.wb.some((m) => m.id === "glm-5.3")).toBe(true);
  });

  it("has capability overrides and a usage handler", () => {
    expect(PROVIDER_CAPABILITIES.workbuddy).toBeTruthy();
    expect(PROVIDER_CAPABILITIES.workbuddy["glm-5.3"].contextWindow).toBe(1000000);
  });

  it("registers the OAuth device-code provider and config", () => {
    expect(OAUTH_PROVIDERS.workbuddy.flowType).toBe("device_code");
    expect(WORKBUDDY_CONFIG.tokenUrl).toBe("https://www.workbuddy.ai/v2/plugin/auth/token");
  });

  it("routes usage lookups through the shared CodeBuddy billing handler", async () => {
    const out = await getUsageForProvider({ provider: "workbuddy" }, null, {});
    expect(out).toHaveProperty("message");
    expect(String(out.message)).toContain("workbuddy");
  });
});
