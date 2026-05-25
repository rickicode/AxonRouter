import { saveRequestDetail } from "../../runtime/usagePersistence";
import { FORMATS } from "../../translator/formats";
import { needsTranslation } from "../../translator/index";
import {
	createPassthroughStreamWithLogger,
	createSSETransformStreamWithLogger,
} from "../../utils/stream";
import { pipeWithDisconnect } from "../../utils/streamHandler";
import {
	buildRequestDetail,
	extractRequestConfig,
} from "./requestDetail";

const SSE_HEADERS = {
	"Content-Type": "text/event-stream",
	"Cache-Control": "no-cache",
	Connection: "keep-alive",
	"Access-Control-Allow-Origin": "*",
};

/**
 * Determine which SSE transform stream to use based on provider/format.
 */
function buildTransformStream({
	provider,
	sourceFormat,
	targetFormat,
	userAgent,
	reqLogger,
	toolNameMap,
	model,
	connectionId,
	body,
	onStreamComplete,
	apiKey,
}) {
	const isDroidCLI =
		userAgent?.toLowerCase().includes("droid") ||
		userAgent?.toLowerCase().includes("codex-cli");
	const needsCodexTranslation =
		provider === "codex" &&
		targetFormat === FORMATS.OPENAI_RESPONSES &&
		!isDroidCLI;

	if (needsCodexTranslation) {
		// Codex returns Responses API SSE → translate to client format
		let codexTarget;
		if (sourceFormat === FORMATS.OPENAI_RESPONSES)
			codexTarget = FORMATS.OPENAI_RESPONSES;
		else if (sourceFormat === FORMATS.CLAUDE) codexTarget = FORMATS.CLAUDE;
		else if (
			sourceFormat === FORMATS.ANTIGRAVITY ||
			sourceFormat === FORMATS.GEMINI ||
			sourceFormat === FORMATS.GEMINI_CLI
		)
			codexTarget = FORMATS.ANTIGRAVITY;
		else codexTarget = FORMATS.OPENAI;
		return createSSETransformStreamWithLogger(
			FORMATS.OPENAI_RESPONSES,
			codexTarget,
			provider,
			reqLogger,
			toolNameMap,
			model,
			connectionId,
			body,
			onStreamComplete,
			apiKey,
		);
	}

	if (needsTranslation(targetFormat, sourceFormat)) {
		return createSSETransformStreamWithLogger(
			targetFormat,
			sourceFormat,
			provider,
			reqLogger,
			toolNameMap,
			model,
			connectionId,
			body,
			onStreamComplete,
			apiKey,
		);
	}

	// sourceFormat + toolNameMap must flow through to passthrough so the
	// pipeline can decloak Claude tool names on the way back to the client.
	return createPassthroughStreamWithLogger(
		provider,
		reqLogger,
		model,
		connectionId,
		body,
		onStreamComplete,
		apiKey,
		sourceFormat,
		toolNameMap,
	);
}

/**
 * Handle streaming response — pipe provider SSE through transform stream to client.
 */
export function handleStreamingResponse({
	providerResponse,
	provider,
	model,
	sourceFormat,
	targetFormat,
	userAgent,
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
	streamController,
	onStreamComplete,
	streamDetailId,
}) {
	if (onRequestSuccess) onRequestSuccess();

	const transformStream = buildTransformStream({
		provider,
		sourceFormat,
		targetFormat,
		userAgent,
		reqLogger,
		toolNameMap,
		model,
		connectionId,
		body,
		onStreamComplete,
		apiKey,
	});
	const transformedBody = pipeWithDisconnect(
		providerResponse,
		transformStream,
		streamController,
		{ model },
	);

	saveRequestDetail(
		buildRequestDetail(
			{
				provider,
				model,
				connectionId,
				latency: { total: Date.now() - requestStartTime },
				tokens: {},
				request: extractRequestConfig(body, stream),
				providerRequest: finalBody || translatedBody || null,
				providerResponse: null,
				response: {
					content: null,
					thinking: null,
					type: "streaming",
					status: "in_progress",
				},
				status: "success",
			},
			{ id: streamDetailId },
		),
	).catch((err) => {
		console.error(
			"[RequestDetail] Failed to save streaming request:",
			err.message,
		);
	});

	return {
		success: true,
		response: new Response(transformedBody, { headers: SSE_HEADERS }),
		streamDetailId,
	};
}

/**
 * Build onStreamComplete callback for streaming usage tracking.
 */
export function buildOnStreamComplete({
	provider,
	model,
	connectionId,
	apiKey,
	requestStartTime,
	body,
	stream,
	finalBody,
	translatedBody,
	clientRawRequest,
	streamDetailId,
}) {
	const onStreamComplete = (contentObj, usage, ttftAt) => {
		const latency = {
			ttft: ttftAt ? ttftAt - requestStartTime : Date.now() - requestStartTime,
			total: Date.now() - requestStartTime,
		};
		const safeContent = contentObj?.content || "[Empty streaming response]";
		const safeThinking = contentObj?.thinking || null;

		saveRequestDetail(
			buildRequestDetail(
				{
					provider,
					model,
					connectionId,
					latency,
					tokens: usage || {},
					request: extractRequestConfig(body, stream),
					providerRequest: finalBody || translatedBody || null,
					providerResponse: null,
					response: {
						content: safeContent,
						thinking: safeThinking,
						type: "streaming",
						status: "completed",
					},
					status: "success",
				},
				{ id: streamDetailId },
			),
		).catch((err) => {
			console.error(
				"[RequestDetail] Failed to update streaming content:",
				err.message,
			);
		});
	};

	return { onStreamComplete, streamDetailId };
}
