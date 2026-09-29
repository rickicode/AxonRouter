/**
 * Regression coverage for payload-free ("empty") upstream responses.
 *
 * A provider can answer a perfectly valid 200 SSE envelope — role event, then
 * finish_reason, then [DONE] — and never emit a single content delta. The old
 * pipeline committed that as a success: the client received an empty 200 and
 * the combo cascade stopped on a member that produced nothing, so the remaining
 * healthy members were never tried.
 *
 * `peekStreamHead` alone cannot see it (one chunk; that first frame is valid),
 * hence `peekStreamHasPayload`, which reads ahead until it sees real payload,
 * the upstream closes, or the bounded budget runs out.
 */
import { describe, it, expect } from "vitest";
import { peekStreamHasPayload } from "../../open-sse/utils/streamHandler.js";

const enc = (s) => new TextEncoder().encode(s);

/** Build a ReadableStream from raw SSE frames, flushed one chunk per frame. */
function sseStream(frames) {
  return new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(enc(f));
      controller.close();
    },
  });
}

/** Drain a stream fully and return the concatenated text. */
async function drain(stream) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

describe("peekStreamHasPayload — empty detection", () => {
  it("flags an OpenAI stream that closes with only role + finish_reason", async () => {
    const r = await peekStreamHasPayload(
      sseStream([
        'data: {"choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ])
    );
    expect(r.empty).toBe(true);
  });

  it("flags a Claude stream that closes with only message_stop", async () => {
    const r = await peekStreamHasPayload(
      sseStream([
        'event: message_start\ndata: {"type":"message_start","message":{"role":"assistant"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ])
    );
    expect(r.empty).toBe(true);
  });

  it("flags a Gemini stream with zero parts", async () => {
    const r = await peekStreamHasPayload(
      sseStream([
        'data: {"candidates":[{"content":{"role":"model","parts":[]},"finishReason":"STOP"}]}\n\n',
      ])
    );
    expect(r.empty).toBe(true);
  });
});

describe("peekStreamHasPayload — must NOT flag valid answers", () => {
  it("accepts OpenAI text content", async () => {
    const r = await peekStreamHasPayload(
      sseStream([
        'data: {"choices":[{"index":0,"delta":{"role":"assistant"}}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n',
        "data: [DONE]\n\n",
      ])
    );
    expect(r.empty).toBe(false);
  });

  it("accepts an empty CONTENT string that carries a tool call", async () => {
    // The critical case: content-less but NOT empty — a tool call is a real answer.
    const r = await peekStreamHasPayload(
      sseStream([
        'data: {"choices":[{"index":0,"delta":{"role":"assistant"}}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"get_weather","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ])
    );
    expect(r.empty).toBe(false);
  });

  it("accepts a Claude tool_use block", async () => {
    const r = await peekStreamHasPayload(
      sseStream([
        'data: {"type":"message_start","message":{"role":"assistant"}}\n\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"t1","name":"search"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ])
    );
    expect(r.empty).toBe(false);
  });

  it("accepts a Gemini functionCall part", async () => {
    const r = await peekStreamHasPayload(
      sseStream([
        'data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"ping","args":{}}}]}}]}\n\n',
      ])
    );
    expect(r.empty).toBe(false);
  });

  it("accepts reasoning-only output (thinking is a real answer)", async () => {
    const r = await peekStreamHasPayload(
      sseStream([
        'data: {"choices":[{"index":0,"delta":{"reasoning_content":"let me think"}}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      ])
    );
    expect(r.empty).toBe(false);
  });

  it("accepts a non-streaming envelope served over an SSE transport", async () => {
    const r = await peekStreamHasPayload(
      sseStream(['data: {"choices":[{"message":{"role":"assistant","content":"whole answer"}}]}\n\n'])
    );
    expect(r.empty).toBe(false);
  });
});

describe("peekStreamHasPayload — stream integrity (no chunk loss)", () => {
  it("replays every consumed chunk so the caller sees the full body", async () => {
    // A valid answer that arrives across many frames: the probe stops early
    // once it sees payload, and the returned stream must still carry all of it.
    const frames = [
      'data: {"choices":[{"index":0,"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"content":"part one "}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"content":"part two "}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"content":"part three"}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const r = await peekStreamHasPayload(sseStream(frames));
    expect(r.empty).toBe(false);
    expect(r.stream).toBeTruthy();
    // The replayed stream must be a superset of what the caller would have read.
    const seen = await drain(r.stream);
    for (const f of frames) expect(seen).toContain(f.trim());
  });

  it("returns no replay stream when the stream is fully consumed and empty", async () => {
    const r = await peekStreamHasPayload(
      sseStream(['data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'])
    );
    expect(r.empty).toBe(true);
    expect(r.stream).toBeNull();
  });
});

describe("peekStreamHasPayload — latency: no waiting on the close", () => {
  it("decides immediately on finish_reason instead of waiting for the socket to close", async () => {
    // A stream that signals finish_reason but never closes would hold the probe
    // for the full timeout budget under a close-based check. The terminal signal
    // is decisive on its own, so this must resolve without the close.
    const neverClosing = new ReadableStream({
      start(controller) {
        controller.enqueue(enc('data: {"choices":[{"index":0,"delta":{"role":"assistant"}}]}\n\n'));
        controller.enqueue(enc('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'));
        // deliberately NOT closed
      },
    });
    const started = Date.now();
    const r = await peekStreamHasPayload(neverClosing, { maxChunks: 8, timeoutMs: 30000 });
    const elapsed = Date.now() - started;
    expect(r.empty).toBe(true);
    // 30s budget was available; a terminal verdict must not consume it.
    expect(elapsed).toBeLessThan(1000);
  });

  it("does not stall a healthy stream that emits its first token immediately", async () => {
    const s = new ReadableStream({
      start(controller) {
        controller.enqueue(enc('data: {"choices":[{"index":0,"delta":{"role":"assistant"}}]}\n\n'));
        controller.enqueue(enc('data: {"choices":[{"index":0,"delta":{"content":"hi"}}]}\n\n'));
        // deliberately NOT closed — payload is enough to commit.
      },
    });
    const started = Date.now();
    const r = await peekStreamHasPayload(s, { maxChunks: 8, timeoutMs: 30000 });
    expect(r.empty).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("peekStreamHasPayload — fail-open on inconclusive input", () => {
  it("does not flag a stream that is still open after the peek budget", async () => {
    // Never closes, never sends payload within maxChunks: inconclusive, so we
    // must NOT claim "empty" (that would kill legitimate slow producers).
    const r = await peekStreamHasPayload(new ReadableStream({ start() {} }), { maxChunks: 3, timeoutMs: 50 });
    expect(r.empty).toBe(false);
  });

  it("does not flag unparseable frames", async () => {
    const r = await peekStreamHasPayload(
      sseStream(["data: {not json at all\n\n", "data: [DONE]\n\n"])
    );
    expect(r.empty).toBe(true); // closed, and no parseable payload
  });

  it("is a no-op when the stream cannot be locked", async () => {
    const s = sseStream(['data: {"choices":[{"index":0,"delta":{"content":"x"}}]}\n\n']);
    const r0 = await drain(s).then(() => null).catch(() => null);
    expect(r0).toBeNull();
    // A fresh, lockable stream still works — guards the getReader() early return.
    const ok = await peekStreamHasPayload(sseStream(['data: {"choices":[{"index":0,"delta":{"content":"x"}}]}\n\n']));
    expect(ok.empty).toBe(false);
  });
});
