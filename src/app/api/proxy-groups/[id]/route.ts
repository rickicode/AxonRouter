import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentProviderConnections, updateCurrentProviderConnection } from "@/lib/connectionAccess";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";
import {
  deleteCurrentProxyGroup,
  getCurrentProxyGroupById,
  updateCurrentProxyGroup,
} from "@/lib/proxyGroupAccess";

type ProxyGroupUpdateBody = {
  name?: unknown;
  mode?: unknown;
  stickyLimit?: unknown;
  strictProxy?: unknown;
  proxyPoolIds?: unknown;
  isActive?: unknown;
};

type ProxyGroupUpdates = {
  name?: string;
  mode?: "roundrobin" | "sticky";
  stickyLimit?: number;
  strictProxy?: boolean;
  proxyPoolIds?: string[];
  isActive?: boolean;
};

type NormalizeProxyGroupUpdateResult = { error: string } | { updates: ProxyGroupUpdates };

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ProviderConnection = {
  id: string;
  provider?: string;
  providerSpecificData?: {
    proxyGroupId?: string;
    [key: string]: unknown;
  } | null;
};

function normalizeProxyGroupUpdate(body: ProxyGroupUpdateBody = {}): NormalizeProxyGroupUpdateResult {
  const updates: ProxyGroupUpdates = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return { error: "Name is required" };
    }
    updates.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(body, "mode")) {
    updates.mode = body.mode === "sticky" ? "sticky" : "roundrobin";
  }

  if (Object.prototype.hasOwnProperty.call(body, "stickyLimit")) {
    updates.stickyLimit = typeof body.stickyLimit === "number" && body.stickyLimit >= 1 ? body.stickyLimit : 1;
  }

  if (Object.prototype.hasOwnProperty.call(body, "strictProxy")) {
    updates.strictProxy = body.strictProxy === true;
  }

  if (Object.prototype.hasOwnProperty.call(body, "proxyPoolIds")) {
    updates.proxyPoolIds = Array.isArray(body.proxyPoolIds)
      ? body.proxyPoolIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
      : [];
  }

  if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
    updates.isActive = body.isActive === true;
  }

  return { updates };
}

async function cascadeRemoveProxyGroupReferences(
  proxyGroupId: string,
  connections: ProviderConnection[],
  settings: any,
) {
  let clearedConnections = 0;
  let clearedProviderDefaults = 0;
  const clearedProviderIds: string[] = [];

  // Clear per-connection proxy group overrides
  for (const connection of connections) {
    if (connection?.providerSpecificData?.proxyGroupId === proxyGroupId) {
      const { proxyGroupId: _remove, ...restSpecificData } = connection.providerSpecificData as any;
      try {
        await updateCurrentProviderConnection(connection.id, {
          providerSpecificData: restSpecificData,
        });
        clearedConnections++;
      } catch (err) {
        console.error(`[proxy-groups] Failed to clear proxyGroupId on connection ${connection.id}:`, err);
      }
    }
  }

  // Clear provider default proxy group references
  const providerProxyDefaults = settings?.providerProxyDefaults || {};
  const updatedDefaults: Record<string, any> = { ...providerProxyDefaults };
  let defaultsChanged = false;

  for (const [providerId, config] of Object.entries(providerProxyDefaults) as [string, any][]) {
    if (config?.proxyGroupId === proxyGroupId) {
      const { proxyGroupId: _remove, ...rest } = config;
      if (Object.keys(rest).length === 0) {
        delete updatedDefaults[providerId];
      } else {
        updatedDefaults[providerId] = rest;
      }
      clearedProviderDefaults++;
      clearedProviderIds.push(providerId);
      defaultsChanged = true;
    }
  }

  if (defaultsChanged) {
    try {
      await updateCurrentSettings({ providerProxyDefaults: updatedDefaults });
    } catch (err) {
      console.error("[proxy-groups] Failed to clear providerProxyDefaults:", err);
    }
  }

  return {
    clearedConnections,
    clearedProviderDefaults,
    clearedProviderIds,
  };
}

// GET /api/proxy-groups/[id] - Get proxy group
export async function GET(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const proxyGroup = await getCurrentProxyGroupById(id);

    if (!proxyGroup) {
      return NextResponse.json({ error: "Proxy group not found" }, { status: 404 });
    }

    return NextResponse.json({ proxyGroup });
  } catch (error) {
    console.log("Error fetching proxy group:", error);
    return NextResponse.json({ error: "Failed to fetch proxy group" }, { status: 500 });
  }
}

// PUT /api/proxy-groups/[id] - Update proxy group
export async function PUT(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const existing = await getCurrentProxyGroupById(id);

    if (!existing) {
      return NextResponse.json({ error: "Proxy group not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as ProxyGroupUpdateBody;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const normalized = normalizeProxyGroupUpdate(body);

    if ("error" in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    if (normalized.updates.isActive === false) {
      const [connections, settings] = await Promise.all([
        getCurrentProviderConnections() as Promise<ProviderConnection[]>,
        getCurrentSettings(),
      ]);
      const cascadeResult = await cascadeRemoveProxyGroupReferences(id, connections, settings);

      const updated = await updateCurrentProxyGroup(id, normalized.updates);
      return NextResponse.json({
        proxyGroup: updated,
        cascade: cascadeResult,
      });
    }

    const updated = await updateCurrentProxyGroup(id, normalized.updates);
    return NextResponse.json({ proxyGroup: updated });
  } catch (error) {
    console.log("Error updating proxy group:", error);
    return NextResponse.json({ error: "Failed to update proxy group" }, { status: 500 });
  }
}

// DELETE /api/proxy-groups/[id] - Delete proxy group
export async function DELETE(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const existing = await getCurrentProxyGroupById(id);

    if (!existing) {
      return NextResponse.json({ error: "Proxy group not found" }, { status: 404 });
    }

    const [connections, settings] = await Promise.all([
      getCurrentProviderConnections() as Promise<ProviderConnection[]>,
      getCurrentSettings(),
    ]);
    const cascadeResult = await cascadeRemoveProxyGroupReferences(id, connections, settings);

    await deleteCurrentProxyGroup(id);
    return NextResponse.json({ success: true, cascade: cascadeResult });
  } catch (error) {
    console.log("Error deleting proxy group:", error);
    return NextResponse.json({ error: "Failed to delete proxy group" }, { status: 500 });
  }
}
