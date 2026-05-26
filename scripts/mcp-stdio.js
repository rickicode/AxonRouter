#!/usr/bin/env node

import readline from "node:readline";

const DEFAULT_BASE_URL = process.env.AXONROUTER_MCP_BASE_URL || "http://127.0.0.1:12711";
const MCP_STREAM_URL = new URL("/api/mcp/stream", DEFAULT_BASE_URL).toString();
const MCP_TOOLS_URL = new URL("/api/mcp/tools", DEFAULT_BASE_URL).toString();
const SERVER_INFO = { name: "axonrouter", version: "0.5.4" };

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message, data = undefined) {
  send({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } });
}

function coreNotRunningError(detail = "") {
  const suffix = detail ? `\nDetail: ${detail}` : "";
  return new Error(
    `AxonRouter core is not reachable at ${DEFAULT_BASE_URL}. Start it first with: axonrouter${suffix}`
  );
}

async function fetchTools() {
  let response;
  try {
    response = await fetch(MCP_TOOLS_URL, { cache: "no-store" });
  } catch (error) {
    throw coreNotRunningError(error?.message || String(error));
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch MCP tools (${response.status})`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.tools) ? payload.tools : [];
}

async function invokeHttpTool(name, args) {
  let response;
  try {
    response = await fetch(MCP_STREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name,
          arguments: args || {},
        },
      }),
    });
  } catch (error) {
    throw coreNotRunningError(error?.message || String(error));
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Tool call failed (${response.status}): ${text || response.statusText}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(payload.error.message || "Tool call failed");
  }

  return payload?.result || {};
}

async function main() {
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
          serverInfo: SERVER_INFO,
          capabilities: { tools: { listChanged: false } },
        });
        return;
      }

      if (method === "initialized" || method === "notifications/initialized") {
        return;
      }

      if (method === "tools/list") {
        const tools = await fetchTools();
        ok(id, { tools });
        return;
      }

      if (method === "tools/call") {
        const result = await invokeHttpTool(params?.name, params?.arguments || {});
        ok(id, result);
        return;
      }

      if (method === "ping") {
        ok(id, {});
        return;
      }

      fail(id, -32601, `Method not found: ${method}`);
    } catch (error) {
      fail(id, -32000, error?.message || String(error));
    }
  });

  const shutdown = () => {
    rl.close();
  };

  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  rl.on("close", () => {
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("[axonrouter:mcp] Failed to start stdio bridge:", error);
  process.exit(1);
});
