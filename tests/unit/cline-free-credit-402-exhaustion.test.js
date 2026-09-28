import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: a 402 credit error on a PAID model of a free-model provider
 * (cline-free, gemini-cli, llm7-free, ...) must never demote the whole account
 * to the terminal `testStatus = "exhausted"` state.
 *
 * Live incident this guards: `cline-free/z-ai/glm-5.3-flash` and
 * `cline-free/moonshotai/kimi-k3` return HTTP 402 `Insufficient balance` at
 * $0.00 credits. The 402 path used to fan out to every account in the rotation
 * pool and mark all of them exhausted, so the FREE models on those same
 * accounts (mimo-v2.6-flash, deepseek-v4.1-flash, gemini-3.8-flash) started
 * answering `503 All cline-free accounts are exhausted` with a ~30-day
 * `reset after`.
 *
 * The account-wide state must stay reserved for providers whose paid balance
 * truly gates every model (codex, unikey, codebuddy, ...).
 */

const mocks = vi.hoisted(() => ({
  updateProviderConnection: vi.fn(async () => {}),
  connections: new Map(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: vi.fn(async (id) => mocks.connections.get(id) || null),
  updateProviderConnection: mocks.updateProviderConnection,
  getProviderConnections: vi.fn(async () => [...mocks.connections.values()]),
}));

vi.mock("@/lib/db/repos/usageSnapshotsRepo.js", () => ({
  upsertUsageSnapshot: vi.fn(async () => {}),
}));

vi.mock("@/lib/cache/client.js", () => ({
  publishEvent: vi.fn(async () => {}),
  setAccountCooldown: vi.fn(async () => true),
  clearModelCooldown: vi.fn(async () => true),
}));

import {
  markAccountExhaustedFromCredits,
  markAccountExhaustedFrom429,
  isQuotaExhaustedForRequest,
  getQuotaCache,
  setQuotaCache,
  __clearForTests,
} from "@/domain/quotaCache.js";
import { providerAllowsAccountExhausted } from "@/domain/accountExhaustionProviders.js";

/** Let `persistAsync`'s fire-and-forget chain settle. */
const flush = () => new Promise((r) => setTimeout(r, 10));

const exhaustedQuotas = () => ({
  "z-ai/glm-5.3-flash": {
    remainingPercentage: 0,
    resetAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  },
});

beforeEach(() => {
  __clearForTests();
  mocks.updateProviderConnection.mockClear();
  mocks.connections.clear();
  mocks.connections.set("cline-conn", {
    id: "cline-conn",
    provider: "cline-free",
    isActive: true,
    testStatus: "active",
    modelLocks: {},
  });
  mocks.connections.set("codex-conn", {
    id: "codex-conn",
    provider: "codex",
    isActive: true,
    testStatus: "active",
    modelLocks: {},
  });
});

describe("402 credit exhaustion (free-model providers)", () => {
  it("markAccountExhaustedFromCredits is a no-op for cline-free", async () => {
    const result = markAccountExhaustedFromCredits("cline-conn", "cline-free", null, "z-ai/glm-5.3-flash");
    await flush();

    expect(result).toBeNull();
    expect(isQuotaExhaustedForRequest("cline-conn", "cline-free")).toBe(false);
    expect(getQuotaCache("cline-conn")).toBeNull();

    // No terminal status write on the connection.
    for (const [, patch] of mocks.updateProviderConnection.mock.calls) {
      expect(patch.testStatus).not.toBe("exhausted");
    }
  });

  it("markAccountExhaustedFrom429 is a no-op for cline-free", async () => {
    const result = markAccountExhaustedFrom429("cline-conn", "cline-free", null, "moonshotai/kimi-k3");
    await flush();

    expect(result).toBeNull();
    expect(isQuotaExhaustedForRequest("cline-conn", "cline-free")).toBe(false);
  });

  it("a fully-zeroed quota snapshot never writes testStatus=exhausted for cline-free", async () => {
    await setQuotaCache("cline-conn", "cline-free", exhaustedQuotas(), {});
    await flush();

    const statusWrites = mocks.updateProviderConnection.mock.calls
      .map(([, patch]) => patch)
      .filter((patch) => patch && patch.testStatus);
    expect(statusWrites).toHaveLength(0);
  });

  it("still records the per-model lock so only the dead model is skipped", async () => {
    await setQuotaCache("cline-conn", "cline-free", exhaustedQuotas(), {});
    await flush();

    const patches = mocks.updateProviderConnection.mock.calls.map(([, patch]) => patch);
    const lockPatch = patches.find((p) => p && p["modelLock_z-ai/glm-5.3-flash"]);
    expect(lockPatch).toBeDefined();
    expect(lockPatch.testStatus).toBeUndefined();
  });

  it("account-wide exhaustion still applies to providers whose balance gates every model", async () => {
    expect(providerAllowsAccountExhausted("codex")).toBe(true);

    markAccountExhaustedFromCredits("codex-conn", "codex", null, "gpt-5.4-mini");
    await flush();

    expect(isQuotaExhaustedForRequest("codex-conn", "codex")).toBe(true);
    const patches = mocks.updateProviderConnection.mock.calls.map(([, patch]) => patch);
    expect(patches.some((p) => p && p.testStatus === "exhausted")).toBe(true);
  });
});

describe("free-model provider exemption set", () => {
  for (const id of ["cline-free", "cline", "gemini-cli", "llm7-free", "opencode-zen", "bai"]) {
    it(`${id} is exempt from account exhaustion`, () => {
      expect(providerAllowsAccountExhausted(id)).toBe(false);
    });
  }
});
