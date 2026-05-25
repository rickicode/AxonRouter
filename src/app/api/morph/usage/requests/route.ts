import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getMorphRecentRequests } from "@/lib/morphUsageDb";
import { logMorphApiAccess } from "@/app/api/morph/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  logMorphApiAccess(request);

  try {
    const { searchParams } = new URL(request.url);
    const limitValue = Number(searchParams.get("limit") || 200);
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 500) : 200;
    const requests = await getMorphRecentRequests(limit);

    return NextResponse.json(requests);
  } catch (error) {
    console.error("[API] Failed to get Morph request logs:", error);
    return NextResponse.json({ error: "Failed to fetch Morph request logs" }, { status: 500 });
  }
}
