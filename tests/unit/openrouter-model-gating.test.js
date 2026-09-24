import { describe, it, expect, beforeEach, vi } from "vitest";

const connectionsDb = new Map();
let settingsDb = {};

vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: vi.fn(async () => null),
  getProviderConnections: vi.fn(async ({ provider, isActive } = {}) => {
    return Array.from(connectionsDb.values()).filter(
      (c) => (!provider || c.provider === provider) && (!isActive || c.isActive),
    );
  }),
  getSettings: vi.fn(async () => settingsDb),
  updateProviderConnection: vi.fn(async (id, patch) => {
    const existing = connectionsDb.get(id) || {};
    const updated = { ...existing, ...patch };
    connectionsDb.set(id, updated);
    return updated;
  }),
  lockAccountToModel: vi.fn(async () => {}),
  unlockAccountModel: vi.fn(async () => {}),
  getProxyPools: vi.fn(async () => []),
}));

vi.mock("@/lib/cache/client.js", () => ({
  getCachedConnections: vi.fn(async () => null),
  setCachedConnections: vi.fn(async () => {}),
  getBatchCooldowns: vi.fn(async () => new Set()),
  setAccountCooldown: vi.fn(async () => true),
  setModelCooldown: vi.fn(async () => true),
  invalidateCachedConnections: vi.fn(async () => {}),
  getLkg: vi.fn(async () => null),
  delLkg: vi.fn(async () => true),
  getDeadCircuit: vi.fn(async () => 0),
  resetDeadCircuit: vi.fn(async () => true),
  incrModelFailCount: vi.fn(async () => 1),
  resetModelFailCount: vi.fn(async () => true),
  setProviderDead: vi.fn(async () => true),
  clearProviderDead: vi.fn(async () => true),
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
  pickProxyPoolId: vi.fn(() => null),
}));

import { checkFallbackError, isModelLockActive } from "open-sse/services/accountFallback.js";
import { getProviderCredentials, markAccountUnavailable } from "../../src/sse/services/auth.js";

const INKLING_403_ERROR = JSON.stringify({
  error: {
    message: "thinkingmachines/inkling:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps",
    code: 403,
    metadata: {
      routing_funnel: [{ step: "Initial Endpoints", endpoint_count: 1 }],
      failed_routing_step: "Gate Free Endpoints by Agentic Harness",
    },
  },
});

describe("OpenRouter Model-Level 403 Gating", () => {
  beforeEach(() => {
    connectionsDb.clear();
    settingsDb = {};
    vi.clearAllMocks();
  });

  it("classifies agentic harness 403 as a model-level restriction with lockAll=false", () => {
    const result = checkFallbackError(403, INKLING_403_ERROR, 0);
    expect(result.shouldFallback).toBe(true);
    expect(result.lockAll).toBe(false);
    expect(result.disableAccount).toBe(false);
  });

  it("marks only the failed model as locked and leaves the OpenRouter account active for other models", async () => {
    const connId = "or-conn-1";
    connectionsDb.set(connId, {
      id: connId,
      provider: "openrouter",
      authType: "apikey",
      name: "OpenRouter User",
      apiKey: "sk-or-v1-12345678",
      isActive: true,
      testStatus: "active",
      modelLocks: {},
    });

    const res = await markAccountUnavailable(
      connId,
      403,
      INKLING_403_ERROR,
      "openrouter",
      "thinkingmachines/inkling:free",
    );

    expect(res.shouldFallback).toBe(true);

    const updated = connectionsDb.get(connId);
    // Account itself MUST remain active
    expect(updated.isActive).toBe(true);
    expect(updated.testStatus).toBe("active");
    expect(updated.lockedAllUntil).toBeUndefined();

    // The restricted model MUST be locked
    expect(isModelLockActive(updated, "thinkingmachines/inkling:free")).toBe(true);

    // Other models MUST NOT be locked
    expect(isModelLockActive(updated, "openai/gpt-4o")).toBe(false);
    expect(isModelLockActive(updated, "anthropic/claude-3.5-sonnet")).toBe(false);

    // Routing for another model successfully selects this connection
    const creds = await getProviderCredentials("openrouter", null, "openai/gpt-4o");
    expect(creds.connectionId).toBe(connId);

    // Routing for the restricted model correctly identifies all accounts are locked for this model
    const restrictedCreds = await getProviderCredentials("openrouter", null, "thinkingmachines/inkling:free");
    expect(restrictedCreds?.allRateLimited).toBe(true);
  });

  it("generic 403 without model context still locks all models", () => {
    const result = checkFallbackError(403, "Forbidden", 0);
    expect(result.shouldFallback).toBe(true);
    expect(result.lockAll).toBe(true);
  });

  it("tool-compat 404 (wrapped 502) locks the model for minutes, never 24h, and keeps the account active", async () => {
    const connId = "conn-tool-404";
    connectionsDb.set(connId, {
      id: connId, provider: "cline-free", isActive: true, testStatus: "active",
      connectionName: "cf-test@example.com",
      credentials: { apiKey: "k" }, accessToken: "tok", refreshToken: "r",
    });
    const WRAPPED_502 = 'Failed to create stream: inference request failed: failed to generate stream from OpenRouter: failed to invoke model \'z-ai/glm-5.2:free\' with streaming: request failed with status 404: {"error":{"message":"No endpoints found that support tool use. Try disabling \\"read\\". To learn more about provider routing, visit: https://openrouter.ai/docs/guides/routing/provider-selection","code":404,"metadata":{"routing_funnel":[{"step":"Initial Endpoints","endpoint_count":1}],"failed_routing_step":"Filter by Tool Compatibility"}}}';

    const cls = checkFallbackError(502, WRAPPED_502, 0);
    expect(cls.shouldFallback).toBe(true);
    expect(cls.isToolIncompatibility).toBe(true);
    expect(cls.cooldownMs).toBeLessThanOrEqual(2 * 60 * 1000);
    expect(cls.lockAll).toBe(false);

    await markAccountUnavailable(connId, 502, WRAPPED_502, "cline-free", "z-ai/glm-5.2:free");

    const updated = connectionsDb.get(connId);
    expect(updated.isActive).toBe(true);
    expect(updated.testStatus).not.toBe("exhausted");
    expect(updated.lockedAllUntil ?? null).toBeFalsy();
    // Model lock must expire within minutes (the old rule pinned 24h here)
    const lockExpiry = new Date(updated.modelLocks?.["z-ai/glm-5.2:free"] || updated["modelLock_z-ai/glm-5.2:free"]).getTime();
    expect(lockExpiry).toBeGreaterThan(Date.now());
    expect(lockExpiry - Date.now()).toBeLessThanOrEqual(2.5 * 60 * 1000);
  });
});
