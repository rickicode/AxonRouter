import { FORMATS } from "../translator/formats";
import {
  type CavemanSettings,
  DEFAULT_CAVEMAN_SETTINGS,
  normalizeCavemanSettings,
  resolveCavemanPrompt,
} from "../config/caveman";

export const CAVEMAN_MARKER = "Caveman Mode";

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildPrompt(rawSettings: CavemanSettings | Record<string, unknown> | unknown): string {
  return resolveCavemanPrompt(rawSettings);
}

function appendText(existing: string, prompt: string) {
  if (!hasText(existing)) return prompt;
  if (existing.includes(CAVEMAN_MARKER)) return existing;
  return `${existing}\n\n${prompt}`;
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

function findInstructionMessageIndex(messages: any[]) {
  return messages.findIndex((message) => message?.role === "system" || message?.role === "developer");
}

function syntheticCavemanMessage(prompt: string) {
  return {
    role: "system",
    content: prompt,
  };
}

export function applyCavemanToOpenAIMessages(body: any, rawSettings: unknown) {
  const settings = normalizeCavemanSettings(rawSettings);
  if (!settings.enabled) return body;

  const prompt = buildPrompt(settings);
  if (!prompt) return body;

  const messages = Array.isArray(body?.messages) ? [...body.messages] : [];
  const instructionIndex = findInstructionMessageIndex(messages);

  if (instructionIndex === -1) {
    return {
      ...body,
      messages: [syntheticCavemanMessage(prompt), ...messages],
    };
  }

  const target = messages[instructionIndex];
  const existingText = normalizeMessageText(target?.content);
  if (existingText.includes(CAVEMAN_MARKER)) {
    return { ...body, messages };
  }

  messages[instructionIndex] = {
    ...target,
    role: "system",
    content: appendText(existingText, prompt),
  };

  return { ...body, messages };
}

function prependResponsesDeveloperMessage(input: any[], prompt: string) {
  const firstInstructionIndex = input.findIndex(
    (item) => item?.type === "message" && (item?.role === "developer" || item?.role === "system")
  );

  if (firstInstructionIndex >= 0) {
    const current = input[firstInstructionIndex];
    const currentText = Array.isArray(current?.content)
      ? current.content
          .filter((part: any) => typeof part?.text === "string")
          .map((part: any) => part.text)
          .join("\n")
      : "";
    if (currentText.includes(CAVEMAN_MARKER)) return input;
    const next = [...input];
    next[firstInstructionIndex] = {
      ...current,
      role: "developer",
      content: [{ type: "input_text", text: appendText(currentText, prompt) }],
    };
    return next;
  }

  return [
    {
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: prompt }],
    },
    ...input,
  ];
}

export function applyCavemanToOpenAIResponsesBody(body: any, rawSettings: unknown) {
  const settings = normalizeCavemanSettings(rawSettings);
  if (!settings.enabled) return body;

  const prompt = buildPrompt(settings);
  if (!prompt) return body;

  const input = Array.isArray(body?.input) ? body.input : [];
  return { ...body, input: prependResponsesDeveloperMessage(input, prompt) };
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
      return { ...body, system: appendText(current, prompt) };
    }
    if (Array.isArray(current)) {
      const text = current.map((part) => part?.text || "").join("\n");
      if (text.includes(CAVEMAN_MARKER)) return body;
      return {
        ...body,
        system: [
          ...current,
          { type: "text", text: prompt, cache_control: { type: "ephemeral", ttl: "1h" } },
        ],
      };
    }
    return { ...body, system: prompt };
  }

  if (format === FORMATS.GEMINI_CLI && body?.request && typeof body.request === "object") {
    const request = body.request;
    const systemInstruction = request?.systemInstruction;
    const parts = Array.isArray(systemInstruction?.parts) ? [...systemInstruction.parts] : [];
    const existingText = parts.map((part) => part?.text || "").join("\n");
    if (existingText.includes(CAVEMAN_MARKER)) return body;
    return {
      ...body,
      request: {
        ...request,
        systemInstruction: {
          role: systemInstruction?.role || "user",
          parts: [...parts, { text: prompt }],
        },
      },
    };
  }

  if (format === FORMATS.GEMINI || format === FORMATS.GEMINI_CLI) {
    const systemInstruction = body?.systemInstruction;
    const parts = Array.isArray(systemInstruction?.parts) ? [...systemInstruction.parts] : [];
    const existingText = parts.map((part) => part?.text || "").join("\n");
    if (existingText.includes(CAVEMAN_MARKER)) return body;
    return {
      ...body,
      systemInstruction: {
        role: systemInstruction?.role || "user",
        parts: [...parts, { text: prompt }],
      },
    };
  }

  if (format === FORMATS.ANTIGRAVITY) {
    const request = body?.request || {};
    const systemInstruction = request?.systemInstruction;
    const parts = Array.isArray(systemInstruction?.parts) ? [...systemInstruction.parts] : [];
    const existingText = parts.map((part) => part?.text || "").join("\n");
    if (existingText.includes(CAVEMAN_MARKER)) return body;
    return {
      ...body,
      request: {
        ...request,
        systemInstruction: {
          role: systemInstruction?.role || "user",
          parts: [...parts, { text: prompt }],
        },
      },
    };
  }

  if (format === FORMATS.OPENAI_RESPONSES) {
    return applyCavemanToOpenAIResponsesBody(body, settings);
  }

  return applyCavemanToOpenAIMessages(body, settings);
}
