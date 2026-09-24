import { describe, it, expect } from "vitest";
import { peekStreamHead } from "../../open-sse/utils/streamHandler.js";

const enc = new TextEncoder();
const sse = (s) => new ReadableStream({
  start(c) { c.enqueue(enc.encode(s)); c.close(); },
});
const hanging = () => new ReadableStream({ start() {} });
const failing = () => new ReadableStream({
  start(c) { c.error(new Error("socket hang up")); },
});

async function collect(stream) {
  const reader = stream.getReader();
  let out = "";
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

describe("peekStreamHead commit gate", () => {
  it("passes data streams through with the head chunk intact", async () => {
    const body = 'data: {"a":1}\n\ndata: [DONE]\n\n';
    const out = await peekStreamHead(sse(body), 500);
    expect(out.failed).toBeFalsy();
    expect(await collect(out.stream)).toBe(body);
  });

  it("fails a stream that errors with zero bytes", async () => {
    const out = await peekStreamHead(failing(), 500);
    expect(out.failed).toBe(true);
    expect(out.error?.message).toMatch(/socket hang up/);
  });

  it("fails an immediately-closed (zero-byte) stream", async () => {
    const out = await peekStreamHead(new ReadableStream({ start(c) { c.close(); } }), 500);
    expect(out.failed).toBe(true);
  });

  it("fails non-SSE garbage behind an SSE content-type", async () => {
    const out = await peekStreamHead(sse("<html><title>Error</title></html>"), 500);
    expect(out.failed).toBe(true);
    expect(out.error?.message).toContain("not SSE");
  });

  it("times out fail-open on a hanging stream (commit as today)", async () => {
    const out = await peekStreamHead(hanging(), 50);
    expect(out.failed).toBeFalsy();
    expect(out.timedOut).toBe(true);
    expect(out.stream).toBeDefined();
  });

  it("treats whitespace keepalive as inconclusive, not failure", async () => {
    const out = await peekStreamHead(sse("   "), 500);
    expect(out.failed).toBeFalsy();
  });
});
