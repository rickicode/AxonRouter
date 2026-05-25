import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { MCP_TOOLS } from "../../../../../open-sse/mcp-server/schemas/tools";

export async function GET(request: Request): Promise<Response> {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const tools = MCP_TOOLS;
  return NextResponse.json(
    { protocol: "mcp", tools },
    { headers: { "Cache-Control": "no-store" } }
  );
}
