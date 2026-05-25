import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getRequestDetailById } from "@/lib/usageDb";

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

type RequestDetailResponse = {
  request?: {
    trace?: unknown;
  } | null;
  response?: {
    trace?: unknown;
  } | null;
  providerResponse?: {
    trace?: unknown;
  } | null;
  correlationId?: string | null;
  traceSummary?: unknown;
};

export async function GET(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const resolvedParams = await params;
    const id = resolvedParams?.id;
    if (!id) {
      return NextResponse.json({ error: "Missing request detail id" }, { status: 400 });
    }

    const detail = (await getRequestDetailById(id)) as RequestDetailResponse | null;
    if (!detail) {
      return NextResponse.json({ error: "Request detail not found" }, { status: 404 });
    }

    const trace = detail?.providerResponse?.trace || detail?.response?.trace || detail?.request?.trace || null;

    return NextResponse.json({
      detail,
      trace,
      traceSummary: detail?.traceSummary || null,
      correlationId: detail?.correlationId || null,
    });
  } catch (error) {
    console.error("[API] Failed to get request detail by id:", error);
    return NextResponse.json({ error: "Failed to fetch request detail" }, { status: 500 });
  }
}
