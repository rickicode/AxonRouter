import { getMorphFastModel, isMorphAutoModel } from "@/shared/constants/models";
import { getMorphKeyOrder } from "@/lib/morph/keySelection";

// Safety margin: don't use 100% of context (reserve for completion + overhead)
const CONTEXT_SAFETY_MARGIN = 0.85; // 85% max usage

// Simple character-based token estimation (avg ~4 chars per token for English)
const CHARS_PER_TOKEN = 4;

const MORPH_ROUTER_API_URL = "https://api.morphllm.com";
const MORPH_ROUTER_TIMEOUT_MS = 2500;
const MORPH_AUTO_MANUAL_ALIAS = "auto-manual";
const MORPH_AUTO_ROUTER_ALIAS = "auto";
const MORPH_MANUAL_TARGETS = Object.freeze({
  simple: "morph-qwen36-27b",
  medium: "morph-minimax27-230b",
  complex: "morph-qwen35-397b",
});
const MORPH_ROUTER_TARGETS = Object.freeze({
  easy: "morph-qwen36-27b",
  medium: "morph-minimax27-230b",
  hard: "morph-qwen35-397b",
  needs_info: "morph-qwen35-397b",
});

function normalizeModelId(model) {
  if (typeof model !== "string") return "";
  const trimmed = model.trim();
  return trimmed.startsWith("morph/") ? trimmed.slice("morph/".length) : trimmed;
}

function getModelContextWindow(modelId) {
  const model = getMorphFastModel(modelId);
  return Number.isFinite(model?.contextWindow) ? model.contextWindow : null;
}

function getModelContextMeta(modelId) {
  const model = getMorphFastModel(modelId);
  if (!model) return null;

  return {
    contextWindow: Number.isFinite(model.contextWindow) ? model.contextWindow : null,
    documentedContextWindow: Number.isFinite(model.documentedContextWindow) ? model.documentedContextWindow : null,
    verifiedRuntimeContextWindow: Number.isFinite(model.verifiedRuntimeContextWindow) ? model.verifiedRuntimeContextWindow : null,
    contextWindowSource: typeof model.contextWindowSource === "string" ? model.contextWindowSource : null,
  };
}

function extractTextFromContent(content) {
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

function collectRequestInputText(payload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const fromMessages = messages
    .map((message) => extractTextFromContent(message?.content))
    .filter(Boolean)
    .join("\n\n");

  if (fromMessages) return fromMessages;

  if (typeof payload?.input === "string") return payload.input;
  if (Array.isArray(payload?.input)) {
    return payload.input
      .map((item) => extractTextFromContent(item?.content))
      .filter(Boolean)
      .join("\n\n");
  }

  return "";
}

// Estimate total token count including system prompt, messages, tools, and completion budget
export function estimateMorphTokenCount(payload) {
  const inputText = collectRequestInputText(payload);
  const inputTokens = Math.ceil(inputText.length / CHARS_PER_TOKEN);
  
  // Estimate system prompt tokens (if present)
  const systemPrompt = payload?.system;
  const systemTokens = systemPrompt 
    ? (typeof systemPrompt === "string" 
        ? Math.ceil(systemPrompt.length / CHARS_PER_TOKEN)
        : Array.isArray(systemPrompt)
          ? systemPrompt.reduce((acc, block) => acc + Math.ceil((block?.text || "").length / CHARS_PER_TOKEN), 0)
          : 0)
    : 0;
  
  // Estimate tools tokens (rough approximation: 50 tokens per tool definition)
  const tools = Array.isArray(payload?.tools) ? payload.tools : [];
  const toolsTokens = tools.reduce((acc, tool) => {
    const def = JSON.stringify(tool).length;
    return acc + Math.ceil(def / CHARS_PER_TOKEN) + 50; // 50 for overhead
  }, 0);
  
  // Estimate completion budget
  const maxTokens = Number(payload?.max_tokens) || 4096; // Default 4k completion
  
  // Total estimated: input + system + tools + completion budget
  return inputTokens + systemTokens + toolsTokens + maxTokens;
}

// Get the smallest model that can handle the estimated token count
function selectModelByContext(tokenCount, preferredModel) {
  // Calculate safe limit (considering completion budget included in tokenCount)
  // We need model context >= tokenCount, but with safety margin.
  const requiredContext = Math.ceil(tokenCount / CONTEXT_SAFETY_MARGIN);

  // If preferred model can handle it, use it.
  const preferredContext = getModelContextWindow(preferredModel);
  if (preferredContext && requiredContext <= preferredContext) {
    return {
      resolvedModel: preferredModel,
      reason: "context_fit",
      requiredContext,
      selectedContextWindow: preferredContext,
      selectedContextMeta: getModelContextMeta(preferredModel),
    };
  }

  // Need to upgrade: find the smallest model that fits.
  const contextSorted = [
    "morph-qwen36-27b",
    "morph-minimax27-230b",
    "morph-qwen35-397b",
  ].map((id) => ({ id, context: getModelContextWindow(id) }))
    .filter((entry) => Number.isFinite(entry.context))
    .sort((a, b) => a.context - b.context);

  for (const model of contextSorted) {
    if (model.context >= requiredContext) {
      return {
        resolvedModel: model.id,
        reason: `context_upgrade_required_${Math.ceil(requiredContext)}t`,
        requiredContext,
        selectedContextWindow: model.context,
        selectedContextMeta: getModelContextMeta(model.id),
      };
    }
  }

  // Fallback to max context model.
  const fallbackModel = "morph-qwen35-397b";
  return {
    resolvedModel: fallbackModel,
    reason: "context_fallback_max",
    requiredContext,
    selectedContextWindow: getModelContextWindow(fallbackModel),
    selectedContextMeta: getModelContextMeta(fallbackModel),
  };
}

function classifyManualRoute(payload: any, context: any = {}) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const tools = Array.isArray(payload?.tools) ? payload.tools : [];
  const inputText = collectRequestInputText(payload);
  const normalizedText = inputText.toLowerCase();
  const promptLength = inputText.length;
  const messageCount = messages.length;
  const maxTokens = Number(payload?.max_tokens);
  const endpoint = typeof context?.endpoint === "string" ? context.endpoint : "chat";

  const analysisHints = [
    "analyze",
    "analysis",
    "review",
    "audit",
    "inspect",
    "debug",
    "diagnose",
    "investigate",
    "root cause",
    "tradeoff",
    "architecture",
    "plan",
    "refactor",
    "design",
  ];
  const implementationHints = [
    "implement",
    "fix",
    "patch",
    "update",
    "edit",
    "change",
    "create",
    "write",
  ];

  const hasAnalysisHint = analysisHints.some((hint) => normalizedText.includes(hint));
  const hasImplementationHint = implementationHints.some((hint) => normalizedText.includes(hint));
  const hasTools = tools.length > 0;
  const longPrompt = promptLength > 900 || messageCount > 6;
  const mediumPrompt = promptLength > 240 || messageCount > 2;
  const smallOutputBudget = Number.isFinite(maxTokens) && maxTokens > 0 && maxTokens <= 64;

  if (hasTools || hasAnalysisHint || longPrompt || (hasImplementationHint && mediumPrompt)) {
    return {
      resolvedModel: MORPH_MANUAL_TARGETS.complex,
      routeSource: "manual",
      reason: [
        hasTools ? "has_tools" : null,
        hasAnalysisHint ? "analysis_prompt" : null,
        longPrompt ? "long_prompt" : null,
        hasImplementationHint && mediumPrompt ? "implementation_prompt" : null,
      ].filter(Boolean).join(",") || "complex",
    };
  }

  if (!hasImplementationHint && !hasAnalysisHint && !hasTools && promptLength > 0 && promptLength <= 120 && messageCount <= 2 && smallOutputBudget) {
    return {
      resolvedModel: endpoint === "chat" ? MORPH_MANUAL_TARGETS.medium : MORPH_MANUAL_TARGETS.simple,
      routeSource: "manual",
      reason: endpoint === "chat"
        ? "short_prompt,no_tools,max_tokens_small,chat_safe_model"
        : "short_prompt,no_tools,max_tokens_small",
    };
  }

  if (!hasTools && !hasAnalysisHint && promptLength > 0 && promptLength <= 220 && messageCount <= 3) {
    return {
      resolvedModel: MORPH_MANUAL_TARGETS.simple,
      routeSource: "manual",
      reason: "short_prompt,no_tools",
    };
  }

  return {
    resolvedModel: MORPH_MANUAL_TARGETS.medium,
    routeSource: "manual",
    reason: mediumPrompt ? "general_medium_prompt" : "general_default",
  };
}

async function classifyWithMorphRouter({ payload, morphSettings }: any) {
  const input = collectRequestInputText(payload).trim();
  if (!input) {
    throw new Error("Morph router requires non-empty input");
  }

  const { keyOrder } = getMorphKeyOrder({
    apiKeys: morphSettings?.apiKeys,
    roundRobinEnabled: morphSettings?.roundRobinEnabled === true,
    rotationKey: "router:raw",
  } as any);
  const apiKey = keyOrder[0]?.apiKey?.trim();
  if (!apiKey) {
    throw new Error("Morph router requires an available API key");
  }

  const response = await fetch(`${MORPH_ROUTER_API_URL}/v1/router/raw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "X-Morph-SDK-Version": "axonrouter-auto-routing",
    },
    body: JSON.stringify({ input, mode: "balanced" }),
    signal: AbortSignal.timeout(MORPH_ROUTER_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Morph router API error (${response.status}): ${errorText || response.statusText}`);
  }

  const result: any = await response.json();
  const difficulty = typeof result?.difficulty === "string" && result.difficulty.trim()
    ? result.difficulty.trim()
    : (typeof result?.model === "string" && result.model.trim() ? result.model.trim() : "medium");
  const resolvedModel = MORPH_ROUTER_TARGETS[difficulty] || MORPH_ROUTER_TARGETS.medium;

  return {
    resolvedModel,
    routeSource: "router",
    difficulty,
    reason: `difficulty=${difficulty}`,
  };
}

export function buildMorphContextLengthErrorPayload({ model, estimatedTokens, requiredContext, selectedContextWindow, selectedContextMeta }: any = {}) {
  const limit = Number.isFinite(selectedContextWindow)
    ? selectedContextWindow
    : (Number.isFinite(selectedContextMeta?.verifiedRuntimeContextWindow)
      ? selectedContextMeta.verifiedRuntimeContextWindow
      : null);
  const resolvedModel = typeof model === "string" && model.trim() ? model.trim() : "Morph model";
  const pieces = [];

  if (limit !== null && Number.isFinite(requiredContext)) {
    pieces.push(`Requested token count exceeds the model's maximum context length of ${limit} tokens.`);
    pieces.push(`Estimated total request size is ${requiredContext} tokens after safety margin, based on roughly ${estimatedTokens || 0} input/output tokens.`);
  } else if (Number.isFinite(requiredContext)) {
    pieces.push(`Requested token count exceeds the model's maximum context length.`);
    pieces.push(`Estimated total request size is ${requiredContext} tokens after safety margin.`);
  } else {
    pieces.push(`Requested token count exceeds the model's maximum context length.`);
  }

  pieces.push(`Reduce the input messages or lower max_tokens before retrying ${resolvedModel}.`);

  return {
    error: {
      message: pieces.join(" "),
      type: "invalid_request_error",
      code: "context_length_exceeded",
      param: "messages",
      provider: "morph",
      status: 400,
      model: resolvedModel,
      ...(Number.isFinite(estimatedTokens) ? { estimated_tokens: estimatedTokens } : {}),
      ...(Number.isFinite(requiredContext) ? { estimated_context_tokens: requiredContext } : {}),
      ...(limit !== null ? { context_window: limit } : {}),
      ...(selectedContextMeta && typeof selectedContextMeta === "object" ? { context_meta: selectedContextMeta } : {}),
    },
  };
}

export function createMorphContextLengthPreflightResponse({ model, estimatedTokens, requiredContext, selectedContextWindow, selectedContextMeta }: any = {}) {
  return new Response(JSON.stringify(buildMorphContextLengthErrorPayload({
    model,
    estimatedTokens,
    requiredContext,
    selectedContextWindow,
    selectedContextMeta,
  })), {
    status: 400,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function shouldPreflightRejectMorphContext(resolution: any) {
  if (!resolution || typeof resolution !== "object") return false;
  if (resolution.reason !== "context_fallback_max") return false;
  if (!Number.isFinite(resolution.requiredContext) || !Number.isFinite(resolution.selectedContextWindow)) return false;
  return resolution.requiredContext > resolution.selectedContextWindow;
}

export async function resolveMorphAutoModel({ payload, morphSettings, context }: any) {
  const requestedModel = normalizeModelId(payload?.model);
  if (!isMorphAutoModel(requestedModel)) {
    return {
      requestedModel,
      resolvedModel: requestedModel,
      routeSource: "explicit",
      reason: "explicit_model",
    };
  }

  // Estimate token count FIRST - context limits are priority
  // If context is already large, skip complexity-based selection entirely
  const estimatedTokens = estimateMorphTokenCount(payload);
  const estimatedContext = Math.ceil(estimatedTokens / CONTEXT_SAFETY_MARGIN);
  const qwen36ContextWindow = getModelContextWindow("morph-qwen36-27b") || 131072;

  // If estimated context exceeds qwen3.6 limit, always use minimax27 or higher.
  if (estimatedContext > qwen36ContextWindow) {
    const contextSelection = selectModelByContext(estimatedTokens, "morph-minimax27-230b");
    return {
      requestedModel,
      resolvedModel: contextSelection.resolvedModel,
      routeSource: "context-aware",
      reason: `${contextSelection.reason};estimated_tokens=${estimatedTokens}`,
      fallbackUsed: false,
      estimatedTokens,
      estimatedContext,
      requiredContext: contextSelection.requiredContext,
      selectedContextWindow: contextSelection.selectedContextWindow,
      selectedContextMeta: contextSelection.selectedContextMeta,
    };
  }

  if (requestedModel === MORPH_AUTO_MANUAL_ALIAS) {
    const manual = classifyManualRoute(payload, context);
    // Apply context check on top of manual classification.
    const contextSelection = selectModelByContext(estimatedTokens, manual.resolvedModel);
    return {
      requestedModel,
      resolvedModel: contextSelection.resolvedModel,
      routeSource: manual.routeSource,
      reason: `${manual.reason};${contextSelection.reason}`,
      fallbackUsed: false,
      estimatedTokens,
      estimatedContext,
      requiredContext: contextSelection.requiredContext,
      selectedContextWindow: contextSelection.selectedContextWindow,
      selectedContextMeta: contextSelection.selectedContextMeta,
    };
  }

  try {
    const routerResult = await classifyWithMorphRouter({ payload, morphSettings });
    // Apply context check on top of router classification.
    const contextSelection = selectModelByContext(estimatedTokens, routerResult.resolvedModel);
    return {
      requestedModel,
      resolvedModel: contextSelection.resolvedModel,
      routeSource: routerResult.routeSource,
      reason: `${routerResult.reason};${contextSelection.reason}`,
      difficulty: routerResult.difficulty,
      fallbackUsed: false,
      estimatedTokens,
      estimatedContext,
      requiredContext: contextSelection.requiredContext,
      selectedContextWindow: contextSelection.selectedContextWindow,
      selectedContextMeta: contextSelection.selectedContextMeta,
    };
  } catch (error: any) {
    const manual = classifyManualRoute(payload, context);
    // Apply context check on top of manual fallback.
    const contextSelection = selectModelByContext(estimatedTokens, manual.resolvedModel);
    return {
      requestedModel,
      resolvedModel: contextSelection.resolvedModel,
      routeSource: "router-fallback-manual",
      reason: `${manual.reason};${contextSelection.reason};router_error=${error?.message || String(error)}`,
      fallbackUsed: true,
      estimatedTokens,
      estimatedContext,
      requiredContext: contextSelection.requiredContext,
      selectedContextWindow: contextSelection.selectedContextWindow,
      selectedContextMeta: contextSelection.selectedContextMeta,
    };
  }
}

export function applyMorphAutoResolution(payload: any, resolution: any) {
  if (!payload || typeof payload !== "object") return payload;
  if (!resolution?.resolvedModel) return payload;
  if (!getMorphFastModel(resolution.resolvedModel)) return payload;

  return {
    ...payload,
    model: resolution.resolvedModel,
    morphRoute: {
      requestedModel: resolution.requestedModel,
      resolvedModel: resolution.resolvedModel,
      routeSource: resolution.routeSource,
      reason: resolution.reason,
      ...(resolution.difficulty ? { difficulty: resolution.difficulty } : {}),
      ...(resolution.fallbackUsed ? { fallbackUsed: true } : {}),
      ...(Number.isFinite(resolution.estimatedTokens) ? { estimatedTokens: resolution.estimatedTokens } : {}),
      ...(Number.isFinite(resolution.estimatedContext) ? { estimatedContext: resolution.estimatedContext } : {}),
      ...(Number.isFinite(resolution.requiredContext) ? { requiredContext: resolution.requiredContext } : {}),
      ...(Number.isFinite(resolution.selectedContextWindow) ? { selectedContextWindow: resolution.selectedContextWindow } : {}),
      ...(resolution.selectedContextMeta && typeof resolution.selectedContextMeta === "object"
        ? { selectedContextMeta: resolution.selectedContextMeta }
        : {}),
    },
  };
}
