import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { handleEmbeddingsCore } from "open-sse/handlers/embeddingsCore.tsx";
import {
	checkFallbackError,
	formatRetryAfter,
	getEarliestRateLimitedUntil,
	getUnavailableUntil,
	isAccountUnavailable,
} from "open-sse/services/accountFallback.js";
import { getModelInfoCore } from "open-sse/services/model.js";
import { errorResponse } from "open-sse/utils/error.js";
import { selectCredential } from "../services/routing.js";
import {
	getRuntimeConfig,
	updateRuntimeProviderCredentials,
	updateRuntimeProviderState,
} from "../services/storage.js";
import { recordUsageEvent } from "../services/usage.js";
import { extractBearerToken, parseApiKey } from "../utils/apiKey.js";
import * as log from "../utils/logger.js";

const SHARED_RUNTIME_ID = "shared";
const DEFAULT_MODEL = "text-embedding-3-small";

type RuntimeEnv = Parameters<typeof getRuntimeConfig>[1];
type EmbeddingsBody = { model?: string; input?: unknown } & Record<
	string,
	unknown
>;
type ProviderCredential = Record<string, unknown> & {
	id: string;
	provider?: string;
	isActive?: boolean;
	apiKey?: string | null;
	accessToken?: string | null;
	refreshToken?: string | null;
	expiresAt?: string | null;
	projectId?: string | null;
	providerSpecificData?: Record<string, unknown>;
	routingStatus?: string | null;
	authState?: string | null;
	healthStatus?: string | null;
	quotaState?: string | null;
	reasonCode?: string | null;
	reasonDetail?: string | null;
	nextRetryAt?: string | null;
	resetAt?: string | null;
	lastCheckedAt?: string | null;
	updatedAt?: string | null;
	backoffLevel?: number | null;
	priority?: number | null;
};

type AllRateLimitedResult = {
	allRateLimited: true;
	retryAfter: string;
	retryAfterHuman: string;
	lastError: string | null;
	lastErrorCode: string | null;
};

type ProviderLookupResult = ProviderCredential | AllRateLimitedResult | null;

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function isProviderRequestValidationError(
	status: number | null | undefined,
	errorText: unknown,
	provider: string | null = null,
) {
	if (Number(status) !== 400) return false;
	const normalized = String(errorText || "").toLowerCase();
	if (!normalized) return false;

	return (
		normalized.includes("content_length_exceeds_threshold") ||
		normalized.includes("input is too long") ||
		normalized.includes("improperly formed request") ||
		normalized.includes("invalid model") ||
		normalized.includes("model not available") ||
		normalized.includes("requested model is not available") ||
		normalized.includes("model_not_supported") ||
		normalized.includes("unsupported model") ||
		normalized.includes("not available for integrator") ||
		normalized.includes("vscode-chat") ||
		(provider === "kiro" && normalized.includes("content length"))
	);
}

/**
 * Handle embeddings requests against the shared runtime namespace.
 * Legacy API key formats still parse, but routing no longer depends on
 * runtime-scoped key metadata or legacy URL path segments.
 */
export async function handleEmbeddings(
	request: Request,
	env: RuntimeEnv,
	_ctx: unknown,
) {
	const requestStartedAt = Date.now();
	if (request.method === "OPTIONS") {
		return new Response(null, {
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "*",
			},
		});
	}

	const apiKey = extractBearerToken(request);
	if (!apiKey)
		return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");

	const parsed = await parseApiKey(apiKey);
	if (!parsed)
		return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key format");

	const runtimeId = SHARED_RUNTIME_ID;

	// Validate API key
	if (!(await validateApiKey(request, runtimeId, env))) {
		return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
	}

	// Parse body
	let body: EmbeddingsBody;
	try {
		body = await request.json();
	} catch {
		return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
	}

	const modelStr = body.model;
	if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");

	if (!body.input)
		return errorResponse(
			HTTP_STATUS.BAD_REQUEST,
			"Missing required field: input",
		);

	log.info("EMBEDDINGS", `${runtimeId} | ${modelStr}`);

	// Resolve model info
	const data = await getRuntimeConfig(runtimeId, env);
	if (!data)
		return errorResponse(
			HTTP_STATUS.SERVICE_UNAVAILABLE,
			"Runtime config unavailable",
		);
	const modelInfo = await getModelInfoCore(modelStr, data?.modelAliases || {});
	if (!modelInfo.provider)
		return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");

	const { provider, model } = modelInfo;
	log.info("EMBEDDINGS_MODEL", `${provider.toUpperCase()} | ${model}`);

	// Provider credential + fallback loop (mirrors handleChat)
	const excludedConnectionIds = new Set<string>();
	let lastError = null;
	let lastStatus = null;
	let retryCount = 0;
	const initialRuntime = await getRuntimeConfig(runtimeId, env);
	if (!initialRuntime)
		return errorResponse(
			HTTP_STATUS.SERVICE_UNAVAILABLE,
			"Runtime config unavailable",
		);
	const providerConnectionCount = Object.values(
		initialRuntime.providers || {},
	).filter((conn: any) => conn?.provider === provider && conn?.isActive).length;
	const MAX_RETRIES = Math.max(10, Math.min(providerConnectionCount, 1000));

	while (retryCount < MAX_RETRIES) {
		retryCount++;
		const data = await getRuntimeConfig(runtimeId, env);
		if (!data)
			return errorResponse(
				HTTP_STATUS.SERVICE_UNAVAILABLE,
				"Runtime config unavailable",
			);

		try {
			const apiKey = extractBearerToken(request);
			const connection: any = await selectCredential(
				data,
				provider,
				apiKey || "default",
				env,
			);
			if (connection?.id) {
				excludedConnectionIds.delete(connection.id);
			}
		} catch (error) {
			const errorMessage = getErrorMessage(error);
			log.warn("EMBEDDINGS_ROUTING", errorMessage);
			if (
				errorMessage === `No available credentials for provider: ${provider}`
			) {
				const availability = await getProviderCredentials(
					runtimeId,
					provider,
					env,
					excludedConnectionIds,
				);
				if (availability?.allRateLimited) {
					const retryAfter = String(availability.retryAfter);
					const retryAfterSec = Math.ceil(
						(new Date(retryAfter).getTime() - Date.now()) / 1000,
					);
					const msg = `[${provider}/${model}] ${availability.lastError || "Unavailable"} (${availability.retryAfterHuman})`;
					const status =
						Number(availability.lastErrorCode) ||
						HTTP_STATUS.SERVICE_UNAVAILABLE;
					return new Response(JSON.stringify({ error: { message: msg } }), {
						status,
						headers: {
							"Content-Type": "application/json",
							"Retry-After": String(Math.max(retryAfterSec, 1)),
						},
					});
				}
				return errorResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, errorMessage);
			}
			return errorResponse(HTTP_STATUS.BAD_REQUEST, errorMessage);
		}

		const credentials: any = await getProviderCredentials(
			runtimeId,
			provider,
			env,
			excludedConnectionIds,
		);

		if (!credentials || (credentials as any).allRateLimited) {
			if (credentials?.allRateLimited) {
				const retryAfterSec = Math.ceil(
					(new Date(credentials.retryAfter).getTime() - Date.now()) / 1000,
				);
				const errorMsg = lastError || credentials.lastError || "Unavailable";
				const msg = `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`;
				const status =
					lastStatus ||
					Number(credentials.lastErrorCode) ||
					HTTP_STATUS.SERVICE_UNAVAILABLE;
				log.warn("EMBEDDINGS", `${provider.toUpperCase()} | ${msg}`);
				return new Response(JSON.stringify({ error: { message: msg } }), {
					status,
					headers: {
						"Content-Type": "application/json",
						"Retry-After": String(Math.max(retryAfterSec, 1)),
					},
				});
			}
			if (excludedConnectionIds.size === 0) {
				return errorResponse(
					HTTP_STATUS.BAD_REQUEST,
					`No credentials for provider: ${provider}`,
				);
			}
			log.warn("EMBEDDINGS", `${provider.toUpperCase()} | no more accounts`);
			return new Response(
				JSON.stringify({ error: lastError || "All accounts unavailable" }),
				{
					status: lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		log.debug("EMBEDDINGS", `account=${credentials.id}`, { provider });

		const result: any = await handleEmbeddingsCore({
			body,
			modelInfo: { provider, model },
			credentials,
			log,
			onCredentialsRefreshed: async (newCreds: Record<string, unknown>) => {
				await updateCredentials(runtimeId, credentials.id, newCreds, env);
			},
			onRequestSuccess: async () => {
				await clearAccountError(runtimeId, credentials.id, credentials, env);
			},
		});

		if (result.success) {
			recordUsageEvent({
				type: "embeddings",
				endpoint: new URL(request.url).pathname,
				provider,
				model,
				connectionId: credentials.id,
				status: result.response?.status || 200,
				tokensInput: 0,
				tokensOutput: 0,
				latencyMs: Date.now() - requestStartedAt,
			});
			return result.response;
		}

		if (
			isProviderRequestValidationError(result?.status, result?.error, provider)
		) {
			log.warn(
				"EMBEDDINGS",
				`Request validation error for ${provider}/${model}; not marking account unavailable`,
			);
			return errorResponse(
				result.status || HTTP_STATUS.BAD_REQUEST,
				result.error || "Bad request",
			);
		}

		const { shouldFallback } = checkFallbackError(
			result?.status,
			result?.error,
		);

		if (shouldFallback) {
			recordUsageEvent({
				type: "embeddings",
				endpoint: new URL(request.url).pathname,
				provider,
				model,
				connectionId: credentials.id,
				status: result?.status,
				tokensInput: 0,
				tokensOutput: 0,
				error: result?.error,
				latencyMs: Date.now() - requestStartedAt,
			});
			log.warn(
				"EMBEDDINGS_FALLBACK",
				`${provider.toUpperCase()} | ${credentials.id} | ${result?.status}`,
			);
			await markAccountUnavailable(
				runtimeId,
				credentials.id,
				result?.status,
				result?.error,
				env,
			);
			excludedConnectionIds.add(credentials.id);
			lastError = result?.error;
			lastStatus = result?.status;
			continue;
		}

		return result.response;
	}

	log.error("EMBEDDINGS", "Max retries exceeded, all accounts failed", {
		provider,
		model,
		attempts: retryCount,
		maxRetries: MAX_RETRIES,
		excludedCount: excludedConnectionIds.size,
		providerConnectionCount,
	});
	return errorResponse(
		HTTP_STATUS.SERVICE_UNAVAILABLE,
		"Max retries exceeded, all accounts failed",
	);
}

// ─── Helpers (same as chat.js) ───────────────────────────────────────────────

async function validateApiKey(
	request: Request,
	runtimeId: string,
	env: RuntimeEnv,
) {
	const authHeader = request.headers.get("Authorization");
	if (!authHeader?.startsWith("Bearer ")) return false;

	const apiKey = authHeader.slice(7);
	const data = await getRuntimeConfig(runtimeId, env);
	if (!data) return false;
	return (
		data?.apiKeys?.some((k: any) => k.isActive !== false && k.key === apiKey) ||
		false
	);
}

async function getProviderCredentials(
	runtimeId: string,
	provider: string,
	env: RuntimeEnv,
	excludedConnectionIds: Set<string> | string = new Set(),
): Promise<ProviderLookupResult> {
	const data = await getRuntimeConfig(runtimeId, env);
	if (!data?.providers) return null;

	const providers = data.providers as Record<string, ProviderCredential>;
	const excludedIds =
		excludedConnectionIds instanceof Set
			? excludedConnectionIds
			: new Set(excludedConnectionIds ? [excludedConnectionIds] : []);

	const providerConnections = Object.entries(providers)
		.filter(([connId, conn]: [string, any]) => {
			if (conn?.provider !== provider || !conn?.isActive) return false;
			if (excludedIds.has(connId)) return false;
			if (isAccountUnavailable(conn)) return false;
			return true;
		})
		.sort(
			(a: [string, any], b: [string, any]) =>
				(a[1]?.priority || 999) - (b[1]?.priority || 999),
		);

	if (providerConnections.length === 0) {
		const allConnections = Object.entries(providers)
			.filter(
				([, conn]: [string, any]) =>
					conn?.provider === provider && conn?.isActive,
			)
			.map(([, conn]: [string, any]) => conn as any);
		const earliest = getEarliestRateLimitedUntil(allConnections);
		if (earliest) {
			const unavailableConns = allConnections.filter((c: any) =>
				isAccountUnavailable(c),
			);
			const earliestConn = unavailableConns.sort((a: any, b: any) => {
				const aUntil = a.nextRetryAt || a.resetAt || 0;
				const bUntil = b.nextRetryAt || b.resetAt || 0;
				return new Date(aUntil).getTime() - new Date(bUntil).getTime();
			})[0];
			return {
				allRateLimited: true,
				retryAfter: earliest,
				retryAfterHuman: formatRetryAfter(earliest),
				lastError: earliestConn?.reasonDetail || null,
				lastErrorCode: earliestConn?.reasonCode || null,
			};
		}
		return null;
	}

	const [connectionId, connection] = providerConnections[0] as [string, any];
	return {
		id: connectionId,
		apiKey: connection.apiKey,
		accessToken: connection.accessToken,
		refreshToken: connection.refreshToken,
		expiresAt: connection.expiresAt,
		projectId: connection.projectId,
		providerSpecificData: connection.providerSpecificData,
		routingStatus: connection.routingStatus,
		authState: connection.authState,
		healthStatus: connection.healthStatus,
		quotaState: connection.quotaState,
		reasonCode: connection.reasonCode,
		reasonDetail: connection.reasonDetail,
		nextRetryAt: connection.nextRetryAt,
		resetAt: connection.resetAt,
		lastCheckedAt: connection.lastCheckedAt,
		updatedAt: connection.updatedAt,
		backoffLevel: connection.backoffLevel,
	};
}

function getNormalizedErrorText(errorText: unknown) {
	return typeof errorText === "string"
		? errorText.toLowerCase()
		: JSON.stringify(errorText || "").toLowerCase();
}

function isUnrecoverableAuthError(errorText: unknown) {
	const lowerError = getNormalizedErrorText(errorText);
	return (
		lowerError.includes("unrecoverable_refresh_error") ||
		lowerError.includes("refresh_token_reused") ||
		lowerError.includes("invalid_grant") ||
		lowerError.includes("invalid_token") ||
		lowerError.includes("invalid bearer token") ||
		lowerError.includes("bearer token included in the request is invalid") ||
		lowerError.includes("re-auth required") ||
		lowerError.includes("reauth required")
	);
}

function isQuotaExhaustionError(status: number, errorText: unknown) {
	const lowerError = getNormalizedErrorText(errorText);
	return (
		status === 402 &&
		(lowerError.includes("monthly_request_count") ||
			lowerError.includes("you have reached the limit") ||
			lowerError.includes("quota exceeded"))
	);
}

function shouldPreserveAccountStatus(status: number, errorText: unknown) {
	const lowerError = getNormalizedErrorText(errorText);

	if (
		lowerError.includes("refresh failed") ||
		lowerError.includes("network error refreshing")
	) {
		return true;
	}

	if (status === 401 || status === 403) {
		return !isUnrecoverableAuthError(errorText);
	}

	if (isQuotaExhaustionError(status, errorText)) {
		return false;
	}

	return (
		lowerError.includes("fetch failed") ||
		lowerError.includes("econnreset") ||
		lowerError.includes("etimedout") ||
		lowerError.includes("socket hang up") ||
		lowerError.includes("network error") ||
		lowerError.includes("connection reset") ||
		lowerError.includes("upstream request timed out") ||
		lowerError.includes("improperly formed request") ||
		(status === 400 &&
			(lowerError.includes("invalid model") ||
				lowerError.includes("model not available") ||
				lowerError.includes("unsupported model") ||
				lowerError.includes("requested model is not available") ||
				lowerError.includes("not available for integrator") ||
				lowerError.includes("vscode-chat") ||
				lowerError.includes("bad request")))
	);
}

async function markAccountUnavailable(
	runtimeId: string,
	connectionId: string,
	status: number,
	errorText: unknown,
	env: RuntimeEnv,
) {
	if (shouldPreserveAccountStatus(status, errorText)) {
		log.info(
			"EMBEDDINGS_ACCOUNT_TRANSIENT",
			`${connectionId} | preserved | status=${status} | detail=${typeof errorText === "string" ? errorText.slice(0, 120) : "unknown error"}`,
		);
		return;
	}

	const updated = await updateRuntimeProviderState(
		runtimeId,
		connectionId,
		(conn) => {
			const backoffLevel = (conn.backoffLevel as number) || 0;
			const { cooldownMs, newBackoffLevel } = checkFallbackError(
				status,
				errorText,
				backoffLevel,
			);
			const effectiveCooldownMs =
				conn.provider === "kiro" && status === 429
					? Math.max(cooldownMs ?? 0, 10_000)
					: (cooldownMs ?? 0);
			const rateLimitedUntil = getUnavailableUntil(effectiveCooldownMs);
			const reason =
				typeof errorText === "string"
					? errorText.slice(0, 100)
					: "Provider error";
			const authUnrecoverable =
				(status === 401 || status === 403) &&
				isUnrecoverableAuthError(errorText);
			const quotaExhausted = isQuotaExhaustionError(status, errorText);
			const preserveKiroRateLimitStatus =
				conn.provider === "kiro" && status === 429;

			const nowIso = new Date().toISOString();
			const isTransientRateLimit = status === 429;
			conn.backoffLevel = newBackoffLevel ?? backoffLevel;
			if (!preserveKiroRateLimitStatus && !isTransientRateLimit) {
				conn.routingStatus = quotaExhausted ? "cooldown" : "blocked";
				conn.healthStatus = quotaExhausted
					? "degraded"
					: status >= 500
						? "unhealthy"
						: "degraded";
				conn.quotaState = quotaExhausted ? "exhausted" : "ok";
				conn.authState = quotaExhausted
					? "ok"
					: status === 401 || status === 403
						? authUnrecoverable
							? "invalid"
							: "expired"
						: "ok";
				conn.reasonCode = quotaExhausted
					? "quota_exhausted"
					: status === 401 || status === 403
						? authUnrecoverable
							? "auth_invalid"
							: "auth_refresh_failed"
						: "usage_request_failed";
				conn.reasonDetail = reason;
			}
			conn.nextRetryAt = rateLimitedUntil;
			conn.resetAt = rateLimitedUntil;
			conn.lastCheckedAt = nowIso;
		},
		env,
	);
	const conn = updated?.providers?.[connectionId];
	if (!conn) return;

	const transitionClass =
		status === 429
			? "EMBEDDINGS_ACCOUNT_RATE_LIMITED"
			: conn.reasonCode === "quota_exhausted"
				? "EMBEDDINGS_ACCOUNT_QUOTA_EXHAUSTED"
				: conn.reasonCode === "auth_invalid"
					? "EMBEDDINGS_ACCOUNT_AUTH_INVALID"
					: "EMBEDDINGS_ACCOUNT_PROVIDER_FAILED";

	log.warn(
		transitionClass,
		`${connectionId} | routing=${conn.routingStatus} | auth=${conn.authState} | quota=${conn.quotaState} | reason=${conn.reasonCode} | retryAt=${conn.nextRetryAt || "-"} | backoff=${conn.backoffLevel || 0}`,
	);
}

async function clearAccountError(
	runtimeId: string,
	connectionId: string,
	currentCredentials: ProviderCredential,
	env: RuntimeEnv,
) {
	const hasError =
		(currentCredentials.routingStatus &&
			currentCredentials.routingStatus !== "eligible") ||
		(currentCredentials.quotaState && currentCredentials.quotaState !== "ok") ||
		(currentCredentials.authState && currentCredentials.authState !== "ok") ||
		(currentCredentials.healthStatus &&
			currentCredentials.healthStatus !== "healthy") ||
		(currentCredentials.reasonCode &&
			currentCredentials.reasonCode !== "unknown") ||
		currentCredentials.reasonDetail ||
		currentCredentials.nextRetryAt ||
		currentCredentials.resetAt;

	if (!hasError) return;

	const updated = await updateRuntimeProviderState(
		runtimeId,
		connectionId,
		(conn) => {
			conn.backoffLevel = 0;
			conn.routingStatus = "eligible";
			conn.authState = "ok";
			conn.healthStatus = "healthy";
			conn.quotaState = "ok";
			conn.reasonCode = "unknown";
			conn.reasonDetail = null;
			conn.nextRetryAt = null;
			conn.resetAt = null;
			conn.lastCheckedAt = new Date().toISOString();
		},
		env,
	);
	if (!updated?.providers?.[connectionId]) return;

	log.info("EMBEDDINGS_ACCOUNT", `${connectionId} | error cleared`);
}

async function updateCredentials(
	runtimeId: string,
	connectionId: string,
	newCredentials: Record<string, unknown>,
	env: RuntimeEnv,
) {
	const updated = await updateRuntimeProviderCredentials(
		runtimeId,
		connectionId,
		newCredentials,
		env,
	);
	if (!updated?.providers?.[connectionId]) return;

	log.debug(
		"EMBEDDINGS_TOKEN",
		`credentials updated in runtime cache | ${connectionId}`,
	);
}
