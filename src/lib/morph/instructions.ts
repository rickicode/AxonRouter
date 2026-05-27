import { existsSync, pathIsAbsolute, pathJoin } from "@axonrouter/data-dir";
import { resolveMorphInstructionsForRequest } from "../../../open-sse/config/morphInstructionsResolver";
import { buildMorphRepoContext } from "./repoContext";
import { estimateMorphTokenCount } from "./autoRouting";

const LARGE_FILE_WRITE_THRESHOLD_CHARS = 80_000;
const FAST_APPLY_REQUIRED_TOOL_NAMES = new Set(["edit", "functions.edit"]);
const LARGE_FILE_WRITE_TOOL_NAMES = new Set(["write", "edit", "create_file", "write_file", "fs_write", "functions.write", "functions.edit"]);

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

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

function detectMorphIntent(messages) {
  const combined = (Array.isArray(messages) ? messages : [])
    .map((message) => extractMessageText(message?.content || ""))
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  if (!combined) return "general";

  const analysisHints = [
    "analyze",
    "analysis",
    "review",
    "audit",
    "inspect",
    "debug",
    "diagnose",
    "diagnosis",
    "investigate",
    "why is",
    "why does",
    "root cause",
    "explain",
    "plan",
    "planning",
  ];

  const implementationHints = [
    "implement",
    "fix",
    "patch",
    "refactor",
    "edit",
    "update",
    "remove",
    "rename",
    "create",
    "change the code",
    "modify the file",
  ];

  const hasAnalysisHint = analysisHints.some((hint) => combined.includes(hint));
  const hasImplementationHint = implementationHints.some((hint) => combined.includes(hint));

  if (hasAnalysisHint && !hasImplementationHint) return "analysis-first";
  if (hasImplementationHint && !hasAnalysisHint) return "edit-allowed";
  if (hasAnalysisHint && hasImplementationHint) return "mixed";
  return "general";
}

function buildMorphIntentInstruction(messages) {
  const intent = detectMorphIntent(messages);
  switch (intent) {
    case "analysis-first":
      return "Intent mode: analysis-first. Inspect and explain before editing. Do not make file changes unless the user explicitly asks you to implement after the analysis.";
    case "edit-allowed":
      return "Intent mode: edit-allowed. The user appears to be explicitly asking for code changes, so you may inspect briefly and then implement directly.";
    case "mixed":
      return "Intent mode: mixed. The request contains both analysis and implementation cues. Prefer a short plan or findings first, then implement if the change request is explicit.";
    default:
      return "Intent mode: general. Use judgment, and prefer understanding the relevant code before making changes.";
  }
}

function extractInstructionText(message) {
  if (!message || typeof message !== "object") return "";
  if (message.role !== "system" && message.role !== "developer") return "";
  return extractMessageText(message.content || "").trim();
}

function estimateToolArgumentSize(toolCall) {
  const args = toolCall?.function?.arguments;
  if (typeof args === "string") return args.length;
  if (args && typeof args === "object") {
    try {
      return JSON.stringify(args).length;
    } catch {
      return 0;
    }
  }
  return 0;
}

function getToolCallName(toolCall) {
  return String(toolCall?.function?.name || "").trim().toLowerCase();
}

function isLargeFileWriteToolCall(toolCall) {
  const name = getToolCallName(toolCall);
  if (!LARGE_FILE_WRITE_TOOL_NAMES.has(name)) return false;
  return estimateToolArgumentSize(toolCall) >= LARGE_FILE_WRITE_THRESHOLD_CHARS;
}

function requiresFastApply(toolCall) {
  return FAST_APPLY_REQUIRED_TOOL_NAMES.has(getToolCallName(toolCall));
}

function shouldUseCleanApplyContext(payload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (toolCalls.some((toolCall) => requiresFastApply(toolCall) || isLargeFileWriteToolCall(toolCall))) {
      return true;
    }
  }
  return false;
}

function getLatestLargeFileWriteToolCall(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const toolCalls = Array.isArray(list[index]?.tool_calls) ? list[index].tool_calls : [];
    const match = toolCalls.find((toolCall) => requiresFastApply(toolCall) || isLargeFileWriteToolCall(toolCall));
    if (match) return match;
  }
  return null;
}

function parseToolCallArguments(toolCall) {
  const args = toolCall?.function?.arguments;
  if (args && typeof args === "object") return args;
  if (typeof args !== "string" || !args.trim()) return null;
  try {
    const parsed = JSON.parse(args);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function resolveToolCallTargetPath(toolCall) {
  const args = parseToolCallArguments(toolCall);
  return typeof args?.path === "string" ? args.path.trim() : "";
}

function resolveWorkspaceFilePath(targetPath) {
  if (typeof targetPath !== "string" || !targetPath.trim()) return null;
  const normalized = targetPath.trim();
  return pathIsAbsolute(normalized) ? normalized : pathJoin(process.cwd(), normalized);
}

function isExistingFilePath(targetPath) {
  const absolutePath = resolveWorkspaceFilePath(targetPath);
  if (!absolutePath) return false;
  try {
    return existsSync(absolutePath);
  } catch {
    return false;
  }
}

function buildExistingFileMutationInstruction(messages) {
  const toolCall = getLatestLargeFileWriteToolCall(messages);
  const targetPath = resolveToolCallTargetPath(toolCall);

  if (!targetPath) {
    return "If the target already exists, prefer an edit/apply-style mutation over rewriting the entire file from scratch.";
  }

  const existingFileNote = isExistingFilePath(targetPath)
    ? "This target already exists in the workspace, so treat it as an existing-file mutation and prefer edit/apply-style changes."
    : "If this file already exists, prefer an edit/apply-style mutation over rewriting the entire file from scratch.";

  return `Target file: ${targetPath}. ${existingFileNote} Only do a full rewrite when a surgical edit is impossible.`;
}

function shouldPreferInternalFastApply(messages) {
  const toolCall = getLatestLargeFileWriteToolCall(messages);
  const targetPath = resolveToolCallTargetPath(toolCall);
  return Boolean(targetPath && isExistingFilePath(targetPath));
}

function buildInternalFastApplyInstruction(messages) {
  const latestToolCall = getLatestLargeFileWriteToolCall(messages);
  const mandatoryFastApply = requiresFastApply(latestToolCall);
  if (!mandatoryFastApply && !shouldPreferInternalFastApply(messages)) return "";

  return [
    mandatoryFastApply
      ? "Internal fast-apply mode is mandatory for this edit operation. Do not use raw rewrite semantics."
      : "Internal fast-apply mode: for this existing file mutation, prefer Morph Apply semantics over raw full-file writes.",
    "When you describe the change, think in terms of a minimal update snippet with // ... existing code ... markers rather than a complete replacement.",
    "Preserve untouched regions exactly and keep the mutation as surgical as possible.",
  ].join("\n\n");
}

function buildCleanApplyInstruction(messages) {
  const userIntent = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === "user")
    .map((message) => extractMessageText(message?.content || ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const summary = userIntent
    ? `User request summary:\n${userIntent}`
    : "User request summary: perform the requested file mutation faithfully.";

  return [
    "Execution mode: clean-apply.",
    "A large file write or edit is about to happen. Ignore older conversational detours unless they are restated here.",
    "Focus only on the current file operation, the provided tool arguments, and the minimal repo context.",
    "Do not rewrite unrelated sections. Prefer the smallest valid mutation that satisfies the request.",
    buildExistingFileMutationInstruction(messages),
    summary,
  ].join("\n\n");
}

const CLEAN_APPLY_PASSTHROUGH_KEYS = [
  "model",
  "stream",
  "max_tokens",
  "temperature",
  "top_p",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "reasoning_effort",
  "thinking",
  "response_format",
  "morphRoute",
];

function trimMessagesForCleanApply(messages) {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length <= 4) return list;

  const instructionMessages = list.filter((message) => message?.role === "system" || message?.role === "developer");
  const userMessages = list.filter((message) => message?.role === "user");
  const assistantMessages = list.filter((message) => message?.role === "assistant");

  const latestUser = userMessages.at(-1) || null;
  const previousUser = userMessages.length > 1 ? userMessages.at(-2) : null;
  const latestAssistantWithToolCalls = [...assistantMessages].reverse().find((message) => Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) || null;
  const latestAssistantText = [...assistantMessages].reverse().find((message) => !latestAssistantWithToolCalls || message !== latestAssistantWithToolCalls) || null;

  const selected = [
    ...instructionMessages,
    previousUser,
    latestUser,
    latestAssistantText,
    latestAssistantWithToolCalls,
  ].filter(Boolean);

  const seen = new Set();
  return selected.filter((message) => {
    if (seen.has(message)) return false;
    seen.add(message);
    return true;
  });
}

function rebuildPayloadForCleanApply(payload, messages, morphContext) {
  const nextPayload: any = {};

  for (const key of CLEAN_APPLY_PASSTHROUGH_KEYS) {
    if (payload[key] !== undefined) {
      nextPayload[key] = payload[key];
    }
  }

  nextPayload.messages = messages;
  nextPayload.morphContext = {
    ...morphContext,
    executionPayloadMode: "fresh",
  };

  return nextPayload;
}

function buildMorphWorkflowInstruction(payload, messages) {
  const messageText = (Array.isArray(messages) ? messages : [])
    .map((message) => extractMessageText(message?.content || ""))
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const explicitInstructionText = (Array.isArray(messages) ? messages : [])
    .map(extractInstructionText)
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const combined = `${messageText}\n${explicitInstructionText}`;
  const hasPlanningSignal = combined.includes("planning mode")
    || combined.includes("plan mode")
    || combined.includes("planner_enabled")
    || combined.includes("replace_plan")
    || combined.includes("enterplanmode")
    || combined.includes("plannotator")
    || combined.includes("planning-only")
    || combined.includes("do not implement yet")
    || combined.includes("reviewed plan")
    || combined.includes("setup package")
    || combined.includes("goal setup");

  if (!hasPlanningSignal) return "";

  return "Workflow mode: planning. You are in a planning/review workflow. Inspect first, produce plans/findings/risks/next steps, and do not implement or mutate files unless the user explicitly asks to execute the plan now.";
}

export function injectMorphInstructionsIntoOpenAIChatPayload(payload, instructions) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const existingMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const repoContext = buildMorphRepoContext();
  const cleanApplyMode = shouldUseCleanApplyContext(payload);
  const workingMessages = cleanApplyMode ? trimMessagesForCleanApply(existingMessages) : existingMessages;
  const estimatedTokenCount = cleanApplyMode ? estimateMorphTokenCount({ ...payload, messages: workingMessages }) : 0;
  const systemInstructions = [
    hasText(instructions) ? instructions.trim() : "",
    buildMorphWorkflowInstruction(payload, workingMessages),
    buildMorphIntentInstruction(workingMessages),
    cleanApplyMode ? buildCleanApplyInstruction(workingMessages) : "",
    cleanApplyMode ? buildInternalFastApplyInstruction(workingMessages) : "",
  ].filter(Boolean).join("\n\n");

  if (!hasText(systemInstructions)) {
    return cleanApplyMode
      ? rebuildPayloadForCleanApply(payload, workingMessages, {
        repo: repoContext,
        cleanApplyMode,
        estimatedTokenCount,
      })
      : {
        ...payload,
        morphContext: {
          repo: repoContext,
          cleanApplyMode,
          estimatedTokenCount,
        },
      };
  }

  const existingInstructionIndex = workingMessages.findIndex((message) => message?.role === "system" || message?.role === "developer");
  if (existingInstructionIndex === -1) {
    const messages = [
      { role: "system", content: systemInstructions },
      ...workingMessages,
    ];

    return cleanApplyMode
      ? rebuildPayloadForCleanApply(payload, messages, {
        repo: repoContext,
        cleanApplyMode,
        estimatedTokenCount,
      })
      : {
        ...payload,
        morphContext: {
          repo: repoContext,
          cleanApplyMode,
          estimatedTokenCount,
        },
        messages,
      };
  }

  const nextMessages = [...workingMessages];
  const existingInstruction = nextMessages[existingInstructionIndex];
  const existingContent = extractMessageText(existingInstruction?.content || "").trim();
  nextMessages[existingInstructionIndex] = {
    ...existingInstruction,
    role: "system",
    content: [existingContent, systemInstructions].filter(Boolean).join("\n\n"),
  };

  return cleanApplyMode
    ? rebuildPayloadForCleanApply(payload, nextMessages, {
      repo: repoContext,
      cleanApplyMode,
      estimatedTokenCount,
    })
    : {
      ...payload,
      morphContext: {
        repo: repoContext,
        cleanApplyMode,
        estimatedTokenCount,
      },
      messages: nextMessages,
    };
}

export async function resolveAndInjectMorphInstructions(payload) {
  const instructions = await resolveMorphInstructionsForRequest();
  return injectMorphInstructionsIntoOpenAIChatPayload(payload, instructions);
}
