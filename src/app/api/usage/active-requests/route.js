import { NextResponse } from "@/lib/http/response.js";
import { getActiveRequests } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

/**
 * GET /api/usage/active-requests
 * Lightweight fast endpoint returning in-flight and recent requests from Valkey ring.
 * Used for instant initial hydration and fallback sync when SSE is reconnecting.
 */
export async function GET() {
  try {
    const data = await getActiveRequests();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ activeRequests: [], recentRequests: [], error: err.message }, { status: 500 });
  }
}
