import fs from "node:fs";
import path from "node:path";
import {
	getSettings,
	getProviderConnections,
	getCombos,
	getComboById,
	updateCombo,
	validateApiKey,
	getApiKeys,
	updateSettings,
	getPricing,
	getProxyPools,
} from "../../../src/lib/localDb";
import { getUsageStats } from "../../../src/lib/usageDb";
import { getUsageAnalyticsFromDb } from "../../../src/lib/usageDb/queries/index";
import {
	getKnownProviders,
	getRequestDetailById,
} from "../../../src/lib/requestDetailsDb";
import { getRoutingLatencySummary } from "../../../src/lib/routingLatency";
import { getModelAliases } from "../../../src/models/index";
import { AI_MODELS } from "../../../src/shared/constants/config";
import {
	getHttpTransportState,
	readMcpHeartbeat,
	isMcpHeartbeatOnline,
} from "../runtimeHeartbeat";
import {
	getUsageSqliteFile,
	getUsageDbInstance,
} from "../../../src/lib/usageDb/core";
import {
	getRequestDetailsSqliteFile,
	getRequestDetailsDbInstance,
} from "../../../src/lib/requestDetailsDb/core";

function decodeHtmlEntities(value = "") {
	return String(value)
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
			String.fromCodePoint(parseInt(hex, 16)),
		)
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ");
}

function stripHtml(value = "") {
	return decodeHtmlEntities(
		String(value)
			.replace(/<script[\s\S]*?<\/script>/gi, "")
			.replace(/<style[\s\S]*?<\/style>/gi, "")
			.replace(/<[^>]+>/g, " "),
	)
		.replace(/\s+/g, " ")
		.trim();
}

function decodeDuckDuckGoUrl(raw = "") {
	try {
		const absolute = new URL(raw, "https://duckduckgo.com");
		const uddg = absolute.searchParams.get("uddg");
		return uddg ? decodeURIComponent(uddg) : absolute.toString();
	} catch {
		return raw;
	}
}

function parseDuckDuckGoResults(html = "", maxResults = 5) {
	const results = [];
	const targetCount = Number.isFinite(Number(maxResults))
		? Math.max(1, Math.min(10, Number(maxResults)))
		: 5;
	const seen = new Set();
	const articleRegex =
		/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi;
	let match;
	while ((match = articleRegex.exec(html)) && results.length < targetCount) {
		const [, href, titleHtml, snippetHtml] = match;
		const decodedUrl = decodeDuckDuckGoUrl(href);
		if (seen.has(decodedUrl)) continue;
		seen.add(decodedUrl);
		results.push({
			title: stripHtml(titleHtml),
			url: decodedUrl,
			snippet: stripHtml(snippetHtml),
		});
	}

	if (results.length >= targetCount) {
		return results;
	}

	const blockRegex =
		/<(?:div|article)[^>]*class="[^"]*(?:result|results_links|web-result)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi;
	while ((match = blockRegex.exec(html)) && results.length < targetCount) {
		const block = match[1];
		const anchor = block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
		if (!anchor) continue;
		const decodedUrl = decodeDuckDuckGoUrl(anchor[1]);
		if (!decodedUrl || seen.has(decodedUrl)) continue;

		const title = stripHtml(anchor[2]);
		const snippetMatch = block.match(
			/<(?:div|a|span)[^>]*class="[^"]*(?:snippet|result__extras__url|result__body)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|a|span)>/i,
		);
		const snippet = stripHtml(snippetMatch?.[1] || block);
		if (!title) continue;

		seen.add(decodedUrl);
		results.push({
			title,
			url: decodedUrl,
			snippet,
		});
	}

	return results;
}

export async function getHealth() {
	const [rawSettings, connections, latency, heartbeat] = await Promise.all([
		getSettings(),
		getProviderConnections(),
		Promise.resolve(getRoutingLatencySummary()),
		readMcpHeartbeat(),
	]);
	const settings: any = rawSettings;
	return {
		ok: true,
		runtime: {
			heartbeat,
			heartbeatOnline: isMcpHeartbeatOnline(heartbeat),
			http: getHttpTransportState(),
		},
		settings: {
			observabilityEnabled: settings?.observabilityEnabled !== false,
			routingStrategy: settings?.routing?.strategy || "fill-first",
		},
		providers: {
			total: connections.length,
			active: connections.filter((item) => item.isActive !== false).length,
		},
		latency,
	};
}

export async function listCombos(includeMetrics = false) {
	const combos = await getCombos();
	const analytics = includeMetrics
		? getUsageAnalyticsFromDb({ period: "30d" })
		: null;
	return {
		combos,
		metrics: analytics
			? { totalRequests: analytics.summary?.totalRequests || 0 }
			: null,
	};
}

export async function getComboMetrics(comboId) {
	const combo = await getComboById(comboId);
	return { combo, note: "Combo metrics adapter pending richer telemetry." };
}

export async function switchCombo(comboId, patch = {}) {
	return updateCombo(comboId, patch);
}

export async function checkQuota(provider) {
	const connections = await getProviderConnections(
		provider ? { provider } : undefined,
	);
	return {
		provider: provider || null,
		connections: connections.map((item) => ({
			id: item.id,
			provider: item.provider,
			name: item.name,
			quotaState: item.quotaState || null,
			routingStatus: item.routingStatus || null,
			resetAt: item.resetAt || null,
			reasonCode: item.reasonCode || null,
		})),
	};
}

export async function routeRequest(origin, input) {
	const res = await fetch(`${origin}/api/v1/unified`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
	const contentType = res.headers.get("content-type") || "";
	const result = contentType.includes("application/json")
		? await res.json().catch(() => null)
		: { status: res.status };
	return { ok: res.ok, status: res.status, result };
}

export async function costReport(period = "7d") {
	return getUsageStats(period);
}

export async function listModelsCatalog() {
	const aliases = await getModelAliases();
	return {
		models: AI_MODELS.map((m) => ({
			...m,
			fullModel: `${m.provider}/${m.model}`,
			alias: aliases[`${m.provider}/${m.model}`] || m.model,
		})),
	};
}

export async function providerMetrics(provider) {
	const analytics = getUsageAnalyticsFromDb({ period: "30d", provider });
	const latency = getRoutingLatencySummary();
	const connections = await getProviderConnections(
		provider ? { provider } : undefined,
	);
	return {
		provider: provider || null,
		analytics,
		latency,
		connectionState: connections.map((item) => ({
			id: item.id,
			provider: item.provider,
			name: item.name,
			healthStatus: item.healthStatus || null,
			routingStatus: item.routingStatus || null,
			quotaState: item.quotaState || null,
			authState: item.authState || null,
			nextRetryAt: item.nextRetryAt || null,
			resetAt: item.resetAt || null,
			backoffLevel: item.backoffLevel ?? 0,
		})),
	};
}

export async function simulateRoute(input: any = {}) {
	const settings: any = await getSettings();
	return {
		simulated: true,
		request: input,
		strategy: settings?.routing?.strategy || "fill-first",
		note: "Simulation currently reflects configured policy and does not execute upstream traffic.",
	};
}

export async function setBudgetGuard(input: any = {}) {
	const current: any = await getSettings();
	const governance = {
		...(current?.governance || {}),
		enabled: input.enabled ?? current?.governance?.enabled ?? false,
		monthlyBudgetCapUsd: Number(
			input.monthlyBudgetCapUsd ??
				current?.governance?.monthlyBudgetCapUsd ??
				0,
		),
	};
	const settings = await updateSettings({ governance });
	return { ok: true, governance: settings?.governance || governance };
}

export async function setRoutingStrategy(input: any = {}) {
	const current: any = await getSettings();
	const routing = {
		...(current?.routing || {}),
		...(input.strategy ? { strategy: input.strategy } : {}),
	};
	delete routing.profile;
	const settings = await updateSettings({ routing });
	return {
		ok: true,
		routing: settings?.routing || routing,
	};
}

export async function setResilienceProfile(input: any = {}) {
	const current: any = await getSettings();
	const resilience = {
		...(current?.mcpResilience || {}),
		profile: input.profile || current?.mcpResilience?.profile || "balanced",
		updatedAt: new Date().toISOString(),
	};
	const settings = await updateSettings({ mcpResilience: resilience });
	return { ok: true, resilience: settings?.mcpResilience || resilience };
}

export async function bestComboForTask(taskType = "general") {
	const combos = await getCombos();
	const analytics = getUsageAnalyticsFromDb({ period: "30d" });
	return {
		taskType,
		suggestion: combos[0] || null,
		candidates: combos,
		note:
			combos.length > 0
				? `Selected first available combo as efficient default for ${taskType}.`
				: "No combos configured.",
		analyticsSummary: analytics?.summary || null,
	};
}

export async function testCombo(comboId, prompt = "") {
	const combo = await getComboById(comboId);
	return {
		ok: !!combo,
		combo,
		promptPreview: prompt ? prompt.slice(0, 120) : "",
		note: combo
			? "Combo resolved; execution-grade combo testing adapter still pending."
			: "Combo not found.",
	};
}

export async function webSearch(query, limit = 5) {
	const trimmed = String(query || "").trim();
	if (!trimmed) {
		return {
			ok: false,
			query: trimmed,
			provider: "duckduckgo-html",
			results: [],
			error: "query is required",
		};
	}

	const normalizedLimit = Number.isFinite(Number(limit))
		? Math.max(1, Math.min(10, Number(limit)))
		: 5;
	const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`;
	const res = await fetch(url, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
			Accept: "text/html,application/xhtml+xml",
		},
	});
	const html = await res.text();
	const results = parseDuckDuckGoResults(html, normalizedLimit);

	return {
		ok: res.ok,
		query: trimmed,
		provider: "duckduckgo-html",
		limit: normalizedLimit,
		results,
		resultCount: results.length,
		note:
			results.length > 0
				? "Search results fetched from DuckDuckGo HTML."
				: "No results parsed from DuckDuckGo HTML response.",
	};
}

function buildSqliteFileStatus(filePath) {
	const exists = fs.existsSync(filePath);
	return {
		status: exists ? "ok" : "missing",
		file: filePath,
		sizeBytes: exists ? fs.statSync(filePath).size : 0,
	};
}

function createRepairBackup(filePath) {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupPath = `${filePath}.mcp-repair-${stamp}.bak`;
	fs.copyFileSync(filePath, backupPath);
	return backupPath;
}

function runSafeSqliteRepair(label, filePath, getDb) {
	if (!fs.existsSync(filePath)) {
		return { label, repaired: false, skipped: true, reason: "missing_file" };
	}

	const backupPath = createRepairBackup(filePath);
	const db = getDb();
	db.pragma("wal_checkpoint(TRUNCATE)");
	db.exec("VACUUM");
	return {
		label,
		repaired: true,
		backupPath,
		actions: ["backup", "wal_checkpoint_truncate", "vacuum"],
	};
}

export async function dbHealthCheck(autoRepair = false) {
	const [knownProviders, heartbeat, settings] = await Promise.all([
		getKnownProviders(),
		readMcpHeartbeat(),
		getSettings(),
	]);
	const usageDbFile = getUsageSqliteFile();
	const requestDetailsDbFile = getRequestDetailsSqliteFile();
	const checks = {
		usageDb: buildSqliteFileStatus(usageDbFile),
		requestDetails: buildSqliteFileStatus(requestDetailsDbFile),
		settingsDb: {
			status: "ok",
		},
		mcpHeartbeat: {
			status: heartbeat
				? isMcpHeartbeatOnline(heartbeat)
					? "ok"
					: "stale"
				: "missing",
			snapshot: heartbeat,
		},
	};

	const repairs = autoRepair
		? [
				runSafeSqliteRepair("usageDb", usageDbFile, () => getUsageDbInstance()),
				runSafeSqliteRepair("requestDetails", requestDetailsDbFile, () =>
					getRequestDetailsDbInstance(),
				),
			]
		: [];

	return {
		ok: true,
		checks,
		providerCount: knownProviders.length,
		autoRepairSupported: true,
		autoRepairApplied: autoRepair === true,
		repairs,
		note: autoRepair
			? "Basic non-destructive MCP repair completed for available SQLite files."
			: "This health check inspects live MCP/runtime database artifacts. Auto-repair is available for safe maintenance steps.",
	};
}

export async function pricingSync() {
	const pricing = await getPricing();
	const providerIds = Object.keys(pricing || {});
	return {
		ok: true,
		synced: false,
		providerCount: providerIds.length,
		providers: providerIds,
		pricing,
		note: "Pricing store was loaded successfully. Upstream synchronization is not implemented yet.",
	};
}

export async function proxyFetch(origin, url, proxyPoolId) {
	if (!proxyPoolId) {
		return {
			ok: false,
			url,
			proxyPoolId: null,
			error: "proxyPoolId is required",
		};
	}
	const res = await fetch(
		`${origin}/api/proxy-pools/${encodeURIComponent(proxyPoolId)}/test`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
		},
	);
	const payload = await res.json().catch(() => ({}));
	return {
		ok: res.ok && payload?.ok === true,
		url,
		proxyPoolId,
		proxyTest: payload,
	};
}

export async function proxyRotate(proxyPoolId) {
	const pools = await getProxyPools();
	const pool = pools.find((item) => item.id === proxyPoolId) || null;
	if (!pool) {
		return {
			ok: false,
			proxyPoolId,
			error: "Proxy pool not found",
		};
	}
	return {
		ok: true,
		proxyPool: pool,
		rotatedTo: pool.id,
		note: "Rotation currently resolves the selected pool deterministically. Stateful pool cycling can be added later.",
	};
}

export async function sessionSnapshot(id) {
	return getRequestDetailById(id);
}

export async function cacheStats(origin) {
	const res = await fetch(`${origin}/api/cache-domain`, { cache: "no-store" });
	return res.json();
}

export async function cacheFlush(origin, layer) {
	const res = await fetch(
		`${origin}/api/cache-domain?layer=${encodeURIComponent(layer)}`,
		{ method: "DELETE" },
	);
	return res.json();
}

export async function proxyStats(origin) {
	const res = await fetch(`${origin}/api/proxy-pools?includeUsage=true`, {
		cache: "no-store",
	});
	const payload = await res.json();
	const proxyPools = Array.isArray(payload?.proxyPools)
		? payload.proxyPools
		: [];
	return {
		proxyPools,
		summary: {
			total: proxyPools.length,
			active: proxyPools.filter((item) => item.isActive !== false).length,
			boundConnections: proxyPools.reduce(
				(sum, item) => sum + Number(item.boundConnectionCount || 0),
				0,
			),
		},
	};
}

export async function resolveCallerFromKey(rawKey) {
	if (!rawKey) return null;
	const valid = await validateApiKey(rawKey);
	if (!valid) return null;
	const keys = await getApiKeys();
	return keys.find((item) => item.key === rawKey) || null;
}

export async function explainRoute(id) {
	const detail = await getRequestDetailById(id);
	return {
		id,
		correlationId: detail?.correlationId || null,
		trace: detail?.providerResponse?.trace || null,
		traceSummary: detail?.traceSummary || null,
		request: detail?.request || null,
		provider: detail?.provider || null,
		model: detail?.model || null,
		note: "Detailed route explanation formatter pending.",
	};
}

export async function knownProviders() {
	return getKnownProviders();
}
