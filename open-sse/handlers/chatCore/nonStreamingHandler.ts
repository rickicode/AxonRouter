import { HTTP_STATUS } from "../../config/runtimeConfig";
import {
	appendRequestLog,
	saveRequestDetail,
} from "../../runtime/usagePersistence";
import { FORMATS } from "../../translator/formats";
import { needsTranslation } from "../../translator/index";
import { ollamaBodyToOpenAI } from "../../translator/response/ollama-to-openai";
import { decloakToolNames } from "../../utils/claudeCloaking";
import { createErrorResult } from "../../utils/error";
import {
	filterUsageForFormat,
} from "../../utils/usageTracking";
import {
	buildRequestDetail,
	extractRequestConfig,
	extractUsageFromResponse,
	saveUsageStats,
} from "./requestDetail";
import {
	parseCommandCodeSSEToOpenAIResponse,
	parseResponsesSSEToOpenAIResponse,
	parseSSEToOpenAIResponse,
	readBufferedSSETextWithProgressTimeout,
} from "./sseToJsonHandler";

/**
 * Translate non-streaming response body from provider format → OpenAI format.
 */
export function translateNonStreamingResponse(
	responseBody,
	targetFormat,
	sourceFormat,
) {
	if (sourceFormat === FORMATS.COMMANDCODE && targetFormat === FORMATS.OPENAI && responseBody?.type === "message") {
		let textContent = "";
		const toolCalls = [];
		for (const block of responseBody.content || []) {
			if (block?.type === "text" && typeof block.text === "string") {
				textContent += block.text;
			} else if (block?.type === "tool_use") {
				toolCalls.push({
					id: block.id || `call_${Date.now()}_${toolCalls.length}`,
					type: "function",
					function: {
						name: block.name || "",
						arguments: JSON.stringify(block.input || {}),
					},
				});
			}
		}

		const message: any = {
			role: "assistant",
			content: textContent || (toolCalls.length > 0 ? null : ""),
		};
		if (toolCalls.length > 0) message.tool_calls = toolCalls;

		let finishReason = responseBody.stop_reason || "stop";
		if (finishReason === "end_turn") finishReason = "stop";
		if (finishReason === "tool_use") finishReason = "tool_calls";

		const usage = responseBody.usage || {};
		return {
			id: `chatcmpl-${responseBody.id || Date.now()}`,
			object: "chat.completion",
			created: Math.floor(Date.now() / 1000),
			model: responseBody.model || "commandcode",
			choices: [{ index: 0, message, finish_reason: finishReason }],
			usage: {
				prompt_tokens: usage.input_tokens || 0,
				completion_tokens: usage.output_tokens || 0,
				total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
			},
		};
	}

	if (sourceFormat === FORMATS.CLAUDE && responseBody?.object === "chat.completion") {
		const choice = responseBody.choices?.[0] || {};
		const message = choice.message || {};
		const content = [];

		if (message.reasoning_content) {
			content.push({ type: "thinking", thinking: message.reasoning_content });
		}
		if (typeof message.content === "string" && message.content.length > 0) {
			content.push({ type: "text", text: message.content });
		}
		if (Array.isArray(message.tool_calls)) {
			for (const toolCall of message.tool_calls) {
				let parsedArguments = {};
				try {
					parsedArguments = JSON.parse(toolCall?.function?.arguments || "{}");
				} catch {
					parsedArguments = {};
				}
				content.push({
					type: "tool_use",
					id: toolCall.id,
					name: toolCall.function?.name || "",
					input: parsedArguments,
				});
			}
		}

		return {
			id: String(responseBody.id || `msg_${Date.now()}`).replace(/^chatcmpl-/, ""),
			type: "message",
			role: "assistant",
			model: responseBody.model || "claude",
			content,
			stop_reason:
				choice.finish_reason === "tool_calls"
					? "tool_use"
					: choice.finish_reason === "length"
						? "max_tokens"
						: "end_turn",
				stop_sequence: null,
				usage: {
					input_tokens: responseBody.usage?.prompt_tokens || 0,
					output_tokens: responseBody.usage?.completion_tokens || 0,
				},
			};
	}

	// OpenAI Responses API → OpenAI Chat Completions (e.g., Codex non-streaming)
	if (sourceFormat === FORMATS.OPENAI_RESPONSES && targetFormat === FORMATS.OPENAI) {
		const output = responseBody?.output || [];
		const messages = output.filter((item) => item?.type === "message");
		let textContent = "";
		const toolCalls = [];

		for (const msg of messages) {
			const content = msg.content || [];
			for (const block of content) {
				if (block?.type === "output_text" && block.text) {
					textContent += block.text;
				}
				if (block?.type === "function_call" || block?.type === "custom_tool_call") {
					toolCalls.push({
						id: block.call_id || `call_${Date.now()}_${toolCalls.length}`,
						type: "function",
						function: {
							name: block.name || "",
							arguments:
								typeof block.arguments === "string"
									? block.arguments
									: JSON.stringify(block.arguments || {}),
						},
					});
				}
			}
		}

		const message: any = {
			role: "assistant",
			content: textContent || (toolCalls.length > 0 ? null : ""),
		};
		if (toolCalls.length > 0) message.tool_calls = toolCalls;

		let finishReason = "stop";
		if (toolCalls.length > 0) finishReason = "tool_calls";
		else if (responseBody?.status === "incomplete") finishReason = "length";

		const usage = responseBody?.usage || {};
		return {
			id: `chatcmpl-${responseBody.id || Date.now()}`,
			object: "chat.completion",
			created: Math.floor(
				(new Date(responseBody?.created_at || Date.now())).getTime() / 1000,
			),
			model: responseBody.model || "unknown",
			choices: [{ index: 0, message, finish_reason: finishReason }],
			usage: {
				prompt_tokens: usage.input_tokens || 0,
				completion_tokens: usage.output_tokens || 0,
				total_tokens:
					(usage.input_tokens || 0) + (usage.output_tokens || 0),
			},
		};
	}

	if (targetFormat === sourceFormat || targetFormat === FORMATS.OPENAI)
		return responseBody;

	// Gemini / Antigravity
	if (
		targetFormat === FORMATS.GEMINI ||
		targetFormat === FORMATS.ANTIGRAVITY ||
		targetFormat === FORMATS.GEMINI_CLI ||
		targetFormat === FORMATS.VERTEX
	) {
		const response = responseBody.response || responseBody;
		if (!response?.candidates?.[0]) return responseBody;

		const candidate = response.candidates[0];
		const content = candidate.content;
		const usage = response.usageMetadata || responseBody.usageMetadata;
		let textContent = "",
			reasoningContent = "";
		const toolCalls = [];

		if (content?.parts) {
			for (const part of content.parts) {
				if (part.thought === true && part.text) reasoningContent += part.text;
				else if (part.text !== undefined) textContent += part.text;
				if (part.functionCall) {
					toolCalls.push({
						id: `call_${part.functionCall.name}_${Date.now()}_${toolCalls.length}`,
						type: "function",
						function: {
							name: part.functionCall.name,
							arguments: JSON.stringify(part.functionCall.args || {}),
						},
					});
				}
			}
		}

		const message: any = { role: "assistant" };
		if (textContent) message.content = textContent;
		if (reasoningContent) message.reasoning_content = reasoningContent;
		if (toolCalls.length > 0) message.tool_calls = toolCalls;
		if (!message.content && !message.tool_calls) message.content = "";

		let finishReason = (candidate.finishReason || "stop").toLowerCase();
		if (finishReason === "stop" && toolCalls.length > 0)
			finishReason = "tool_calls";

		const result: any = {
			id: `chatcmpl-${response.responseId || Date.now()}`,
			object: "chat.completion",
			created: Math.floor(
				new Date(response.createTime || Date.now()).getTime() / 1000,
			),
			model: response.modelVersion || "gemini",
			choices: [{ index: 0, message, finish_reason: finishReason }],
		};

		if (usage) {
			result.usage = {
				prompt_tokens:
					(usage.promptTokenCount || 0) + (usage.thoughtsTokenCount || 0),
				completion_tokens: usage.candidatesTokenCount || 0,
				total_tokens: usage.totalTokenCount || 0,
			};
			if (usage.thoughtsTokenCount > 0) {
				result.usage.completion_tokens_details = {
					reasoning_tokens: usage.thoughtsTokenCount,
				};
			}
		}
		return result;
	}

	// Claude
	if (targetFormat === FORMATS.CLAUDE) {
		if (!responseBody.content) return responseBody;

		let textContent = "",
			thinkingContent = "";
		const toolCalls = [];

		for (const block of responseBody.content) {
			if (block.type === "text") {
				// Strip markdown code block markers (e.g. kimi wraps JSON in ```json...```)
				const raw = block.text ?? "";
				const text = raw
					.replace(/^\s*```\s*json\s*\n?/i, "")
					.replace(/\n?\s*```\s*$/i, "");
				textContent += text;
			} else if (block.type === "thinking")
				thinkingContent += block.thinking || "";
			else if (block.type === "tool_use") {
				toolCalls.push({
					id: block.id,
					type: "function",
					function: {
						name: block.name,
						arguments: JSON.stringify(block.input || {}),
					},
				});
			}
		}

		const message: any = { role: "assistant" };
		if (textContent) message.content = textContent;
		if (thinkingContent) message.reasoning_content = thinkingContent;
		if (toolCalls.length > 0) message.tool_calls = toolCalls;
		if (!message.content && !message.tool_calls) message.content = "";

		let finishReason = responseBody.stop_reason || "stop";
		if (finishReason === "end_turn") finishReason = "stop";
		if (finishReason === "tool_use") finishReason = "tool_calls";

		const result: any = {
			id: `chatcmpl-${responseBody.id || Date.now()}`,
			object: "chat.completion",
			created: Math.floor(Date.now() / 1000),
			model: responseBody.model || "claude",
			choices: [{ index: 0, message, finish_reason: finishReason }],
		};

		if (responseBody.usage) {
			result.usage = {
				prompt_tokens: responseBody.usage.input_tokens || 0,
				completion_tokens: responseBody.usage.output_tokens || 0,
				total_tokens:
					(responseBody.usage.input_tokens || 0) +
					(responseBody.usage.output_tokens || 0),
			};
		}
		return result;
	}

	// Ollama
	if (targetFormat === FORMATS.OLLAMA) {
		return ollamaBodyToOpenAI(responseBody);
	}

	return responseBody;
}

/**
 * Handle non-streaming response from provider.
 */
export async function handleNonStreamingResponse({
	providerResponse,
	provider,
	model,
	sourceFormat,
	targetFormat,
	body,
	stream,
	translatedBody,
	finalBody,
	requestStartTime,
	connectionId,
	apiKey,
	clientRawRequest,
	onRequestSuccess,
	reqLogger,
	toolNameMap,
	trackDone,
	appendLog,
}) {
	trackDone();
	const contentType = providerResponse.headers.get("content-type") || "";
	let responseBody;

	const handleBodyReadAbort = (err) => {
		if (err?.name !== "AbortError") return null;
		const status =
			err.code === "UPSTREAM_TIMEOUT" || err.code === "STREAM_IDLE_TIMEOUT"
				? HTTP_STATUS.GATEWAY_TIMEOUT
				: 499;
		if (status !== HTTP_STATUS.GATEWAY_TIMEOUT) {
			appendLog({ status: `FAILED ${status}` });
		}
		return createErrorResult(
			status,
			err.message ||
				(status === HTTP_STATUS.GATEWAY_TIMEOUT
					? "Upstream request timed out"
					: "Request aborted"),
			null,
		);
	};

	if (contentType.includes("text/event-stream")) {
		let sseText;
		try {
			sseText = await readBufferedSSETextWithProgressTimeout(providerResponse);
		} catch (err) {
			const abortResult = handleBodyReadAbort(err);
			if (abortResult) return abortResult;
			throw err;
		}
		const parsed =
			provider === "commandcode" || sourceFormat === FORMATS.COMMANDCODE
				? await parseCommandCodeSSEToOpenAIResponse(sseText, model)
				: parseSSEToOpenAIResponse(sseText, model);
		if (!parsed) {
			appendLog({ status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}` });
			return createErrorResult(
				HTTP_STATUS.BAD_GATEWAY,
				"Invalid SSE response for non-streaming request",
				null,
			);
		}
		responseBody = parsed;
	} else {
		let rawText;
		try {
			rawText = await readBufferedSSETextWithProgressTimeout(providerResponse);
		} catch (err) {
			const abortResult = handleBodyReadAbort(err);
			if (abortResult) return abortResult;
			throw err;
		}

		try {
			responseBody = JSON.parse(rawText);
		} catch (err) {
			const normalizedText = String(rawText || "").trim();
			const looksLikeSSE =
				normalizedText.startsWith("event:")
				|| normalizedText.startsWith("data:")
				|| normalizedText.includes("\nevent:")
				|| normalizedText.includes("\ndata:");
			if (looksLikeSSE) {
				const parsed =
					provider === "commandcode" || sourceFormat === FORMATS.COMMANDCODE
						? await parseCommandCodeSSEToOpenAIResponse(normalizedText, model)
						: provider === "codex"
							? parseResponsesSSEToOpenAIResponse(normalizedText, model)
							: parseSSEToOpenAIResponse(normalizedText, model);
				if (parsed) {
					responseBody = parsed;
				} else {
					appendLog({ status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}` });
					return createErrorResult(
						HTTP_STATUS.BAD_GATEWAY,
						"Invalid SSE response for non-streaming request",
						null,
					);
				}
			} else {
				appendLog({ status: `FAILED ${HTTP_STATUS.BAD_GATEWAY}` });
				console.error(
					`[ChatCore] Failed to parse JSON from ${provider}:`,
					err.message,
				);
				return createErrorResult(
					HTTP_STATUS.BAD_GATEWAY,
					`Invalid JSON response from ${provider}`,
					null,
				);
			}
		}
	}

	reqLogger.logProviderResponse(
		providerResponse.status,
		providerResponse.statusText,
		providerResponse.headers,
		responseBody,
	);
	if (provider === "commandcode") {
		console.error("[commandcode-debug] raw non-stream response", JSON.stringify({
			status: providerResponse.status,
			contentType,
			responseBody,
		}));
	}
	if (onRequestSuccess) await onRequestSuccess(providerResponse?.headers);

	const usage = extractUsageFromResponse(responseBody);
	appendLog({ tokens: usage, status: "200 OK" });
	saveUsageStats({
		provider,
		model,
		tokens: usage,
		connectionId,
		apiKey,
		endpoint: clientRawRequest?.endpoint,
	});

	// Decloak AFTER provider-response logging so logs preserve upstream fidelity
	// (debugging the cloak system itself needs to see what upstream actually sent).
	// Runs before translation so translator sees real tool names. Covers Claude→Claude
	// passthrough and Claude→OpenAI translation. See claudeCloaking.js for "exec_ide" symptom.
	const decloakedBody = decloakToolNames(responseBody, toolNameMap);

	const translatedResponse = needsTranslation(targetFormat, sourceFormat)
		? translateNonStreamingResponse(decloakedBody, targetFormat, sourceFormat)
		: decloakedBody;

	// Strict JSON mode cleanup for OpenAI-compatible callers:
	// if provider wraps object in markdown fence, normalize to plain JSON string.
	if (body?.response_format?.type === "json_object" && translatedResponse?.choices?.[0]?.message) {
		const msg = translatedResponse.choices[0].message;
		if (typeof msg.content === "string" && msg.content.trim()) {
			const raw = msg.content.trim();
			const unfenced = raw
				.replace(/^\s*```\s*json\s*\n?/i, "")
				.replace(/\n?\s*```\s*$/i, "")
				.trim();
			try {
				const parsed = JSON.parse(unfenced);
				if (parsed && typeof parsed === "object") {
					msg.content = JSON.stringify(parsed);
				}
			} catch {
				// Keep original content when not parseable as JSON.
			}
		}
	}
	if (provider === "commandcode") {
		console.error("[commandcode-debug] translated non-stream response", JSON.stringify({
			targetFormat,
			sourceFormat,
			translatedResponse,
		}));
	}

	if (sourceFormat !== FORMATS.CLAUDE) {
		// Fix finish_reason for tool_calls: some providers return non-standard values (e.g. "other")
		if (translatedResponse?.choices?.[0]) {
			const choice = translatedResponse.choices[0];
			const msg = choice.message;
			const hasToolCalls =
				Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0;
			if (hasToolCalls && choice.finish_reason !== "tool_calls") {
				choice.finish_reason = "tool_calls";
			}
		}

		// Ensure OpenAI-required fields
		if (!translatedResponse.object) translatedResponse.object = "chat.completion";
		if (!translatedResponse.created)
			translatedResponse.created = Math.floor(Date.now() / 1000);

		// Strip Azure-specific fields
		delete translatedResponse.prompt_filter_results;
		if (translatedResponse?.choices) {
			for (const choice of translatedResponse.choices)
				delete choice.content_filter_results;
		}

		// Strip reasoning_content — some clients (e.g. Firecrawl AI SDK) have JSON parsers that
		// break on this non-standard field, even though OpenAI allows it in extensions.
		if (translatedResponse?.choices) {
			for (const choice of translatedResponse.choices) {
				if (choice?.message) delete choice.message.reasoning_content;
			}
		}
	}

	if (translatedResponse?.usage) {
		translatedResponse.usage = filterUsageForFormat(
			translatedResponse.usage,
			sourceFormat,
		);
	}

	reqLogger.logConvertedResponse(translatedResponse);

	const totalLatency = Date.now() - requestStartTime;
	saveRequestDetail(
		buildRequestDetail(
			{
				provider,
				model,
				connectionId,
				latency: { ttft: totalLatency, total: totalLatency },
				tokens: usage || {},
				request: extractRequestConfig(body, stream),
				providerRequest: finalBody || translatedBody || null,
				providerResponse: responseBody || null,
				response: {
					content:
						translatedResponse?.choices?.[0]?.message?.content ||
						translatedResponse?.content ||
						translatedResponse?.content?.find?.((block) => block?.type === "text")?.text ||
						null,
					thinking:
						translatedResponse?.choices?.[0]?.message?.reasoning_content ||
						translatedResponse?.reasoning_content ||
						translatedResponse?.content?.find?.((block) => block?.type === "thinking")?.thinking ||
						null,
					finish_reason:
						translatedResponse?.choices?.[0]?.finish_reason ||
						translatedResponse?.stop_reason ||
						"unknown",
				},
				status: "success",
			},
			{ endpoint: clientRawRequest?.endpoint || null },
		),
	).catch((err) => {
		console.error("[RequestDetail] Failed to save:", err.message);
	});

	return {
		success: true,
		response: new Response(JSON.stringify(translatedResponse), {
			headers: {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
			},
		}),
	};
}
