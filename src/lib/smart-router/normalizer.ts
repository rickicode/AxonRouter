// Request normalizer
// Normalize OpenAI Chat, OpenAI Responses, and Anthropic Messages formats

import type { NormalizedRequest } from "./features";

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Record<string, unknown>[])
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const p = part as Record<string, unknown>;
      if (typeof p.text === "string") return p.text;
      if (typeof p.input_text === "string") return p.input_text;
      if (typeof p.output_text === "string") return p.output_text;
      if (typeof p.content === "string") return p.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function hasImageContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return (content as Record<string, unknown>[]).some((part) => {
    const type = String(part?.type || "").toLowerCase();
    return type.includes("image") || Boolean(part?.image_url) || (part?.source as Record<string, unknown>)?.type === "base64";
  });
}

interface RawMessage {
  role?: string;
  content?: unknown;
  type?: string;
  hasImage?: boolean;
}

function normalizeOpenAI(body: Record<string, unknown>): RawMessage[] {
  const messages = Array.isArray(body.messages) ? body.messages as RawMessage[] : [];
  return messages.map((m) => ({
    role: m.role || "unknown",
    content: m.content,
    hasImage: hasImageContent(m.content),
  }));
}

function normalizeResponses(body: Record<string, unknown>): RawMessage[] {
  if (typeof body.input === "string") return [{ role: "user", content: body.input, hasImage: false }];
  const input = Array.isArray(body.input) ? body.input as Record<string, unknown>[] : [];
  return input.map((item) => ({
    role: (item.role as string) || (item.type === "message" ? "user" : (item.type as string) || "unknown"),
    content: item.content ?? item.input ?? item.text,
    hasImage: hasImageContent(item.content),
  }));
}

function normalizeAnthropic(body: Record<string, unknown>): RawMessage[] {
  const messages = Array.isArray(body.messages) ? body.messages as RawMessage[] : [];
  const result: RawMessage[] = [];
  if (body.system) {
    result.push({ role: "system", content: body.system, hasImage: false });
  }
  for (const m of messages) {
    result.push({ role: m.role || "unknown", content: m.content, hasImage: hasImageContent(m.content) });
  }
  return result;
}

function firstMeaningful(messages: RawMessage[], role: string): string {
  const found = messages.find((m) => m.role === role && textFromContent(m.content).trim());
  return found ? textFromContent(found.content) : "";
}

function lastMeaningful(messages: RawMessage[], role: string): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role) {
      const text = textFromContent(messages[i].content);
      if (text.trim()) return text;
    }
  }
  return "";
}

export function normalizeRequest(pathname: string, body: Record<string, unknown>): NormalizedRequest {
  const format = pathname.endsWith("/messages")
    ? "anthropic"
    : pathname.endsWith("/responses") || body.input !== undefined
      ? "openai-responses"
      : "openai-chat";

  const messages = format === "anthropic"
    ? normalizeAnthropic(body)
    : format === "openai-responses"
      ? normalizeResponses(body)
      : normalizeOpenAI(body);

  const allText = messages.map((m) => textFromContent(m.content)).filter(Boolean).join("\n");
  const latestUserText = lastMeaningful(messages, "user") || lastMeaningful(messages, "input") || "";
  const systemText = firstMeaningful(messages, "system") || "";
  const tools = Array.isArray(body.tools) ? body.tools as Record<string, unknown>[] : [];

  return {
    allText,
    latestUserText,
    systemText,
    messageCount: messages.length,
    toolCount: tools.length,
    hasImage: messages.some((m) => m.hasImage),
    hasStructuredOutput: Boolean(body.response_format || body.text),
    reasoningEffort: (body.reasoning_effort || (body.reasoning as Record<string, unknown>)?.effort || null) as string | null,
  };
}
