import { instrumentUsageWorker } from "./observability/otel";

/**
 * In-process FIFO queue with bounded concurrency for usage refresh jobs.
 * Pure in-memory queue backed by SQLite-WAL (single node). Zero RTT, no
 * external dependencies.
 */

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_WAIT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_QUEUED = 100;

const MEMORY_STATE: {
	queue: QueueJob[];
	activeCount: number;
	pumping: boolean;
} = {
	queue: [],
	activeCount: 0,
	pumping: false,
};

const IN_FLIGHT_BY_CONNECTION = new Map<string, Promise<unknown>>();

export function getUsageQueueConcurrency() {
	const parsed = Number.parseInt(
		process.env.USAGE_QUEUE_CONCURRENCY || "1",
		10,
	);
	if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_CONCURRENCY;
	return parsed;
}

export function getUsageQueueWaitTimeoutMs() {
	const parsed = Number.parseInt(
		process.env.USAGE_QUEUE_WAIT_TIMEOUT_MS || `${DEFAULT_WAIT_TIMEOUT_MS}`,
		10,
	);
	if (!Number.isFinite(parsed) || parsed < 1000) return DEFAULT_WAIT_TIMEOUT_MS;
	return parsed;
}

export function getUsageQueueMaxQueued() {
	const parsed = Number.parseInt(
		process.env.USAGE_QUEUE_MAX_QUEUED || `${DEFAULT_MAX_QUEUED}`,
		10,
	);
	if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_QUEUED;
	return parsed;
}

type QueueError = Error & { status?: number };

type QueueJob = {
	connectionId: string;
	handler: () => unknown | Promise<unknown>;
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
	timeoutId: ReturnType<typeof setTimeout> | null;
};

function createQueueTimeoutError(connectionId: string): QueueError {
	const error: QueueError = new Error(
		`Usage refresh queue timed out for connection ${connectionId}`,
	);
	error.status = 504;
	return error;
}

function createQueueOverloadError(): QueueError {
	const error: QueueError = new Error(
		"Usage refresh queue is overloaded. Please retry shortly.",
	);
	error.status = 503;
	return error;
}

function withMemoryQueue(
	connectionId: string,
	handler: () => unknown | Promise<unknown>,
) {
	return new Promise((resolve, reject) => {
		if (MEMORY_STATE.queue.length >= getUsageQueueMaxQueued()) {
			reject(createQueueOverloadError());
			return;
		}

		const job = {
			connectionId,
			handler,
			resolve,
			reject,
			timeoutId: null,
		};

		job.timeoutId = setTimeout(() => {
			const index = MEMORY_STATE.queue.indexOf(job);
			if (index !== -1) {
				MEMORY_STATE.queue.splice(index, 1);
				reject(createQueueTimeoutError(connectionId));
			}
		}, getUsageQueueWaitTimeoutMs());

		MEMORY_STATE.queue.push(job);
		pumpMemoryQueue();
	});
}

function pumpMemoryQueue() {
	if (MEMORY_STATE.pumping) return;
	MEMORY_STATE.pumping = true;

	try {
		const concurrency = getUsageQueueConcurrency();
		while (
			MEMORY_STATE.activeCount < concurrency &&
			MEMORY_STATE.queue.length > 0
		) {
			const job = MEMORY_STATE.queue.shift();
			if (!job) break;

			clearTimeout(job.timeoutId);
			MEMORY_STATE.activeCount += 1;
			Promise.resolve()
				.then(() => job.handler())
				.then(job.resolve, job.reject)
				.finally(() => {
					MEMORY_STATE.activeCount = Math.max(0, MEMORY_STATE.activeCount - 1);
					pumpMemoryQueue();
				});
		}
	} finally {
		MEMORY_STATE.pumping = false;
	}
}

export async function runUsageRefreshJob(
	connectionId: string,
	handler: () => unknown | Promise<unknown>,
) {
	if (!connectionId || typeof handler !== "function") {
		throw new Error("runUsageRefreshJob requires a connectionId and handler");
	}

	return instrumentUsageWorker(
		"queue.enqueue",
		{
			"usage_worker.connection_id": connectionId,
			"usage_worker.queue_depth": MEMORY_STATE.queue.length,
			"usage_worker.active_count": MEMORY_STATE.activeCount,
		},
		() =>
			withMemoryQueue(connectionId, () =>
				instrumentUsageWorker(
					"queue.execute",
					{
						"usage_worker.connection_id": connectionId,
					},
					handler,
				),
			),
	);
}

export async function runDedupedUsageRefreshJob(
	connectionId: string,
	handler: () => unknown | Promise<unknown>,
) {
	if (!connectionId || typeof handler !== "function") {
		throw new Error(
			"runDedupedUsageRefreshJob requires a connectionId and handler",
		);
	}

	const cached = IN_FLIGHT_BY_CONNECTION.get(connectionId);
	if (cached) {
		return instrumentUsageWorker(
			"queue.dedupe_hit",
			{
				"usage_worker.connection_id": connectionId,
			},
			() => cached,
		);
	}

	const promise = runUsageRefreshJob(connectionId, handler);
	IN_FLIGHT_BY_CONNECTION.set(connectionId, promise);

	promise
		.finally(() => {
			if (IN_FLIGHT_BY_CONNECTION.get(connectionId) === promise) {
				IN_FLIGHT_BY_CONNECTION.delete(connectionId);
			}
		})
		.catch((err) => {
			console.debug(`[UsageRefreshQueue] Deduped job for ${connectionId} rejected:`, err?.message || err);
		});

	return promise;
}
