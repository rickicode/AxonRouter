// Regression tests for the TokenHarbor 429 "at capacity" handling.
//
// Two real bugs are locked down here:
//
// 1. `markPoolUnfit()` is a SYNC function (returns undefined), but the executor
//    called `markPoolUnfit(...).catch(() => {})`. On every 403 region-block that
//    threw `TypeError: Cannot read properties of undefined (reading 'catch')`,
//    which surfaced to the client as:
//      [TokenHarbor] All speculative attempts failed: Cannot read properties of
//      undefined (reading 'catch')
//    The same call site also passed `errReason` as the 3rd positional argument
//    (`until`), so isPoolFit()'s numeric comparison was poisoned and the pool
//    was never actually marked unfit.
//
// 2. The provider-wide PER-MODEL cooldown only fired when `capacityFailures`
//    reached MAX_TOTAL_HEDGE_ATTEMPTS (10). With a real account pool the
//    credentials run out long before 10 tries, so the cooldown never fired and
//    every new request re-hammered all accounts (hot loop).
//
// The cooldown window is clamped to 60-120s: the upstream hint "retry in about
// 30 seconds" is too short to be useful with a large account pool, and an
// unbounded hint would park healthy accounts for too long.

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  clampModelCooldownSeconds,
  MODEL_CAPACITY_COOLDOWN_MIN_SECONDS,
  MODEL_CAPACITY_COOLDOWN_MAX_SECONDS,
  MODEL_CAPACITY_COOLDOWN_DEFAULT_SECONDS,
} from "../../open-sse/config/errorConfig.js";
import { isPoolFit, markPoolUnfit, resetPoolFitness } from "../../open-sse/services/proxyPoolFitness.js";

describe("clampModelCooldownSeconds", () => {
  it("uses the configured default when the upstream hint is missing or unparseable", () => {
    expect(clampModelCooldownSeconds(NaN)).toBe(MODEL_CAPACITY_COOLDOWN_DEFAULT_SECONDS);
    expect(clampModelCooldownSeconds(undefined)).toBe(MODEL_CAPACITY_COOLDOWN_DEFAULT_SECONDS);
    expect(clampModelCooldownSeconds("not a number")).toBe(MODEL_CAPACITY_COOLDOWN_DEFAULT_SECONDS);
  });

  it("floors a too-short hint at the minimum (upstream said 30s)", () => {
    // The real upstream message is "Please retry in about 30 seconds."
    expect(clampModelCooldownSeconds(30)).toBe(MODEL_CAPACITY_COOLDOWN_MIN_SECONDS);
    expect(clampModelCooldownSeconds(1)).toBe(MODEL_CAPACITY_COOLDOWN_MIN_SECONDS);
    expect(clampModelCooldownSeconds(0)).toBe(MODEL_CAPACITY_COOLDOWN_MIN_SECONDS);
  });

  it("caps a too-long hint at the maximum", () => {
    expect(clampModelCooldownSeconds(200)).toBe(MODEL_CAPACITY_COOLDOWN_MAX_SECONDS);
    expect(clampModelCooldownSeconds(86400)).toBe(MODEL_CAPACITY_COOLDOWN_MAX_SECONDS);
  });

  it("passes a hint that is already inside the window through unchanged", () => {
    expect(clampModelCooldownSeconds(60)).toBe(60);
    expect(clampModelCooldownSeconds(90)).toBe(90);
    expect(clampModelCooldownSeconds(120)).toBe(120);
  });

  it("keeps the window ordered and non-empty", () => {
    expect(MODEL_CAPACITY_COOLDOWN_MIN_SECONDS).toBeLessThanOrEqual(MODEL_CAPACITY_COOLDOWN_DEFAULT_SECONDS);
    expect(MODEL_CAPACITY_COOLDOWN_DEFAULT_SECONDS).toBeLessThanOrEqual(MODEL_CAPACITY_COOLDOWN_MAX_SECONDS);
  });
});

describe("markPoolUnfit contract", () => {
  beforeEach(() => {
    resetPoolFitness();
  });

  // The executor must call markPoolUnfit(poolId, scope, until, reason) with the
  // reason in the 4th slot. Passing it in the 3rd slot (`until`) made
  // isPoolFit() compare a string against a number, so the pool was never
  // excluded and region-block protection silently did nothing.
  it("accepts the reason in the 4th argument and still marks the pool unfit", () => {
    const reason = "HTTP 403: request was refused for region";
    markPoolUnfit("pool-1", "tokenharbor::model-x", undefined, reason);
    expect(isPoolFit("pool-1", "tokenharbor::model-x", Date.now())).toBe(false);
  });

  it("leaves a healthy pool fit when no mark was placed", () => {
    expect(isPoolFit("pool-healthy", "tokenharbor::model-x", Date.now())).toBe(true);
  });

  it("does not return a promise (regression: .catch() on undefined)", () => {
    // The executor previously did `markPoolUnfit(...).catch(() => {})`, which
    // threw TypeError because the function is sync. Assert the return value so
    // a future refactor to `async` is a deliberate, visible change.
    const ret = markPoolUnfit("pool-2", "tokenharbor::model-y", undefined, "reason");
    expect(ret).toBeUndefined();
    expect(typeof ret?.catch).not.toBe("function");
  });

  it("ignores an empty poolId or scope instead of throwing", () => {
    expect(() => markPoolUnfit("", "tokenharbor::model-x", undefined, "r")).not.toThrow();
    expect(() => markPoolUnfit("pool-3", "", undefined, "r")).not.toThrow();
  });
});

describe("TokenHarbor executor source invariants", () => {
  // Source-level guards: the wiring bugs above are all in one file and are easy
  // to reintroduce during a refactor. These fail loudly if the shape regresses.
  let src;

  beforeEach(async () => {
    const { readFileSync } = await import("node:fs");
    src = readFileSync(new URL("../../open-sse/executors/tokenharbor.js", import.meta.url), "utf8");
  });

  it("never calls .catch() on the sync markPoolUnfit()", () => {
    expect(src).not.toMatch(/markPoolUnfit\([^)]*\)\.catch\(/);
  });

  it("passes the region-block reason in the 4th positional slot of markPoolUnfit", () => {
    const call = src.match(/markPoolUnfit\([^)]*\)/g) || [];
    expect(call.length).toBeGreaterThan(0);
    for (const c of call) {
      // (poolId, scope, until, reason) -> 4 args, and the 3rd must be `undefined`
      // so the default `until` applies instead of a string.
      expect(c.startsWith("markPoolUnfit(pOptions.proxyPoolId, `tokenharbor::${model}`, undefined,")).toBe(true);
    }
  });

  it("gates the provider-wide cooldown on pool exhaustion, not a fixed attempt count", () => {
    // The dead guard was `capacityFailures >= MAX_TOTAL_HEDGE_ATTEMPTS`.
    expect(src).not.toMatch(/capacityFailures\s*>=\s*MAX_TOTAL_HEDGE_ATTEMPTS/);
    expect(src).toMatch(/capacityFailures\s*>\s*0\s*&&\s*exhaustedPool/);
  });

  it("routes the cooldown duration through the shared clamp helper", () => {
    expect(src).toMatch(/clampModelCooldownSeconds\(/);
    // No raw 30s fallback left in the cooldown path.
    expect(src).not.toMatch(/retrySecs\s*=\s*retryMatch\s*\?\s*parseInt\([^)]*\)\s*:\s*30/);
  });

  it("carries connName on the failure result so capacity logs name the account", () => {
    // The 429/capacity early-return omitted `connName`, so every hedge line
    // read "Account undefined at model capacity" (36 of 36 in a 30m window) and
    // gave no way to tell which credential was being rotated away from.
    const failureReturn = src.match(/return\s*\{[^}]*isModelCapacity[^}]*\}/);
    expect(failureReturn).not.toBeNull();
    expect(failureReturn[0]).toMatch(/connName/);
  });
});

describe("chat.js handler source invariants", () => {
  let src;

  beforeEach(async () => {
    const { readFileSync } = await import("node:fs");
    src = readFileSync(new URL("../../src/sse/handlers/chat.js", import.meta.url), "utf8");
  });

  it("promotes the per-model cooldown in the account-pool-exhausted branch", () => {
    expect(src).toMatch(/credentials\.lastErrorCode === "ACCOUNT_EXHAUSTED"/);
    // The cooldown guard now sits before the ACCOUNT_EXHAUSTED check, i.e.
    // inside the allRateLimited branch.
    const idxCooldown = src.indexOf("clampModelCooldownSeconds");
    const idxExhausted = src.indexOf('credentials.lastErrorCode === "ACCOUNT_EXHAUSTED"');
    expect(idxCooldown).toBeGreaterThan(-1);
    expect(idxCooldown).toBeLessThan(idxExhausted);
  });

  it("no longer sets a model cooldown from the MAX_FALLBACK_ATTEMPTS cap", () => {
    const capIdx = src.indexOf("Reached maximum fallback attempts");
    const window = src.slice(capIdx, capIdx + 700);
    expect(window).not.toMatch(/setProviderModelCooldown/);
  });
});
