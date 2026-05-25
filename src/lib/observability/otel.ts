import { getSettings } from "../localDb";

const SERVICE_NAME = "axonrouter";
const OTEL_RELOAD_INTERVAL_MS = 5_000;
const OTEL_SHUTDOWN_TIMEOUT_MS = 2_000;
const SETTINGS_CACHE_KEY = "__axonrouterSettingsCache";

type OTelSettings = {
	enabled: boolean;
	jaegerOtlpHttpEndpoint: string;
};

type OTelState = {
	enabled: boolean;
	configHash: string;
	tracer?: any;
	api?: any;
	sdk?: any;
	loadedAt: number;
};

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

let otelStatePromise: Promise<OTelState> | null = null;
let currentOtelState: OTelState | null = null;
let currentOtelStateLoadPromise: Promise<OTelState> | null = null;
let shutdownHooksRegistered = false;
let otelShutdownInFlight: Promise<void> | null = null;

function setCachedSettings(settings: any) {
	(globalThis as any)[SETTINGS_CACHE_KEY] = {
		settings,
		loadedAt: Date.now(),
	} satisfies SettingsCacheEntry;
}

export function getCachedSettings(maxAgeMs = OTEL_RELOAD_INTERVAL_MS) {
	const cache = (globalThis as any)[SETTINGS_CACHE_KEY] as
		| SettingsCacheEntry
		| undefined;
	if (!cache) return null;
	if (Date.now() - cache.loadedAt > maxAgeMs) return null;
	return cache.settings;
}

function normalizeOtelSettings(settings: any): OTelSettings {
	const otel = settings?.observability?.otel;
	const endpoint =
		typeof otel?.jaegerOtlpHttpEndpoint === "string"
			? otel.jaegerOtlpHttpEndpoint.trim()
			: "";
	return {
		enabled: otel?.enabled === true,
		jaegerOtlpHttpEndpoint: endpoint,
	};
}

function getConfigHash(otel: OTelSettings) {
	return JSON.stringify(otel);
}

function setAttributes(span: any, attributes: SpanAttributes = {}) {
	for (const [key, value] of Object.entries(attributes)) {
		if (value !== undefined && value !== null) {
			span?.setAttribute?.(key, value);
		}
	}
}

function setSpanError(span: any, api: any, error: any) {
	span?.recordException?.(error);
	span?.setAttribute?.("error", true);
	span?.setAttribute?.("error.message", error?.message || String(error));
	span?.setStatus?.({
		code: api?.SpanStatusCode?.ERROR || 2,
		message: error?.message || String(error),
	});
}

function setHttpStatus(span: any, api: any, status: number) {
	span?.setAttribute?.("http.status_code", status);
	if (status >= 500) {
		span?.setStatus?.({
			code: api?.SpanStatusCode?.ERROR || 2,
			message: `HTTP ${status}`,
		});
	}
}

async function shutdownState(state: OTelState | null) {
	if (!state?.sdk?.shutdown) return;
	try {
		await Promise.race([
			state.sdk.shutdown(),
			new Promise((resolve) => setTimeout(resolve, OTEL_SHUTDOWN_TIMEOUT_MS)),
		]);
	} catch (error) {
		console.warn(
			"[OTEL] OpenTelemetry shutdown skipped:",
			(error as any)?.message || error,
		);
	}
}

async function loadOtelState(
	previous: OTelState | null = null,
): Promise<OTelState> {
	const settings = await getSettings();
	setCachedSettings(settings);
	const otel = normalizeOtelSettings(settings);
	const configHash = getConfigHash(otel);

	if (previous && previous.configHash === configHash) {
		return { ...previous, loadedAt: Date.now() };
	}

	await shutdownState(previous);

	if (!otel.enabled || !otel.jaegerOtlpHttpEndpoint) {
		return { enabled: false, configHash, loadedAt: Date.now() };
	}

	try {
		const [
			{ NodeSDK },
			{ OTLPTraceExporter },
			resources,
			{ ATTR_SERVICE_NAME },
			api,
		] = await Promise.all([
			import("@opentelemetry/sdk-node"),
			import("@opentelemetry/exporter-trace-otlp-http"),
			import("@opentelemetry/resources"),
			import("@opentelemetry/semantic-conventions"),
			import("@opentelemetry/api"),
		]);

		const traceExporter = new OTLPTraceExporter({
			url: otel.jaegerOtlpHttpEndpoint,
		});

		const sdk = new NodeSDK({
			traceExporter,
			resource: new resources.Resource({
				[ATTR_SERVICE_NAME]: SERVICE_NAME,
			}),
		});

		await sdk.start();
		const tracer = api.trace.getTracer(SERVICE_NAME);

		return {
			enabled: true,
			tracer,
			api,
			sdk,
			configHash,
			loadedAt: Date.now(),
		};
	} catch (error) {
		console.warn(
			"[OTEL] OpenTelemetry init skipped:",
			(error as any)?.message || error,
		);
		return { enabled: false, configHash, loadedAt: Date.now() };
	}
}

async function getOtelState() {
	const now = Date.now();
	const shouldReload =
		!currentOtelState ||
		now - currentOtelState.loadedAt > OTEL_RELOAD_INTERVAL_MS;

	if (currentOtelStateLoadPromise) {
		return currentOtelStateLoadPromise;
	}

	if (!otelStatePromise || shouldReload) {
		currentOtelStateLoadPromise = loadOtelState(currentOtelState)
			.then((state) => {
				currentOtelState = state;
				otelStatePromise = Promise.resolve(state);
				return state;
			})
			.finally(() => {
				currentOtelStateLoadPromise = null;
			});
		return currentOtelStateLoadPromise;
	}

	return otelStatePromise;
}

function withStreamSpanLifecycle(
	response: Response,
	span: any,
	api: any,
	startMs: number,
): Response {
	const finishSpan = (extraAttributes: SpanAttributes = {}) => {
		if ((span as any).__axonrouterEnded) return;
		(span as any).__axonrouterEnded = true;
		setAttributes(span, extraAttributes);
		span?.setAttribute?.("axonrouter.duration_ms", Date.now() - startMs);
		span.end();
	};

	if (!response.body) {
		finishSpan();
		return response;
	}

	let firstChunkSeen = false;
	let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	const stream = new ReadableStream({
		start(controller) {
			reader = response.body!.getReader();

			const pump = async (): Promise<void> => {
				try {
					while (true) {
						const { done, value } = await reader!.read();
						if (done) break;
						if (!firstChunkSeen) {
							firstChunkSeen = true;
							span?.setAttribute?.(
								"axonrouter.first_chunk_ms",
								Date.now() - startMs,
							);
						}
						controller.enqueue(value);
					}
					controller.close();
				} catch (error) {
					setSpanError(span, api, error);
					controller.error(error);
				} finally {
					finishSpan();
				}
			};

			void pump();
		},
		async cancel(reason) {
			span?.setAttribute?.("axonrouter.stream_cancelled", true);
			if (reason) setSpanError(span, api, reason);
			try {
				await reader?.cancel(reason);
			} catch {
				// Ignore cancel races; span closure still matters more than stream cleanup errors.
			} finally {
				finishSpan();
			}
		},
	});

	return new Response(stream, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

async function extractRequestedModel(
	request: Request,
): Promise<{ requestedModel?: string; provider?: string; model?: string }> {
	if (request.method !== "POST") return {};

	const contentType = request.headers.get("content-type") || "";
	if (!contentType.toLowerCase().includes("application/json")) return {};

	try {
		const body = await request.clone().json();
		const requestedModel =
			typeof body?.model === "string" ? body.model.trim() : "";
		if (!requestedModel) return {};

		if (requestedModel.includes("/")) {
			const [provider, ...rest] = requestedModel.split("/");
			const model = rest.join("/").trim();
			return {
				requestedModel,
				provider: provider?.trim() || undefined,
				model: model || undefined,
			};
		}

		return { requestedModel };
	} catch {
		return {};
	}
}

export async function withOtelSpan<T>(
	name: string,
	attributes: SpanAttributes,
	handler: () => Promise<T> | T,
): Promise<T> {
	const state = await getOtelState();
	if (!state.enabled) {
		return handler();
	}

	const startMs = Date.now();
	const span = state.tracer.startSpan(name);
	setAttributes(span, attributes);

	const run = async () => {
		try {
			const result = await handler();
			span?.setAttribute?.("axonrouter.duration_ms", Date.now() - startMs);
			return result;
		} catch (error) {
			setSpanError(span, state.api, error);
			throw error;
		} finally {
			span.end();
		}
	};

	return state.api?.context && state.api?.trace
		? state.api.context.with(
				state.api.trace.setSpan(state.api.context.active(), span),
				run,
			)
		: run();
}

export async function instrumentRequest(
	request: Request,
	label: string,
	handler: () => Promise<Response>,
	options: InstrumentRequestOptions = {},
): Promise<Response> {
	const state = await getOtelState();
	if (!state.enabled) {
		return handler();
	}

	const startMs = Date.now();
	const routePrefix = options.routePrefix || "";
	const route = `${routePrefix}/${label}`.replace(/\/+/g, "/");
	const span = state.tracer.startSpan(
		options.spanName || `http ${request.method} ${route}`,
	);
	span.setAttribute("http.method", request.method);
	span.setAttribute("http.route", route);
	span.setAttribute("url.path", new URL(request.url).pathname);
	setAttributes(span, options.attributes);

	const modelMeta = await extractRequestedModel(request);
	if (modelMeta.requestedModel)
		span.setAttribute("axonrouter.requested_model", modelMeta.requestedModel);
	if (modelMeta.provider)
		span.setAttribute("axonrouter.provider", modelMeta.provider);
	if (modelMeta.model) span.setAttribute("axonrouter.model", modelMeta.model);

	const run = async () => {
		try {
			const response = await handler();
			setHttpStatus(span, state.api, response.status);
			return withStreamSpanLifecycle(response, span, state.api, startMs);
		} catch (error: any) {
			setSpanError(span, state.api, error);
			span?.setAttribute?.("axonrouter.duration_ms", Date.now() - startMs);
			span.end();
			throw error;
		}
	};

	return state.api?.context && state.api?.trace
		? state.api.context.with(
				state.api.trace.setSpan(state.api.context.active(), span),
				run,
			)
		: run();
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
	if (otelShutdownInFlight) {
		return otelShutdownInFlight;
	}

	otelShutdownInFlight = (async () => {
		const state = currentOtelState;
		currentOtelState = null;
		otelStatePromise = null;
		currentOtelStateLoadPromise = null;
		await shutdownState(state);
	})().finally(() => {
		otelShutdownInFlight = null;
	});

	return otelShutdownInFlight;
}

function registerOtelShutdownHooks() {
	if (shutdownHooksRegistered || typeof process === "undefined") return;
	shutdownHooksRegistered = true;

	const flushBeforeExit = () => shutdownOtel();

	const flushThenExit = (signal: NodeJS.Signals) => {
		process.once(signal, () => {
			process.exit(128 + (signal === "SIGINT" ? 2 : 15));
		});

		void shutdownOtel().finally(() => {
			process.kill(process.pid, signal);
		});
	};

	process.once("beforeExit", () => {
		void flushBeforeExit();
	});
	process.once("SIGTERM", () => flushThenExit("SIGTERM"));
	process.once("SIGINT", () => flushThenExit("SIGINT"));
}

registerOtelShutdownHooks();

export function resetOtelStateForTests() {
	currentOtelState = null;
	otelStatePromise = null;
	currentOtelStateLoadPromise = null;
	otelShutdownInFlight = null;
}
