import { instrumentUsageWorker } from "@/lib/observability/otel";
import "../../open-sse/utils/proxyFetch";

import {
	getCurrentProviderConnectionById,
	getCurrentQuotaExhaustedThresholdPercent,
} from "./connectionStateAccess";
import { updateCurrentProviderConnection } from "./connectionStateWriteAccess";
import {
	testSingleConnection,
	validateConnectionCredentials,
} from "../app/api/providers/[id]/test/testUtils";
import { getUsageForProvider } from "../../open-sse/services/usage";
import { getExecutor } from "../../open-sse/executors/index";
import {
	applyCanonicalUsageRefresh,
	applyLiveQuotaUpdate,
	getCodexLiveQuotaSignal,
	getConnectionAuthBlockedPatch,
	getLiveRequestRecoveryPatch,
	isConfirmedAuthBlockedError,
	isAuthExpiredMessage,
	isTransientUpstreamTimeoutError,
	syncUsageStatus,
} from "./usageStatus";
import { mergeCodexUsageProviderSpecificData } from "./oauth/codexAccount";

import { getProviderStrategy } from "./usageRefresh/providerStrategy";

const TRANSIENT_USAGE_RETRY_DELAY_MS = 750;
const TRANSIENT_USAGE_MAX_ATTEMPTS = 3;
const TRANSIENT_CONNECTIVITY_ERROR_PATTERNS = [
	"unable to connect",
	"is the computer able to access the url",
	"fetch failed",
	"network error",
	"network request failed",
	"econnrefused",
	"enotfound",
	"eai_again",
	"etimedout",
	"socket hang up",
	"connection refused",
	"dns lookup failed",
];
const AUTH_RELATED_ERROR_PATTERNS = [
	"token invalid",
	"invalid token",
	"token expired",
	"expired",
	"refresh failed",
	"re-authorize",
	"reauthorize",
	"unauthorized",
	"unauthenticated",
	"access denied",
	"invalid grant",
	"revoked",
	"oauth",
	"access token",
	"invalid api key",
	"invalid session cookie",
	"no access token",
];

function createHttpError(message: string, status = 500, extra: any = {}) {
	return Object.assign(new Error(message), { status, ...extra });
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createUsageFetchTimeoutError(timeoutMs: number) {
	const error: any = new Error(`usage fetch timed out after ${timeoutMs}ms`);
	error.name = "AbortError";
	error.status = 504;
	error.code = "UPSTREAM_TIMEOUT";
	error.timeoutMs = timeoutMs;
	return error;
}

async function withUsageFetchTimeout(task: any, timeoutMs: number) {
	return await new Promise((resolve, reject) => {
		const timeoutId = setTimeout(
			() => reject(createUsageFetchTimeoutError(timeoutMs)),
			timeoutMs,
		);

		Promise.resolve()
			.then(task)
			.then(resolve, reject)
			.finally(() => clearTimeout(timeoutId));
	});
}

function isTransientConnectivityError(error: any) {
	const message =
		typeof error === "string"
			? error
			: error?.message || error?.error || error?.cause?.message || "";
	const code = String(error?.code || error?.cause?.code || "").toUpperCase();
	const normalizedMessage = String(message).toLowerCase();

	if (
		AUTH_RELATED_ERROR_PATTERNS.some((pattern) =>
			normalizedMessage.includes(pattern),
		)
	) {
		return false;
	}

	return (
		code === "ECONNREFUSED" ||
		code === "ENOTFOUND" ||
		code === "EAI_AGAIN" ||
		code === "ETIMEDOUT" ||
		code === "ECONNRESET" ||
		TRANSIENT_CONNECTIVITY_ERROR_PATTERNS.some((pattern) =>
			normalizedMessage.includes(pattern),
		)
	);
}

function shouldSkipTransientUsageError(error: any) {
	return (
		isTransientConnectivityError(error) ||
		isTransientUpstreamTimeoutError(error, {
			statusCode: error?.status,
			errorCode: error?.code || error?.errorCode,
		})
	);
}

function isQuotaUnavailableError(error: any) {
	return error?.code === "USAGE_QUOTA_UNAVAILABLE";
}

function shouldRetryQuotaUnavailable(connection: any, error: any) {
	const strategy = getProviderStrategy(connection?.provider);
	if (!strategy.requiresQuota) return false;
	return isQuotaUnavailableError(error);
}

function hasUsableUsageQuota(usage: any = {}) {
	const quotas = usage?.quotas;
	return Boolean(
		quotas && typeof quotas === "object" && Object.keys(quotas).length > 0,
	);
}

function createMissingUsageQuotaError(connection: any = {}, usage: any = {}) {
	const message =
		usage?.message ||
		`Usage refresh did not return quota data for ${connection?.provider || "provider"}`;
	const snapshot = {
		provider: connection?.provider || null,
		checkedAt: new Date().toISOString(),
		message,
		quotas: {},
		usageUnavailable: true,
		reasonCode: "usage_quota_unavailable",
		...(usage && typeof usage === "object" ? usage : {}),
	};
	const error: any = createHttpError(message, 502, {
		reasonCode: "usage_quota_unavailable",
		reasonDetail: message,
		usage: snapshot,
	});
	error.code = "USAGE_QUOTA_UNAVAILABLE";
	return error;
}

function assertUsageHasQuota(connection: any = {}, usage: any = {}) {
	const strategy = getProviderStrategy(connection?.provider);
	if (!strategy.requiresQuota) return;
	if (hasUsableUsageQuota(usage)) return;
	throw createMissingUsageQuotaError(connection, usage);
}

function getUsageRetryLogLabel(connection: any = {}) {
	return (
		connection?.email ||
		connection?.displayName ||
		connection?.connectionName ||
		connection?.name ||
		connection?.id ||
		"unknown"
	);
}

function getOperationalUsageSnapshot(
	connection: any,
	_message: string,
	extra: any = {},
) {
	if (connection?.usageSnapshot) {
		return {};
	}

	return {
		usageSnapshot: JSON.stringify({
			provider: connection?.provider || null,
			...extra,
		}),
	};
}

async function persistPlanTypeFromUsage(connection: any, usage: any) {
	if (!connection?.id || !usage?.plan) return;
	const provider = connection.provider;
	if (provider !== "github" && provider !== "antigravity" && provider !== "codex") return;

	if (provider === "codex") {
		const updatedSpecificData = mergeCodexUsageProviderSpecificData(
			connection.providerSpecificData,
			usage,
		);
		const currentSpecificData = connection?.providerSpecificData;
		if (!updatedSpecificData) return;
		if (JSON.stringify(currentSpecificData || {}) === JSON.stringify(updatedSpecificData)) return;
		await updateCurrentProviderConnection(connection.id, {
			providerSpecificData: updatedSpecificData,
		});
		connection.providerSpecificData = updatedSpecificData;
		return;
	}

	const currentPlanType = connection?.providerSpecificData?.planType;
	const newPlanType = String(usage.plan).trim();
	if (!newPlanType || currentPlanType === newPlanType) return;

	const updatedSpecificData = {
		...(connection.providerSpecificData || {}),
		planType: newPlanType,
	};
	await updateCurrentProviderConnection(connection.id, {
		providerSpecificData: updatedSpecificData,
	});
	connection.providerSpecificData = updatedSpecificData;
}

async function tryCredentialRefreshFromConnectionTest(connection: any) {
	if (!connection?.id) return connection;
	const strategy = getProviderStrategy(connection?.provider);
	if (!strategy.credentialRefreshOnTransientFailure) return connection;

	try {
		const validation: any = await validateConnectionCredentials(connection);
		if (validation?.refreshed !== true || !validation?.newTokens) {
			return connection;
		}

		const newTokens: any = validation.newTokens;
		const tokenPatch: any = {
			updatedAt: new Date().toISOString(),
			accessToken: newTokens.accessToken,
		};

		if (newTokens.refreshToken) {
			tokenPatch.refreshToken = newTokens.refreshToken;
		}
		if (newTokens.expiresIn) {
			tokenPatch.expiresAt = new Date(
				Date.now() + newTokens.expiresIn * 1000,
			).toISOString();
		}

		await updateCurrentProviderConnection(connection.id, tokenPatch);
		return {
			...connection,
			...tokenPatch,
		};
	} catch {
		return connection;
	}
}

async function refreshAndUpdateCredentials(
	connection: any,
	force = false,
	options: any = {},
) {
	const { persistStatus = true } = options;
	const executor = getExecutor(connection.provider);
	const credentials = {
		accessToken: connection.accessToken,
		refreshToken: connection.refreshToken,
		expiresAt: connection.expiresAt || connection.tokenExpiresAt,
		providerSpecificData: connection.providerSpecificData,
		copilotToken: connection.providerSpecificData?.copilotToken,
		copilotTokenExpiresAt:
			connection.providerSpecificData?.copilotTokenExpiresAt,
	};

	const needsRefresh = force || executor.needsRefresh(credentials);
	if (!needsRefresh) {
		return { connection, refreshed: false };
	}

	const refreshResult = await executor.refreshCredentials(credentials, console);
	if (!refreshResult) {
		if (connection.accessToken) {
			return { connection, refreshed: false };
		}
		throw createHttpError(
			"Failed to refresh credentials. Please re-authorize the connection.",
			401,
		);
	}

	const now = new Date().toISOString();
	const credentialPatch = {
		...(refreshResult.accessToken
			? { accessToken: refreshResult.accessToken }
			: {}),
		...(refreshResult.refreshToken
			? { refreshToken: refreshResult.refreshToken }
			: {}),
		...(refreshResult.expiresIn
			? {
					expiresAt: new Date(
						Date.now() + refreshResult.expiresIn * 1000,
					).toISOString(),
				}
			: {}),
		...(refreshResult.expiresAt ? { expiresAt: refreshResult.expiresAt } : {}),
		...(refreshResult.providerSpecificData ||
		refreshResult.copilotToken ||
		refreshResult.copilotTokenExpiresAt
			? {
					providerSpecificData: {
						...(connection.providerSpecificData || {}),
						...(refreshResult.providerSpecificData || {}),
						...(refreshResult.copilotToken
							? { copilotToken: refreshResult.copilotToken }
							: {}),
						...(refreshResult.copilotTokenExpiresAt
							? { copilotTokenExpiresAt: refreshResult.copilotTokenExpiresAt }
							: {}),
					},
				}
			: {}),
	};
	const updateData =
		Object.keys(credentialPatch).length > 0
			? { updatedAt: now, ...credentialPatch }
			: {};

	if (Object.keys(updateData).length > 0) {
		await updateCurrentProviderConnection(connection.id, updateData);
	}
	const updatedConnection = { ...connection, ...updateData };

	if (
		persistStatus &&
		(force || refreshResult.accessToken || refreshResult.refreshToken)
	) {
		await syncUsageStatus(
			updatedConnection,
			getLiveRequestRecoveryPatch({
				lastCheckedAt: now,
				usageSnapshot: updatedConnection?.usageSnapshot,
			}),
		);
	}

	return { connection: updatedConnection, refreshed: true };
}

// Provider-specific retry detection is now in usageRefresh/providerStrategy.ts

async function runConnectionTestOrThrow(connectionId: any, options: any = {}) {
	const { persistStatus = false } = options;
	const testResult = await testSingleConnection(connectionId, {
		persistStatus,
	});

	if (testResult?.error === "Connection not found") {
		throw createHttpError("Connection not found", 404, {
			testResult,
			phase: "test",
		});
	}

	if (!testResult?.valid) {
		const message = testResult?.error || "Connection test failed";
		throw createHttpError(message, 401, { testResult, phase: "test" });
	}

	return testResult;
}

async function loadUsageConnection(connectionId: any) {
	const connection = await getCurrentProviderConnectionById(connectionId);
	if (!connection) {
		throw createHttpError("Connection not found", 404);
	}

	if (connection.authType !== "oauth") {
		return {
			connection,
			usage: { message: "Usage not available for API key connections" },
			skipped: true,
		};
	}

	return { connection };
}

async function resolveGlobalExhaustedThreshold(value: any) {
	if (Number.isFinite(value)) {
		return value;
	}

	return getCurrentQuotaExhaustedThresholdPercent();
}

async function fetchUsageWithTransientRetry(connection: any) {
	let lastError = null;
	const strategy = getProviderStrategy(connection?.provider);
	const timeoutMs = strategy.timeoutMs;

	for (let attempt = 1; attempt <= TRANSIENT_USAGE_MAX_ATTEMPTS; attempt += 1) {
		try {
			const usage = await withUsageFetchTimeout(
				() => getUsageForProvider(connection),
				timeoutMs,
			);
			assertUsageHasQuota(connection, usage);
			return usage;
		} catch (usageError: any) {
			lastError = usageError;
			const isRetryable =
				shouldSkipTransientUsageError(usageError) ||
				shouldRetryQuotaUnavailable(connection, usageError);
			const logLabel = `${connection?.provider || "provider"}:${getUsageRetryLogLabel(connection)}`;

			if (strategy.requiresQuota && isQuotaUnavailableError(usageError)) {
				console.warn(
					`[UsageRefresh] ${connection?.provider} quota details missing on attempt ${attempt}/${TRANSIENT_USAGE_MAX_ATTEMPTS} for ${logLabel}: ${usageError.message}`,
				);
			}

			if (!isRetryable || attempt >= TRANSIENT_USAGE_MAX_ATTEMPTS) {
				if (isRetryable) {
					console.warn(
						`[UsageRefresh] transient usage fetch failed after ${attempt}/${TRANSIENT_USAGE_MAX_ATTEMPTS} attempts for ${logLabel}: ${usageError.message}`,
					);
				}
				throw usageError;
			}

			console.warn(
				`[UsageRefresh] transient usage fetch failed on attempt ${attempt}/${TRANSIENT_USAGE_MAX_ATTEMPTS} for ${logLabel}; retrying in ${TRANSIENT_USAGE_RETRY_DELAY_MS * attempt}ms: ${usageError.message}`,
			);
			await sleep(TRANSIENT_USAGE_RETRY_DELAY_MS * attempt);
		}
	}

	throw lastError || new Error("Usage fetch failed");
}

export async function refreshConnectionUsage(
	connectionId: any,
	options: any = {},
) {
	return instrumentUsageWorker(
		"connection_usage_refresh",
		{
			"usage_worker.connection_id": String(connectionId || ""),
			"usage_worker.run_connection_test": options?.runConnectionTest === true,
			"usage_worker.skip_transient_connectivity_errors":
				options?.skipTransientConnectivityErrors === true,
		},
		async () => {
			const {
				runConnectionTest = false,
				globalExhaustedThreshold,
				skipTransientConnectivityErrors = false,
			} = options;

			let connection;
			let testResult = null;
			let authExpiredUsageError = null;
			let credentialsRefreshed = false;
			const shouldPersistRefreshStatus = !skipTransientConnectivityErrors;

			try {
				const loaded = await loadUsageConnection(connectionId);
				connection = loaded.connection;
				if (loaded.skipped) {
					return { connection, usage: loaded.usage, testResult, skipped: true };
				}

				if (runConnectionTest) {
					testResult = await runConnectionTestOrThrow(connectionId);
					connection = await getCurrentProviderConnectionById(connectionId);
					if (!connection) {
						throw createHttpError("Connection not found", 404, { testResult });
					}
				}

				try {
					const result = await refreshAndUpdateCredentials(
						connection,
						!runConnectionTest,
						{
							persistStatus: shouldPersistRefreshStatus,
						},
					);
					connection = result.connection;
					credentialsRefreshed = result.refreshed === true;
				} catch (refreshError: any) {
					const lastCheckedAt = new Date().toISOString();
					await syncUsageStatus(
						connection,
						getConnectionAuthBlockedPatch(refreshError.message, {
							lastCheckedAt,
							usageSnapshot: JSON.stringify({
								provider: connection?.provider || null,
								checkedAt: lastCheckedAt,
								message: refreshError.message,
							}),
						}) || {
							routingStatus: "blocked",
							healthStatus: "degraded",
							quotaState: "ok",
							authState: "ok",
							reasonCode: "refresh_failed",
							reasonDetail: refreshError.message,
							lastCheckedAt,
							...getOperationalUsageSnapshot(connection, refreshError.message, {
								checkedAt: lastCheckedAt,
							}),
						},
					);
					throw createHttpError(
						`Credential refresh failed: ${refreshError.message}`,
						401,
						{
							cause: refreshError,
							statusSynced: true,
						},
					);
				}

				let usage;
				const strategy = getProviderStrategy(connection?.provider);
				try {
					usage = await fetchUsageWithTransientRetry(connection);
				} catch (usageError: any) {
					if (
						strategy.credentialRefreshOnTransientFailure &&
						!runConnectionTest &&
						usageError?.code === "USAGE_QUOTA_UNAVAILABLE"
					) {
						console.warn(
							`[UsageRefresh] ${connection?.provider} usage missing quota after background fetch; rerunning connection test before retry for ${getUsageRetryLogLabel(connection)}`,
						);
						testResult = await runConnectionTestOrThrow(connectionId, {
							persistStatus: true,
						});
						connection = await getCurrentProviderConnectionById(connectionId);
						if (!connection) {
							throw createHttpError("Connection not found", 404, {
								testResult,
							});
						}
						try {
							usage = await fetchUsageWithTransientRetry(connection);
						} catch (retryAfterTestError: any) {
							retryAfterTestError.testResult = testResult;
							throw retryAfterTestError;
						}
					} else if (
						strategy.credentialRefreshOnTransientFailure &&
						shouldSkipTransientUsageError(usageError)
					) {
						console.warn(
							`[UsageRefresh] ${connection?.provider} transient usage failure; trying credential refresh from connection test for ${getUsageRetryLogLabel(connection)}: ${usageError.message}`,
						);
						connection =
							await tryCredentialRefreshFromConnectionTest(connection);
						try {
							usage = await fetchUsageWithTransientRetry(connection);
						} catch (retryAfterRefreshError: any) {
							retryAfterRefreshError.testResult = testResult;
							throw retryAfterRefreshError;
						}
					} else if (
						!connection.refreshToken ||
						!isAuthExpiredUsageError(usageError)
					) {
						usageError.testResult = testResult;
						throw usageError;
					} else {
						authExpiredUsageError = usageError;
						usage = { message: usageError.message || "Usage auth expired" };
					}
				}

				// Strategy: detect temporary auth response → re-test + retry
				if (strategy.isTemporaryAuthResponse?.(usage)) {
					console.warn(
						`[UsageRefresh] ${connection?.provider} usage API returned temporary auth-shaped response; rerunning connection test for ${getUsageRetryLogLabel(connection)}`,
					);
					testResult = await runConnectionTestOrThrow(connectionId, {
						persistStatus: true,
					});
					connection = await getCurrentProviderConnectionById(connectionId);
					if (!connection) {
						throw createHttpError("Connection not found", 404, { testResult });
					}
					usage = await fetchUsageWithTransientRetry(connection);
				}

				// Strategy: detect recoverable auth expiry → force credential refresh + retry
				if (strategy.isRecoverableAuthExpiry?.(connection, usage)) {
					if (!credentialsRefreshed) {
						const retryResult = await refreshAndUpdateCredentials(
							connection,
							true,
							{
								persistStatus: shouldPersistRefreshStatus,
							},
						);
						connection = retryResult.connection;
						credentialsRefreshed = retryResult.refreshed === true;
					}
					usage = await fetchUsageWithTransientRetry(connection);
				}

				if (isAuthExpiredMessage(usage) && connection.refreshToken) {
					let retryResult;
					try {
						retryResult = await refreshAndUpdateCredentials(connection, true, {
							persistStatus: shouldPersistRefreshStatus,
						});
						connection = retryResult.connection;
					} catch (retryError: any) {
						const lastCheckedAt = new Date().toISOString();
						const reasonDetail = authExpiredUsageError?.message
							? `${retryError.message}; original usage error: ${authExpiredUsageError.message}`
							: retryError.message;
						await syncUsageStatus(
							connection,
							getConnectionAuthBlockedPatch(reasonDetail, {
								lastCheckedAt,
								usageSnapshot: JSON.stringify({
									provider: connection?.provider || null,
									checkedAt: lastCheckedAt,
									message: reasonDetail,
								}),
							}) || {
								routingStatus: "blocked",
								healthStatus: "degraded",
								quotaState: "ok",
								authState: "ok",
								reasonCode: "auth_expired",
								reasonDetail,
								lastCheckedAt,
								...getOperationalUsageSnapshot(connection, reasonDetail, {
									checkedAt: lastCheckedAt,
								}),
							},
						);
						throw createHttpError(
							`Credential refresh failed: ${retryError.message}`,
							401,
							{
								cause: retryError,
								originalUsageError: authExpiredUsageError,
								reasonDetail,
								statusSynced: true,
								testResult,
							},
						);
					}

					try {
						usage = await withUsageFetchTimeout(
							() => getUsageForProvider(connection),
							strategy.timeoutMs,
						);
						assertUsageHasQuota(connection, usage);
					} catch (usageRetryError: any) {
						usageRetryError.reasonDetail = authExpiredUsageError?.message
							? `${usageRetryError.message}; original usage error: ${authExpiredUsageError.message}`
							: usageRetryError.message;
						usageRetryError.testResult = testResult;
						throw usageRetryError;
					}
				}

				assertUsageHasQuota(connection, usage);

				const resolvedGlobalExhaustedThreshold =
					await resolveGlobalExhaustedThreshold(globalExhaustedThreshold);
				await persistPlanTypeFromUsage(connection, usage);
				if (strategy.onSuccess) {
					await strategy.onSuccess(connection, usage);
				}
				await applyCanonicalUsageRefresh(connection, usage, {
					...(Number.isFinite(resolvedGlobalExhaustedThreshold)
						? { globalExhaustedThreshold: resolvedGlobalExhaustedThreshold }
						: {}),
				});

				return { connection, usage, testResult, skipped: false };
			} catch (error: any) {
				const status = Number.isInteger(error?.status) ? error.status : 500;
				if (connection?.id && !error.connection) {
					error.connection = connection;
				}
				if (testResult && !error.testResult) {
					error.testResult = testResult;
				}
				if (!connection?.id || error?.statusSynced) throw error;

				if (
					skipTransientConnectivityErrors &&
					shouldSkipTransientUsageError(error)
				) {
					// Persist minimal snapshot so UI knows the worker tried
					if (connection?.id && !connection?.usageSnapshot) {
						const checkedAt = new Date().toISOString();
						await syncUsageStatus(connection, {
							routingStatus: connection?.routingStatus || "eligible",
							healthStatus: "degraded",
							quotaState: connection?.quotaState || "ok",
							authState: connection?.authState || "ok",
							reasonCode: "transient_connectivity_error",
							reasonDetail: "Usage check temporarily unavailable",
							lastCheckedAt: checkedAt,
							usageSnapshot: JSON.stringify({
								provider: connection?.provider || null,
								checkedAt,
								quotas: {},
							}),
						});
					}
					return {
						connection,
						usage: null,
						testResult,
						skipped: true,
						skipReason: "transient_connectivity_error",
					};
				}

				const lastCheckedAt = new Date().toISOString();
				if (error?.code === "USAGE_QUOTA_UNAVAILABLE") {
					const errorStrategy = getProviderStrategy(connection?.provider);
					if (errorStrategy.skipOnQuotaUnavailable) {
						console.warn(
							`[UsageRefresh] ${connection?.provider} quota details unavailable after ${TRANSIENT_USAGE_MAX_ATTEMPTS} attempts for ${getUsageRetryLogLabel(connection)}; preserving previous usage snapshot`,
						);
						// Persist minimal snapshot so UI knows the worker tried
						if (!connection?.usageSnapshot) {
							const checkedAt = new Date().toISOString();
							await syncUsageStatus(connection, {
								routingStatus: connection?.routingStatus || "eligible",
								healthStatus: "degraded",
								quotaState: connection?.quotaState || "ok",
								authState: connection?.authState || "ok",
								reasonCode: "usage_quota_unavailable",
								reasonDetail: "Quota details unavailable",
								lastCheckedAt: checkedAt,
								usageSnapshot: JSON.stringify({
									provider: connection?.provider || null,
									checkedAt,
									quotas: {},
									usageUnavailable: true,
								}),
							});
						}
						return {
							connection,
							usage: null,
							testResult,
							skipped: true,
							skipReason: "usage_quota_unavailable",
						};
					}

					await syncUsageStatus(connection, {
						routingStatus:
							connection?.routingStatus &&
							connection.routingStatus !== "unknown"
								? connection.routingStatus
								: "eligible",
						healthStatus: "degraded",
						quotaState: connection?.quotaState || "ok",
						authState: connection?.authState || "ok",
						reasonCode: "usage_quota_unavailable",
						reasonDetail: "Quota details unavailable",
						lastCheckedAt,
						usageSnapshot: JSON.stringify(
							error.usage || {
								provider: connection?.provider || null,
								checkedAt: lastCheckedAt,
								quotas: {},
								usageUnavailable: true,
								reasonCode: "usage_quota_unavailable",
							},
						),
					});
					error.statusSynced = true;
					throw error;
				}

				if (
					isTransientUpstreamTimeoutError(error, {
						statusCode: status,
						errorCode: error?.code || error?.errorCode,
					})
				) {
					const hasKnownRoutingStatus =
						connection?.routingStatus && connection.routingStatus !== "unknown";
					await syncUsageStatus(connection, {
						routingStatus: hasKnownRoutingStatus
							? connection.routingStatus
							: "eligible",
						healthStatus: "degraded",
						quotaState: connection?.quotaState || "ok",
						authState: connection?.authState || "ok",
						reasonCode: connection?.reasonCode ?? null,
						lastCheckedAt,
						usageSnapshot: JSON.stringify({
							provider: connection?.provider || null,
							checkedAt: lastCheckedAt,
							quotas: {},
						}),
					});
					throw error;
				}

				const quotaSignal = getCodexLiveQuotaSignal(connection, {
					statusCode: status,
					errorText: error?.message || error?.error,
					errorCode: error?.code || error?.errorCode,
				});

				if (quotaSignal) {
					await applyLiveQuotaUpdate(connection, quotaSignal, {
						observedAt: lastCheckedAt,
					});
				} else {
					const authBlockedPatch = getConnectionAuthBlockedPatch(error, {
						lastCheckedAt,
						statusCode: status,
						usageSnapshot: JSON.stringify({
							provider: connection?.provider || null,
							checkedAt: lastCheckedAt,
							message: error.reasonDetail || error.message,
						}),
					});

					await syncUsageStatus(
						connection,
						authBlockedPatch || {
							...(status === 429
								? {
										nextRetryAt: new Date(Date.now() + 10_000).toISOString(),
										resetAt: connection?.resetAt ?? null,
										lastCheckedAt,
									}
								: {
										routingStatus: "blocked",
										healthStatus: "degraded",
										quotaState: "ok",
										authState: "ok",
										reasonCode: isConfirmedAuthBlockedError(error, {
											statusCode: status,
										})
											? "auth_invalid"
											: "usage_request_failed",
										reasonDetail: "Usage check failed",
										lastCheckedAt,
										nextRetryAt: connection?.nextRetryAt ?? null,
										...getOperationalUsageSnapshot(
											connection,
											"Usage check failed.",
											{ checkedAt: lastCheckedAt },
										),
									}),
						},
					);
				}

				throw error;
			}
		},
	);
}

function isAuthExpiredUsageError(error: any) {
	return isAuthExpiredMessage({
		message: error?.message || error?.error || error?.cause?.message || "",
	});
}
