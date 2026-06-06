import { getCurrentProviderConnectionById } from "@/lib/connectionStateAccess";
import { syncUsageStatus } from "@/lib/usageStatus";
import {
	getUsageQueueConcurrency,
	runDedupedUsageRefreshJob,
	runUsageRefreshJob,
} from "@/lib/usageRefreshQueue";
import { refreshConnectionUsage } from "@/lib/connectionUsageRefresh";
import type {
	CanonicalUsageWorkerInput,
	CanonicalUsageWorkerOutput,
	NormalizedQuotaWindow,
	NormalizedUsageSnapshot,
	UsageErrorClass,
	UsageRefreshTrigger,
} from "@/lib/usageRefresh/canonicalTypes";

export function getCanonicalUsageWorkerBatchSize(maxBatchSize = 25) {
	return Math.max(1, Math.min(maxBatchSize, getUsageQueueConcurrency()));
}

function classifyUsageError(error: any): UsageErrorClass {
	const status = Number(error?.status || error?.statusCode);
	const code = String(error?.code || error?.errorCode || "").toUpperCase();
	const message = String(error?.message || error?.error || "").toLowerCase();

	if (status === 503 || message.includes("queue is overloaded")) return "overload";
	if (status === 504 || code.includes("TIMEOUT") || message.includes("timed out")) return "timeout";
	if (status === 401 || status === 403 || message.includes("unauthorized") || message.includes("token")) return "auth";
	if (status === 429 || code.includes("QUOTA") || message.includes("quota")) return "quota";
	if (status >= 500 || code.startsWith("E")) return "transient";
	if (status >= 400) return "provider";
	return "unknown";
}

function normalizeQuotaWindow(key: string, value: any): NormalizedQuotaWindow {
	if (!value || typeof value !== "object") return { key };
	return {
		key,
		label: value.label ?? value.name ?? key,
		used: value.used ?? value.current ?? null,
		limit: value.limit ?? value.max ?? null,
		remaining: value.remaining ?? null,
		usedPercent: value.usedPercent ?? value.percent ?? null,
		resetAt: value.resetAt ?? value.resetsAt ?? null,
	};
}

function readConnectionSnapshot(connection: any) {
	if (!connection?.usageSnapshot) return null;
	if (typeof connection.usageSnapshot === "object") return connection.usageSnapshot;
	try {
		return JSON.parse(connection.usageSnapshot);
	} catch {
		return null;
	}
}

export function normalizeUsageSnapshot(
	usage: any,
	connection: any,
	trigger: UsageRefreshTrigger,
	extra: Partial<NormalizedUsageSnapshot> = {},
): NormalizedUsageSnapshot {
	const persistedUsage = readConnectionSnapshot(connection);
	const source = usage || persistedUsage || {};
	const rawQuotas = source?.quotas && typeof source.quotas === "object" ? source.quotas : {};
	const quotas = Object.fromEntries(
		Object.entries(rawQuotas).map(([key, value]) => [
			key,
			normalizeQuotaWindow(key, value),
		]),
	);
	const reasonDetail =
		extra.reasonDetail ??
		source?.reasonDetail ??
		source?.message ??
		connection?.reasonDetail ??
		null;

	return {
		provider: connection?.provider || source?.provider || null,
		checkedAt: source?.checkedAt || connection?.lastCheckedAt || new Date().toISOString(),
		trigger,
		quotas,
		plan: source?.plan ?? connection?.providerSpecificData?.planType ?? null,
		account: source?.account ?? null,
		...(extra.raw === undefined ? {} : { raw: extra.raw }),
		stale: extra.stale ?? Boolean(source?.stale),
		errorClass: extra.errorClass,
		reasonCode:
			extra.reasonCode ??
			source?.reasonCode ??
			connection?.reasonCode ??
			null,
		reasonDetail,
		nextRetryAt: extra.nextRetryAt ?? connection?.nextRetryAt ?? null,
	};
}

async function clearForceBackoff(connectionId: string) {
	const connection = await getCurrentProviderConnectionById(connectionId);
	if (!connection) return;
	// Preserve auth-invalid/disabled blocks — force refresh should only clear
	// backoff and transient errors, not override genuine auth failures.
	const isAuthBlocked = connection?.authState === "invalid"
		|| connection?.reasonCode === "auth_invalid";
	await syncUsageStatus(connection, {
		backoffLevel: 0,
		nextRetryAt: null,
		...(isAuthBlocked ? {} : {
			routingStatus: "eligible",
			healthStatus: "healthy",
			quotaState: "ok",
			authState: "ok",
			reasonCode: null,
			reasonDetail: null,
		}),
		lastCheckedAt: new Date().toISOString(),
	});
}

async function executeCanonicalUsageWorker(
	input: Required<Pick<CanonicalUsageWorkerInput, "connectionId" | "trigger">> &
		CanonicalUsageWorkerInput,
	queued: boolean,
): Promise<CanonicalUsageWorkerOutput> {
	const startedAt = new Date().toISOString();
	const startedMs = Date.now();

	try {
		const result: any = await refreshConnectionUsage(input.connectionId, {
			runConnectionTest: input.force || input.runConnectionTest,
			globalExhaustedThreshold: input.globalExhaustedThreshold,
			skipTransientConnectivityErrors:
				input.skipTransientConnectivityErrors ?? input.trigger === "scheduled",
			trigger: input.trigger,
			metadata: input.metadata,
		});
		const completedAt = new Date().toISOString();
		const usage = normalizeUsageSnapshot(result.usage, result.connection, input.trigger, {
			reasonCode: result.skipReason || undefined,
			reasonDetail: result.skipReason || undefined,
			stale: result.skipped === true,
		});
		return {
			connection: result.connection,
			usage,
			testResult: result.testResult,
			skipped: result.skipped === true,
			skipReason: result.skipReason || null,
			worker: {
				connectionId: input.connectionId,
				trigger: input.trigger,
				force: input.force === true,
				queued,
				deduped: !input.force,
				startedAt,
				completedAt,
				durationMs: Date.now() - startedMs,
			},
		};
	} catch (error: any) {
		error.errorClass = error.errorClass || classifyUsageError(error);
		throw error;
	}
}

export async function runCanonicalUsageWorker(
	input: CanonicalUsageWorkerInput,
): Promise<CanonicalUsageWorkerOutput> {
	if (!input?.connectionId) throw new Error("runCanonicalUsageWorker requires connectionId");
	const trigger = input.trigger || "manual";
	if (input.force) await clearForceBackoff(input.connectionId);
	const normalizedInput = { ...input, trigger };
	const runWorker = () => executeCanonicalUsageWorker(normalizedInput, true);
	if (input.force) {
		return runUsageRefreshJob(input.connectionId, runWorker) as Promise<CanonicalUsageWorkerOutput>;
	}
	return runDedupedUsageRefreshJob(input.connectionId, runWorker) as Promise<CanonicalUsageWorkerOutput>;
}

export { classifyUsageError };
export type { CanonicalUsageWorkerInput, CanonicalUsageWorkerOutput };
