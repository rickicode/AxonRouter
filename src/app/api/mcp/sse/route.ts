import { NextResponse } from "next/server";
import { markHttpTransportActive } from "../../../../../open-sse/mcp-server/runtimeHeartbeat";
import { MCP_TOOLS } from "../../../../../open-sse/mcp-server/schemas/tools";
import { extractApiKey, hasApiKeys, isValidApiKey } from "@/sse/services/apiKeyAuth";

type McpServerModule = typeof import("../../../../../open-sse/mcp-server/server");

async function loadMcpServer(): Promise<McpServerModule> {
  return import("../../../../../open-sse/mcp-server/server");
}

function toMcpTool(tool: any) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

function jsonRpcOk(id: any, result: any) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: any, code: number, message: string) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

async function checkAuth(request: Request) {
  if (!(await hasApiKeys())) return null;
  const apiKey = extractApiKey(request);
  if (!apiKey) return NextResponse.json(JSON.parse(jsonRpcError(null, -32000, "Missing API key")), { status: 401 });
  if (!(await isValidApiKey(apiKey))) return NextResponse.json(JSON.parse(jsonRpcError(null, -32000, "Invalid API key")), { status: 401 });
  return null;
}

/**
 * GET /api/mcp/sse — Opens an SSE stream.
 * The server sends an `endpoint` event with the POST URL for client messages.
 */
export async function GET(request: Request): Promise<Response> {
  const authError = await checkAuth(request);
  if (authError) return authError;

  markHttpTransportActive("sse", 1);

  const origin = new URL(request.url).origin;
  const sessionId = crypto.randomUUID();
  const postEndpoint = `${origin}/api/mcp/sse?sessionId=${sessionId}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send the endpoint event per MCP SSE spec
      controller.enqueue(encoder.encode(`event: endpoint\ndata: ${postEndpoint}\n\n`));

      // Keep-alive ping every 30s
      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { clearInterval(keepAlive); }
      }, 30000);

      // Close after 10 minutes max
      setTimeout(() => { clearInterval(keepAlive); try { controller.close(); } catch {} }, 600000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-MCP-Session-Id": sessionId,
    },
  });
}

/**
 * POST /api/mcp/sse — Receives JSON-RPC messages from the client.
 * Returns the result as a JSON-RPC response.
 */
export async function POST(request: Request): Promise<Response> {
  const authError = await checkAuth(request);
  if (authError) return authError;

  markHttpTransportActive("sse", 0);

  const body = await request.json().catch(() => null);
  if (!body || !body.method) {
    return NextResponse.json(JSON.parse(jsonRpcError(body?.id ?? null, -32600, "Invalid request")), { status: 400 });
  }

  const { id, method, params } = body;
  const origin = new URL(request.url).origin;

  if (method === "initialize") {
    return NextResponse.json(JSON.parse(jsonRpcOk(id, {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "axonrouter", version: "0.5.4" },
      capabilities: { tools: { listChanged: false } },
    })));
  }

  if (method === "initialized") {
    return new Response(null, { status: 204 });
  }

  if (method === "tools/list") {
    return NextResponse.json(JSON.parse(jsonRpcOk(id, { tools: MCP_TOOLS.map(toMcpTool) })));
  }

  if (method === "tools/call") {
    const { invokeTool } = await loadMcpServer();
    const result = await invokeTool(params?.name, params?.arguments || {}, {
      origin,
      transport: "sse",
      apiKeyRecord: null,
    });

    const content = result?.ok === false
      ? [{ type: "text", text: result.error || "Tool call failed" }]
      : [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }];

    return NextResponse.json(JSON.parse(jsonRpcOk(id, { content, isError: result?.ok === false })));
  }

  if (method === "ping") {
    return NextResponse.json(JSON.parse(jsonRpcOk(id, {})));
  }

  return NextResponse.json(JSON.parse(jsonRpcError(id, -32601, `Method not found: ${method}`)), { status: 404 });
}
