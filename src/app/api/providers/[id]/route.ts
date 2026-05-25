import { NextResponse } from "next/server";
import { getMorphManagedConnectionById } from "@/app/api/providers/_morphManaged";
import { isMorphManagedProvider } from "@/shared/constants/providers";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

type ModelsModule = typeof import("@/models");

async function loadModels(): Promise<ModelsModule> {
  return import("@/models");
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ConnectionRecord = {
  id?: string;
  provider?: string;
  authType?: string;
  providerSpecificData?: Record<string, unknown>;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  [key: string]: unknown;
};

type ProviderRouteBody = {
  name?: unknown;
  priority?: unknown;
  globalPriority?: unknown;
  defaultModel?: unknown;
  isActive?: unknown;
  apiKey?: unknown;
  providerSpecificData?: Record<string, unknown>;
  proxyPoolId?: unknown;
  routingOrderLocked?: unknown;
  routingOrder?: unknown;
  // Status fields (used by test-all and validate flows)
  routingStatus?: unknown;
  healthStatus?: unknown;
  quotaState?: unknown;
  authState?: unknown;
  reasonCode?: unknown;
  reasonDetail?: unknown;
  nextRetryAt?: unknown;
  resetAt?: unknown;
  lastCheckedAt?: unknown;
};

type ProxyPoolUpdateResult = {
  hasProxyPoolField: boolean;
  proxyPoolId: string | null;
  error?: string;
};

const LEGACY_MIRROR_FIELDS = [
  "testStatus",
  "lastTested",
  "lastError",
  "lastErrorType",
  "lastErrorAt",
  "rateLimitedUntil",
  "errorCode",
] as const;

function stripLegacyMirrorFields(connection: ConnectionRecord) {
  const result: ConnectionRecord = { ...connection };
  for (const field of LEGACY_MIRROR_FIELDS) {
    delete result[field];
  }
  return result;
}

async function normalizeProxyPoolUpdate(
  proxyPoolIdInput: unknown,
  getProxyPoolById: ModelsModule["getProxyPoolById"]
): Promise<ProxyPoolUpdateResult> {
  if (proxyPoolIdInput === undefined) {
    return { hasProxyPoolField: false, proxyPoolId: null };
  }

  if (proxyPoolIdInput === null || proxyPoolIdInput === "" || proxyPoolIdInput === "__none__") {
    return { hasProxyPoolField: true, proxyPoolId: null };
  }

  const proxyPoolId = String(proxyPoolIdInput).trim();
  if (!proxyPoolId) {
    return { hasProxyPoolField: true, proxyPoolId: null };
  }

  const proxyPool = await getProxyPoolById(proxyPoolId);
  if (!proxyPool) {
    return { hasProxyPoolField: true, proxyPoolId: null, error: "Proxy pool not found" };
  }
  if (proxyPool.isActive !== true) {
    return { hasProxyPoolField: true, proxyPoolId: null, error: "Proxy pool is inactive. Activate it first before assigning." };
  }

  return { hasProxyPoolField: true, proxyPoolId };
}

function shouldMergeProviderSpecificData(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined,
  hasProxyPoolField: boolean,
) {
  return existing !== undefined || incoming !== undefined || hasProxyPoolField;
}

// GET /api/providers/[id] - Get single connection
export async function GET(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { getProviderConnectionById } = await loadModels();
    const { id } = await params;
    const connection =
      (await getMorphManagedConnectionById(id)) ||
      ((await getProviderConnectionById(id)) as ConnectionRecord | null);

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    // Hide sensitive fields
    const result = stripLegacyMirrorFields(connection);
    delete result.apiKey;
    delete result.accessToken;
    delete result.refreshToken;
    delete result.idToken;

    return NextResponse.json({ connection: result });
  } catch (error) {
    console.log("Error fetching connection:", error);
    return NextResponse.json({ error: "Failed to fetch connection" }, { status: 500 });
  }
}

// PUT /api/providers/[id] - Update connection
export async function PUT(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const {
      getProviderConnectionById,
      getProxyPoolById,
      updateProviderConnection,
    } = await loadModels();
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as ProviderRouteBody;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const {
      name,
      priority,
      globalPriority,
      defaultModel,
      isActive,
      apiKey,
      providerSpecificData,
      routingOrderLocked,
      routingOrder,
      // Status fields (used by test-all and validate flows)
      routingStatus,
      healthStatus,
      quotaState,
      authState,
      reasonCode,
      reasonDetail,
      nextRetryAt,
      resetAt,
      lastCheckedAt,
    } = body;

    const existing =
      (await getMorphManagedConnectionById(id)) ||
      ((await getProviderConnectionById(id)) as ConnectionRecord | null);
    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    if (isMorphManagedProvider(existing.provider)) {
      return NextResponse.json({ error: "Morph Fast Models is managed in Morph settings" }, { status: 400 });
    }

    const proxyPoolResult = await normalizeProxyPoolUpdate(body.proxyPoolId, getProxyPoolById);
    if (proxyPoolResult.error) {
      return NextResponse.json({ error: proxyPoolResult.error }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (priority !== undefined) updateData.priority = priority;
    if (globalPriority !== undefined) updateData.globalPriority = globalPriority;
    if (defaultModel !== undefined) updateData.defaultModel = defaultModel;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (apiKey && existing.authType === "apikey") updateData.apiKey = apiKey;
    // Status fields — used by test-all and validate flows to update connection health
    if (routingStatus !== undefined) updateData.routingStatus = routingStatus;
    if (healthStatus !== undefined) updateData.healthStatus = healthStatus;
    if (quotaState !== undefined) updateData.quotaState = quotaState;
    if (authState !== undefined) updateData.authState = authState;
    if (reasonCode !== undefined) updateData.reasonCode = reasonCode;
    if (reasonDetail !== undefined) updateData.reasonDetail = reasonDetail;
    if (nextRetryAt !== undefined) updateData.nextRetryAt = nextRetryAt;
    if (resetAt !== undefined) updateData.resetAt = resetAt;
    if (lastCheckedAt !== undefined) updateData.lastCheckedAt = lastCheckedAt;
    if (
      shouldMergeProviderSpecificData(
        existing.providerSpecificData,
        providerSpecificData,
        proxyPoolResult.hasProxyPoolField,
      )
      || routingOrderLocked !== undefined
    ) {
      const mergedProviderSpecificData: Record<string, unknown> = {
        ...(existing.providerSpecificData || {}),
        ...(providerSpecificData || {}),
      };

      if (routingOrderLocked !== undefined) {
        const normalizedRoutingOrder = Number(routingOrder);
        if (routingOrderLocked === true && (!Number.isInteger(normalizedRoutingOrder) || normalizedRoutingOrder < 1)) {
          return NextResponse.json({ error: "Routing order must be a whole number greater than or equal to 1" }, { status: 400 });
        }

        mergedProviderSpecificData.routingOrderLocked = routingOrderLocked === true;
        mergedProviderSpecificData.routingOrder = routingOrderLocked === true ? normalizedRoutingOrder : null;
        const existingProviderSpecificData = existing.providerSpecificData as Record<string, unknown> | undefined;
        mergedProviderSpecificData.routingOrderLockedAt = routingOrderLocked === true
          ? (existingProviderSpecificData?.routingOrderLockedAt || new Date().toISOString())
          : null;
      }

      if (proxyPoolResult.hasProxyPoolField) {
        if (proxyPoolResult.proxyPoolId === null) {
          delete mergedProviderSpecificData.proxyPoolId;
        } else {
          mergedProviderSpecificData.proxyPoolId = proxyPoolResult.proxyPoolId;
        }
      }

      updateData.providerSpecificData = mergedProviderSpecificData;
    }

    let updated: ConnectionRecord;
    try {
      updated = (await updateProviderConnection(id, updateData)) as ConnectionRecord;
    } catch (error: any) {
      const message = error?.message || "Failed to update connection";
      if (message.includes("already used") || message.includes("Routing order")) {
        const status = message.includes("already used") ? 409 : 400;
        return NextResponse.json({ error: message }, { status });
      }
      throw error;
    }

    // Hide sensitive fields
    const result = stripLegacyMirrorFields(updated);
    delete result.apiKey;
    delete result.accessToken;
    delete result.refreshToken;
    delete result.idToken;

    return NextResponse.json({ connection: result });
  } catch (error) {
    console.log("Error updating connection:", error);
    return NextResponse.json({ error: "Failed to update connection" }, { status: 500 });
  }
}

// DELETE /api/providers/[id] - Delete connection
export async function DELETE(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { deleteProviderConnection } = await loadModels();
    const { id } = await params;

    const morphManaged = await getMorphManagedConnectionById(id);
    if (morphManaged) {
      return NextResponse.json({ error: "Morph Fast Models is managed in Morph settings" }, { status: 400 });
    }

    const deleted = await deleteProviderConnection(id);
    if (!deleted) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Connection deleted successfully" });
  } catch (error) {
    console.log("Error deleting connection:", error);
    return NextResponse.json({ error: "Failed to delete connection" }, { status: 500 });
  }
}
