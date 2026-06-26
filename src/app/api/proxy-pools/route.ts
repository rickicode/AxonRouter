import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentProviderConnections } from "@/lib/connectionAccess";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { createCurrentProxyPool, getCurrentProxyPools } from "@/lib/proxyPoolAccess";
import { type ProxyPoolType, type RelayType, RELAY_TYPES, isRelayType, normalizeProxyPoolType, generateRelayAuth } from "@/lib/relayTypes";

type ProxyPoolInputBody = {
  name?: unknown;
  proxyUrl?: unknown;
  noProxy?: unknown;
  isActive?: unknown;
  strictProxy?: unknown;
  type?: unknown;
};

type NormalizedProxyPoolInput = {
  name: string;
  proxyUrl: string;
  noProxy: string;
  isActive: boolean;
  strictProxy: boolean;
  type: ProxyPoolType;
  relayAuth?: string;
};

type NormalizedProxyPoolResult =
  | NormalizedProxyPoolInput
  | {
      error: string;
    };

type ProxyPoolFilter = {
  isActive?: boolean;
};

type ProviderConnectionWithProxyPool = {
  provider?: string;
  providerSpecificData?: {
    proxyPoolId?: string;
  } | null;
};

type ProxyPoolWithId = {
  id: string;
} & Record<string, unknown>;

function toBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

const VALID_PROXY_TYPES: ProxyPoolType[] = ["http", "vercel", "deno", "cloudflare"];

function normalizeProxyPoolInput(body: ProxyPoolInputBody = {}): NormalizedProxyPoolResult {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const proxyUrl = typeof body?.proxyUrl === "string" ? body.proxyUrl.trim() : "";
  const noProxy = typeof body?.noProxy === "string" ? body.noProxy.trim() : "";
  const isActive = body?.isActive === undefined ? true : body.isActive === true;
  const strictProxy = body?.strictProxy === true;

  // Auto-detect type from URL if not explicitly provided
  const type: ProxyPoolType = normalizeProxyPoolType(body?.type, proxyUrl);

  if (!name) {
    return { error: "Name is required" };
  }

  if (!proxyUrl) {
    return { error: "Proxy URL is required" };
  }

  const relayAuth = isRelayType(type) ? generateRelayAuth() : undefined;
  return { name, proxyUrl, noProxy, isActive, strictProxy, type, relayAuth };
}

function buildUsageMap(connections: ProviderConnectionWithProxyPool[] = []): Map<string, number> {
  const usageMap = new Map<string, number>();

  for (const connection of connections) {
    const proxyPoolId = connection?.providerSpecificData?.proxyPoolId;
    if (!proxyPoolId) continue;

    usageMap.set(proxyPoolId, (usageMap.get(proxyPoolId) || 0) + 1);
  }

  return usageMap;
}

function buildProviderDefaultUsageMap(providerProxyDefaults: Record<string, { proxyPoolId?: string } | undefined> = {}) {
  const usageMap = new Map<string, string[]>();

  for (const [providerId, config] of Object.entries(providerProxyDefaults)) {
    const proxyPoolId = typeof config?.proxyPoolId === "string" ? config.proxyPoolId.trim() : "";
    if (!proxyPoolId) continue;
    const providers = usageMap.get(proxyPoolId) || [];
    providers.push(providerId);
    usageMap.set(proxyPoolId, providers);
  }

  return usageMap;
}

// GET /api/proxy-pools - List proxy pools
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const isActive = toBoolean(searchParams.get("isActive"));
    const includeUsage = searchParams.get("includeUsage") === "true";

    const filter: ProxyPoolFilter = {};
    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    const proxyPools = (await getCurrentProxyPools(filter)) as ProxyPoolWithId[];

    if (!includeUsage) {
      return NextResponse.json({ proxyPools });
    }

    const connections = (await getCurrentProviderConnections()) as ProviderConnectionWithProxyPool[];
    const settings = await getCurrentSettings();
    const usageMap = buildUsageMap(connections);
    const providerDefaultUsageMap = buildProviderDefaultUsageMap(settings?.providerProxyDefaults || {});

    const enrichedProxyPools = proxyPools.map((pool) => ({
      ...pool,
      boundConnectionCount: usageMap.get(pool.id) || 0,
      defaultProviderIds: providerDefaultUsageMap.get(pool.id) || [],
      defaultProviderCount: (providerDefaultUsageMap.get(pool.id) || []).length,
    }));

    return NextResponse.json({ proxyPools: enrichedProxyPools });
  } catch (error) {
    console.log("Error fetching proxy pools:", error);
    return NextResponse.json({ error: "Failed to fetch proxy pools" }, { status: 500 });
  }
}

// POST /api/proxy-pools - Create proxy pool
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as ProxyPoolInputBody;
    const normalized = normalizeProxyPoolInput(body);

    if ("error" in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const proxyPool = await createCurrentProxyPool(normalized);
    return NextResponse.json({ proxyPool }, { status: 201 });
  } catch (error) {
    console.log("Error creating proxy pool:", error);
    return NextResponse.json({ error: "Failed to create proxy pool" }, { status: 500 });
  }
}
