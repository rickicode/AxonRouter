/**
 * Lightweight observability — replaces heavy @opentelemetry/sdk-node dependency.
 *
 * Keeps the same exported API (instrumentV1Request, withOtelSpan, etc.) for
 * backward compatibility, but uses simple performance timing under the hood.
 * No external OTEL packages required.
 *
 * Mirrors OmniRoute's approach: data aggregation without OTEL SDK.
 */

import { getSettings } from "../localDb";

const SERVICE_NAME = "axonrouter";
const SETTINGS_CACHE_KEY = "__axonrouterSettingsCache";
const TIMING_LOG_PREFIX = `[${SERVICE_NAME}/timing]`;

type SpanAttributes = Record<
	string,
	string | number | boolean | null | undefined
>;

type InstrumentRequestOptions = {
	routePrefix?: string;
	spanName?: string;
	attributes?: SpanAttributes;
};

type SettingsCacheEntry = {
	settings: any;
	loadedAt: number;
};

// === Minimal span implementation — no OTEL SDK needed ===

class TimingSpan {
	private _name: string;
	private _startMs: number;
	private _attributes: Record<string, any>;
	private _ended = false;

	constructor(name: string) {
		this._name = name;
		this._startMs = performance.now();
		this._attributes = {};
	}

	setAttribute(key: string, value: any) {
		if (value !== undefined && value !== null) {
			this._attributes[key] = value;
		}
	}

	recordException(error: any) {
		this._attributes["error.message"] = error?.message || String(error);
	}

	setStatus(status: { code: number; message?: string }) {
		this._attributes["status.code"] = status.code;
		if (status.message) this._attributes["status.message"] = status.message;
	}

	end() {
		if (this._ended) return;
		this._ended = true;
		const elapsed = performance.now() - this._startMs;
		const attrs = Object.entries(this._attributes)
			.map(([k, v]) => `${k}=${v}`)
			.join(" ");
		if (elapsed > 100) {
			console.log(`${TIMING_LOG_PREFIX} ${this._name} ${elapsed.toFixed(1)}ms ${attrs}`);
		}
	}
}

function startSpan(name: string): TimingSpan {
	return new TimingSpan(name);
}

// === Settings cache (same as before) ===

function setCachedSettings(settings: any) {
	(globalThis as any)[SETTINGS_CACHE_KEY] = {
		settings,
		loadedAt: Date.now(),
	} satisfies SettingsCacheEntry;
}

export function getCachedSettings(maxAgeMs = 5_000) {
	const cache = (globalThis as any)[SETTINGS_CACHE_KEY] as
		| SettingsCacheEntry
		| undefined;
	if (!cache) return null;
	if (Date.now() - cache.loadedAt > maxAgeMs) return null;
	return cache.settings;
}

// === Exported API (same signatures — no-op or lightweight) ===

export async function withOtelSpan<T>(
	name: string,
	attributes: SpanAttributes,
	handler: () => Promise<T> | T,
): Promise<T> {
	const startMs = performance.now();
	try {
		const result = await handler();
		const elapsed = performance.now() - startMs;
		if (elapsed > 100) {
			console.log(`${TIMING_LOG_PREFIX} ${name} ${elapsed.toFixed(1)}ms`);
		}
		return result;
	} catch (error) {
		const elapsed = performance.now() - startMs;
		console.warn(`${TIMING_LOG_PREFIX} ${name} FAILED after ${elapsed.toFixed(1)}ms:`, error);
		throw error;
	}
}

export async function instrumentRequest(
	request: Request,
	label: string,
	handler: () => Promise<Response>,
	options: InstrumentRequestOptions = {},
): Promise<Response> {
	const startMs = performance.now();
	const routePrefix = options.routePrefix || "";
	const route = `${routePrefix}/${label}`.replace(/\/+/g, "/");

	try {
		const response = await handler();
		const elapsed = performance.now() - startMs;
		if (elapsed > 100) {
			console.log(`${TIMING_LOG_PREFIX} ${request.method} ${route} ${response.status} ${elapsed.toFixed(1)}ms`);
		}
		return response;
	} catch (error: any) {
		const elapsed = performance.now() - startMs;
		console.warn(`${TIMING_LOG_PREFIX} ${request.method} ${route} FAILED after ${elapsed.toFixed(1)}ms:`, error?.message || error);
		throw error;
	}
}

export async function instrumentV1Request(
	request: Request,
	label: string,
	handler: () => Promise<Response>,
	attributes: SpanAttributes = {},
): Promise<Response> {
	return instrumentRequest(request, label, handler, {
		routePrefix: "/v1",
		attributes: {
			"axonrouter.route_family": "v1",
			...attributes,
		},
	});
}

export async function instrumentUsageWorker<T>(
	name: string,
	attributes: SpanAttributes,
	handler: () => Promise<T> | T,
): Promise<T> {
	return withOtelSpan(
		`usage_worker.${name}`,
		{
			"axonrouter.worker": "usage",
			...attributes,
		},
		handler,
	);
}

export async function shutdownOtel() {
	// No-op — nothing to shut down
}

export function resetOtelStateForTests() {
	// No-op — nothing to reset
}
