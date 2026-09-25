import { NextResponse } from "@/lib/http/response.js";
import { getProviderConnectionById, updateProviderConnection } from "@/models";
import { clearAntigravityConnectionCache } from "@/sse/services/antigravityQuota";
import { deleteUsageSnapshotsByConnectionIds } from "@/lib/db/repos/usageSnapshotsRepo.js";
import { setAccountCooldown, clearProviderDead } from "@/lib/cache/client.js";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    // Build clear object for all modelLock_* fields and account locks
    const updates = {
      isActive: true,
      testStatus: "active",
      lastError: null,
      lastErrorAt: null,
      errorCode: null,
      backoffLevel: 0,
      rateLimitedUntil: null,
      lockedAllUntil: null,
      lockedToModel: null,
      lockedToModelUntil: null,
      modelLocks: {},
      disabledReason: null,
      previousStatus: null,
      disabledAt: null,
      disabledBy: null,
    };

    for (const key of Object.keys(connection)) {
      if (key.startsWith("modelLock_")) {
        updates[key] = null;
      }
    }

    // Also clear in providerSpecificData if any modelLock exists there
    if (connection.providerSpecificData) {
      const psdUpdates = { ...connection.providerSpecificData };
      let changed = false;
      for (const k of Object.keys(psdUpdates)) {
        if (k.startsWith("modelLock_")) {
          delete psdUpdates[k];
          changed = true;
        }
      }
      if (psdUpdates.refreshBlocked !== undefined || psdUpdates.refreshBlockedAt !== undefined) {
        delete psdUpdates.refreshBlocked;
        delete psdUpdates.refreshBlockedAt;
        changed = true;
      }
      if (psdUpdates.validationUrl !== undefined || psdUpdates.validationMessage !== undefined || psdUpdates.validationAt !== undefined) {
        delete psdUpdates.validationUrl;
        delete psdUpdates.validationMessage;
        delete psdUpdates.validationAt;
        changed = true;
      }
      if (changed) updates.providerSpecificData = psdUpdates;
    }

    const updated = await updateProviderConnection(id, updates);

    // Clear speed-layer cooldown (memory + PG)
    setAccountCooldown(id, 0).catch(() => {});
    if (connection.provider) {
      clearProviderDead(connection.provider).catch(() => {});
    }

    // Clear Antigravity in-memory cache if applicable
    if (typeof clearAntigravityConnectionCache === "function") {
      clearAntigravityConnectionCache(id);
    }

    // Drop the persisted quota snapshot too: otherwise the next routing
    // selection re-hydrates the stale exhausted snapshot into RAM and the
    // account is blocked again (top-ups / manual resets never stick).
    // Fail-open — a snapshot failure must not break the status reset.
    try {
      await deleteUsageSnapshotsByConnectionIds([id]);
    } catch (e) {
      console.error("Error deleting usage snapshot on reset-status:", e?.message || e);
    }

    return NextResponse.json({ ok: true, connection: updated });
  } catch (error) {
    console.error("Error resetting connection status:", error);
    return NextResponse.json({ error: "Failed to reset connection status" }, { status: 500 });
  }
}
