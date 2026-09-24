import { describe, expect, it } from "vitest";

const { formatProviderError, unwrapJsonMessage } = await import("../../open-sse/utils/error.js");

const GEMINI_NESTED =
  '{"error":{"message":"Please ensure that function call turn comes immediately after a user turn or after a function response turn.","type":"invalid_request_error","param":"","code":null}}';

describe("formatProviderError — provider/model visibility", () => {
  it("labels the error with provider and model so the client can debug without server logs", () => {
    const out = formatProviderError(new Error(GEMINI_NESTED), "unikey", "google/gemini-3.5-flash", 400);
    expect(out).toBe(
      "[400 · unikey/google/gemini-3.5-flash]: Please ensure that function call turn comes immediately after a user turn or after a function response turn."
    );
  });

  it("omits the model segment when only the provider is known", () => {
    expect(formatProviderError(new Error("boom"), "ag", null, 502)).toBe("[502 · ag]: boom");
  });

  it("omits the context segment entirely when neither is known (no dangling separator)", () => {
    expect(formatProviderError(new Error("x"), null, undefined, 500)).toBe("[500]: x");
  });

  it("keeps the low-level fetch cause attached", () => {
    const err = new Error("fetch failed");
    err.cause = { code: "UND_ERR_SOCKET" };
    expect(formatProviderError(err, "p", "m", 502)).toBe("[502 · p/m]: fetch failed (cause: UND_ERR_SOCKET)");
  });

  it("falls back to FETCH_FAILED when no status code is supplied", () => {
    expect(formatProviderError(new Error("nope"), "p", "m")).toBe("[FETCH_FAILED · p/m]: nope");
  });
});

describe("unwrapJsonMessage — nested OpenAI envelopes", () => {
  it("peels a single JSON envelope down to the real message", () => {
    expect(unwrapJsonMessage(GEMINI_NESTED)).toBe(
      "Please ensure that function call turn comes immediately after a user turn or after a function response turn."
    );
  });

  it("peels double-nested error.error.message", () => {
    expect(unwrapJsonMessage('{"error":{"error":{"message":"deep"}}}')).toBe("deep");
  });

  it("handles a string-valued error field", () => {
    expect(unwrapJsonMessage('{"error":"rate limited"}')).toBe("rate limited");
  });

  it("passes through plain text untouched", () => {
    expect(unwrapJsonMessage("plain reason")).toBe("plain reason");
  });

  it("passes through malformed JSON untouched", () => {
    expect(unwrapJsonMessage("{not json")).toBe("{not json");
  });

  it("does not loop forever on self-referential envelopes", () => {
    const selfRef = '{"error":{"message":"{\\"error\\":{\\"message\\":\\"selfRef\\"}}"}}';
    expect(unwrapJsonMessage(selfRef)).toBe("selfRef");
  });

  it("returns non-string input unchanged", () => {
    expect(unwrapJsonMessage(undefined)).toBeUndefined();
  });
});
