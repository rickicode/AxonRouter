import readline from "node:readline";
import { listTools, invokeTool } from "./server";
import { MCP_SCOPE_PRESETS } from "./scopes";
import { writeMcpHeartbeat } from "./runtimeHeartbeat";

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message, data = undefined) {
  send({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } });
}

function toMcpTool(tool) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      title: tool.name,
      phase: tool.phase,
      auditLevel: tool.auditLevel,
      requiredScopes: tool.requiredScopes || [],
    },
  };
}

export function startHeartbeatLoop({ toolCount, scopes }) {
  let stopped = false;
  const startedAt = new Date().toISOString();

  const tick = async () => {
    if (stopped) return;
    await writeMcpHeartbeat({
      pid: process.pid,
      startedAt,
      lastHeartbeatAt: new Date().toISOString(),
      version: "0.5.4",
      transport: "stdio",
      scopesEnforced: true,
      allowedScopes: scopes,
      toolCount,
    });
  };

  const timer = setInterval(() => {
    void tick();
  }, 5000);
  void tick();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export async function startStdioServer({ origin = process.env.AXONROUTER_MCP_BASE_URL || "http://127.0.0.1:7127", scopes = MCP_SCOPE_PRESETS.full } = {}) {
  const tools = await listTools();
  const stopHeartbeat = startHeartbeatLoop({ toolCount: tools.length, scopes });

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      fail(null, -32700, "Parse error");
      return;
    }

    const { id, method, params } = msg || {};

    try {
      if (method === "initialize") {
        ok(id, {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "axonrouter", version: "0.5.4" },
          capabilities: { tools: { listChanged: false } },
        });
        return;
      }

      if (method === "initialized") {
        return;
      }

      if (method === "tools/list") {
        ok(id, { tools: tools.map(toMcpTool) });
        return;
      }

      if (method === "tools/call") {
        const name = params?.name;
        const args = params?.arguments || {};
        const result = await invokeTool(name, args, {
          origin,
          transport: "stdio",
          apiKeyRecord: { id: "stdio", isActive: true, mcpScopes: scopes },
        });
        if (!result.ok) {
          fail(id, -32000, result.error || "Tool failed", result);
          return;
        }
        ok(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.result, null, 2),
            },
          ],
          structuredContent: result.result,
          isError: false,
        });
        return;
      }

      fail(id, -32601, `Method not found: ${method}`);
    } catch (error) {
      fail(id, -32000, error?.message || String(error));
    }
  });

  const shutdown = () => {
    stopHeartbeat();
    rl.close();
  };

  rl.on("close", () => {
    stopHeartbeat();
    process.exit(0);
  });

  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
