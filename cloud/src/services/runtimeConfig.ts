const DEFAULT_CACHE_TTL_MS = 15_000;

type PlainObject = Record<string, unknown>;

type RuntimeConfigShape = PlainObject & {
	providers: PlainObject;
	modelAliases: PlainObject;
	combos: unknown[];
	apiKeys: unknown[];
	settings: PlainObject;
};

type EligibleRuntimeConfigShape = {
	providers: PlainObject;
};

type RuntimeRegistration = {
	runtimeUrl?: string;
	cacheTtlMs?: number;
};

type RuntimeLoadOptions = {
	forceRefresh?: boolean;
};

type RuntimeCacheEntry = {
	config: RuntimeConfigShape;
	fetchedAt: number;
};

type FetchLike = (
	...args: Parameters<typeof fetch>
) => ReturnType<typeof fetch>;

function defaultFetchImpl(...args: Parameters<typeof fetch>) {
	return fetch(...args);
}

function isPlainObject(value: unknown): value is PlainObject {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isValidRuntimeConfig(
	value: unknown,
): value is RuntimeConfigShape {
	return (
		isPlainObject(value) &&
		isPlainObject(value.providers) &&
		isPlainObject(value.modelAliases) &&
		Array.isArray(value.combos) &&
		Array.isArray(value.apiKeys) &&
		isPlainObject(value.settings)
	);
}

function isValidEligibleRuntimeConfig(
	value: unknown,
): value is EligibleRuntimeConfigShape {
	return isPlainObject(value) && isPlainObject(value.providers);
}

function getRuntimeConfigUrl(runtimeUrl: string) {
	return new URL(
		"runtime.json",
		runtimeUrl.endsWith("/") ? runtimeUrl : `${runtimeUrl}/`,
	).toString();
}

function getEligibleConfigUrl(runtimeUrl: string) {
	return new URL(
		"eligible.json",
		runtimeUrl.endsWith("/") ? runtimeUrl : `${runtimeUrl}/`,
	).toString();
}

function getTransientFetchError(response: Response) {
	if (response.status >= 500) {
		return new Error(
			`Runtime config fetch failed with status ${response.status}`,
		);
	}

	return null;
}

async function readJsonResponse<T>(
	response: Response,
	errorMessage: string,
): Promise<T> {
	try {
		return (await response.json()) as T;
	} catch {
		throw new Error(errorMessage);
	}
}

function mergeEligibleProviders(
	runtimePayload: RuntimeConfigShape,
	eligiblePayload: EligibleRuntimeConfigShape | null,
) {
	if (!eligiblePayload) {
		return runtimePayload;
	}

	return {
		...runtimePayload,
		providers: eligiblePayload.providers,
	};
}

export function createRuntimeConfigLoader({
	fetchImpl = defaultFetchImpl,
	now = () => Date.now(),
}: {
	fetchImpl?: FetchLike;
	now?: () => number;
} = {}) {
	const cache = new Map<string, RuntimeCacheEntry>();

	return {
		invalidate(runtimeId: string, registration: RuntimeRegistration = {}) {
			const runtimeUrl = registration?.runtimeUrl;
			if (!runtimeUrl) {
				for (const key of cache.keys()) {
					if (key.startsWith(`${runtimeId}:`)) {
						cache.delete(key);
					}
				}
				return;
			}

			cache.delete(`${runtimeId}:${runtimeUrl}`);
		},

		async load(
			runtimeId: string,
			registration: RuntimeRegistration = {},
			options: RuntimeLoadOptions = {},
		) {
			const runtimeUrl = registration?.runtimeUrl;
			if (!runtimeUrl) {
				return null;
			}

			const cacheKey = `${runtimeId}:${runtimeUrl}`;
			const ttlMs =
				typeof registration.cacheTtlMs === "number" &&
				Number.isFinite(registration.cacheTtlMs)
					? Math.max(0, registration.cacheTtlMs)
					: DEFAULT_CACHE_TTL_MS;
			const cacheEntry = cache.get(cacheKey);
			const currentTime = now();

			if (
				!options.forceRefresh &&
				cacheEntry &&
				currentTime - cacheEntry.fetchedAt < ttlMs
			) {
				return cacheEntry.config;
			}

			let runtimeResponse;
			try {
				runtimeResponse = await fetchImpl(getRuntimeConfigUrl(runtimeUrl));
			} catch (error) {
				if (cacheEntry) {
					return cacheEntry.config;
				}
				throw error;
			}

			const transientError = getTransientFetchError(runtimeResponse);
			if (transientError) {
				if (cacheEntry) {
					return cacheEntry.config;
				}
				throw transientError;
			}

			if (!runtimeResponse.ok) {
				throw new Error(
					`Runtime config fetch failed with status ${runtimeResponse.status}`,
				);
			}

			const runtimePayload = await readJsonResponse<RuntimeConfigShape>(
				runtimeResponse,
				"Invalid runtime config payload",
			);
			if (!isValidRuntimeConfig(runtimePayload)) {
				throw new Error("Invalid runtime config payload");
			}

			let eligiblePayload: EligibleRuntimeConfigShape | null = null;
			let eligibleResponse;
			try {
				eligibleResponse = await fetchImpl(getEligibleConfigUrl(runtimeUrl));
			} catch (error) {
				if (cacheEntry) {
					return cacheEntry.config;
				}
				throw error;
			}

			const eligibleTransientError = getTransientFetchError(eligibleResponse);
			if (eligibleTransientError) {
				if (cacheEntry) {
					return cacheEntry.config;
				}
				throw eligibleTransientError;
			}

			if (eligibleResponse.status !== 404) {
				if (!eligibleResponse.ok) {
					throw new Error(
						`Eligible runtime fetch failed with status ${eligibleResponse.status}`,
					);
				}

				eligiblePayload = await readJsonResponse<EligibleRuntimeConfigShape>(
					eligibleResponse,
					"Invalid eligible runtime payload",
				);
				if (!isValidEligibleRuntimeConfig(eligiblePayload)) {
					throw new Error("Invalid eligible runtime payload");
				}
			}

			const config = mergeEligibleProviders(runtimePayload, eligiblePayload);
			cache.set(cacheKey, {
				config,
				fetchedAt: currentTime,
			});
			return config;
		},
	};
}
