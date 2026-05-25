import { describe, it, expect } from "vitest";
import { normalizeChatRuntimeSettings } from "open-sse/utils/abort";

describe("normalizeChatRuntimeSettings - stability fields", () => {
  it("returns all new defaults when given empty input", () => {
    const result = normalizeChatRuntimeSettings({});

    expect(result.sseHeartbeatIntervalMs).toBe(15000);
    expect(result.streamReadinessTimeoutMs).toBe(80000);
    expect(result.useUpstreamRetryHints).toBe(true);
    expect(result.circuitBreaker).toEqual({
      enabled: true,
      failureThreshold: 5,
      resetTimeoutMs: 60000,
    });
    expect(result.providerProfiles).toEqual({});
  });

  it("returns all new defaults when given undefined", () => {
    const result = normalizeChatRuntimeSettings(undefined);

    expect(result.sseHeartbeatIntervalMs).toBe(15000);
    expect(result.streamReadinessTimeoutMs).toBe(80000);
    expect(result.useUpstreamRetryHints).toBe(true);
    expect(result.circuitBreaker.enabled).toBe(true);
    expect(result.circuitBreaker.failureThreshold).toBe(5);
    expect(result.circuitBreaker.resetTimeoutMs).toBe(60000);
    expect(result.providerProfiles).toEqual({});
  });

  it("preserves valid custom values", () => {
    const result = normalizeChatRuntimeSettings({
      sseHeartbeatIntervalMs: 30000,
      streamReadinessTimeoutMs: 50000,
      useUpstreamRetryHints: false,
      circuitBreaker: {
        enabled: false,
        failureThreshold: 10,
        resetTimeoutMs: 120000,
      },
      providerProfiles: {
        openai: {
          baseCooldownMs: 5000,
          maxBackoffSteps: 3,
          useUpstreamRetryHints: false,
        },
      },
    });

    expect(result.sseHeartbeatIntervalMs).toBe(30000);
    expect(result.streamReadinessTimeoutMs).toBe(50000);
    expect(result.useUpstreamRetryHints).toBe(false);
    expect(result.circuitBreaker).toEqual({
      enabled: false,
      failureThreshold: 10,
      resetTimeoutMs: 120000,
    });
    expect(result.providerProfiles).toEqual({
      openai: {
        baseCooldownMs: 5000,
        maxBackoffSteps: 3,
        useUpstreamRetryHints: false,
      },
    });
  });

  it("allows sseHeartbeatIntervalMs of 0 (disabled)", () => {
    const result = normalizeChatRuntimeSettings({
      sseHeartbeatIntervalMs: 0,
    });
    expect(result.sseHeartbeatIntervalMs).toBe(0);
  });

  it("clamps sseHeartbeatIntervalMs below 5000 to 5000 (minimum floor)", () => {
    const result = normalizeChatRuntimeSettings({
      sseHeartbeatIntervalMs: 1,
    });
    expect(result.sseHeartbeatIntervalMs).toBe(5000);

    const result2 = normalizeChatRuntimeSettings({
      sseHeartbeatIntervalMs: 4999,
    });
    expect(result2.sseHeartbeatIntervalMs).toBe(5000);

    const result3 = normalizeChatRuntimeSettings({
      sseHeartbeatIntervalMs: 5000,
    });
    expect(result3.sseHeartbeatIntervalMs).toBe(5000);
  });

  it("falls back to defaults for invalid negative sseHeartbeatIntervalMs", () => {
    const result = normalizeChatRuntimeSettings({
      sseHeartbeatIntervalMs: -1,
    });
    expect(result.sseHeartbeatIntervalMs).toBe(15000);
  });

  it("falls back to defaults for invalid string sseHeartbeatIntervalMs", () => {
    const result = normalizeChatRuntimeSettings({
      sseHeartbeatIntervalMs: "invalid",
    });
    expect(result.sseHeartbeatIntervalMs).toBe(15000);
  });

  it("falls back to defaults for invalid streamReadinessTimeoutMs", () => {
    const result = normalizeChatRuntimeSettings({
      streamReadinessTimeoutMs: -100,
    });
    expect(result.streamReadinessTimeoutMs).toBe(80000);

    const result2 = normalizeChatRuntimeSettings({
      streamReadinessTimeoutMs: 0,
    });
    expect(result2.streamReadinessTimeoutMs).toBe(80000);
  });

  it("falls back to defaults for non-boolean useUpstreamRetryHints", () => {
    // useUpstreamRetryHints uses !== false pattern, so only explicit false disables it
    const result = normalizeChatRuntimeSettings({
      useUpstreamRetryHints: "no",
    });
    expect(result.useUpstreamRetryHints).toBe(true);

    const result2 = normalizeChatRuntimeSettings({
      useUpstreamRetryHints: 0,
    });
    expect(result2.useUpstreamRetryHints).toBe(true);
  });

  it("falls back to defaults for invalid circuitBreaker fields", () => {
    const result = normalizeChatRuntimeSettings({
      circuitBreaker: {
        enabled: "yes",
        failureThreshold: -1,
        resetTimeoutMs: "invalid",
      },
    });

    // enabled uses !== false, so anything not explicitly false is true
    expect(result.circuitBreaker.enabled).toBe(true);
    expect(result.circuitBreaker.failureThreshold).toBe(5);
    expect(result.circuitBreaker.resetTimeoutMs).toBe(60000);
  });

  it("falls back to defaults when circuitBreaker is not an object", () => {
    const result = normalizeChatRuntimeSettings({
      circuitBreaker: "invalid",
    });
    expect(result.circuitBreaker).toEqual({
      enabled: true,
      failureThreshold: 5,
      resetTimeoutMs: 60000,
    });
  });

  it("cleans invalid providerProfiles entries", () => {
    const result = normalizeChatRuntimeSettings({
      providerProfiles: {
        validProvider: {
          baseCooldownMs: 2000,
          maxBackoffSteps: 4,
        },
        invalidProvider: "not-an-object",
        arrayProvider: [1, 2, 3],
        emptyProvider: {},
        badValues: {
          baseCooldownMs: -5,
          maxBackoffSteps: "nope",
          useUpstreamRetryHints: "yes",
        },
      },
    });

    expect(result.providerProfiles.validProvider).toEqual({
      baseCooldownMs: 2000,
      maxBackoffSteps: 4,
    });
    expect(result.providerProfiles.invalidProvider).toBeUndefined();
    expect(result.providerProfiles.arrayProvider).toBeUndefined();
    expect(result.providerProfiles.emptyProvider).toEqual({});
    // badValues: baseCooldownMs is negative so omitted, maxBackoffSteps is NaN so omitted,
    // useUpstreamRetryHints is "yes" (not true) so it becomes false
    expect(result.providerProfiles.badValues).toEqual({
      useUpstreamRetryHints: false,
    });
  });

  it("handles providerProfiles that is not an object", () => {
    const result = normalizeChatRuntimeSettings({
      providerProfiles: "invalid",
    });
    expect(result.providerProfiles).toEqual({});

    const result2 = normalizeChatRuntimeSettings({
      providerProfiles: null,
    });
    expect(result2.providerProfiles).toEqual({});

    const result3 = normalizeChatRuntimeSettings({
      providerProfiles: [1, 2],
    });
    expect(result3.providerProfiles).toEqual({});
  });

  it("truncates float values to integers for numeric fields", () => {
    const result = normalizeChatRuntimeSettings({
      sseHeartbeatIntervalMs: 15000.7,
      streamReadinessTimeoutMs: 80000.9,
      circuitBreaker: {
        failureThreshold: 5.9,
        resetTimeoutMs: 60000.1,
      },
      providerProfiles: {
        test: {
          baseCooldownMs: 1000.8,
          maxBackoffSteps: 2.3,
        },
      },
    });

    expect(result.sseHeartbeatIntervalMs).toBe(15000);
    expect(result.streamReadinessTimeoutMs).toBe(80000);
    expect(result.circuitBreaker.failureThreshold).toBe(5);
    expect(result.circuitBreaker.resetTimeoutMs).toBe(60000);
    expect(result.providerProfiles.test.baseCooldownMs).toBe(1000);
    expect(result.providerProfiles.test.maxBackoffSteps).toBe(2);
  });

  it("preserves existing fields alongside new fields", () => {
    const result = normalizeChatRuntimeSettings({
      maxInflight: 3000,
      sseHeartbeatIntervalMs: 20000,
    });

    expect(result.maxInflight).toBe(3000);
    expect(result.sseHeartbeatIntervalMs).toBe(20000);
    expect(result.streamReadinessTimeoutMs).toBe(80000);
  });
});
