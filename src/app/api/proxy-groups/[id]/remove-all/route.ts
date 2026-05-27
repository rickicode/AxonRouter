import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentProviderConnections, updateCurrentProviderConnection } from "@/lib/connectionAccess";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";
import { getCurrentProxyGroupById } from "@/lib/proxyGroupAccess";

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

// POST /api/proxy-groups/[id]/remove-all - Remove group assignment from all connections and provider defaults
export async function POST(request: Request, { params }: RouteContext) {
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

    let clearedConnections = 0;
    let clearedProviderDefaults = 0;
    const clearedProviderIds: string[] = [];

    // Clear per-connection proxy group references
    for (const connection of connections) {
      if (connection?.providerSpecificData?.proxyGroupId === id) {
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
      if (config?.proxyGroupId === id) {
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

    return NextResponse.json({
      success: true,
      clearedConnections,
      clearedProviderDefaults,
      clearedProviderIds,
    });
  } catch (error) {
    console.log("Error removing proxy group references:", error);
    return NextResponse.json({ error: "Failed to remove proxy group references" }, { status: 500 });
  }
}
