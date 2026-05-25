import { NextResponse } from "next/server";

type InvokeRequestBody = {
  tool?: string;
  input?: Record<string, unknown>;
};

type BasicHandlersModule = typeof import("../../../../../open-sse/mcp-server/handlers/basic");
type McpServerModule = typeof import("../../../../../open-sse/mcp-server/server");

async function loadBasicHandlers(): Promise<BasicHandlersModule> {
  return import("../../../../../open-sse/mcp-server/handlers/basic");
}

async function loadMcpServer(): Promise<McpServerModule> {
  return import("../../../../../open-sse/mcp-server/server");
}

function readApiKey(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-api-key") || "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as InvokeRequestBody;
    const apiKey = readApiKey(request);
    const { resolveCallerFromKey } = await loadBasicHandlers();
    const apiKeyRecord = await resolveCallerFromKey(apiKey);
    const { invokeTool } = await loadMcpServer();
    const result = await invokeTool(body?.tool, body?.input || {}, {
      origin: new URL(request.url).origin,
      transport: "http",
      apiKeyRecord,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
