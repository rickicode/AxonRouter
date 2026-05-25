import { NextResponse } from "next/server";

async function probeProtocol(origin, path, options = undefined) {
  try {
    const res = await fetch(`${origin}${path}`, { cache: "no-store", ...(options || {}) });
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

export async function GET(request) {
  const origin = new URL(request.url).origin;
  const [mcpStatus, mcpTools, mcpInvoke, a2aHandshake, a2aMessage] = await Promise.all([
    probeProtocol(origin, "/api/mcp/status"),
    probeProtocol(origin, "/api/mcp/tools"),
    probeProtocol(origin, "/api/mcp/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "axonrouter_get_health", input: {} }),
    }),
    probeProtocol(origin, "/api/protocols/a2a/handshake"),
    probeProtocol(origin, "/api/protocols/a2a/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "healthcheck", message: "ping" }),
    }),
  ]);

  const mcpOnline = mcpStatus.ok && mcpTools.ok && mcpInvoke.ok;
  const mcpJson = mcpStatus.json || {};

  return NextResponse.json({
    protocols: [
      {
        id: "mcp",
        label: "MCP",
        status: mcpOnline ? (mcpJson.online ? "online" : "offline") : "degraded",
        transport: [mcpJson.transport || "stdio", "sse", "streamable-http"],
        capabilities: ["tool-schema", "tool-invocation-mapping", "audit", "runtime-status"],
        handshake: mcpStatus.ok ? "ok" : "degraded",
        runtimeFlow: mcpInvoke.ok ? "ok" : "degraded",
        toolCount: mcpJson.toolCount || (mcpTools.json?.tools || []).length || 0,
      },
      {
        id: "a2a",
        label: "A2A",
        status: a2aHandshake.ok && a2aMessage.ok ? "staging" : "planned",
        transport: ["http", "sse"],
        capabilities: ["agent-message-envelope", "streaming-handshake"],
        handshake: a2aHandshake.ok ? "ok" : "degraded",
        runtimeFlow: a2aMessage.ok ? "ok" : "degraded",
      },
    ],
  }, { headers: { "Cache-Control": "no-store" } });
}
