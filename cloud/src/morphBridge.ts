import {
	splitMorphThinkBlocks,
	cloneResponseHeadersWithoutLength,
	createMorphReasoningEventTransformer,
} from "../../src/lib/morph/reasoning.js";
import { MORPH_FAST_MODELS } from "../../src/shared/constants/models.js";

type MorphFastModel = (typeof MORPH_FAST_MODELS)[number];
type MorphMessage = Record<string, unknown> & {
	content?: unknown;
	reasoning_content?: string;
	tool_calls?: MorphToolCall[];
};
type MorphToolCall = {
	id?: string;
	function?: {
		name?: string;
		arguments?: string;
	};
};
type OpenAIChoice = Record<string, unknown> & {
	message?: MorphMessage;
	delta?: Record<string, unknown> & {
		content?: string;
		reasoning_content?: string;
		tool_calls?: MorphToolCall[];
	};
	finish_reason?: string | null;
};
type OpenAIParsedResponse = Record<string, unknown> & {
	id?: string;
	model?: string;
	created?: number;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
	choices?: OpenAIChoice[];
};

type ResponsesInputItem = Record<string, unknown> & {
	type?: string;
	role?: string;
	content?: string | Array<Record<string, unknown>>;
};

const MORPH_FAST_MODEL_IDS = new Set(
	MORPH_FAST_MODELS.map((model: MorphFastModel) => model.id),
);

export function normalizeSharedMorphModel(model: unknown) {
	if (typeof model !== "string") return "";
	const normalized = model.trim();
	if (!normalized) return "";
	return normalized.startsWith("morph/")
		? normalized.slice("morph/".length)
		: normalized;
}

export function isSharedMorphFastModel(model: unknown) {
	const normalized = normalizeSharedMorphModel(model);
	return normalized ? MORPH_FAST_MODEL_IDS.has(normalized) : false;
}

function normalizeReasoningMessage(message: MorphMessage = {}) {
	const { content, reasoning } = splitMorphThinkBlocks(message.content);
	const reasoningContent =
		typeof message.reasoning_content === "string" &&
		message.reasoning_content.trim()
			? message.reasoning_content.trim()
			: reasoning;

	return {
		...message,
		content: typeof content === "string" && content.length > 0 ? content : null,
		...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
	};
}

export function translateClaudeRequestToOpenAI(
	body: Record<string, unknown> = {},
	resolvedInstructions = "",
) {
	const messages = [];
	const model = normalizeSharedMorphModel(body.model);

	if (body.system) {
		const systemContent = Array.isArray(body.system)
			? body.system
					.map((entry: Record<string, unknown>) => entry?.text || "")
					.filter(Boolean)
					.join("\n")
			: String(body.system || "");
		if (systemContent)
			messages.push({ role: "system", content: systemContent });
	} else if (
		typeof resolvedInstructions === "string" &&
		resolvedInstructions.trim()
	) {
		messages.push({ role: "system", content: resolvedInstructions.trim() });
	}

	for (const msg of Array.isArray(body.messages) ? body.messages : []) {
		const role = msg?.role === "assistant" ? "assistant" : "user";
		const content =
			typeof msg?.content === "string"
				? msg.content
				: Array.isArray(msg?.content)
					? msg.content
							.map((part: Record<string, unknown>) =>
								part?.type === "text" ? part.text || "" : "",
							)
							.filter(Boolean)
							.join("\n")
					: "";
		messages.push({ role, content });
	}

	return {
		model,
		messages,
		stream: body?.stream === true,
		max_tokens: body?.max_tokens,
		temperature: body?.temperature,
		top_p: body?.top_p,
	};
}

export function translateResponsesRequestToOpenAI(
	body: Record<string, unknown> = {},
	resolvedInstructions = "",
) {
	const model = normalizeSharedMorphModel(body.model);
	const messages = [];

	if (typeof body.instructions === "string" && body.instructions.trim()) {
		messages.push({ role: "system", content: body.instructions.trim() });
	} else if (
		typeof resolvedInstructions === "string" &&
		resolvedInstructions.trim()
	) {
		messages.push({ role: "system", content: resolvedInstructions.trim() });
	}

	if (typeof body.input === "string") {
		messages.push({ role: "user", content: body.input });
	} else if (Array.isArray(body.input)) {
		for (const item of body.input as ResponsesInputItem[]) {
			if (!item || typeof item !== "object") continue;
			if (item.type === "message" || item.role) {
				const role =
					item.role === "assistant"
						? "assistant"
						: item.role === "system" || item.role === "developer"
							? "system"
							: "user";
				let content = "";
				if (typeof item.content === "string") {
					content = item.content;
				} else if (Array.isArray(item.content)) {
					content = item.content
						.map((part: Record<string, unknown>) =>
							part?.type === "input_text" ||
							part?.type === "output_text" ||
							part?.type === "text"
								? part.text || ""
								: "",
						)
						.filter(Boolean)
						.join("\n");
				}
				messages.push({ role, content });
			}
		}
	}

	return {
		model,
		messages,
		stream: body?.stream === true,
		max_tokens: body?.max_output_tokens || body?.max_tokens,
		temperature: body?.temperature,
		top_p: body?.top_p,
	};
}

export function translateOpenAIResponseToClaude(
	parsed: OpenAIParsedResponse,
	fallbackModel = "",
) {
	const choice = parsed?.choices?.[0] || {};
	const message = normalizeReasoningMessage(choice.message || {});
	const content = [];
	const cleanedText =
		typeof message.content === "string" ? message.content : "";

	if (cleanedText) {
		content.push({ type: "text", text: cleanedText });
	}

	if (Array.isArray(message.tool_calls)) {
		for (const toolCall of message.tool_calls) {
			let parsedArguments = {};
			try {
				parsedArguments = JSON.parse(toolCall.function?.arguments || "{}");
			} catch {}
			content.push({
				type: "tool_use",
				id: toolCall.id || `call_${Date.now()}`,
				name: toolCall.function?.name || "",
				input: parsedArguments,
			});
		}
	}

	return {
		id: String(parsed?.id || `msg_${Date.now()}`).replace(/^chatcmpl-/, ""),
		type: "message",
		role: "assistant",
		model: parsed?.model || fallbackModel,
		content:
			content.length > 0
				? content
				: [
						{
							type: "text",
							text: "[Morph returned reasoning only before completion]",
						},
					],
		stop_reason:
			choice.finish_reason === "tool_calls"
				? "tool_use"
				: choice.finish_reason === "length"
					? "max_tokens"
					: "end_turn",
		stop_sequence: null,
		usage: parsed?.usage
			? {
					input_tokens: parsed.usage.prompt_tokens || 0,
					output_tokens: parsed.usage.completion_tokens || 0,
				}
			: undefined,
	};
}

export function translateOpenAIResponseToResponses(
	parsed: OpenAIParsedResponse,
	fallbackModel = "",
) {
	const choice = parsed?.choices?.[0] || {};
	const message = normalizeReasoningMessage(choice.message || {});
	const output = [];
	const cleanedText =
		typeof message.content === "string" ? message.content : "";
	const normalizedReasoning =
		typeof message.reasoning_content === "string" &&
		message.reasoning_content.trim()
			? message.reasoning_content.trim()
			: null;

	if (normalizedReasoning) {
		output.push({
			id: `rs_${parsed?.id || Date.now()}`,
			type: "reasoning",
			summary: [
				{
					type: "summary_text",
					text: normalizedReasoning,
				},
			],
		});
	}

	if (Array.isArray(message.tool_calls)) {
		for (const toolCall of message.tool_calls) {
			output.push({
				id: `fc_${toolCall.id || Date.now()}`,
				type: "function_call",
				call_id: toolCall.id || null,
				name: toolCall.function?.name || "",
				arguments: toolCall.function?.arguments || "{}",
			});
		}
	}

	output.unshift({
		id: `msg_${parsed?.id || Date.now()}`,
		type: "message",
		role: "assistant",
		content: cleanedText
			? [
					{
						type: "output_text",
						text: cleanedText,
						annotations: [],
						logprobs: [],
					},
				]
			: [],
	});

	return {
		id: `resp_${parsed?.id || Date.now()}`,
		object: "response",
		created_at: parsed?.created || Math.floor(Date.now() / 1000),
		status: "completed",
		error: null,
		model: parsed?.model || fallbackModel,
		output,
		usage: parsed?.usage
			? {
					input_tokens: parsed.usage.prompt_tokens || 0,
					output_tokens: parsed.usage.completion_tokens || 0,
					total_tokens:
						parsed.usage.total_tokens ||
						(parsed.usage.prompt_tokens || 0) +
							(parsed.usage.completion_tokens || 0),
				}
			: undefined,
	};
}

export async function normalizeOpenAIChatResponse(response: Response) {
	const contentType = response.headers.get("content-type") || "";
	if (contentType.includes("text/event-stream")) {
		const source = response.body;
		if (!source) return response;

		const transformed = source.pipeThrough(
			createMorphReasoningEventTransformer(),
		);

		return new Response(transformed, {
			status: response.status,
			statusText: response.statusText,
			headers: cloneResponseHeadersWithoutLength(response.headers),
		});
	}

	const text = await response.text();
	try {
		const parsed = JSON.parse(text);
		if (Array.isArray(parsed?.choices)) {
			const nextChoices = parsed.choices.map((choice: OpenAIChoice) => {
				if (
					!choice ||
					typeof choice !== "object" ||
					!choice.message ||
					typeof choice.message !== "object"
				)
					return choice;
				return {
					...choice,
					message: normalizeReasoningMessage(choice.message),
				};
			});
			return new Response(JSON.stringify({ ...parsed, choices: nextChoices }), {
				status: response.status,
				statusText: response.statusText,
				headers: cloneResponseHeadersWithoutLength(response.headers),
			});
		}
	} catch {
		return new Response(text, {
			status: response.status,
			statusText: response.statusText,
			headers: cloneResponseHeadersWithoutLength(response.headers),
		});
	}

	return new Response(text, {
		status: response.status,
		statusText: response.statusText,
		headers: cloneResponseHeadersWithoutLength(response.headers),
	});
}

export function createClaudeStreamingBridge(
	response: Response,
	fallbackModel = "",
) {
	const source = response.body;
	if (!source) return response;

	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	let buffer = "";
	let messageId = null;
	let emittedMessageStart = false;
	let textStarted = false;
	const toolIndexById = new Map<string, number>();

	function toSse(event: string, data: Record<string, unknown>) {
		return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	}

	function mapToolCall(toolCall: MorphToolCall) {
		let parsedArguments: Record<string, unknown> = {};
		try {
			parsedArguments = JSON.parse(
				toolCall.function?.arguments || "{}",
			) as Record<string, unknown>;
		} catch {
			parsedArguments = {};
		}

		return {
			type: "tool_use",
			id: toolCall.id || `call_${Date.now()}`,
			name: toolCall.function?.name || "",
			input: parsedArguments,
		};
	}

	function convertChunk(parsed: OpenAIParsedResponse) {
		const chunks: string[] = [];
		const choice = parsed?.choices?.[0] || {};
		const delta = choice?.delta || {};
		messageId ||= String(parsed?.id || `msg_${Date.now()}`).replace(
			/^chatcmpl-/,
			"",
		);

		if (!emittedMessageStart) {
			emittedMessageStart = true;
			chunks.push(
				toSse("message_start", {
					type: "message_start",
					message: {
						id: messageId,
						type: "message",
						role: "assistant",
						model: parsed?.model || fallbackModel,
						content: [],
					},
				}),
			);
		}

		if (
			typeof delta.reasoning_content === "string" &&
			delta.reasoning_content.length > 0
		) {
			chunks.push(
				toSse("content_block_start", {
					type: "content_block_start",
					index: 0,
					content_block: { type: "thinking", thinking: "" },
				}),
			);
			chunks.push(
				toSse("content_block_delta", {
					type: "content_block_delta",
					index: 0,
					delta: { type: "thinking_delta", thinking: delta.reasoning_content },
				}),
			);
			chunks.push(
				toSse("content_block_stop", {
					type: "content_block_stop",
					index: 0,
				}),
			);
		}

		if (typeof delta.content === "string" && delta.content.length > 0) {
			if (!textStarted) {
				textStarted = true;
				chunks.push(
					toSse("content_block_start", {
						type: "content_block_start",
						index: 0,
						content_block: { type: "text", text: "" },
					}),
				);
			}
			chunks.push(
				toSse("content_block_delta", {
					type: "content_block_delta",
					index: 0,
					delta: { type: "text_delta", text: delta.content },
				}),
			);
		}

		if (Array.isArray(delta.tool_calls)) {
			for (const toolCall of delta.tool_calls) {
				const toolId = toolCall.id || `call_${Date.now()}`;
				if (!toolIndexById.has(toolId)) {
					toolIndexById.set(toolId, toolIndexById.size + 1);
					chunks.push(
						toSse("content_block_start", {
							type: "content_block_start",
							index: toolIndexById.get(toolId),
							content_block: mapToolCall(toolCall),
						}),
					);
					chunks.push(
						toSse("content_block_stop", {
							type: "content_block_stop",
							index: toolIndexById.get(toolId),
						}),
					);
				}
			}
		}

		if (choice.finish_reason) {
			if (textStarted) {
				chunks.push(
					toSse("content_block_stop", {
						type: "content_block_stop",
						index: 0,
					}),
				);
			}
			chunks.push(
				toSse("message_delta", {
					type: "message_delta",
					delta: {
						stop_reason:
							choice.finish_reason === "tool_calls"
								? "tool_use"
								: choice.finish_reason === "length"
									? "max_tokens"
									: "end_turn",
						stop_sequence: null,
					},
					usage: parsed?.usage
						? {
								input_tokens: parsed.usage.prompt_tokens || 0,
								output_tokens: parsed.usage.completion_tokens || 0,
							}
						: undefined,
				}),
			);
			chunks.push(toSse("message_stop", { type: "message_stop" }));
		}

		return chunks.join("");
	}

	const transformed = source.pipeThrough(
		new TransformStream({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true });
				const normalized = buffer.replace(/\r\n/g, "\n");
				const parts = normalized.split("\n\n");
				buffer = parts.pop() || "";

				for (const part of parts) {
					const dataLines = part
						.split("\n")
						.filter((line) => line.startsWith("data:"));
					if (dataLines.length === 0) continue;
					const data = dataLines.map((line) => line.slice(5).trim()).join("\n");
					if (!data || data === "[DONE]") continue;
					try {
						const parsed = JSON.parse(data);
						const converted = convertChunk(parsed);
						if (converted) controller.enqueue(encoder.encode(converted));
					} catch {}
				}
			},
			flush(controller) {
				const finalText = buffer + decoder.decode();
				if (!finalText.trim()) return;
				const dataLines = finalText
					.split("\n")
					.filter((line) => line.startsWith("data:"));
				const data = dataLines.map((line) => line.slice(5).trim()).join("\n");
				if (!data || data === "[DONE]") return;
				try {
					const parsed = JSON.parse(data);
					const converted = convertChunk(parsed);
					if (converted) controller.enqueue(encoder.encode(converted));
				} catch {}
			},
		}),
	);

	return new Response(transformed, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			...Object.fromEntries(
				cloneResponseHeadersWithoutLength(response.headers).entries(),
			),
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"Access-Control-Allow-Origin": "*",
		},
	});
}

export function createResponsesStreamingBridge(
	response: Response,
	fallbackModel = "",
) {
	const source = response.body;
	if (!source) return response;

	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	let buffer = "";
	let responseId: string | null = null;
	let outputIndex = 0;

	function toSse(data: Record<string, unknown>) {
		return `data: ${JSON.stringify(data)}\n\n`;
	}

	function convertChunk(parsed: OpenAIParsedResponse) {
		const chunks: string[] = [];
		const choice = parsed?.choices?.[0] || {};
		const delta = choice?.delta || {};
		responseId ||= `resp_${parsed?.id || Date.now()}`;

		if (
			typeof delta.reasoning_content === "string" &&
			delta.reasoning_content.length > 0
		) {
			chunks.push(
				toSse({
					type: "response.reasoning.delta",
					response_id: responseId,
					output_index: outputIndex,
					delta: delta.reasoning_content,
				}),
			);
		}

		if (typeof delta.content === "string" && delta.content.length > 0) {
			chunks.push(
				toSse({
					type: "response.output_text.delta",
					response_id: responseId,
					output_index: outputIndex,
					delta: delta.content,
				}),
			);
		}

		if (Array.isArray(delta.tool_calls)) {
			for (const toolCall of delta.tool_calls) {
				chunks.push(
					toSse({
						type: "response.function_call_arguments.done",
						response_id: responseId,
						output_index: ++outputIndex,
						item_id: `fc_${toolCall.id || Date.now()}`,
						call_id: toolCall.id || null,
						name: toolCall.function?.name || "",
						arguments: toolCall.function?.arguments || "{}",
					}),
				);
			}
		}

		if (choice.finish_reason) {
			chunks.push(
				toSse({
					type: "response.completed",
					response: {
						id: responseId,
						object: "response",
						created_at: parsed?.created || Math.floor(Date.now() / 1000),
						status: "completed",
						error: null,
						model: parsed?.model || fallbackModel,
						usage: parsed?.usage
							? {
									input_tokens: parsed.usage.prompt_tokens || 0,
									output_tokens: parsed.usage.completion_tokens || 0,
									total_tokens:
										parsed.usage.total_tokens ||
										(parsed.usage.prompt_tokens || 0) +
											(parsed.usage.completion_tokens || 0),
								}
							: undefined,
					},
				}),
			);
			chunks.push("data: [DONE]\n\n");
		}

		return chunks.join("");
	}

	const transformed = source.pipeThrough(
		new TransformStream({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true });
				const normalized = buffer.replace(/\r\n/g, "\n");
				const parts = normalized.split("\n\n");
				buffer = parts.pop() || "";

				for (const part of parts) {
					const dataLines = part
						.split("\n")
						.filter((line) => line.startsWith("data:"));
					if (dataLines.length === 0) continue;
					const data = dataLines.map((line) => line.slice(5).trim()).join("\n");
					if (!data || data === "[DONE]") continue;
					try {
						const parsed = JSON.parse(data);
						const converted = convertChunk(parsed);
						if (converted) controller.enqueue(encoder.encode(converted));
					} catch {}
				}
			},
			flush(controller) {
				const finalText = buffer + decoder.decode();
				if (!finalText.trim()) return;
				const dataLines = finalText
					.split("\n")
					.filter((line) => line.startsWith("data:"));
				const data = dataLines.map((line) => line.slice(5).trim()).join("\n");
				if (!data || data === "[DONE]") return;
				try {
					const parsed = JSON.parse(data);
					const converted = convertChunk(parsed);
					if (converted) controller.enqueue(encoder.encode(converted));
				} catch {}
			},
		}),
	);

	return new Response(transformed, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			...Object.fromEntries(
				cloneResponseHeadersWithoutLength(response.headers).entries(),
			),
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"Access-Control-Allow-Origin": "*",
		},
	});
}
