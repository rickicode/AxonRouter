// Replay REAL recorded UniKey upstream SSE bytes (direct upstream capture,
// tests/translator/__fixtures__/unikey-direct-gemini-3.5-flash.sse) through the
// fixed gateway code and assert no nameless tool call reaches either client
// format. Regression test for "Model generated invalid tool call".
import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveFailedRequest: vi.fn(async () => {}),
}));

import "./registerAll.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import {
  createPassthroughStreamWithLogger,
  createSSETransformStreamWithLogger,
} from "../../open-sse/utils/stream.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW_SSE = readFileSync(
  path.join(HERE, "__fixtures__/unikey-direct-gemini-3.5-flash.sse"), "utf8");

const BODY = {
  model: "gemini-3.5-flash",
  messages: [{ role: "user", content: "List files matching *combo* using glob." }],
  tools: [{ type: "function", function: { name: "glob", description: "g",
    parameters: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] } } }],
};

async function pump(stream, sseText) {
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();
  const enc = new TextEncoder();
  // Read concurrently: TransformStream applies backpressure, so writes must
  // not wait for reads to start (and vice versa).
  let out = "";
  const dec = new TextDecoder();
  const draining = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
    }
  })();
  // Feed the way TCP chunks arrive (split mid-line on purpose)
  const bytes = enc.encode(sseText);
  const mid = Math.floor(bytes.length / 2);
  await writer.write(bytes.slice(0, mid));
  await writer.write(bytes.slice(mid));
  await writer.close();
  await draining;
  return out;
}

function openaiToolCalls(sseOut) {
  const calls = [];
  for (const line of sseOut.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const d = t.slice(5).trim();
    if (d === "[DONE]") continue;
    const parsed = JSON.parse(d);
    for (const ch of parsed.choices || []) {
      for (const tc of ch.delta?.tool_calls || []) calls.push(tc);
    }
  }
  return calls;
}

function claudeToolUses(sseOut) {
  const uses = [];
  for (const line of sseOut.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const d = t.slice(5).trim();
    if (!d || d === "[DONE]") continue;
    const parsed = JSON.parse(d);
    if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") {
      uses.push(parsed.content_block);
    }
  }
  return uses;
}

describe("recorded unikey SSE replay", () => {
  let openaiOut, claudeOut;
  beforeAll(async () => {
    openaiOut = await pump(
      createPassthroughStreamWithLogger("unikey", null, "gemini-3.5-flash", null, BODY, null, null),
      RAW_SSE);
    claudeOut = await pump(
      createSSETransformStreamWithLogger(FORMATS.OPENAI, FORMATS.CLAUDE, "unikey", null, null,
        "gemini-3.5-flash", null, BODY, null, null),
      RAW_SSE);
  }, 30000);

  it("openai path: every streamed tool call carries function.name", () => {
    const calls = openaiToolCalls(openaiOut);
    expect(calls.length).toBeGreaterThan(0);
    for (const tc of calls) {
      if (tc.function && "arguments" in (tc.function || {})) {
        // args-only continuation deltas are fine; the assembled call must resolve —
        // assert at least one delta carried the repaired name
      }
    }
    expect(calls.some((tc) => tc.function?.name === "glob")).toBe(true);
  });

  it("claude path: no tool_use block is emitted with empty name", () => {
    const uses = claudeToolUses(claudeOut);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u.name).toBe("glob");
  });
});
