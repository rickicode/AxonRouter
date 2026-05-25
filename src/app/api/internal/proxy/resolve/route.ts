import { NextResponse } from "next/server";
import { getConnectionStatusDetails } from "@/lib/connectionStatus";
import { getCurrentProviderConnections } from "@/lib/connectionAccess";
import { getInternalProxyTokens } from "@/lib/internalProxyTokens";
import {
  getEligibleConnectionsFromSnapshot,
  loadProviderEligibilitySnapshot,
} from "@/lib/providerEligibility";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { recordRoutingLatency } from "@/lib/routingLatency";
import { resolveProviderId } from "@/shared/constants/providers";

const INTERNAL_AUTH_HEADER = "x-internal-auth";

type InternalResolveRequestBody = {
  provider?: string;
  model?: string;
  protocolFamily?: string;
  publicPath?: string;
};

type ProxyConnection = {
  id?: string;
  provider?: string;
  priority?: number;
  lastUsedAt?: string | null;
  consecutiveUseCount?: number;
};

type RoutingSettings = {
  strategy?: string;
  providerStrategies?: Record<string, ProviderStrategy | undefined>;
};

type ProviderStrategy = {
  strategy?: string;
  fallbackStrategy?: string;
};

type AppSettings = {
  routing?: RoutingSettings;
  providerStrategies?: Record<string, ProviderStrategy | undefined>;
  fallbackStrategy?: string;
};

async function hasValidInternalAuth(request: Request): Promise<boolean> {
  const tokens = await getInternalProxyTokens();
  const expectedToken = tokens.resolveToken;
  if (!expectedToken) return false;

  const providedToken = request.headers.get(INTERNAL_AUTH_HEADER);
  return Boolean(providedToken) && providedToken === expectedToken;
}

const ALLOWED_PROTOCOL_PATHS: Record<string, Set<string>> = {
  openai: new Set([
    "/v1/chat/completions",
    "/v1/responses",
    "/v1/embeddings",
    "/v1/audio/speech",
    "/v1/images/generations",
  ]),
  anthropic: new Set(["/v1/messages"]),
};

function normalizeTtlSeconds(): number {
  const raw = Number(process.env.GO_PROXY_RESOLVE_CACHE_TTL_SECONDS);
  const fallback = 7;
  const value = Number.isFinite(raw) ? raw : fallback;
  return Math.max(5, Math.min(10, Math.floor(value)));
}

function sortByPriority(connections: ProxyConnection[] = []): ProxyConnection[] {
  return [...connections].sort((a, b) => (a.priority || 999) - (b.priority || 999));
}

function sortByRecencyDesc(connections: ProxyConnection[] = []): ProxyConnection[] {
  return [...connections].sort((a, b) => {
    if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
    if (!a.lastUsedAt) return 1;
    if (!b.lastUsedAt) return -1;
    return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
  });
}

function sortByRecencyAsc(connections: ProxyConnection[] = []): ProxyConnection[] {
  return [...connections].sort((a, b) => {
    if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
    if (!a.lastUsedAt) return -1;
    if (!b.lastUsedAt) return 1;
    return new Date(a.lastUsedAt).getTime() - new Date(b.lastUsedAt).getTime();
  });
}

function sanitizeConnection(connection: ProxyConnection = {}) {
  const status = getConnectionStatusDetails(connection);
  return {
    connectionId: connection.id,
    provider: connection.provider,
    status: status.status,
    statusSource: status.source,
    cooldownUntil: status.cooldownUntil,
    hasActiveModelLock: status.hasActiveModelLock,
  };
}

function validateRouteContract(protocolFamily?: string, publicPath?: string): boolean {
  if (!protocolFamily || !publicPath) return false;
  const allowedPaths = ALLOWED_PROTOCOL_PATHS[protocolFamily];
  if (!allowedPaths) return false;
  return allowedPaths.has(publicPath);
}

function pickConnections(selectionPool: ProxyConnection[] = [], strategy = "fill-first") {
  const pool = sortByPriority(selectionPool);
  if (pool.length === 0) return { chosen: null, fallbackChain: [] as ProxyConnection[] };

  if (strategy === "round-robin") {
    const stickyLimit = 3;
    const byRecency = sortByRecencyDesc(pool);
    const current = byRecency[0];
    const currentCount = current?.consecutiveUseCount || 0;

    const chosen = current && current.lastUsedAt && currentCount < stickyLimit
      ? current
      : sortByRecencyAsc(pool)[0];

    const fallbackChain = pool.filter((connection) => connection.id !== chosen?.id);
    return { chosen, fallbackChain };
  }

  return {
    chosen: pool[0],
    fallbackChain: pool.slice(1),
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let providerForMetric: string | null = null;
  let metricStatus = "ok";

  try {
    if (!(await hasValidInternalAuth(request))) {
      metricStatus = "unauthorized";
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    let payload: InternalResolveRequestBody;
    try {
      payload = (await request.json()) as InternalResolveRequestBody;
    } catch {
      metricStatus = "invalid_request";
      return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    const providerInput = payload?.provider;
    const model = payload?.model || null;
    const protocolFamily = payload?.protocolFamily;
    const publicPath = payload?.publicPath;

    if (!providerInput || !model || !protocolFamily || !publicPath) {
      metricStatus = "invalid_request";
      return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    if (!validateRouteContract(protocolFamily, publicPath)) {
      metricStatus = "invalid_route_contract";
      return NextResponse.json({ ok: false, error: "invalid_route_contract" }, { status: 400 });
    }

    const provider = resolveProviderId(providerInput);
    providerForMetric = provider;

    const [connections, settings] = await Promise.all([
      getCurrentProviderConnections({ provider, isActive: true }),
      getCurrentSettings(),
    ]);

    const availableConnections = Array.isArray(connections) ? (connections as ProxyConnection[]) : [];
    const eligibilitySnapshot = loadProviderEligibilitySnapshot(provider);
    const centralizedEligibleConnections = getEligibleConnectionsFromSnapshot(eligibilitySnapshot, availableConnections);
    const selectionPool = Array.isArray(centralizedEligibleConnections)
      ? centralizedEligibleConnections as ProxyConnection[]
      : availableConnections.filter(
          (connection) => getConnectionStatusDetails(connection).status === "eligible",
        );

    if (selectionPool.length === 0) {
      metricStatus = "no_routable_connection";
      return NextResponse.json({ ok: false, error: "no_routable_connection", owner: "axonrouter" }, { status: 503 });
    }

    const typedSettings = (settings || {}) as AppSettings;
    const routing = typedSettings.routing || {};
    const providerOverride = (routing.providerStrategies || typedSettings.providerStrategies || {})[provider] || {};
    const strategy = providerOverride.strategy
      || providerOverride.fallbackStrategy
      || routing.strategy
      || typedSettings.fallbackStrategy
      || "fill-first";

    const { chosen, fallbackChain } = pickConnections(selectionPool, strategy);
    const ttlSeconds = normalizeTtlSeconds();

    return NextResponse.json({
      ok: true,
      owner: "axonrouter",
      resolution: {
        provider,
        model,
        protocolFamily,
        publicPath,
        ttlSeconds,
        chosenConnection: sanitizeConnection(chosen || undefined),
        fallbackChain: fallbackChain.length > 0 ? fallbackChain.map(sanitizeConnection) : undefined,
      },
    });
  } catch (error) {
    metricStatus = "error";
    throw error;
  } finally {
    recordRoutingLatency({
      providerId: providerForMetric,
      status: metricStatus,
    } as any);
  }
}
