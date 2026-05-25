import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export async function GET(request: Request): Promise<Response> {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const { getAuditStats } = await import("../../../../../../open-sse/mcp-server/audit");
  return NextResponse.json(await getAuditStats());
}
