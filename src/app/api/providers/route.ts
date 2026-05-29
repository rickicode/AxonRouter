import { NextResponse } from "next/server";
import { APIKEY_PROVIDERS } from "@/shared/constants/config";
import {
	FREE_TIER_PROVIDERS,
	WEB_COOKIE_PROVIDERS,
	isOpenAICompatibleProvider,
	isAnthropicCompatibleProvider,
	isMorphManagedProvider,
} from "@/shared/constants/providers";
import {
	buildMorphManagedConnection,
	injectMorphManagedProvider,
} from "./_morphManaged";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
	createCurrentProviderConnection,
	getCurrentProviderConnectionById,
	getCurrentProviderConnections,
} from "@/lib/connectionAccess";
import { getProviderConnectionStatusSummary } from "@/lib/providerConnectionSummary";
import { syncConnectionModels } from "@/lib/providerModels/syncRunner";

export const dynamic = "force-dynamic";

const LEGACY_MIRROR_FIELDS = [
	"testStatus",
	"lastTested",
	"lastError",
	"lastErrorType",
	"lastErrorAt",
	"rateLimitedUntil",
	"errorCode",
] as const;

type JsonRecord = Record<string, unknown>;

type ProviderConnectionLike = JsonRecord & {
	id?: string;
	provider?: string;
	authType?: string;
	name?: string;
	apiKey?: string;
	accessToken?: string;
	refreshToken?: string;
	idToken?: string;
	providerSpecificData?: JsonRecord | null;
};

type ProxyPoolResult =
	| {
			error: string;
	  }
	| {
			proxyPoolId: string | null;
	  };

type CreateProviderRequestBody = JsonRecord & {
	provider?: string;
	apiKey?: string;
	name?: string;
	priority?: number;
	globalPriority?: number | null;
	defaultModel?: string | null;
	proxyPoolId?: unknown;
	providerSpecificData?: JsonRecord | null;
};

type ModelsModule = typeof import("@/models");

async function loadModels(): Promise<ModelsModule> {
	return import("@/models");
}

function stripLegacyMirrorFields(connection: ProviderConnectionLike) {
	const result: ProviderConnectionLike = { ...connection };
	for (const field of LEGACY_MIRROR_FIELDS) {
		delete result[field];
	}
	return result;
}

async function normalizeProxyPoolId(
	proxyPoolId: unknown,
): Promise<ProxyPoolResult> {
	const { getProxyPoolById } = await loadModels();
	if (
		proxyPoolId === undefined ||
		proxyPoolId === null ||
		proxyPoolId === "" ||
		proxyPoolId === "__none__"
	) {
		return { proxyPoolId: null };
	}

	const normalizedId = String(proxyPoolId).trim();
	if (!normalizedId) {
		return { proxyPoolId: null };
	}

	const proxyPool = await getProxyPoolById(normalizedId);
	if (!proxyPool) {
		return { error: "Proxy pool not found" };
	}
	if (proxyPool.isActive !== true) {
		return {
			error: "Proxy pool is inactive. Activate it first before assigning.",
		};
	}

	return { proxyPoolId: normalizedId };
}

// GET /api/providers - List all connections
export async function GET(request: Request) {
	const authError = await requireManagementAuth(request);
	if (authError) return authError;

	try {
		const rawConnections =
			(await getCurrentProviderConnections()) as ProviderConnectionLike[];
		const morphManagedConnection =
			(await buildMorphManagedConnection()) as ProviderConnectionLike;
		const connections = [
			...(injectMorphManagedProvider(
				rawConnections,
			) as ProviderConnectionLike[]),
			morphManagedConnection,
		];
		const providerSummaries: Record<string, Record<string, unknown>> = {};
		const summaryGroups = new Map<string, ProviderConnectionLike[]>();

		for (const connection of connections) {
			const providerId = connection.provider || "unknown";
			const authType = connection.authType || "unknown";
			const groupKey = `${providerId}::${authType}`;
			if (!summaryGroups.has(groupKey)) summaryGroups.set(groupKey, []);
			summaryGroups.get(groupKey)?.push(connection);
		}

		for (const [groupKey, groupedConnections] of summaryGroups.entries()) {
			const [providerId, authType] = groupKey.split("::");
			if (!providerSummaries[providerId]) providerSummaries[providerId] = {};
			providerSummaries[providerId][authType] =
				getProviderConnectionStatusSummary(groupedConnections);
		}

		const safeConnections = connections.map((connection) => {
			const isCompatible =
				isOpenAICompatibleProvider(connection.provider) ||
				isAnthropicCompatibleProvider(connection.provider);

			// Mask API key: show last 6 chars with asterisk prefix
			const rawApiKey = connection.apiKey;
			const maskedApiKey =
				typeof rawApiKey === "string" && rawApiKey.length > 6
					? `****${rawApiKey.slice(-6)}`
					: typeof rawApiKey === "string" && rawApiKey.length > 0
						? `****`
						: null;

			// For compatible providers, always show masked key suffix — no legacy node name fallback
			const name = isCompatible
				? maskedApiKey || connection.id || connection.provider
				: connection.name;

			return {
				...stripLegacyMirrorFields(connection),
				name,
				maskedApiKey,
				accessToken: undefined,
				refreshToken: undefined,
				idToken: undefined,
			};
		});

		return NextResponse.json({
			connections: safeConnections,
			providerSummaries,
		});
	} catch (error) {
		console.log("Error fetching providers:", error);
		return NextResponse.json(
			{ error: "Failed to fetch providers" },
			{ status: 500 },
		);
	}
}

// POST /api/providers - Create new connection (API Key only, OAuth via separate flow)
export async function POST(request: Request) {
	const authError = await requireManagementAuth(request);
	if (authError) return authError;

	try {
		const { getProviderNodeById } = await loadModels();
		const body = (await request.json()) as CreateProviderRequestBody;
		const { provider, apiKey, name, priority, globalPriority, defaultModel } =
			body;

		const proxyPoolResult = await normalizeProxyPoolId(body.proxyPoolId);
		if ("error" in proxyPoolResult) {
			return NextResponse.json(
				{ error: proxyPoolResult.error },
				{ status: 400 },
			);
		}
		const proxyPoolId = proxyPoolResult.proxyPoolId;

		const isWebCookieProvider = !!(provider && WEB_COOKIE_PROVIDERS[provider]);
		const isValidProvider =
			!!(provider && APIKEY_PROVIDERS[provider]) ||
			!!(provider && FREE_TIER_PROVIDERS[provider]) ||
			isWebCookieProvider ||
			isOpenAICompatibleProvider(provider) ||
			isAnthropicCompatibleProvider(provider);

		if (isMorphManagedProvider(provider)) {
			return NextResponse.json(
				{ error: "Morph Fast Models is managed in Morph settings" },
				{ status: 400 },
			);
		}

		if (!provider || !isValidProvider) {
			return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
		}
		if (!apiKey) {
			return NextResponse.json(
				{
					error: `${isWebCookieProvider ? "Cookie value" : "API Key"} is required`,
				},
				{ status: 400 },
			);
		}
		if (!name) {
			return NextResponse.json({ error: "Name is required" }, { status: 400 });
		}

		let providerSpecificData = body.providerSpecificData || null;

		if (isOpenAICompatibleProvider(provider)) {
			const node = (await getProviderNodeById(provider)) as {
				prefix?: string;
				apiType?: string;
				baseUrl?: string;
				name?: string;
			} | null;
			if (!node) {
				return NextResponse.json(
					{ error: "OpenAI Compatible node not found" },
					{ status: 404 },
				);
			}

			providerSpecificData = {
				prefix: node.prefix,
				apiType: node.apiType,
				baseUrl: node.baseUrl,
			};
		} else if (isAnthropicCompatibleProvider(provider)) {
			const node = (await getProviderNodeById(provider)) as {
				prefix?: string;
				baseUrl?: string;
				name?: string;
			} | null;
			if (!node) {
				return NextResponse.json(
					{ error: "Anthropic Compatible node not found" },
					{ status: 404 },
				);
			}

			providerSpecificData = {
				prefix: node.prefix,
				baseUrl: node.baseUrl,
			};
		}

		const mergedProviderSpecificData: JsonRecord = {
			...(providerSpecificData || {}),
		};

		if (proxyPoolId !== null) {
			mergedProviderSpecificData.proxyPoolId = proxyPoolId;
		}

		const newConnection = (await createCurrentProviderConnection({
			provider,
			authType: isWebCookieProvider ? "cookie" : "apikey",
			name,
			apiKey,
			priority: priority || 1,
			globalPriority: globalPriority || null,
			defaultModel: defaultModel || null,
			providerSpecificData: mergedProviderSpecificData,
			isActive: true,
			routingStatus: "eligible",
			quotaState: "ok",
			authState: "ok",
			healthStatus: "healthy",
			reasonCode: null,
			reasonDetail: null,
			nextRetryAt: null,
			resetAt: null,
			lastCheckedAt: new Date().toISOString(),
		})) as ProviderConnectionLike;

		try {
			const { refreshConnectionUsage } = await import(
				"@/lib/connectionUsageRefresh"
			);
			await refreshConnectionUsage(newConnection.id as string, {
				runConnectionTest: true,
				skipTransientConnectivityErrors: true,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(
				`[Providers] Post-create validation failed for ${newConnection.id}: ${message}`,
			);
		}

		const latestConnection = ((await getCurrentProviderConnectionById(
			newConnection.id as string,
		)) || newConnection) as ProviderConnectionLike;

		// Auto-sync models for the newly created connection (fire-and-forget, non-blocking)
		syncConnectionModels(
			newConnection.id as string,
			newConnection.provider,
		).catch(() => {});

		const result: ProviderConnectionLike = { ...latestConnection };
		delete result.apiKey;

		return NextResponse.json({ connection: result }, { status: 201 });
	} catch (error) {
		console.log("Error creating provider:", error);
		return NextResponse.json(
			{ error: "Failed to create provider" },
			{ status: 500 },
		);
	}
}
