const FAST_APPLY_TOOL_NAMES = new Set(["edit", "functions.edit", "write", "functions.write", "write_file", "create_file", "fs_write"]);

async function getNodeRuntime() {
  const [path, fs] = await Promise.all([
    import("node:path"),
    import("node:fs/promises"),
  ]);

  return { path, fs };
}

function getToolCallName(toolCall) {
  return String(toolCall?.function?.name || "").trim().toLowerCase();
}

function isFastApplyToolCall(toolCall) {
  return FAST_APPLY_TOOL_NAMES.has(getToolCallName(toolCall));
}

function parseToolCallArguments(toolCall) {
  const raw = toolCall?.function?.arguments;
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function resolveWorkspacePath(targetPath) {
  if (typeof targetPath !== "string" || !targetPath.trim()) return null;
  const normalized = targetPath.trim();
  const { path } = await getNodeRuntime();
  return path.isAbsolute(normalized)
    ? normalized
    : path.join(process.cwd(), normalized);
}

function extractLatestFastApplyToolCall(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const toolCalls = Array.isArray(list[index]?.tool_calls) ? list[index].tool_calls : [];
    const match = toolCalls.find(isFastApplyToolCall);
    if (match) {
      return { toolCall: match, assistantMessage: list[index] };
    }
  }
  return null;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let start = 0;
  while (true) {
    const idx = haystack.indexOf(needle, start);
    if (idx === -1) return count;
    count += 1;
    start = idx + needle.length;
  }
}

function buildInstruction(targetPath, latestUserText) {
  const base = targetPath
    ? `Apply this exact edit surgically in ${targetPath}.`
    : "Apply this exact edit surgically in the target file.";
  const summary = typeof latestUserText === "string" && latestUserText.trim()
    ? `User request summary: ${latestUserText.trim()}`
    : "User request summary: preserve untouched regions and perform only the requested edit.";
  return `${base} ${summary}`;
}

function extractLatestUserText(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index];
    if (message?.role === "user" && typeof message?.content === "string" && message.content.trim()) {
      return message.content.trim();
    }
  }
  return "";
}

function clampBoundaryToLineStart(text, index) {
  if (index <= 0) return 0;
  const boundary = text.lastIndexOf("\n", index - 1);
  return boundary === -1 ? 0 : boundary + 1;
}

function clampBoundaryToLineEnd(text, index) {
  if (index >= text.length) return text.length;
  const boundary = text.indexOf("\n", index);
  return boundary === -1 ? text.length : boundary;
}

function trimSingleLeadingNewline(text) {
  return text.startsWith("\n") ? text.slice(1) : text;
}

function trimSingleTrailingNewline(text) {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

function buildMarkerWrappedUpdateFromReplacement(originalCode, replacementCode) {
  if (typeof originalCode !== "string" || typeof replacementCode !== "string") {
    return "// ... existing code ...";
  }

  if (originalCode === replacementCode) {
    return "// ... existing code ...";
  }

  let prefixIndex = 0;
  const maxPrefix = Math.min(originalCode.length, replacementCode.length);
  while (prefixIndex < maxPrefix && originalCode[prefixIndex] === replacementCode[prefixIndex]) {
    prefixIndex += 1;
  }

  let originalSuffixIndex = originalCode.length;
  let replacementSuffixIndex = replacementCode.length;
  while (
    originalSuffixIndex > prefixIndex
    && replacementSuffixIndex > prefixIndex
    && originalCode[originalSuffixIndex - 1] === replacementCode[replacementSuffixIndex - 1]
  ) {
    originalSuffixIndex -= 1;
    replacementSuffixIndex -= 1;
  }

  const originalStart = clampBoundaryToLineStart(originalCode, prefixIndex);
  const replacementStart = clampBoundaryToLineStart(replacementCode, prefixIndex);
  const originalEnd = clampBoundaryToLineEnd(originalCode, originalSuffixIndex);
  const replacementEnd = clampBoundaryToLineEnd(replacementCode, replacementSuffixIndex);

  const beforeAnchor = trimSingleTrailingNewline(originalCode.slice(0, originalStart));
  const changedReplacement = trimSingleLeadingNewline(trimSingleTrailingNewline(replacementCode.slice(replacementStart, replacementEnd)));
  const afterAnchor = trimSingleLeadingNewline(originalCode.slice(originalEnd));

  return [
    beforeAnchor ? `${beforeAnchor}\n// ... existing code ...` : "// ... existing code ...",
    changedReplacement,
    afterAnchor ? `// ... existing code ...\n${afterAnchor}` : "// ... existing code ...",
  ].filter(Boolean).join("\n");
}

function buildApplyUpdate(args, originalCode, updatedCode) {
  const oldText = typeof args?.oldText === "string" ? args.oldText : "";
  const newText = typeof args?.newText === "string" ? args.newText : "";
  if (oldText) {
    return `// ... existing code ...\n${newText}\n// ... existing code ...`;
  }

  return buildMarkerWrappedUpdateFromReplacement(originalCode, updatedCode);
}

function buildApplyMessageContent({ instruction, originalCode, update }) {
  return `<instruction>${instruction}</instruction>\n<code>${originalCode}</code>\n<update>${update}</update>`;
}

export async function detectMorphFastApplyInterception(payload) {
  const match = extractLatestFastApplyToolCall(payload?.messages);
  if (!match) {
    return { intercept: false, reason: "no_edit_tool_call" };
  }

  const args = parseToolCallArguments(match.toolCall);
  if (!args) {
    return { intercept: false, reason: "invalid_tool_args" };
  }

  const targetPath = typeof args.path === "string" ? args.path.trim() : "";
  const absolutePath = await resolveWorkspacePath(targetPath);
  if (!absolutePath) {
    return { intercept: false, reason: "missing_path" };
  }

  const oldText = typeof args.oldText === "string" ? args.oldText : "";
  const newText = typeof args.newText === "string" ? args.newText : "";
  const hasExplicitReplace = oldText.length > 0;
  const hasFullContent = typeof args.content === "string" && args.content.length > 0;
  if (!hasExplicitReplace && !hasFullContent) {
    return { intercept: false, reason: "missing_edit_payload" };
  }

  let originalCode;
  try {
    const { fs } = await getNodeRuntime();
    originalCode = await fs.readFile(absolutePath, "utf8");
  } catch {
    return { intercept: false, reason: "file_not_found" };
  }

  let updatedCode = originalCode;
  if (hasExplicitReplace) {
    const occurrences = countOccurrences(originalCode, oldText);
    if (occurrences !== 1) {
      return { intercept: false, reason: occurrences === 0 ? "old_text_not_found" : "old_text_ambiguous" };
    }
    updatedCode = originalCode.replace(oldText, newText);
  } else if (hasFullContent) {
    updatedCode = args.content;
  }
  const latestUserText = extractLatestUserText(payload?.messages);
  const instruction = buildInstruction(targetPath, latestUserText);
  const update = buildApplyUpdate(args, originalCode, updatedCode);
  const applyMessageContent = buildApplyMessageContent({ instruction, originalCode, update });

  return {
    intercept: true,
    reason: "single_exact_edit",
    targetPath,
    absolutePath,
    originalCode,
    updatedCode,
    instruction,
    update,
    applyMessageContent,
    toolCall: match.toolCall,
    args,
  };
}

export async function maybeBuildMorphFastApplyPayload(payload, morphSettings = null) {
  const plan = await detectMorphFastApplyInterception(payload);
  if (!plan.intercept) return { intercept: false, reason: plan.reason };

  const configuredModel = typeof morphSettings?.fastApplyModel === "string" && morphSettings.fastApplyModel.trim()
    ? morphSettings.fastApplyModel.trim()
    : "morph-v3-fast";

  return {
    intercept: true,
    reason: plan.reason,
    requestPayload: {
      model: configuredModel,
      stream: payload?.stream === true,
      messages: [
        {
          role: "user",
          content: plan.applyMessageContent,
        },
      ],
      morphContext: {
        ...(payload?.morphContext || {}),
        internalFastApplyIntercepted: true,
        internalFastApplyTargetPath: plan.targetPath,
        internalFastApplyModel: configuredModel,
      },
    },
    plan,
  };
}
