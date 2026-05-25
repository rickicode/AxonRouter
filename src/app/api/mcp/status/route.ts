import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentSettings } from "@/lib/settingsAccess";
import {
  getHttpTransportState,
  isMcpHeartbeatOnline,
  readMcpHeartbeat,
  resolveMcpHeartbeatPath,
} from "../../../../../open-sse/mcp-server/runtimeHeartbeat";
import { MCP_TOOLS } from "../../../../../open-sse/mcp-server/schemas/tools";

type SettingsWithMcp = {
  mcpTransport?: string;
  mcpEnabled?: boolean;
};

type McpAuditModule = typeof import("../../../../../open-sse/mcp-server/audit");

async function loadMcpAudit(): Promise<McpAuditModule> {
  return import("../../../../../open-sse/mcp-server/audit");
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { getAuditStats } = await loadMcpAudit();
    const [settings, heartbeat] = await Promise.all([
      getCurrentSettings() as Promise<SettingsWithMcp | null | undefined>,
      readMcpHeartbeat(),
    ]);
    const audit = await getAuditStats();
    const http = getHttpTransportState();
    const stdioOnline = isMcpHeartbeatOnline(heartbeat);
    const transport = settings?.mcpTransport || "stdio";
    const online = transport === "stdio" ? stdioOnline : !!http.online;

    return NextResponse.json(
      {
        status: online ? "online" : "offline",
        online,
        enabled: settings?.mcpEnabled !== false,
        transport,
        toolCount: MCP_TOOLS.length,
        heartbeatPath: resolveMcpHeartbeatPath(),
        heartbeat,
        httpTransport: http,
        activity: audit,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
