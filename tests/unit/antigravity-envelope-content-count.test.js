/**
 * Regression: antigravity responses were counted as zero-length by stream.js.
 *
 * finalizeStream() tallied generated text from a TOP-LEVEL `candidates` array
 * only. The antigravity response translator (translator/response/
 * openai-to-antigravity.js) nests the Gemini envelope one level deeper under
 * `response`, so every antigravity answer carried real text to the client
 * (observed OUT 301-1862) while totalContentLength stayed 0 — and the response
 * was recorded as empty at completion.
 *
 * The pre-commit gate (peekStreamHasPayload) already unwrapped the envelope, so
 * it never flagged these. Only the completion accounting was wrong, which is
 * why the log showed a healthy OUT count next to an EMPTY verdict.
 *
 * `content` is empty here because the transform converts the Gemini frame into
 * client-format SSE, so the translated text is asserted from isEmpty rather
 * than from content.
 *
 * Verified against the fix: reverting the unwrap in stream.js makes the first
 * test fail; with it, isEmpty is false.
 */
import { describe, it, expect } from "vitest";
import { createSSEStream } from "../../open-sse/utils/stream.js";

const enc = (s) => new TextEncoder().encode(s);

const sseStream = (chunks) =>
  new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc(c));
      controller.close();
    },
  });

const antigravityFrame = (text, finishReason = null) =>
  `data: ${JSON.stringify({
    response: { candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }] },
  })}\n\n`;

const runStream = async (frames) => {
  const captured = [];
  const transform = createSSEStream({
    targetFormat: "openai",
    sourceFormat: "antigravity",
    provider: "antigravity",
    model: "claude-opus-4-6-thinking",
    onStreamComplete: (payload) => { captured.push(payload); },
  });
  await new Response(sseStream(frames).pipeThrough(transform)).text();
  return captured;
};

describe("stream.js counts text through the antigravity response envelope", () => {
  it("reports isEmpty false for real text carried under response.candidates", async () => {
    const captured = await runStream([
      antigravityFrame("hello"),
      antigravityFrame(" world"),
      antigravityFrame("", "STOP"),
    ]);

    expect(captured.length).toBe(1);
    expect(captured[0]?.isEmpty).toBe(false);
  });

  it("still reports empty when the nested envelope carries no text at all", async () => {
    const captured = await runStream([
      `data: ${JSON.stringify({
        response: { candidates: [{ content: { role: "model", parts: [] }, finishReason: "STOP" }] },
      })}\n\n`,
    ]);

    expect(captured.length).toBe(1);
    expect(captured[0]?.isEmpty).toBe(true);
  });

  it("does not regress a plain top-level Gemini stream", async () => {
    const captured = await runStream([
      'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"plain"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"role":"model","parts":[]},"finishReason":"STOP"}]}\n\n',
    ]);

    expect(captured.length).toBe(1);
    expect(captured[0]?.isEmpty).toBe(false);
  });
});
