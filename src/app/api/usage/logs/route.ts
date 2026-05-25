import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getRecentUsageLogRows } from "@/lib/usageDb/queries";

export async function GET(request: Request): Promise<Response> {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const logs = getRecentUsageLogRows(200, { source: "general" });
    return NextResponse.json(logs);
  } catch (error: unknown) {
    console.error("Error fetching logs:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
