import { getCurrentProviderConnectionById } from "@/lib/connectionStateAccess";
import { syncUsageStatus } from "@/lib/usageStatus";
import {
	getUsageQueueConcurrency,
	runDedupedUsageRefreshJob,
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

export function normalizeUsageSnapshot(
	usage: any,
	connection: any,
	trigger: UsageRefreshTrigger,
	extra: Partial<NormalizedUsageSnapshot> = {},
): NormalizedUsageSnapshot {
	const rawQuotas = usage?.quotas && typeof usage.quotas === "object" ? usage.quotas : {};
	const quotas = Object.fromEntries(
		Object.entries(rawQuotas).map(([key, value]) => [
			key,
			normalizeQuotaWindow(key, value),
		]),
	);

	return {
		provider: connection?.provider || usage?.provider || null,
		checkedAt: usage?.checkedAt || new Date().toISOString(),
		trigger,
		quotas,
		plan: usage?.plan ?? null,
		account: usage?.account ?? null,
		...(extra.raw === undefined ? {} : { raw: extra.raw }),
		stale: extra.stale ?? Boolean(usage?.stale),
		errorClass: extra.errorClass,
		reasonCode: extra.reasonCode ?? usage?.reasonCode ?? null,
		reasonDetail: extra.reasonDetail ?? usage?.message ?? null,
		nextRetryAt: extra.nextRetryAt ?? null,
	};
}

async function clearForceBackoff(connectionId: string) {
	const connection = await getCurrentProviderConnectionById(connectionId);
	if (!connection) return;
	await syncUsageStatus(connection, {
		backoffLevel: 0,
		nextRetryAt: null,
		routingStatus: "eligible",
		healthStatus: "healthy",
		quotaState: "ok",
		authState: "ok",
		reasonCode: null,
		reasonDetail: null,
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
		return {
			connection: result.connection,
			usage: result.usage,
			testResult: result.testResult,
			skipped: result.skipped === true,
			skipReason: result.skipReason || null,
			worker: {
				connectionId: input.connectionId,
				trigger: input.trigger,
				force: input.force === true,
				queued,
				deduped: true,
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
	return runDedupedUsageRefreshJob(input.connectionId, () =>
		executeCanonicalUsageWorker(normalizedInput, true),
	) as Promise<CanonicalUsageWorkerOutput>;
}

export { classifyUsageError };
export type { CanonicalUsageWorkerInput, CanonicalUsageWorkerOutput };
