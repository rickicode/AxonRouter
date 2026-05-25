import { NextResponse } from "next/server";
import { markHttpTransportActive } from "../../../../../open-sse/mcp-server/runtimeHeartbeat";
import { MCP_TOOLS } from "../../../../../open-sse/mcp-server/schemas/tools";
import { extractApiKey, hasApiKeys, isValidApiKey } from "@/sse/services/apiKeyAuth";

type McpServerModule = typeof import("../../../../../open-sse/mcp-server/server");

async function loadMcpServer(): Promise<McpServerModule> {
  return import("../../../../../open-sse/mcp-server/server");
}

function toMcpTool(tool: any) {
  return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
}

function jsonRpcOk(id: any, result: any) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function checkAuth(request: Request) {
  if (!(await hasApiKeys())) return null;
  const apiKey = extractApiKey(request);
  if (!apiKey) return NextResponse.json(jsonRpcError(null, -32000, "Missing API key"), { status: 401 });
  if (!(await isValidApiKey(apiKey))) return NextResponse.json(jsonRpcError(null, -32000, "Invalid API key"), { status: 401 });
  return null;
}

export async function POST(request: Request) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  markHttpTransportActive("streamable-http", 0);

  const body = await request.json().catch(() => ({}));
  const { id, method, params } = body;
  const origin = new URL(request.url).origin;

  if (method === "initialize") {
    return NextResponse.json(jsonRpcOk(id, {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "axonrouter-mcp", version: "0.5.4" },
      capabilities: { tools: { listChanged: false } },
    }));
  }

  if (method === "initialized" || method === "notifications/initialized") {
    return new Response(null, { status: 204 });
  }

  if (method === "tools/list") {
    return NextResponse.json(jsonRpcOk(id, { tools: MCP_TOOLS.map(toMcpTool) }));
  }

  if (method === "tools/call") {
    const { invokeTool } = await loadMcpServer();
    const result = await invokeTool(params?.name, params?.arguments || {}, {
      origin,
      transport: "streamable-http",
      apiKeyRecord: null,
    });

    const content = result?.ok === false
      ? [{ type: "text", text: result.error || "Tool call failed" }]
      : [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }];

    return NextResponse.json(jsonRpcOk(id, { content, isError: result?.ok === false }));
  }

  if (method === "ping") {
    return NextResponse.json(jsonRpcOk(id, {}));
  }

  return NextResponse.json(jsonRpcError(id, -32601, `Method not found: ${method}`), { status: 404 });
}
