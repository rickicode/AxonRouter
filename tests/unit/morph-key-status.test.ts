import { describe, expect, it } from "vitest";
import { buildMorphKeyStatusPatch } from "../../src/app/api/morph/test-key/shared.ts";

describe("Morph key status classification", () => {
  it("classifies invalid API key responses as inactive", () => {
    expect(buildMorphKeyStatusPatch({
      status: 401,
      responseText: JSON.stringify({ error: "Invalid API key" }),
    })).toMatchObject({
      status: "inactive",
      isExhausted: false,
      nextRetryAt: null,
    });
  });

  it("classifies credit and monthly quota failures as exhausted", () => {
    expect(buildMorphKeyStatusPatch({
      status: 402,
      responseText: "Monthly credit limit exceeded",
    })).toMatchObject({
      status: "exhausted",
      isExhausted: true,
      nextRetryAt: null,
    });
  });

  it("classifies rate limits as cooldown instead of invalid or exhausted", () => {
    const patch = buildMorphKeyStatusPatch({
      status: 429,
      responseText: "Rate limit exceeded. Too many requests.",
    });

    expect(patch).toMatchObject({
      status: "cooldown",
      isExhausted: false,
    });
    expect(typeof patch.nextRetryAt).toBe("string");
    expect(new Date(String(patch.nextRetryAt)).getTime()).toBeGreaterThan(Date.now() + (13 * 24 * 60 * 60 * 1000));
    expect(new Date(String(patch.nextRetryAt)).getTime()).toBeLessThanOrEqual(Date.now() + (14 * 24 * 60 * 60 * 1000) + 60_000);
  });

  it("does not classify generic upstream errors as invalid", () => {
    expect(buildMorphKeyStatusPatch({
      status: 500,
      responseText: "Internal server error",
    })).toMatchObject({
      status: "unknown",
      isExhausted: false,
      nextRetryAt: null,
    });
  });
});
