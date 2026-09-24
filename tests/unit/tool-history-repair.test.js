import { describe, expect, it } from "vitest";

const { repairStrictOpenAIToolHistory } = await import(
  "../../open-sse/translator/concerns/toolCall.js"
);

const call = (id, name = "read_file") => ({
  id,
  type: "function",
  function: { name, arguments: "{}" },
});
const result = (id, content) => ({ role: "tool", tool_call_id: id, content });

/** Structural check a strict Gemini backend performs on an OpenAI history. */
function firstViolation(messages) {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !msg.tool_calls?.length) continue;
    const ids = msg.tool_calls.map((t) => t.id);
    const next = messages[i + 1];
    const answered = next?.role === "tool" && ids.includes(next.tool_call_id);
    if (!answered) return { index: i, ids, nextRole: next?.role ?? "(end)" };
  }
  return null;
}

describe("repairStrictOpenAIToolHistory", () => {
  it("keeps every tool result when a gateway reuses the same call id across turns", () => {
    // Gemini-backed gateways synthesise short per-response ids ("call_0",
    // "call_1"), so id "call_0" legitimately recurs on later turns. A
    // conversation-wide dedupe dropped the second result and left an orphaned
    // assistant turn — the exact shape that produced
    // "Please ensure that function call turn comes immediately after a user
    //  turn or after a function response turn."
    const body = {
      messages: [
        { role: "user", content: "read /etc/hostname" },
        { role: "assistant", content: null, tool_calls: [call("call_0")] },
        result("call_0", "myhost"),
        { role: "user", content: "now read /etc/os-release" },
        { role: "assistant", content: null, tool_calls: [call("call_0")] },
        result("call_0", "ID=cachyos"),
        { role: "user", content: "summarise" },
      ],
    };

    repairStrictOpenAIToolHistory(body);

    const results = body.messages.filter((m) => m.role === "tool");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.content)).toEqual(["myhost", "ID=cachyos"]);
    expect(body.messages.findIndex((m) => m.content === "now read /etc/os-release"))
      .toBeGreaterThan(body.messages.findIndex((m) => m.content === "myhost"));
    expect(firstViolation(body.messages)).toBeNull();
  });

  it("inserts a placeholder for an unanswered call instead of leaving it dangling", () => {
    const body = {
      messages: [
        { role: "user", content: "read a" },
        { role: "assistant", content: null, tool_calls: [call("c1")] },
        { role: "user", content: "still there?" },
      ],
    };

    repairStrictOpenAIToolHistory(body);

    expect(body.messages[2]).toMatchObject({
      role: "tool",
      tool_call_id: "c1",
      content: "[tool result unavailable]",
    });
    expect(firstViolation(body.messages)).toBeNull();
  });

  it("pairs duplicate ids inside one assistant turn with both results in order", () => {
    const body = {
      messages: [
        { role: "user", content: "go" },
        { role: "assistant", content: null, tool_calls: [call("dup"), call("dup")] },
        result("dup", "first"),
        result("dup", "second"),
        { role: "user", content: "ok" },
      ],
    };

    repairStrictOpenAIToolHistory(body);

    const results = body.messages.filter((m) => m.role === "tool");
    expect(results.map((r) => r.content)).toEqual(["first", "second"]);
    expect(results.every((r) => r.tool_call_id === "dup")).toBe(true);
    expect(firstViolation(body.messages)).toBeNull();
  });

  it("drops orphan tool messages that have no matching call", () => {
    const body = {
      messages: [
        { role: "user", content: "hi" },
        result("ghost", "no call for this"),
      ],
    };

    repairStrictOpenAIToolHistory(body);

    expect(body.messages.filter((m) => m.role === "tool")).toHaveLength(0);
  });

  it("leaves a clean history untouched", () => {
    const body = {
      messages: [
        { role: "system", content: "agent" },
        { role: "user", content: "read a" },
        { role: "assistant", content: null, tool_calls: [call("c_1")] },
        result("c_1", "A"),
        { role: "user", content: "thanks" },
      ],
    };
    const snapshot = JSON.parse(JSON.stringify(body));

    repairStrictOpenAIToolHistory(body);

    expect(body).toEqual(snapshot);
    expect(firstViolation(body.messages)).toBeNull();
  });

  it("preserves parallel tool calls and their results", () => {
    const body = {
      messages: [
        { role: "user", content: "read both" },
        { role: "assistant", content: null, tool_calls: [call("p1"), call("p2")] },
        result("p1", "one"),
        result("p2", "two"),
        { role: "user", content: "ok" },
      ],
    };

    repairStrictOpenAIToolHistory(body);

    expect(body.messages.filter((m) => m.role === "tool").map((r) => r.content))
      .toEqual(["one", "two"]);
    expect(firstViolation(body.messages)).toBeNull();
  });

  it("rewrites repeated per-turn ids for UniKey Gemini history", () => {
    const body = {
      messages: [
        { role: "user", content: "read one" },
        { role: "assistant", content: null, tool_calls: [call("call_0")] },
        result("call_0", "one"),
        { role: "user", content: "read two" },
        { role: "assistant", content: null, tool_calls: [call("call_0")] },
        result("call_0", "two"),
      ],
    };

    repairStrictOpenAIToolHistory(body, { uniqueCallIds: true });

    const assistants = body.messages.filter((m) => m.role === "assistant");
    const results = body.messages.filter((m) => m.role === "tool");
    expect(assistants.map((m) => m.tool_calls[0].id)).toEqual([
      "unikey_call_1_0",
      "unikey_call_4_0",
    ]);
    expect(results.map((m) => m.tool_call_id)).toEqual([
      "unikey_call_1_0",
      "unikey_call_4_0",
    ]);
  });

  it("is a no-op on bodies without a messages array", () => {
    expect(repairStrictOpenAIToolHistory(null)).toBeNull();
    expect(repairStrictOpenAIToolHistory({})).toEqual({});
  });
});
