import { FORMATS } from "../translator/formats";
import {
  type CavemanSettings,
  DEFAULT_CAVEMAN_SETTINGS,
  normalizeCavemanSettings,
  resolveCavemanPrompt,
} from "../config/caveman";

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildPrompt(rawSettings: CavemanSettings | Record<string, unknown> | unknown): string {
  return resolveCavemanPrompt(rawSettings);
}

function normalizeMessageText(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function applyCavemanToOpenAIMessages(body: any, rawSettings: unknown) {
  const settings = normalizeCavemanSettings(rawSettings);
  if (!settings.enabled) return body;

  const prompt = buildPrompt(settings);
  if (!prompt) return body;

  if (!Array.isArray(body?.messages)) {
    body.messages = [{ role: "system", content: prompt }];
    return body;
  }

  const idx = body.messages.findIndex((m: any) => m?.role === "system" || m?.role === "developer");
  if (idx === -1) {
    body.messages.unshift({ role: "system", content: prompt });
    return body;
  }

  const target = body.messages[idx];
  const existingText = normalizeMessageText(target?.content);
  target.role = "system";
  target.content = existingText ? `${existingText}\n\n${prompt}` : prompt;
  return body;
}

export function applyCavemanToOpenAIResponsesBody(body: any, rawSettings: unknown) {
  const settings = normalizeCavemanSettings(rawSettings);
  if (!settings.enabled) return body;

  const prompt = buildPrompt(settings);
  if (!prompt) return body;

  if (!Array.isArray(body?.input)) {
    body.input = [];
  }

  const idx = body.input.findIndex(
    (item: any) => item?.type === "message" && (item?.role === "developer" || item?.role === "system")
  );

  if (idx >= 0) {
    const current = body.input[idx];
    const currentText = Array.isArray(current?.content)
      ? current.content.filter((part: any) => typeof part?.text === "string").map((part: any) => part.text).join("\n")
      : "";
    current.role = "developer";
    current.content = [{ type: "input_text", text: currentText ? `${currentText}\n\n${prompt}` : prompt }];
  } else {
    body.input.unshift({
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: prompt }],
    });
  }
  return body;
}

export function applyCavemanToOpenAIIntermediate(body: any, rawSettings: unknown, sourceFormat?: string, targetFormat?: string) {
  if (sourceFormat === FORMATS.OPENAI_RESPONSES && targetFormat === FORMATS.OPENAI_RESPONSES) {
    return applyCavemanToOpenAIResponsesBody(body, rawSettings);
  }
  return applyCavemanToOpenAIMessages(body, rawSettings);
}

export function applyCavemanToPassthroughBody(body: any, rawSettings: unknown, format: string) {
  const settings = normalizeCavemanSettings(rawSettings);
  if (!settings.enabled || settings.applyToPassthrough === false) return body;

  const prompt = buildPrompt(settings);
  if (!prompt) return body;

  if (format === FORMATS.CLAUDE) {
    const current = body?.system;
    if (typeof current === "string") {
      body.system = hasText(current) ? `${current}\n\n${prompt}` : prompt;
      return body;
    }
    if (Array.isArray(current)) {
      current.push({ type: "text", text: prompt, cache_control: { type: "ephemeral", ttl: "1h" } });
      return body;
    }
    body.system = prompt;
    return body;
  }

  if (format === FORMATS.GEMINI_CLI && body?.request && typeof body.request === "object") {
    const request = body.request;
    const systemInstruction = request?.systemInstruction;
    if (!systemInstruction) {
      request.systemInstruction = { role: "user", parts: [{ text: prompt }] };
    } else {
      if (!Array.isArray(systemInstruction.parts)) {
        systemInstruction.parts = [];
      }
      systemInstruction.parts.push({ text: prompt });
    }
    return body;
  }

  if (format === FORMATS.GEMINI || format === FORMATS.GEMINI_CLI) {
    const systemInstruction = body?.systemInstruction;
    if (!systemInstruction) {
      body.systemInstruction = { role: "user", parts: [{ text: prompt }] };
    } else {
      if (!Array.isArray(systemInstruction.parts)) {
        systemInstruction.parts = [];
      }
      systemInstruction.parts.push({ text: prompt });
    }
    return body;
  }

  if (format === FORMATS.ANTIGRAVITY) {
    if (!body.request) body.request = {};
    const request = body.request;
    const systemInstruction = request?.systemInstruction;
    if (!systemInstruction) {
      request.systemInstruction = { role: "user", parts: [{ text: prompt }] };
    } else {
      if (!Array.isArray(systemInstruction.parts)) {
        systemInstruction.parts = [];
      }
      systemInstruction.parts.push({ text: prompt });
    }
    return body;
  }

  if (format === FORMATS.OPENAI_RESPONSES) {
    return applyCavemanToOpenAIResponsesBody(body, settings);
  }

  return applyCavemanToOpenAIMessages(body, settings);
}
