import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

function parseBoolean(value: string | null): boolean | undefined {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const { queryAuditEntries } = await import("../../../../../open-sse/mcp-server/audit");
  const { searchParams } = new URL(request.url);
  const result = await queryAuditEntries({
    limit: Number(searchParams.get("limit") || 50),
    offset: Number(searchParams.get("offset") || 0),
    tool: searchParams.get("tool") || undefined,
    success: parseBoolean(searchParams.get("success")),
    apiKeyId: searchParams.get("apiKeyId") || undefined,
  });

  return NextResponse.json(result);
}
