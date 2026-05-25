import {
	appendRequestLog,
	saveRequestDetail,
	saveRequestUsage,
} from "../../runtime/usagePersistence";
import { COLORS } from "../../utils/stream";

const OPTIONAL_PARAMS = [
	"temperature",
	"top_p",
	"top_k",
	"max_tokens",
	"max_completion_tokens",
	"thinking",
	"reasoning",
	"enable_thinking",
	"presence_penalty",
	"frequency_penalty",
	"seed",
	"stop",
	"tools",
	"tool_choice",
	"response_format",
	"prediction",
	"store",
	"metadata",
	"n",
	"logprobs",
	"top_logprobs",
	"logit_bias",
	"user",
	"parallel_tool_calls",
];

function shouldStripInternalKey(key) {
	return typeof key === "string" && key.startsWith("__axonrouter");
}

export function stripInternalMetadata(value) {
	if (Array.isArray(value)) {
		return value.map(stripInternalMetadata);
	}
	if (!value || typeof value !== "object") {
		return value;
	}

	const next = {};
	for (const [key, entry] of Object.entries(value)) {
		if (shouldStripInternalKey(key)) continue;
		next[key] = stripInternalMetadata(entry);
	}
	return next;
}

export function extractRequestConfig(body, stream) {
	const config = { messages: body.messages || [], model: body.model, stream };
	for (const param of OPTIONAL_PARAMS) {
		if (body[param] !== undefined) config[param] = body[param];
	}
	return stripInternalMetadata(config);
}

export function extractUsageFromResponse(responseBody) {
	if (!responseBody || typeof responseBody !== "object") return null;

	// Claude format
	if (responseBody.usage?.input_tokens !== undefined) {
		return {
			prompt_tokens: responseBody.usage.input_tokens || 0,
			completion_tokens: responseBody.usage.output_tokens || 0,
			cache_read_input_tokens: responseBody.usage.cache_read_input_tokens,
			cache_creation_input_tokens:
				responseBody.usage.cache_creation_input_tokens,
		};
	}

	// OpenAI format
	if (responseBody.usage?.prompt_tokens !== undefined) {
		return {
			prompt_tokens: responseBody.usage.prompt_tokens || 0,
			completion_tokens: responseBody.usage.completion_tokens || 0,
			cached_tokens: responseBody.usage.prompt_tokens_details?.cached_tokens,
			reasoning_tokens:
				responseBody.usage.completion_tokens_details?.reasoning_tokens,
		};
	}

	// Gemini format
	if (responseBody.usageMetadata) {
		return {
			prompt_tokens: responseBody.usageMetadata.promptTokenCount || 0,
			completion_tokens: responseBody.usageMetadata.candidatesTokenCount || 0,
			reasoning_tokens: responseBody.usageMetadata.thoughtsTokenCount,
		};
	}

	return null;
}

export function buildRequestDetail(base, overrides = {}) {
	return {
		provider: base.provider || "unknown",
		model: base.model || "unknown",
		connectionId: base.connectionId || undefined,
		timestamp: new Date().toISOString(),
		latency: base.latency || {},
		tokens: base.tokens || {},
		request: stripInternalMetadata(base.request),
		providerRequest: stripInternalMetadata(base.providerRequest) || null,
		providerResponse: stripInternalMetadata(base.providerResponse) || null,
		response: stripInternalMetadata(base.response) || null,
		status: base.status || "success",
		...overrides,
	};
}

export function saveUsageStats({
	provider,
	model,
	tokens,
	connectionId,
	apiKey,
	endpoint,
	label = "USAGE",
}) {
	if (!tokens || typeof tokens !== "object") return;

	const inTokens = tokens.input_tokens ?? tokens.prompt_tokens ?? 0;
	const outTokens = tokens.output_tokens ?? tokens.completion_tokens ?? 0;
	const hasExtendedUsage = [
		tokens.total_tokens,
		tokens.cached_tokens,
		tokens.cache_read_input_tokens,
		tokens.cache_creation_input_tokens,
		tokens.reasoning_tokens,
	].some((value) => value !== undefined && value !== null && Number(value) !== 0);

	if (inTokens === 0 && outTokens === 0 && !hasExtendedUsage) return;

	const time = new Date().toLocaleTimeString("en-US", {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const accountSuffix = connectionId
		? ` | account=${connectionId.slice(0, 8)}...`
		: "";
	console.log(
		`${COLORS.green}[${time}] 📊 [${label}] ${provider.toUpperCase()} | in=${inTokens} | out=${outTokens}${accountSuffix}${COLORS.reset}`,
	);

	// Normalize to OpenAI token shape for storage while preserving richer usage fields.
	const normalized = {
		prompt_tokens: tokens.prompt_tokens ?? tokens.input_tokens ?? 0,
		completion_tokens: tokens.completion_tokens ?? tokens.output_tokens ?? 0,
		...(tokens.total_tokens !== undefined ? { total_tokens: tokens.total_tokens } : {}),
		...(tokens.cached_tokens !== undefined ? { cached_tokens: tokens.cached_tokens } : {}),
		...(tokens.cache_read_input_tokens !== undefined ? { cache_read_input_tokens: tokens.cache_read_input_tokens } : {}),
		...(tokens.cache_creation_input_tokens !== undefined ? { cache_creation_input_tokens: tokens.cache_creation_input_tokens } : {}),
		...(tokens.reasoning_tokens !== undefined ? { reasoning_tokens: tokens.reasoning_tokens } : {}),
		...(tokens.prompt_tokens_details !== undefined ? { prompt_tokens_details: tokens.prompt_tokens_details } : {}),
		...(tokens.completion_tokens_details !== undefined ? { completion_tokens_details: tokens.completion_tokens_details } : {}),
	};

	saveRequestUsage({
		provider: provider || "unknown",
		model: model || "unknown",
		tokens: normalized,
		timestamp: new Date().toISOString(),
		connectionId: connectionId || undefined,
		apiKey: apiKey || undefined,
		endpoint: endpoint || null,
	}).catch(() => {});
}
