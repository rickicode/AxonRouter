import { NextResponse } from "next/server";
import { bulkResetProviderConnectionsStatus } from "@/models";
import { clearBatchAntigravityConnectionCache } from "@/sse/services/antigravityQuota";
import {
  deleteUsageSnapshotsByConnectionIds,
  getBatchProviderQuotas,
} from "@/lib/db/repos/usageSnapshotsRepo.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const { provider, ids } = body;

    if (!provider && (!Array.isArray(ids) || ids.length === 0)) {
      return NextResponse.json({ error: "provider or ids is required" }, { status: 400 });
    }

    const result = await bulkResetProviderConnectionsStatus({ provider, ids });

    // Resolve affected ids: resetting by provider alone passes no ids, and
    // without them neither the RAM quota cache nor the persisted snapshots
    // are cleared — stale exhausted snapshots re-block the accounts on the
    // next selection. Fail-open throughout.
    let affectedIds = Array.isArray(ids) ? ids : [];
    if (affectedIds.length === 0 && provider) {
      try {
        const snapshots = await getBatchProviderQuotas(provider);
        affectedIds = snapshots.map((s) => s?.connectionId).filter(Boolean);
      } catch {}
    }

    if (provider === "antigravity" || affectedIds.length > 0) {
      try {
        clearBatchAntigravityConnectionCache(affectedIds);
      } catch {}
      try {
        await deleteUsageSnapshotsByConnectionIds(affectedIds);
      } catch (e) {
        console.error("Error deleting usage snapshots on bulk reset-status:", e?.message || e);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error bulk resetting connection status:", error);
    return NextResponse.json({ error: "Failed to reset connection status" }, { status: 500 });
  }
}
