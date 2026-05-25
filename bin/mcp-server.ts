#!/usr/bin/env node

(async () => {
  try {
    const { startStdioServer } = await import("../open-sse/mcp-server/stdioServer.ts");
    await startStdioServer({});
  } catch (error) {
    console.error("[axonrouter:mcp] Failed to start stdio MCP server:", error);
    process.exit(1);
  }
})();
