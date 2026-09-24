import { describe, expect, it } from "vitest";
import {
  SEARCH_DEBOUNCE_MS,
  matchesSearchQuery,
  truncateErrorText,
} from "@/app/(dashboard)/dashboard/providers/utils.js";

describe("providers search debounce + helpers", () => {
  it("debounce is 200ms per spec", () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(200);
  });

  it("matchesSearchQuery is case-insensitive substring", () => {
    expect(matchesSearchQuery("OpenAI", "open")).toBe(true);
    expect(matchesSearchQuery("Anthropic", "THRO")).toBe(true);
    expect(matchesSearchQuery("OpenAI", "xyz")).toBe(false);
  });

  it("empty/blank query matches everything, empty name matches nothing", () => {
    expect(matchesSearchQuery("OpenAI", "")).toBe(true);
    expect(matchesSearchQuery("OpenAI", "   ")).toBe(true);
    expect(matchesSearchQuery("", "open")).toBe(false);
    expect(matchesSearchQuery(null, "open")).toBe(false);
  });

  it("truncateErrorText passes short text through", () => {
    expect(truncateErrorText("3 Error (ERR)")).toBe("3 Error (ERR)");
    expect(truncateErrorText(null)).toBe(null);
    expect(truncateErrorText(undefined)).toBe(undefined);
  });

  it("truncateErrorText truncates long upstream strings with ellipsis", () => {
    const long = "x".repeat(100);
    const out = truncateErrorText(long, 32);
    expect(out.length).toBeLessThanOrEqual(32);
    expect(out.endsWith("…")).toBe(true);
  });
});
