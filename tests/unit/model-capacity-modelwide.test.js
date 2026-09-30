// A "no capacity available for model X" reply is a statement about the MODEL on
// the upstream server, not about the account that happened to carry the request.
//
// It used to be treated as an ordinary per-connection failure. Because model
// locks are stored per connection, retiring one connection still left the rest of
// the fleet free to try the same dead model — observed in production on
// antigravity, which had 26 connections each burning a 503 in turn (~21 wasted
// calls/day) while 12 already carried a `claude-opus-4-6-thinking` lock.
//
// `modelWide` on the ERROR_RULE is what tells markAccountUnavailable to also
// retire the model provider-wide, so every connection skips it at once.

import { describe, it, expect } from "vitest";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";
import { ERROR_RULES } from "../../open-sse/config/errorConfig.js";

const CAPACITY_MESSAGE = "No capacity available for model claude-opus-4-6-thinking on the server";

describe("model-capacity errors are flagged model-wide", () => {
  it("flags the antigravity 503 capacity message", () => {
    const result = checkFallbackError(503, CAPACITY_MESSAGE);
    expect(result.isModelCapacity).toBe(true);
    expect(result.lockAll).toBe(false); // account stays usable for other models
    expect(result.shouldFallback).toBe(true);
    expect(result.cooldownMs).toBe(15 * 60 * 1000);
  });

  it("flags the message case-insensitively", () => {
    expect(checkFallbackError(503, "NO CAPACITY AVAILABLE FOR MODEL x").isModelCapacity).toBe(true);
    expect(checkFallbackError(503, "no capacity available for model x").isModelCapacity).toBe(true);
  });

  it("flags the model_capacity_exhausted variant", () => {
    expect(checkFallbackError(503, "model_capacity_exhausted").isModelCapacity).toBe(true);
  });

  it("does not flag ordinary rate limits", () => {
    expect(checkFallbackError(429, "rate limit exceeded").isModelCapacity).toBeFalsy();
    expect(checkFallbackError(429, "too many requests").isModelCapacity).toBeFalsy();
  });

  it("does not flag 4xx client errors or auth failures", () => {
    expect(checkFallbackError(400, "invalid_request_error").isModelCapacity).toBeFalsy();
    expect(checkFallbackError(404, "model not found").isModelCapacity).toBeFalsy();
    expect(checkFallbackError(401, "invalid api key").isModelCapacity).toBeFalsy();
  });

  it("does not flag a generic 503 with no capacity wording", () => {
    expect(checkFallbackError(503, "internal server error").isModelCapacity).toBeFalsy();
  });

  it("only the capacity rules carry modelWide", () => {
    const flagged = ERROR_RULES.filter((r) => r.modelWide).map((r) => r.text);
    expect(flagged).toEqual(["model_capacity_exhausted", "no capacity available for model"]);
  });

  it("keeps modelWide rules account-safe (never account-wide)", () => {
    for (const rule of ERROR_RULES.filter((r) => r.modelWide)) {
      expect(rule.lockAll).toBe(false);
      expect(rule.cooldownMs).toBeGreaterThan(0);
    }
  });
});
