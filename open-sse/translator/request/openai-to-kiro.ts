/**
 * OpenAI to Kiro Request Translator
 * Converts OpenAI Chat Completions format to Kiro/AWS CodeWhisperer format
 */
import { register } from "../index";
import { FORMATS } from "../formats";
import { v5 as uuidv5 } from "uuid";

const DEFAULT_KIRO_MAX_TOOLS = 24;
const KIRO_PREFERRED_TOOL_NAMES = [
	"read",
	"write",
	"edit",
	"bash",
	"read_file",
	"read_files",
	"file_search",
	"grep_search",
	"delete_file",
	"create_file",
	"execute_bash",
];
const DEFAULT_KIRO_MAX_PAYLOAD_BYTES = 580000;

function getKiroPayloadBudget() {
	const bytes = Number(process.env.KIRO_MAX_PAYLOAD_BYTES);
	if (Number.isFinite(bytes) && bytes > 0) return bytes;
	const chars = Number(process.env.KIRO_MAX_PAYLOAD_CHARS);
	if (Number.isFinite(chars) && chars > 0) return chars;
	return DEFAULT_KIRO_MAX_PAYLOAD_BYTES;
}

function payloadSize(payload) {
	return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

function trimContent(value, maxBytes) {
	if (typeof value !== "string") return "";
	const buf = Buffer.from(value, "utf8");
	if (buf.length <= maxBytes) return value;
	const suffix = "\n[truncated]";
	const suffixBytes = Buffer.byteLength(suffix, "utf8");
	let cutAt = Math.max(0, maxBytes - suffixBytes);
	// Walk back to a valid UTF-8 codepoint boundary
	while (cutAt > 0 && (buf[cutAt] & 0xc0) === 0x80) cutAt--;
	return buf.slice(0, cutAt).toString("utf8") + suffix;
}

function shrinkCurrentContent(payload, budget) {
	const current = payload.conversationState.currentMessage.userInputMessage;
	const original = current.content || "";
	// Use byte length as upper bound to avoid over-allocation for multi-byte content
	let low = 0;
	let high = Buffer.byteLength(original, "utf8");
	let best = "";
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		current.content = trimContent(original, mid);
		if (payloadSize(payload) <= budget) {
			best = current.content;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}
	current.content = best;
}

function fitKiroPayload(payload, budget) {
	const current = payload.conversationState.currentMessage.userInputMessage;

	if (payloadSize(payload) <= budget) return payload;

	// Step 1: truncate large tool result content in currentMessage (preserve structure)
	const ctx = current.userInputMessageContext;
	if (ctx?.toolResults) {
		for (const tr of ctx.toolResults) {
			if (!Array.isArray(tr.content)) continue;
			for (const block of tr.content) {
				if (typeof block.text === "string" && block.text.length > 2000) {
					block.text = block.text.slice(0, 2000) + "\n[truncated]";
				}
			}
			if (payloadSize(payload) <= budget) return payload;
		}
	}

	// Step 2: drop oldest history entries in pairs (user+assistant) to preserve consistency
	while (
		payloadSize(payload) > budget &&
		payload.conversationState.history.length >= 2
	) {
		payload.conversationState.history.shift(); // remove user
		payload.conversationState.history.shift(); // remove assistant
	}
	if (payloadSize(payload) <= budget) return payload;

	// Step 3: drop optional tool definitions before destroying the user's current prompt.
	if (ctx?.tools) {
		delete ctx.tools;
		if (Object.keys(ctx).length === 0) delete current.userInputMessageContext;
	}
	if (payloadSize(payload) <= budget) return payload;

	// Step 4: if history is empty and toolResults remain, remove them (no matching toolUses context)
	if (payload.conversationState.history.length === 0 && ctx?.toolResults) {
		delete ctx.toolResults;
		if (Object.keys(ctx).length === 0) delete current.userInputMessageContext;
	}
	if (payloadSize(payload) <= budget) return payload;

	// Step 5: truncate current message content (last resort, keep toolResults)
	if (payloadSize(payload) > budget) shrinkCurrentContent(payload, budget);
	if (payloadSize(payload) > budget) current.content = "";

	return payload;
}

function getKiroMaxTools() {
	const value = Number(process.env.KIRO_MAX_TOOLS);
	if (Number.isFinite(value) && value > 0) return Math.floor(value);
	return DEFAULT_KIRO_MAX_TOOLS;
}

function pickKiroTools(tools) {
	if (!Array.isArray(tools) || tools.length === 0) return [];

	const normalized = tools.map((tool, index) => ({
		tool,
		index,
		name: String(tool?.function?.name || tool?.name || "").trim(),
	}));

	const preferred = [];
	const fallback = [];
	const seen = new Set();

	for (const entry of normalized) {
		if (!entry.name || seen.has(entry.name)) continue;
		seen.add(entry.name);
		if (KIRO_PREFERRED_TOOL_NAMES.includes(entry.name)) {
			preferred.push(entry);
		} else {
			fallback.push(entry);
		}
	}

	return [...preferred, ...fallback]
		.slice(0, getKiroMaxTools())
		.map((entry) => entry.tool);
}

function isKiroProfileMode(credentials) {
	return Boolean(credentials?.providerSpecificData?.profileArn);
}

function pruneKiroContextForMode(ctx, allowTools) {
	if (!ctx || typeof ctx !== "object") return undefined;

	const next = { ...ctx };
	if (!allowTools) {
		delete next.tools;
		delete next.toolResults;
	}

	return Object.keys(next).length > 0 ? next : undefined;
}

function shouldInjectKiroTimestamp() {
	return process.env.KIRO_DISABLE_TIMESTAMP_PREFIX !== "1";
}

function shouldIncludeKiroInferenceConfig() {
	return process.env.KIRO_DISABLE_INFERENCE_CONFIG !== "1";
}

/**
 * Convert OpenAI messages to Kiro format
 * Rules: system/tool/user -> user role, merge consecutive same roles
 */
function convertMessages(messages, tools, model, credentials) {
	const history = [];
	let currentMessage = null;
	let conversationId = null;
	let agentContinuationId = null;
	let agentTaskType = null;
	const allowExtendedToolContext = isKiroProfileMode(credentials);

	let pendingUserContent = [];
	let pendingAssistantContent = [];
	let pendingToolResults = [];
	let pendingToolUses = [];
	let currentRole = null;

	const serializeTools = () => {
		const selectedTools = pickKiroTools(tools);
		if (selectedTools.length === 0) return undefined;
		return selectedTools.map((t) => {
			const name = t.function?.name || t.name;
			let description = t.function?.description || t.description || "";

			if (!description.trim()) {
				description = `Tool: ${name}`;
			}

			return {
				toolSpecification: {
					name,
					description,
					inputSchema: {
						json:
							t.function?.parameters || t.parameters || t.input_schema || {},
					},
				},
			};
		});
	};

	// Map toolUseId -> {name, input} untuk pairing dengan tool results
	const toolUseMap = new Map<string, { name: string; input: any }>();

	const flushPending = () => {
		if (currentRole === "user") {
			const hasToolResults = pendingToolResults.length > 0;
			const joinedContent = pendingUserContent.join("\n\n").trim();
			const content = joinedContent || "continue";

			const userMsg: any = {
				userInputMessage: {
					content,
					modelId: "",
				},
			};

			const serializedTools = serializeTools();
			const ctx: any = {};
			if (hasToolResults) ctx.toolResults = pendingToolResults;
			if (serializedTools?.length) ctx.tools = serializedTools;
			const nextCtx = pruneKiroContextForMode(ctx, allowExtendedToolContext);
			if (nextCtx) {
				userMsg.userInputMessage.userInputMessageContext = nextCtx;
			}

			history.push(userMsg);
			currentMessage = userMsg;
			pendingUserContent = [];
			pendingToolResults = [];
		} else if (currentRole === "assistant") {
			// Profile-based CodeWhisperer accounts tolerate richer tool history than builder-id accounts.
			const content = pendingAssistantContent.join("\n\n").trim();
			const assistantMsg: any = { assistantResponseMessage: { content } };
			if (allowExtendedToolContext && pendingToolUses.length > 0) {
				assistantMsg.assistantResponseMessage.toolUses = pendingToolUses;
			}
			history.push(assistantMsg);
			pendingAssistantContent = [];
			pendingToolUses = [];
		}
	};

	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];
		let role = msg.role;
		const additional = msg?.additional_kwargs || {};

		if (
			typeof additional.conversationId === "string" &&
			additional.conversationId.trim()
		) {
			conversationId = additional.conversationId.trim();
		}
		if (
			typeof additional.continuationId === "string" &&
			additional.continuationId.trim()
		) {
			agentContinuationId = additional.continuationId.trim();
		}
		if (typeof additional.taskType === "string" && additional.taskType.trim()) {
			agentTaskType = additional.taskType.trim();
		}

		// Normalize: system/tool -> user
		if (role === "system" || role === "tool") {
			role = "user";
		}

		// If role changes, flush pending
		if (role !== currentRole && currentRole !== null) {
			flushPending();
		}
		currentRole = role;

		if (role === "user") {
			let content = "";
			if (typeof msg.content === "string") {
				content = msg.content;
			} else if (Array.isArray(msg.content)) {
				const textParts = msg.content
					.filter((c) => c.type === "text" || c.text)
					.map((c) => c.text || "");
				content = textParts.join("\n");

				const toolResultBlocks = msg.content.filter(
					(c) => c.type === "tool_result",
				);
				if (toolResultBlocks.length > 0) {
					toolResultBlocks.forEach((block) => {
						const text = Array.isArray(block.content)
							? block.content.map((c) => c.text || "").join("\n")
							: typeof block.content === "string"
								? block.content
								: "";

						pendingToolResults.push({
							toolUseId: block.tool_use_id,
							status: "success",
							content: [{ text }],
						});
					});
				}
			}

			if (msg.role === "tool") {
				const toolContent = typeof msg.content === "string" ? msg.content : "";
				pendingToolResults.push({
					toolUseId: msg.tool_call_id,
					status: "success",
					content: [{ text: toolContent }],
				});
			} else if (content) {
				pendingUserContent.push(content);
			}
		} else if (role === "assistant") {
			let textContent = "";
			let toolUses = [];

			if (Array.isArray(msg.content)) {
				const textBlocks = msg.content.filter((c) => c.type === "text");
				textContent = textBlocks
					.map((b) => b.text)
					.join("\n")
					.trim();

				const toolUseBlocks = msg.content.filter((c) => c.type === "tool_use");
				toolUses = toolUseBlocks;
			} else if (typeof msg.content === "string") {
				textContent = msg.content.trim();
			}

			if (msg.tool_calls && msg.tool_calls.length > 0) {
				toolUses = msg.tool_calls;
			}

			if (textContent) {
				pendingAssistantContent.push(textContent);
			}

			if (toolUses.length > 0) {
				// Collect tool uses for the assistantResponseMessage
				for (const toolUse of toolUses) {
					const toolUseId =
						toolUse.id || toolUse.tool_use_id || `call_${Date.now()}`;
					const name = toolUse.function?.name || toolUse.name || "tool";
					let input = {};
					try {
						input =
							typeof toolUse.function?.arguments === "string"
								? JSON.parse(toolUse.function.arguments)
								: toolUse.input || toolUse.function?.arguments || {};
					} catch {
						input = {};
					}
					pendingToolUses.push({ toolUseId, name, input });
					toolUseMap.set(toolUseId, { name, input });
				}
				flushPending();
				currentRole = null;
			}
		}
	}

	if (currentRole !== null) {
		flushPending();
	}

	if (history.length > 0 && history[history.length - 1].userInputMessage) {
		currentMessage = history.pop();
	} else if (!currentMessage) {
		currentMessage = {
			userInputMessage: {
				content: "Continue",
				modelId: model,
			},
		};
	}

	const firstHistoryItem = history[0];
	if (
		firstHistoryItem?.userInputMessage?.userInputMessageContext?.tools &&
		!currentMessage?.userInputMessage?.userInputMessageContext?.tools
	) {
		if (!currentMessage.userInputMessage.userInputMessageContext) {
			currentMessage.userInputMessage.userInputMessageContext = {};
		}
		currentMessage.userInputMessage.userInputMessageContext.tools =
			firstHistoryItem.userInputMessage.userInputMessageContext.tools;
	}

	history.forEach((item) => {
		if (item.userInputMessage && !item.userInputMessage.modelId) {
			item.userInputMessage.modelId = model;
		}
		if (item.userInputMessage && !item.userInputMessage.origin) {
			item.userInputMessage.origin = "AI_EDITOR";
		}
		// History entries should not have tools (only currentMessage needs them)
		if (item.userInputMessage?.userInputMessageContext?.tools) {
			delete item.userInputMessage.userInputMessageContext.tools;
		}
		if (
			item.userInputMessage?.userInputMessageContext &&
			Object.keys(item.userInputMessage.userInputMessageContext).length === 0
		) {
			delete item.userInputMessage.userInputMessageContext;
		}
	});

	agentContinuationId = null;
	agentTaskType = null;

	return {
		history,
		currentMessage,
		conversationId,
		agentContinuationId,
		agentTaskType,
		allowExtendedToolContext,
	};
}

/**
 * Build Kiro payload from OpenAI format
 */
export function buildKiroPayload(model, body, stream, credentials) {
	const messages = body.messages || [];
	const tools = body.tools || [];
	const maxTokens = body.max_tokens ?? body.max_completion_tokens ?? undefined;
	const temperature = body.temperature;
	const topP = body.top_p;

	const {
		history,
		currentMessage,
		conversationId,
		agentContinuationId,
		agentTaskType,
		allowExtendedToolContext,
	} = convertMessages(messages, tools, model, credentials);

	const profileArn = credentials?.providerSpecificData?.profileArn || "";

	let finalContent = currentMessage?.userInputMessage?.content || "";

	// Compute conversationId seed BEFORE injecting timestamp so the ID stays
	// stable across retries/tool-result turns within the same conversation.
	// Include profileArn (account) + system message (contains workspace/cwd from client)
	// so different accounts and different directories never share the same conversationId.
	const NAMESPACE_KIRO = "34f7193f-561d-4050-bc84-9547d953d6bf";
	const systemContent =
		messages.find((m) => m.role === "system")?.content || "";
	const firstContent =
		history.length > 0 && history[0].userInputMessage?.content
			? history[0].userInputMessage.content
			: finalContent;
	const conversationSeed = `${profileArn}:${typeof systemContent === "string" ? systemContent.substring(0, 500) : ""}:${(firstContent || "").substring(0, 4000)}`;
	const stableConversationId =
		conversationId || uuidv5(conversationSeed, NAMESPACE_KIRO);

	if (shouldInjectKiroTimestamp()) {
		const timestamp = new Date().toISOString();
		// Only prepend timestamp if there's actual content; otherwise use a minimal placeholder
		if (finalContent.trim()) {
			finalContent = `[Context: Current time is ${timestamp}]\n\n${finalContent}`;
		} else {
			finalContent = `[Context: Current time is ${timestamp}]\n\ncontinue`;
		}
	} else if (!finalContent.trim()) {
		finalContent = "continue";
	}

	const payload: any = {
		conversationState: {
			chatTriggerType: "MANUAL",
			conversationId: stableConversationId,
			currentMessage: {
				userInputMessage: {
					content: finalContent,
					modelId: model,
					origin: "AI_EDITOR",
					...(currentMessage?.userInputMessage?.userInputMessageContext && {
						userInputMessageContext:
							currentMessage.userInputMessage.userInputMessageContext,
					}),
				},
			},
			history,
		},
	};

	if (agentContinuationId) {
		payload.conversationState.agentContinuationId = agentContinuationId;
	}
	if (agentTaskType) {
		payload.conversationState.agentTaskType = agentTaskType;
	}

	if (profileArn) {
		payload.profileArn = profileArn;
	}

	if (
		shouldIncludeKiroInferenceConfig() &&
		(maxTokens !== undefined || temperature !== undefined || topP !== undefined)
	) {
		payload.inferenceConfig = {};
		if (maxTokens !== undefined) payload.inferenceConfig.maxTokens = maxTokens;
		if (temperature !== undefined)
			payload.inferenceConfig.temperature = temperature;
		if (topP !== undefined) payload.inferenceConfig.topP = topP;
	}

	Object.defineProperty(payload, "__axonDebug", {
		value: {
			providerMode: allowExtendedToolContext ? "profile" : "builder-id",
			toolCount: Array.isArray(
				currentMessage?.userInputMessage?.userInputMessageContext?.tools,
			)
				? currentMessage.userInputMessage.userInputMessageContext.tools.length
				: 0,
			hasToolResults: Array.isArray(
				currentMessage?.userInputMessage?.userInputMessageContext?.toolResults,
			)
				? currentMessage.userInputMessage.userInputMessageContext.toolResults
						.length > 0
				: false,
			hasAgentContinuationId: Boolean(agentContinuationId),
			hasAgentTaskType: Boolean(agentTaskType),
			historyLength: Array.isArray(history) ? history.length : 0,
			timestampPrefixEnabled: shouldInjectKiroTimestamp(),
			inferenceConfigEnabled: shouldIncludeKiroInferenceConfig(),
		},
		enumerable: false,
	});

	return fitKiroPayload(payload, getKiroPayloadBudget());
}

register(FORMATS.OPENAI, FORMATS.KIRO, buildKiroPayload, null);
