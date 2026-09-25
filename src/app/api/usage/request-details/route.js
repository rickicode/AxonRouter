import { NextResponse } from "@/lib/http/response.js";
import { getRequestDetails } from "@/lib/usageDb";

/**
 * GET /api/usage/request-details
 * Query parameters: page, pageSize (1-100), provider, model, connectionId, status, startDate, endDate
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    const pageRaw = parseInt(searchParams.get("page"));
    const page = Number.isNaN(pageRaw) ? 1 : pageRaw;
    const pageSizeRaw = parseInt(searchParams.get("pageSize"));
    const pageSize = Number.isNaN(pageSizeRaw) ? 20 : pageSizeRaw;
    const provider = searchParams.get("provider");
    const model = searchParams.get("model");
    const connectionId = searchParams.get("connectionId");
    const status = searchParams.get("status");
    const statusCode = searchParams.get("statusCode");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    
    if (page < 1) {
      return NextResponse.json(
        { error: "Page must be >= 1" },
        { status: 400 }
      );
    }
    
    if (pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        { error: "PageSize must be between 1 and 100" },
        { status: 400 }
      );
    }
    
    const filter = {
      page,
      pageSize
    };
    
    if (provider) filter.provider = provider;
    if (model) filter.model = model;
    if (connectionId) filter.connectionId = connectionId;
    if (status) filter.status = status;
    if (statusCode) filter.statusCode = statusCode;
    // Back-compat: status can be "success", "failed", or numeric code
    if (status && /^\d+$/.test(status)) {
      filter.statusCode = status;
      delete filter.status;
    }
    if (startDate) filter.startDate = startDate;
    if (endDate) filter.endDate = endDate;
    
    const result = await getRequestDetails(filter);

    // Opt-in full payloads: set REQUEST_DETAILS_SHOW_RAW=true (and keep
    // dashboard behind login) to return unredacted request/response bodies.
    // Default stays redacted: stored details include full conversation
    // payloads (user prompts, tool calls, provider responses), and returning
    // them lets any dashboard-authenticated user (or, if requireLogin is
    // disabled, anyone) read every user's conversation history.
    // For failed requests the error response payload is always preserved
    // so operators can debug issues directly from the dashboard.
    const showRaw = process.env.REQUEST_DETAILS_SHOW_RAW === "true";

    const redactedDetails = (result.details || []).map((d) => {
      if (showRaw) return d;
      const redacted = { ...d };
      const isFailed = d.status !== "success" || Boolean(d.error || d.response?.error);

      for (const key of ["request", "providerRequest", "providerResponse", "response"]) {
        if (redacted[key] !== undefined) {
          if (isFailed && (key === "response" || key === "providerResponse")) {
            // Keep error response intact so operators can inspect failure reasons
            continue;
          }
          redacted[key] = { redacted: true };
        }
      }

      if (isFailed) {
        redacted.error = d.response?.error || d.error || (d.status !== "success" ? `Error (${d.status || 500})` : null);
      }

      return redacted;
    });

    return NextResponse.json({ ...result, details: redactedDetails });
  } catch (error) {
    console.error("[API] Failed to get request details:", error);
    return NextResponse.json(
      { error: "Failed to fetch request details" },
      { status: 500 }
    );
  }
}
