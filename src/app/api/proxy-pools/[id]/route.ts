import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentProviderConnections, updateCurrentProviderConnection } from "@/lib/connectionAccess";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";
import {
  deleteCurrentProxyPool,
  getCurrentProxyPoolById,
  updateCurrentProxyPool,
} from "@/lib/proxyPoolAccess";
import { getCurrentProxyGroups, updateCurrentProxyGroup } from "@/lib/proxyGroupAccess";

type ProxyPoolUpdateBody = {
  name?: unknown;
  proxyUrl?: unknown;
  noProxy?: unknown;
  isActive?: unknown;
  strictProxy?: unknown;
  type?: unknown;
};

type ProxyPoolUpdates = {
  name?: string;
  proxyUrl?: string;
  noProxy?: string;
  isActive?: boolean;
  strictProxy?: boolean;
  type?: "http" | "relay";
};

type NormalizeProxyPoolUpdateResult =
  | { error: string }
  | { updates: ProxyPoolUpdates };

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ProviderConnection = {
  id: string;
  provider?: string;
  providerSpecificData?: {
    proxyPoolId?: string;
    [key: string]: unknown;
  } | null;
};

function getProviderDefaultUsage(providerProxyDefaults: Record<string, { proxyPoolId?: string } | undefined> = {}, proxyPoolId: string) {
  const providerIds = Object.entries(providerProxyDefaults)
    .filter(([, config]) => config?.proxyPoolId === proxyPoolId)
    .map(([providerId]) => providerId);

  return {
    providerIds,
    providerDefaultCount: providerIds.length,
  };
}

function normalizeProxyPoolUpdate(body: ProxyPoolUpdateBody = {}): NormalizeProxyPoolUpdateResult {
  const updates: ProxyPoolUpdates = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return { error: "Name is required" };
    }
    updates.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(body, "proxyUrl")) {
    const proxyUrl = typeof body.proxyUrl === "string" ? body.proxyUrl.trim() : "";
    if (!proxyUrl) {
      return { error: "Proxy URL is required" };
    }
    updates.proxyUrl = proxyUrl;
  }

  if (Object.prototype.hasOwnProperty.call(body, "noProxy")) {
    updates.noProxy = typeof body.noProxy === "string" ? body.noProxy.trim() : "";
  }

  if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
    updates.isActive = body.isActive === true;
  }

  if (Object.prototype.hasOwnProperty.call(body, "strictProxy")) {
    updates.strictProxy = body.strictProxy === true;
  }

  if (Object.prototype.hasOwnProperty.call(body, "type")) {
    const validTypes = ["http", "relay"] as const;
    updates.type = validTypes.includes(body.type as (typeof validTypes)[number])
      ? (body.type as "http" | "relay")
      : "http";
  }

  return { updates };
}

function countBoundConnections(connections: ProviderConnection[] = [], proxyPoolId: string) {
  return connections.filter((connection) => connection?.providerSpecificData?.proxyPoolId === proxyPoolId).length;
}

async function cascadeRemoveProxyPoolReferences(
  proxyPoolId: string,
  connections: ProviderConnection[],
  settings: any
) {
  let clearedConnections = 0;
  let clearedProviderDefaults = 0;
  const clearedProviderIds: string[] = [];

  // Clear per-account proxy overrides
  for (const connection of connections) {
    if (connection?.providerSpecificData?.proxyPoolId === proxyPoolId) {
      const { proxyPoolId: _remove, ...restSpecificData } = connection.providerSpecificData as any;
      try {
        await updateCurrentProviderConnection(connection.id, {
          providerSpecificData: restSpecificData,
        });
        clearedConnections++;
      } catch (err) {
        console.error(`[proxy-pools] Failed to clear proxyPoolId on connection ${connection.id}:`, err);
      }
    }
  }

  // Clear provider default proxy references
  const providerProxyDefaults = settings?.providerProxyDefaults || {};
  const updatedDefaults: Record<string, any> = { ...providerProxyDefaults };
  let defaultsChanged = false;

  for (const [providerId, config] of Object.entries(providerProxyDefaults) as [string, any][]) {
    if (config?.proxyPoolId === proxyPoolId) {
      delete updatedDefaults[providerId];
      clearedProviderDefaults++;
      clearedProviderIds.push(providerId);
      defaultsChanged = true;
    }
  }

  if (defaultsChanged) {
    try {
      await updateCurrentSettings({ providerProxyDefaults: updatedDefaults });
    } catch (err) {
      console.error("[proxy-pools] Failed to clear providerProxyDefaults:", err);
    }
  }

  return {
    clearedConnections,
    clearedProviderDefaults,
    clearedProviderIds,
  };
}

// GET /api/proxy-pools/[id] - Get proxy pool
export async function GET(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const proxyPool = await getCurrentProxyPoolById(id);

    if (!proxyPool) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    return NextResponse.json({ proxyPool });
  } catch (error) {
    console.log("Error fetching proxy pool:", error);
    return NextResponse.json({ error: "Failed to fetch proxy pool" }, { status: 500 });
  }
}

// PUT /api/proxy-pools/[id] - Update proxy pool
export async function PUT(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const existing = await getCurrentProxyPoolById(id);

    if (!existing) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as ProxyPoolUpdateBody;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const normalized = normalizeProxyPoolUpdate(body);

    if ("error" in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    if (normalized.updates.isActive === false) {
      const [connections, settings] = await Promise.all([
        getCurrentProviderConnections() as Promise<ProviderConnection[]>,
        getCurrentSettings(),
      ]);
      const cascadeResult = await cascadeRemoveProxyPoolReferences(id, connections, settings);

      const updated = await updateCurrentProxyPool(id, normalized.updates);
      return NextResponse.json({
        proxyPool: updated,
        cascade: cascadeResult,
      });
    }

    const updated = await updateCurrentProxyPool(id, normalized.updates);
    return NextResponse.json({ proxyPool: updated });
  } catch (error) {
    console.log("Error updating proxy pool:", error);
    return NextResponse.json({ error: "Failed to update proxy pool" }, { status: 500 });
  }
}

// DELETE /api/proxy-pools/[id] - Delete proxy pool
export async function DELETE(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const existing = await getCurrentProxyPoolById(id);

    if (!existing) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    const [connections, settings] = await Promise.all([
      getCurrentProviderConnections() as Promise<ProviderConnection[]>,
      getCurrentSettings(),
    ]);
    const cascadeResult = await cascadeRemoveProxyPoolReferences(id, connections, settings);

    // Remove stale pool ID from any proxy group's proxyPoolIds array
    const groups = await getCurrentProxyGroups();
    for (const group of groups) {
      if (group.proxyPoolIds?.includes(id)) {
        await updateCurrentProxyGroup(group.id, {
          proxyPoolIds: group.proxyPoolIds.filter((pid: string) => pid !== id),
        });
      }
    }

    await deleteCurrentProxyPool(id);
    return NextResponse.json({ success: true, cascade: cascadeResult });
  } catch (error) {
    console.log("Error deleting proxy pool:", error);
    return NextResponse.json({ error: "Failed to delete proxy pool" }, { status: 500 });
  }
}
