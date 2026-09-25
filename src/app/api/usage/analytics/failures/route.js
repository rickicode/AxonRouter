import { NextResponse } from "@/lib/http/response.js";
import { getFailureAnalytics } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

/**
 * GET /api/usage/analytics/failures
 * Query parameters: provider, model, timeFrom, timeTo, limit
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const provider = searchParams.get("provider") || undefined;
    const model = searchParams.get("model") || undefined;
    const timeFrom = searchParams.get("timeFrom") || undefined;
    const timeTo = searchParams.get("timeTo") || undefined;
    const limitRaw = parseInt(searchParams.get("limit") || "20", 10);
    const limit = Number.isNaN(limitRaw) ? 20 : Math.min(100, Math.max(1, limitRaw));

    const result = await getFailureAnalytics({
      provider,
      model,
      timeFrom,
      timeTo,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] /api/usage/analytics/failures error:", error);
    return NextResponse.json(
      { error: "Failed to fetch failure analytics", details: error.message },
      { status: 500 },
    );
  }
}
