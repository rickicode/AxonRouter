import {
	getModelStrip,
	getModelTargetFormat,
	PROVIDER_ID_TO_ALIAS,
} from "../config/providerModels";
import { HTTP_STATUS } from "../config/runtimeConfig";
import { getExecutor } from "../executors/index";
import {
	appendRequestLog,
	saveRequestDetail,
	trackPendingRequest,
} from "../runtime/usagePersistence";
import { detectFormat, getTargetFormat } from "../services/provider";
import { refreshWithRetry } from "../services/tokenRefresh";
import { FORMATS } from "../translator/formats";
import { translateRequest } from "../translator/index";
import {
	applyCavemanToOpenAIIntermediate,
	applyCavemanToPassthroughBody,
} from "../promptModifiers/index";
import { handleBypassRequest } from "../utils/bypassHandler";
import {
	detectClientTool,
	isNativePassthrough,
} from "../utils/clientDetector";
import {
	createErrorResult,
	formatProviderError,
	parseUpstreamError,
} from "../utils/error";
import { createRequestLogger } from "../utils/requestLogger";
import { COLORS } from "../utils/stream";
import { createStreamController } from "../utils/streamHandler";
import { handleNonStreamingResponse } from "./chatCore/nonStreamingHandler";
import {
	buildRequestDetail,
	extractRequestConfig,
	stripInternalMetadata,
} from "./chatCore/requestDetail";
import { handleForcedSSEToJson } from "./chatCore/sseToJsonHandler";
import {
	buildOnStreamComplete,
	handleStreamingResponse,
} from "./chatCore/streamingHandler";

/**
 * Core chat handler - shared between SSE and Worker
 * @param {object} options.body - Request body
 * @param {object} options.modelInfo - { provider, model }
 * @param {object} options.credentials - Provider credentials
 * @param {string} options.sourceFormatOverride - Override detected source format (e.g. "openai-responses")
 */
export async function handleChatCore({
	body,
	modelInfo,
	credentials,
	log,
	onCredentialsRefreshed,
	onRequestSuccess,
	onDisconnect,
	clientRawRequest,
	connectionId,
	userAgent,
	apiKey,
	ccFilterNaming,
	sourceFormatOverride,
	providerThinking,
	cavemanSettings,
}) {
	const { provider, model } = modelInfo;
	const requestStartTime = Date.now();

	const sourceFormat = sourceFormatOverride || detectFormat(body);

	// Check for bypass patterns (warmup, skip, cc naming)
	const bypassResponse = await handleBypassRequest(
		body,
		model,
		userAgent,
		ccFilterNaming,
	);
	if (bypassResponse) return bypassResponse;

	const alias = PROVIDER_ID_TO_ALIAS[provider] || provider;
	const modelTargetFormat = getModelTargetFormat(alias, model);
	const targetFormat = modelTargetFormat || getTargetFormat(provider);
	const stripList = getModelStrip(alias, model);

	// Inject provider-level thinking config override (only if client hasn't set)
	// on/off → extended type (body.thinking), none/low/medium/high → effort type (body.reasoning_effort)
	if (providerThinking?.mode && providerThinking.mode !== "auto") {
		const mode = providerThinking.mode;
		if (mode === "on" && !body.thinking) {
			console.log("Injecting provider-level thinking config override: on");
			body = { ...body, thinking: { type: "enabled", budget_tokens: 10000 } };
		} else if (mode === "off" && !body.thinking) {
			body = { ...body, thinking: { type: "disabled" } };
		} else if (!body.reasoning_effort) {
			body = { ...body, reasoning_effort: mode };
		}
	}

	const clientRequestedStreaming =
		body.stream === true ||
		sourceFormat === FORMATS.ANTIGRAVITY ||
		sourceFormat === FORMATS.GEMINI ||
		sourceFormat === FORMATS.GEMINI_CLI;
	const requestEndpoint = clientRawRequest?.endpoint || "";
	const isChatCompletionsEndpoint =
		requestEndpoint.includes("/v1/chat/completions");
	const clientRequestedCompact = isChatCompletionsEndpoint
		? body.use_compact === true
		: body.use_compact !== false;
	const shouldUseCodexCompact =
		provider === "codex"
		&& !clientRequestedStreaming
		&& (!isChatCompletionsEndpoint || clientRequestedCompact);
	const providerRequiresStreaming =
		provider === "openai"
		|| provider === "commandcode";
	let stream = providerRequiresStreaming ? true : body.stream !== false;

	// Check client Accept header preference for non-streaming requests
	// This fixes AI SDK compatibility where clients send Accept: application/json
	// EXCEPT for providers that require streaming — their SSE is translated to JSON internally
	const acceptHeader = clientRawRequest?.headers?.accept || "";
	const clientPrefersJson = acceptHeader.includes("application/json");
	const clientPrefersSSE = acceptHeader.includes("text/event-stream");
	if (clientPrefersJson && !clientPrefersSSE && body.stream !== true && !providerRequiresStreaming) {
		stream = false;
	}
	if (provider === "codex" && !clientRequestedStreaming && !shouldUseCodexCompact) {
		stream = false;
	}
	if (shouldUseCodexCompact) {
		stream = false;
	}

	const reqLogger = await createRequestLogger(
		sourceFormat,
		targetFormat,
		model,
	);
	if (clientRawRequest)
		reqLogger.logClientRawRequest(
			clientRawRequest.endpoint,
			clientRawRequest.body,
			clientRawRequest.headers,
		);
	reqLogger.logRawRequest(body);
	log?.debug?.(
		"FORMAT",
		`${sourceFormat} → ${targetFormat} | stream=${stream}`,
	);

	// Native passthrough: CLI tool and provider are the same ecosystem
	// Skip all translation/normalization — only model and Bearer are swapped
	const clientTool = detectClientTool(clientRawRequest?.headers || {}, body);
	const passthrough = isNativePassthrough(clientTool, provider);

	let translatedBody;
	let toolNameMap;
	if (passthrough) {
		log?.debug?.(
			"PASSTHROUGH",
			`${clientTool} → ${provider} | native lossless`,
		);
		translatedBody = applyCavemanToPassthroughBody(
			{ ...body, model },
			cavemanSettings,
			targetFormat,
		);
	} else {
		translatedBody = await translateRequest(
			sourceFormat,
			targetFormat,
			model,
			body,
			stream,
			credentials,
			provider,
			reqLogger,
			stripList,
			connectionId,
			(intermediateBody, context) => applyCavemanToOpenAIIntermediate(intermediateBody, cavemanSettings, context?.sourceFormat, context?.targetFormat),
		);
		if (!translatedBody) {
			trackPendingRequest(model, provider, connectionId, false, true);
			return createErrorResult(
				HTTP_STATUS.BAD_REQUEST,
				`Failed to translate request for ${sourceFormat} → ${targetFormat}`,
				null,
			);
		}
		toolNameMap = translatedBody._toolNameMap;
		delete translatedBody._toolNameMap;
		translatedBody.model = model;
		delete translatedBody.use_compact;
		if (shouldUseCodexCompact) {
			translatedBody._compact = true;
		}
	}

	translatedBody = stripInternalMetadata(translatedBody);

	const executor = getExecutor(provider);
	trackPendingRequest(model, provider, connectionId, true);
	appendRequestLog({ model, provider, connectionId, status: "PENDING" }).catch(
		() => {},
	);

	const msgCount =
		translatedBody.messages?.length ||
		translatedBody.input?.length ||
		translatedBody.contents?.length ||
		translatedBody.request?.contents?.length ||
		0;
	log?.debug?.(
		"REQUEST",
		`${provider.toUpperCase()} | ${model} | ${msgCount} msgs`,
	);

	const streamController = createStreamController({
		onDisconnect: (reason) => {
			trackPendingRequest(model, provider, connectionId, false);
			if (onDisconnect) onDisconnect(reason);
		},
		onError: () => trackPendingRequest(model, provider, connectionId, false),
		log,
		provider,
		model,
	});

	const proxyOptions = {
		connectionProxyEnabled:
			credentials?.providerSpecificData?.connectionProxyEnabled === true,
		connectionProxyUrl:
			credentials?.providerSpecificData?.connectionProxyUrl || "",
		connectionNoProxy:
			credentials?.providerSpecificData?.connectionNoProxy || "",
		relayUrl:
			credentials?.providerSpecificData?.relayUrl ||
			credentials?.providerSpecificData?.vercelRelayUrl || "",
		strictProxy:
			credentials?.providerSpecificData?.strictProxy === true,
	};

	if (proxyOptions.relayUrl) {
		const connectionName =
			credentials?.connectionName || credentials?.connectionId || "unknown";
		const poolId =
			credentials?.providerSpecificData?.connectionProxyPoolId || "none";
		log?.info?.(
			"PROXY",
			`${provider.toUpperCase()} | ${model} | conn=${connectionName} | pool=${poolId} | relay=${proxyOptions.relayUrl}`,
		);
	} else if (
		proxyOptions.connectionProxyEnabled &&
		proxyOptions.connectionProxyUrl
	) {
		let maskedProxyUrl = proxyOptions.connectionProxyUrl;
		try {
			const parsed = new URL(proxyOptions.connectionProxyUrl);
			const host = parsed.hostname || "";
			const port = parsed.port ? `:${parsed.port}` : "";
			const protocol = parsed.protocol || "http:";
			maskedProxyUrl = `${protocol}//${host}${port}`;
		} catch {
			// Keep raw if URL parsing fails
		}

		const poolId =
			credentials?.providerSpecificData?.connectionProxyPoolId || "none";
		const connectionName =
			credentials?.connectionName || credentials?.connectionId || "unknown";
		log?.info?.(
			"PROXY",
			`${provider.toUpperCase()} | ${model} | conn=${connectionName} | pool=${poolId} | url=${maskedProxyUrl}`,
		);
	}

	if (proxyOptions.connectionProxyEnabled && proxyOptions.connectionNoProxy) {
		const connectionName =
			credentials?.connectionName || credentials?.connectionId || "unknown";
		log?.debug?.(
			"PROXY",
			`${provider.toUpperCase()} | ${model} | conn=${connectionName} | no_proxy=${proxyOptions.connectionNoProxy}`,
		);
	}

	// Execute request
	let providerResponse, providerUrl, providerHeaders, finalBody;
	try {
		const result = await executor.execute({
			model,
			body: translatedBody,
			stream,
			credentials,
			signal: streamController.signal,
			log,
			proxyOptions,
		});
		providerResponse = result.response;
		providerUrl = result.url;
		providerHeaders = result.headers;
		finalBody = stripInternalMetadata(result.transformedBody);
		reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);
	} catch (error) {
		const isTimeoutAbort =
			error.code === "UPSTREAM_TIMEOUT" || error.code === "STREAM_IDLE_TIMEOUT";
		const isNetworkTimeout = !isTimeoutAbort && (
			error.code === "ETIMEDOUT" || error.code === "ECONNABORTED" ||
			error.cause?.code === "ETIMEDOUT" || error.cause?.code === "ECONNABORTED" ||
			(typeof error.message === "string" && error.message.includes("timed out"))
		);
		const isAnyTimeout = isTimeoutAbort || isNetworkTimeout;
		const abortStatus = isTimeoutAbort
			? HTTP_STATUS.GATEWAY_TIMEOUT
			: 499;
		trackPendingRequest(model, provider, connectionId, false, true);
		if (!isAnyTimeout) {
			appendRequestLog({
				model,
				provider,
				connectionId,
				status: `FAILED ${error.name === "AbortError" ? abortStatus : HTTP_STATUS.BAD_GATEWAY}`,
			}).catch(() => {});
		}
		saveRequestDetail(
			buildRequestDetail({
				provider,
				model,
				connectionId,
				latency: { total: Date.now() - requestStartTime },
				tokens: {},
				request: extractRequestConfig(body, stream),
				providerRequest: translatedBody || null,
				providerResponse: null,
				response: {
					error: error.message || String(error),
					status: error.name === "AbortError" ? abortStatus : 502,
					thinking: null,
					errorCode: error.code || null,
					timeoutMs: error.timeoutMs ?? null,
					timeoutPhase: error.phase || null,
					transient: isAnyTimeout,
				},
				status: "error",
			}),
		).catch(() => {});

		if (error.name === "AbortError") {
			streamController.handleError(error);
			if (isTimeoutAbort) {
				return createErrorResult(
					HTTP_STATUS.GATEWAY_TIMEOUT,
					error.message || "Upstream request timed out",
					null,
					{ errorCode: error.code, timeoutMs: error.timeoutMs ?? null },
				);
			}
			return createErrorResult(499, "Request aborted", null, {
				errorCode: error.code || null,
			});
		}
		const errMsg = formatProviderError(
			error,
			provider,
			model,
			HTTP_STATUS.BAD_GATEWAY,
		);
		console.log(`${COLORS.red}[ERROR] ${errMsg}${COLORS.reset}`);
		return createErrorResult(HTTP_STATUS.BAD_GATEWAY, errMsg, null, {
			errorCode: error.code || null,
		});
	}

	// Handle 401/403 - try token refresh (skip for noAuth providers)
	if (
		!executor.noAuth &&
		(providerResponse.status === HTTP_STATUS.UNAUTHORIZED ||
			providerResponse.status === HTTP_STATUS.FORBIDDEN)
	) {
		try {
			const newCredentials = await refreshWithRetry(
				() => executor.refreshCredentials(credentials, log),
				3,
				log,
			);
			if (newCredentials?.accessToken || newCredentials?.copilotToken) {
				log?.info?.("TOKEN", `${provider.toUpperCase()} | refreshed`);
				Object.assign(credentials, newCredentials);
				if (onCredentialsRefreshed) {
					try {
						await onCredentialsRefreshed(newCredentials);
					} catch (e) {
						log?.warn?.("TOKEN", `onCredentialsRefreshed failed: ${e.message}`);
					}
				}
				try {
					const retryResult = await executor.execute({
						model,
						body: translatedBody,
						stream,
						credentials,
						signal: streamController.signal,
						log,
						proxyOptions,
					});
					if (retryResult.response.ok) {
						providerResponse = retryResult.response;
						providerUrl = retryResult.url;
					}
				} catch {
					log?.warn?.(
						"TOKEN",
						`${provider.toUpperCase()} | retry after refresh failed`,
					);
				}
			} else {
				log?.warn?.("TOKEN", `${provider.toUpperCase()} | refresh failed`);
			}
		} catch (e) {
			log?.warn?.(
				"TOKEN",
				`${provider.toUpperCase()} | refresh threw: ${e.message}`,
			);
		}
	}

	// Provider returned error
	if (!providerResponse.ok) {
		trackPendingRequest(model, provider, connectionId, false, true);
		const parsedError = await parseUpstreamError(
			providerResponse,
			executor,
		);
		const { statusCode, message, resetsAtMs } = parsedError;
		const validationUrl = 'validationUrl' in parsedError ? parsedError.validationUrl : undefined;
		appendRequestLog({
			model,
			provider,
			connectionId,
			status: `FAILED ${statusCode}`,
		}).catch(() => {});
		saveRequestDetail(
			buildRequestDetail({
				provider,
				model,
				connectionId,
				latency: { total: Date.now() - requestStartTime },
				tokens: {},
				request: extractRequestConfig(body, stream),
				providerRequest: finalBody || translatedBody || null,
				response: { error: message, status: statusCode, thinking: null },
				status: "error",
			}),
		).catch(() => {});

		const errMsg = formatProviderError(
			new Error(message),
			provider,
			model,
			statusCode,
		);
		console.log(`${COLORS.red}[ERROR] ${errMsg}${COLORS.reset}`);
		reqLogger.logError(new Error(message), finalBody || translatedBody);
		return createErrorResult(statusCode, errMsg, resetsAtMs, {
			...(validationUrl ? { validationUrl } : {}),
		});
	}

	// One-shot recovery for strict JSON mode on Gemini CLI:
	// if upstream returns empty assistant content, retry once with reinforced instruction.
	if (!stream && provider === "gemini-cli" && body?.response_format?.type === "json_object") {
		try {
			const probe = await providerResponse.clone().text();
			let parsed: any = null;
			try {
				parsed = JSON.parse(probe);
			} catch {}

			const openaiContent = parsed?.choices?.[0]?.message?.content;
			const geminiParts = parsed?.candidates?.[0]?.content?.parts;
			const geminiText = Array.isArray(geminiParts)
				? geminiParts
						.map((part: any) => (typeof part?.text === "string" ? part.text : ""))
						.join("")
				: "";
			const content = typeof openaiContent === "string" ? openaiContent : geminiText;
			const isEmpty = typeof content !== "string" || content.trim() === "";

			if (isEmpty) {
				const retryBody = {
					...translatedBody,
					messages: [
						...(Array.isArray(translatedBody?.messages) ? translatedBody.messages : []),
						{ role: "user", content: "Return ONLY a valid JSON object now." },
					],
				};
				const retryResult = await executor.execute({
					model,
					body: retryBody,
					stream,
					credentials,
					signal: streamController.signal,
					log,
					proxyOptions,
				});
				if (retryResult.response?.ok) {
					providerResponse = retryResult.response;
					providerUrl = retryResult.url;
					providerHeaders = retryResult.headers;
					finalBody = stripInternalMetadata(retryResult.transformedBody);
					reqLogger.logTargetRequest(providerUrl, providerHeaders, finalBody);
					log?.info?.("RETRY", "gemini-cli json_object empty response recovered with one-shot retry");
				}
			}
		} catch {
			// best-effort retry guard only
		}
	}

	const sharedCtx = {
		provider,
		model,
		body,
		stream,
		translatedBody,
		finalBody,
		requestStartTime,
		connectionId,
		apiKey,
		clientRawRequest,
		onRequestSuccess,
	};
	const appendLog = (extra) =>
		appendRequestLog({ model, provider, connectionId, ...extra }).catch(
			() => {},
		);
	const trackDone = () =>
		trackPendingRequest(model, provider, connectionId, false);

	// Provider forced streaming but client wants JSON
	const shouldForceSSEToJson =
		(!clientRequestedStreaming && providerRequiresStreaming)
		|| (provider === "codex" && !clientRequestedStreaming && !shouldUseCodexCompact);
	if (shouldForceSSEToJson) {
		const result = await handleForcedSSEToJson({
			...sharedCtx,
			providerResponse,
			sourceFormat,
			trackDone,
			appendLog,
		});
		if (result) {
			streamController.handleComplete();
			return result;
		}
	}

	// True non-streaming response
	if (!stream) {
		const result = await handleNonStreamingResponse({
			...sharedCtx,
			providerResponse,
			sourceFormat,
			targetFormat,
			reqLogger,
			toolNameMap,
			trackDone,
			appendLog,
		});
		streamController.handleComplete();
		return result;
	}

	// Streaming response
	const streamDetailId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
	const { onStreamComplete } = buildOnStreamComplete({ ...sharedCtx, streamDetailId });
	return handleStreamingResponse({
		...sharedCtx,
		providerResponse,
		sourceFormat,
		targetFormat,
		userAgent,
		reqLogger,
		toolNameMap,
		streamController,
		onStreamComplete,
		streamDetailId,
	});
}

export function isTokenExpiringSoon(expiresAt, bufferMs = 5 * 60 * 1000) {
	if (!expiresAt) return false;
	return new Date(expiresAt).getTime() - Date.now() < bufferMs;
}
