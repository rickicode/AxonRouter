/**
 * Per-provider override for the stream commit peek.
 *
 * The commit peek waits a bounded time for the first bytes after upstream
 * headers arrive. On timeout it is treated as inconclusive and commits the
 * stream as a success — fail-open, so a slow client never hangs.
 *
 * That tradeoff breaks a provider whose prompt prefill routinely outruns the
 * 8s default: the peek gives up, the stream commits, and an answer that was
 * still being generated gets recorded as empty and never retried.
 *
 * Measured on atria-asi in production: ttft 20681 / 6965 / 95123 ms across
 * three consecutive requests, all logged EMPTY-COMMITTED.
 */
import { describe, it, expect } from "vitest";
import { PROVIDERS } from "../../open-sse/providers/index.js";
import { readFileSync } from "node:fs";

const handlerSrc = readFileSync(
  new URL("../../open-sse/handlers/chatCore/streamingHandler.js", import.meta.url),
  "utf8",
);

describe("per-provider commit peek override", () => {
  it("declares a longer peek for the slow-prefill provider", () => {
    expect(PROVIDERS["atria-asi"]?.commitPeekMs).toBeGreaterThan(8 * 1000);
  });

  it("leaves providers without an override on the global default", () => {
    expect(PROVIDERS["codex"]?.commitPeekMs).toBeUndefined();
  });

  it("resolves the peek timeout per provider, not from the global constant", () => {
    expect(handlerSrc).toMatch(
      /commitPeekMs\s*=\s*PROVIDERS\[provider\]\?\.commitPeekMs\s*\|\|\s*STREAM_COMMIT_PEEK_MS/,
    );
  });

  it("passes the override to both peek gates", () => {
    expect(handlerSrc).toMatch(/peekStreamHead\(transformedBody,\s*commitPeekMs\)/);
    expect(handlerSrc).toMatch(
      /peekStreamHasPayload\(committedBody,\s*\{\s*timeoutMs:\s*commitPeekMs\s*\}\)/,
    );
  });
});
