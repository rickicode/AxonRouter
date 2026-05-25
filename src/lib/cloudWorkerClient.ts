import crypto from "node:crypto";

const REQUEST_TIMEOUT_MS = 8_000;

type CloudWorkerMetadata = {
	registeredBy?: string;
	runtimeUrl?: string;
	cacheTtlSeconds?: number;
};

type CloudWorkerError = Error & {
	status?: number;
};

type FetchWorkerUsageOptions = {
	machineId?: string;
	cursor?: number;
	limit?: number;
};

function normalizeUrl(url: unknown) {
	return String(url || "").replace(/\/$/, "");
}

export function generateCloudSecret() {
	return crypto.randomBytes(32).toString("hex");
}

/**
 * Probe the worker's public liveness endpoint.
 * Does NOT require a secret. Returns latency + worker version when reachable.
 */
export async function probeCloudHealth(workerUrl: unknown) {
	const url = `${normalizeUrl(workerUrl)}/admin/health`;
	const startedAt = Date.now();
	try {
		const res = await fetch(url, {
			method: "GET",
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		const latencyMs = Date.now() - startedAt;
		if (!res.ok) {
			return {
				ok: false,
				status: "error",
				latencyMs,
				error: `HTTP ${res.status}`,
			};
		}
		const body = await res.json().catch(() => ({}));
		return {
			ok: true,
			status: "online",
			latencyMs,
			version: body?.version || null,
			uptime: body?.uptime ?? null,
		};
	} catch (error: any) {
		return {
			ok: false,
			status: "offline",
			latencyMs: Date.now() - startedAt,
			error:
				error?.name === "AbortError"
					? "timeout"
					: error?.message || "fetch failed",
		};
	}
}

/**
 * Validate that the configured shared secret is accepted by the worker.
 */
export async function registerWithWorker(workerUrl: unknown, secret: string, metadata: CloudWorkerMetadata = {}) {
	const url = `${normalizeUrl(workerUrl)}/admin/register`;
	const payload: Record<string, string> = {};

	if (typeof metadata.registeredBy === "string" && metadata.registeredBy.trim()) {
		payload.registeredBy = metadata.registeredBy.trim();
	}

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Cloud-Secret": secret,
		},
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	let body: any = null;
	try {
		body = await res.json();
	} catch {
		/* ignore */
	}

	if (!res.ok) {
		const message = body?.error || `register failed (HTTP ${res.status})`;
		throw new Error(message);
	}

	return body || {};
}

/**
 * Fetch the JSON status payload for this worker.
 * Used by the dashboard to render sync state without exposing the secret to
 * the browser.
 */
export async function fetchWorkerStatus(workerUrl: unknown, secret: string) {
	const url = `${normalizeUrl(workerUrl)}/admin/status.json`;
	const startedAt = Date.now();

	const res = await fetch(url, {
		method: "GET",
		headers: { "X-Cloud-Secret": secret },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	let body: any = null;
	try {
		body = await res.json();
	} catch {
		/* ignore */
	}

	if (!res.ok) {
		const message = body?.error || `status fetch failed (HTTP ${res.status})`;
		const err: CloudWorkerError = new Error(message);
		err.status = res.status;
		throw err;
	}

	return {
		...(body || {}),
		latencyMs: Date.now() - startedAt,
	};
}

export async function fetchWorkerLogs(
	workerUrl: unknown,
	secret: string,
	{ limit = 100, clear = false }: { limit?: number; clear?: boolean } = {},
) {
	const params = new URLSearchParams({
		limit: String(Number(limit) || 100),
	});
	if (clear) params.set("clear", "1");
	const url = `${normalizeUrl(workerUrl)}/admin/logs.json?${params.toString()}`;

	const res = await fetch(url, {
		method: "GET",
		headers: { "X-Cloud-Secret": secret },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	let body: any = null;
	try {
		body = await res.json();
	} catch {
		/* ignore */
	}

	if (!res.ok) {
		const message = body?.error || `logs fetch failed (HTTP ${res.status})`;
		const err: CloudWorkerError = new Error(message);
		err.status = res.status;
		throw err;
	}

	return body || { success: true, count: 0, logs: [] };
}

export async function pushWorkerRuntimeSync(workerUrl: unknown, secret: string, payload: unknown) {
	const url = `${normalizeUrl(workerUrl)}/sync/shared`;

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Cloud-Secret": secret,
		},
		body: JSON.stringify(payload || {}),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	let body: any = null;
	try {
		body = await res.json();
	} catch {
		/* ignore */
	}

	if (!res.ok) {
		const message = body?.error || `runtime sync failed (HTTP ${res.status})`;
		const err: CloudWorkerError = new Error(message);
		err.status = res.status;
		throw err;
	}

	return body || {};
}

export async function unregisterWorker(workerUrl: unknown, secret: string) {
	const url = `${normalizeUrl(workerUrl)}/admin/unregister`;

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Cloud-Secret": secret,
		},
		body: JSON.stringify({}),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	let body: any = null;
	try {
		body = await res.json();
	} catch {
		/* ignore */
	}

	if (!res.ok) {
		const message = body?.error || `unregister failed (HTTP ${res.status})`;
		const err: CloudWorkerError = new Error(message);
		err.status = res.status;
		throw err;
	}

	return body || {};
}

export async function fetchWorkerUsageEvents(
	workerUrl: unknown,
	secret: string,
	{ machineId, cursor = 0, limit = 500 }: FetchWorkerUsageOptions = {},
) {
	const params = new URLSearchParams({
		machineId: String(machineId || "").trim(),
		cursor: String(Number(cursor) || 0),
		limit: String(Number(limit) || 500),
	});
	const url = `${normalizeUrl(workerUrl)}/admin/usage/events?${params}`;

	const res = await fetch(url, {
		method: "GET",
		headers: { "X-Cloud-Secret": secret },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	let body: any = null;
	try {
		body = await res.json();
	} catch {
		/* ignore */
	}

	if (!res.ok) {
		const message =
			body?.error || `usage events fetch failed (HTTP ${res.status})`;
		const err: CloudWorkerError = new Error(message);
		err.status = res.status;
		throw err;
	}

	return body || { events: [], nextCursor: Number(cursor) || 0 };
}

/**
 * Build the URL the user can open in a browser tab to view the live worker
 * dashboard.
 */
export function buildWorkerDashboardUrl(workerUrl: unknown, secret: string) {
	const base = normalizeUrl(workerUrl);
	const params = new URLSearchParams({
		token: secret,
	});
	return `${base}/admin/status?${params.toString()}`;
}
