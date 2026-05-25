import { beforeEach, describe, expect, it, vi } from "vitest";

const writeMcpHeartbeat = vi.fn(async () => {});

vi.mock("../../open-sse/mcp-server/runtimeHeartbeat.ts", () => ({
  writeMcpHeartbeat,
}));

describe("stdio MCP server helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes heartbeat with stdio transport metadata", async () => {
    const { startHeartbeatLoop } = await import("../../open-sse/mcp-server/stdioServer.ts");
    const stop = startHeartbeatLoop({ toolCount: 1, scopes: ["read:health"] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    expect(writeMcpHeartbeat).toHaveBeenCalled();
    expect(writeMcpHeartbeat.mock.calls[0][0].transport).toBe("stdio");
    expect(writeMcpHeartbeat.mock.calls[0][0].allowedScopes).toEqual(["read:health"]);
  });
});
