import { describe, it, expect, vi, beforeEach } from "vitest";
import { MorphExecutor } from "../../open-sse/executors/morphllm.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";
import morphRegistry from "../../open-sse/providers/registry/morphllm.js";

describe("Morph Provider & Rate Limiting System", () => {
  it("morph registry contains updated live models and dual transports", () => {
    expect(morphRegistry.id).toBe("morphllm");
    expect(morphRegistry.transports).toHaveLength(2);
    expect(morphRegistry.transports.map((t) => t.format)).toEqual(["openai", "claude"]);

    const modelIds = morphRegistry.models.map((m) => m.id);
    expect(modelIds).toContain("morph-dsv41flash");
    expect(modelIds).toContain("morph-kimik3");
    expect(modelIds).toContain("morph-kimik3-fast");
    expect(modelIds).toContain("morph-glm53-744b");
    expect(modelIds).toContain("morph-glm53flash");
    expect(modelIds).toContain("morph-dsv4flash");
    expect(modelIds).not.toContain("auto");
    expect(modelIds).not.toContain("morph-v3-fast");
    expect(modelIds).not.toContain("morph-compactor");
  });

  describe("Morph error rules in errorConfig", () => {
    it("classifies Monthly quota exceeded as account exhaustion", () => {
      const errText = '{"detail":"Monthly quota exceeded. Upgrade to a paid plan at https://morphllm.com/dashboard/billing"}';
      const result = checkFallbackError(429, errText, 0);
      expect(result.shouldFallback).toBe(true);
      expect(result.isExhausted).toBe(true);
      expect(result.lockAll).toBe(true);
      expect(result.cooldownMs).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it("classifies 5 requests/minute as short 15s cooldown without account lock", () => {
      const errText = '{"detail":"Rate limit exceeded. Please slow down your requests. Limit: 5 requests/minute."}';
      const result = checkFallbackError(429, errText, 0);
      expect(result.shouldFallback).toBe(true);
      expect(result.lockAll).toBe(false);
      expect(result.cooldownMs).toBe(15 * 1000);
    });

    it("classifies is not served by this endpoint with zero cooldown without locking account", () => {
      const errText = "Model 'systemone-latest' is not served by this endpoint; accepted models: morph-v0, morph-v2";
      const result = checkFallbackError(400, errText, 0);
      expect(result.shouldFallback).toBe(true);
      expect(result.lockAll).toBe(false);
      expect(result.cooldownMs).toBe(0);
    });
  });

  describe("MorphExecutor client-side rate limiting", () => {
    let executor;

    beforeEach(() => {
      executor = new MorphExecutor();
    });

    it("allows requests up to 5 RPM limit cleanly", async () => {
      const executeSpy = vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(executor)), "execute")
        .mockResolvedValue({ response: { ok: true, status: 200 } });

      const testKey = "test-key-" + Math.random().toString(36);
      for (let i = 0; i < 5; i++) {
        const res = await executor.execute({
          model: "morph-dsv41flash",
          body: {},
          credentials: { apiKey: testKey },
          log: { info: vi.fn(), warn: vi.fn() },
        });
        expect(res.response.ok).toBe(true);
      }
      expect(executeSpy).toHaveBeenCalledTimes(5);
    });

    it("fast-fails with 429 when window is congested (>4s wait)", async () => {
      vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(executor)), "execute")
        .mockResolvedValue({ response: { ok: true, status: 200 } });

      const testKey = "test-congested-" + Math.random().toString(36);
      // Fill window with 5 requests
      for (let i = 0; i < 5; i++) {
        await executor.execute({
          model: "morph-dsv41flash",
          body: {},
          credentials: { apiKey: testKey },
          log: { info: vi.fn(), warn: vi.fn() },
        });
      }

      // 6th request immediately after must fail fast with 429
      await expect(
        executor.execute({
          model: "morph-dsv41flash",
          body: {},
          credentials: { apiKey: testKey },
          log: { info: vi.fn(), warn: vi.fn() },
        })
      ).rejects.toThrow(/Morph rate limit/);
    });
  });
});
