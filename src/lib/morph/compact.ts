import { executeWithMorphKeyFailover } from "@/lib/morph/keySelection";

const CLEAN_APPLY_COMPACT_MIN_MESSAGES = 5;
const CLEAN_APPLY_RECENT_MESSAGES = 2;
const CLEAN_APPLY_COMPRESSION_RATIO = 0.35;
const CLEAN_APPLY_MIN_ESTIMATED_TOKENS_FOR_COMPACT = 12_000;

function extractMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      if (typeof part.content === "string") return part.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function getCompactQuery(messages) {
  const latestUser = [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => message?.role === "user");
  return extractMessageText(latestUser?.content || "").trim() || "current file edit request";
}

function normalizeCompactMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const role = message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user";
      const content = extractMessageText(message.content || "").trim();
      if (!content) return null;
      return { role, content };
    })
    .filter(Boolean);
}

export async function maybeCompactCleanApplyPayload(payload, morphSettings) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload?.morphContext?.cleanApplyMode !== true) return payload;

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const estimatedTokenCount = Number(payload?.morphContext?.estimatedTokenCount || 0) || 0;
  if (messages.length < CLEAN_APPLY_COMPACT_MIN_MESSAGES && estimatedTokenCount < CLEAN_APPLY_MIN_ESTIMATED_TOKENS_FOR_COMPACT) {
    return payload;
  }

  const prefix = messages.slice(0, -CLEAN_APPLY_RECENT_MESSAGES);
  const suffix = messages.slice(-CLEAN_APPLY_RECENT_MESSAGES);
  const compactMessages = normalizeCompactMessages(prefix);
  if (compactMessages.length < 2) return payload;

  const requestBody = {
    messages: compactMessages,
    query: getCompactQuery(messages),
    compression_ratio: CLEAN_APPLY_COMPRESSION_RATIO,
    preserve_recent: 0,
    compress_system_messages: false,
    include_line_ranges: false,
    include_markers: true,
    model: "morph-compactor",
  };

  try {
    const response = await executeWithMorphKeyFailover({
      apiKeys: morphSettings?.apiKeys,
      roundRobinEnabled: morphSettings?.roundRobinEnabled,
      rotationKey: "clean-apply-compact",
      execute: async ({ apiKey }) => {
        const compactResponse = await fetch(new URL("/v1/compact", `${morphSettings.baseUrl.replace(/\/+$/, "")}/`).toString(), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });
        return compactResponse;
      },
    } as any);

    if (!response.ok) return payload;

    const result = await response.json().catch(() => null);
    const compactedMessages = Array.isArray(result?.messages) ? result.messages : null;
    if (!compactedMessages || compactedMessages.length === 0) return payload;

    const compactedPrefixMessages = compactedMessages.length;
    const originalPrefixMessages = prefix.length;
    const savedMessages = Math.max(originalPrefixMessages - compactedPrefixMessages, 0);

    return {
      ...payload,
      morphContext: {
        ...payload.morphContext,
        compactedForCleanApply: true,
        compactSavedMessages: savedMessages,
        compactOriginalPrefixMessages: originalPrefixMessages,
        compactedPrefixMessages,
        compactQuery: requestBody.query,
      },
      messages: [...compactedMessages, ...suffix],
    };
  } catch {
    return payload;
  }
}
