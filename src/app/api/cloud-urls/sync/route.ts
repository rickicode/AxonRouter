import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

type CloudSyncResult = Record<string, unknown>;

type CloudSyncErrorResponse = {
  error: string;
};

/**
 * POST /api/cloud-urls/sync
 *
 * Manually trigger a sync to all registered cloud workers. Used by the
 * "Sync now" button in the dashboard.
 */
export async function POST(request: Request): Promise<NextResponse<CloudSyncResult | CloudSyncErrorResponse>> {
  const authError = await requireManagementAuth(request);
  if (authError) return authError as NextResponse<CloudSyncResult | CloudSyncErrorResponse>;

  try {
    const { syncToCloud } = await import("@/lib/cloudSync");
    const result = await syncToCloud();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cloud sync failed" },
      { status: 500 }
    );
  }
}
