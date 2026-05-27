import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentProviderConnections } from "@/lib/connectionAccess";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { createCurrentProxyGroup, getCurrentProxyGroups } from "@/lib/proxyGroupAccess";

type ProxyGroupMode = "roundrobin" | "sticky";

type ProxyGroupInputBody = {
  name?: unknown;
  mode?: unknown;
  stickyLimit?: unknown;
  strictProxy?: unknown;
  proxyPoolIds?: unknown;
  isActive?: unknown;
};

type NormalizedProxyGroupInput = {
  name: string;
  mode: ProxyGroupMode;
  stickyLimit: number;
  strictProxy: boolean;
  proxyPoolIds: string[];
  isActive: boolean;
};

type NormalizedProxyGroupResult = NormalizedProxyGroupInput | { error: string };

type ProxyGroupFilter = {
  isActive?: boolean;
};

type ProviderConnectionWithProxy = {
  provider?: string;
  providerSpecificData?: {
    proxyGroupId?: string;
    proxyPoolId?: string;
  } | null;
};

type ProxyGroupWithId = {
  id: string;
} & Record<string, unknown>;

function toBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function normalizeProxyGroupInput(body: ProxyGroupInputBody = {}): NormalizedProxyGroupResult {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const mode: ProxyGroupMode = body?.mode === "sticky" ? "sticky" : "roundrobin";
  const stickyLimit = typeof body?.stickyLimit === "number" && body.stickyLimit >= 1 ? body.stickyLimit : 1;
  const strictProxy = body?.strictProxy === true;
  const proxyPoolIds = Array.isArray(body?.proxyPoolIds)
    ? body.proxyPoolIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
    : [];
  const isActive = body?.isActive === undefined ? true : body.isActive === true;

  if (!name) {
    return { error: "Name is required" };
  }

  return { name, mode, stickyLimit, strictProxy, proxyPoolIds, isActive };
}

function buildGroupUsageMap(connections: ProviderConnectionWithProxy[] = []): Map<string, number> {
  const usageMap = new Map<string, number>();

  for (const connection of connections) {
    const proxyGroupId = connection?.providerSpecificData?.proxyGroupId;
    if (!proxyGroupId) continue;

    usageMap.set(proxyGroupId, (usageMap.get(proxyGroupId) || 0) + 1);
  }

  return usageMap;
}

function buildGroupProviderDefaultUsageMap(providerProxyDefaults: Record<string, { proxyGroupId?: string } | undefined> = {}) {
  const usageMap = new Map<string, string[]>();

  for (const [providerId, config] of Object.entries(providerProxyDefaults)) {
    const proxyGroupId = typeof config?.proxyGroupId === "string" ? config.proxyGroupId.trim() : "";
    if (!proxyGroupId) continue;
    const providers = usageMap.get(proxyGroupId) || [];
    providers.push(providerId);
    usageMap.set(proxyGroupId, providers);
  }

  return usageMap;
}

async function ensureDefaultGroup() {
  const groups = await getCurrentProxyGroups();
  if (Array.isArray(groups) && groups.length > 0) {
    return;
  }
  await createCurrentProxyGroup({
    name: "default",
    mode: "roundrobin",
    stickyLimit: 1,
    strictProxy: false,
    proxyPoolIds: [],
    isActive: true,
  });
}

// GET /api/proxy-groups - List proxy groups
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    await ensureDefaultGroup();

    const { searchParams } = new URL(request.url);
    const isActive = toBoolean(searchParams.get("isActive"));
    const includeUsage = searchParams.get("includeUsage") === "true";

    const filter: ProxyGroupFilter = {};
    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    const proxyGroups = (await getCurrentProxyGroups(filter)) as ProxyGroupWithId[];

    if (!includeUsage) {
      return NextResponse.json({ proxyGroups });
    }

    const connections = (await getCurrentProviderConnections()) as ProviderConnectionWithProxy[];
    const settings = await getCurrentSettings();
    const usageMap = buildGroupUsageMap(connections);
    const providerDefaultUsageMap = buildGroupProviderDefaultUsageMap(settings?.providerProxyDefaults || {});

    const enrichedProxyGroups = proxyGroups.map((group) => ({
      ...group,
      boundConnectionCount: usageMap.get(group.id) || 0,
      defaultProviderIds: providerDefaultUsageMap.get(group.id) || [],
      defaultProviderCount: (providerDefaultUsageMap.get(group.id) || []).length,
    }));

    return NextResponse.json({ proxyGroups: enrichedProxyGroups });
  } catch (error) {
    console.log("Error fetching proxy groups:", error);
    return NextResponse.json({ error: "Failed to fetch proxy groups" }, { status: 500 });
  }
}

// POST /api/proxy-groups - Create proxy group
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as ProxyGroupInputBody;
    const normalized = normalizeProxyGroupInput(body);

    if ("error" in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const proxyGroup = await createCurrentProxyGroup(normalized);
    return NextResponse.json({ proxyGroup }, { status: 201 });
  } catch (error) {
    console.log("Error creating proxy group:", error);
    return NextResponse.json({ error: "Failed to create proxy group" }, { status: 500 });
  }
}
