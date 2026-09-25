import { NextResponse } from "@/lib/http/response.js";
import { pruneUsageHistory } from "@/lib/db/repos/usageRepo.js";
import { pruneAnalyticsEvents } from "@/lib/db/repos/analyticsRepo.js";
import { pruneStalePartitions } from "@/lib/db/schema.pg.js";
import { getAdapter } from "@/lib/db/driver.js";
import { getSettings } from "@/lib/db/repos/settingsRepo.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const settings = await getSettings().catch(() => ({}));

    const retentionDays = body.retentionDays !== undefined ? Number(body.retentionDays) : Number(settings.usageRetentionDays) || 7;
    const maxRecords = body.maxRecords !== undefined ? Number(body.maxRecords) : Number(settings.usageMaxRecords) || 100000;
    const partitionRetainMonths = body.partitionRetainMonths !== undefined ? Number(body.partitionRetainMonths) : Number(settings.usagePartitionRetainMonths) || 2;

    const db = await getAdapter();

    // 1. Prune usage_history
    const usageResult = await pruneUsageHistory({ retentionDays, maxRecords });

    // 2. Prune analytics_events
    const analyticsResult = await pruneAnalyticsEvents({ retentionDays: Math.max(retentionDays, 7), maxRecords });

    // 3. Prune stale partitions
    await pruneStalePartitions(db, partitionRetainMonths);

    // 4. Fetch updated row counts
    const usageCountRow = await db.get("SELECT COUNT(*)::int AS count FROM usage_history");
    const analyticsCountRow = await db.get("SELECT COUNT(*)::int AS count FROM analytics_events");

    return NextResponse.json({
      success: true,
      deletedUsageRows: usageResult.deleted || 0,
      currentUsageRows: usageCountRow?.count || 0,
      currentAnalyticsRows: analyticsCountRow?.count || 0,
    });
  } catch (error) {
    console.error("[settings/database/prune] error:", error);
    return NextResponse.json({ error: error.message || "Failed to prune database" }, { status: 500 });
  }
}
