import { describe, it, expect, beforeEach, vi } from "vitest";

// Custom compatible nodes (openai-compatible-* / anthropic-compatible-*) have
// dynamic ids that can never be in the static USAGE_SUPPORTED_PROVIDERS /
// USAGE_APIKEY_PROVIDERS lists. The Usage → ProviderLimits page must still
// list those connections with their live status (active/exhausted/unavailable/
// disabled). Regression: the route used to pass only the static lists, so
// getClientUsageMeta/getClientUsageConnections filtered every custom node out
// (invisible connections, statusCounts stuck at 0).

const mocks = vi.hoisted(() => ({
  getClientUsageMeta: vi.fn(),
  getClientUsageConnections: vi.fn(),
  getProviderNodes: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: vi.fn(async () => null),
  getClientUsageMeta: mocks.getClientUsageMeta,
  getClientUsageConnections: mocks.getClientUsageConnections,
  getProviderNodes: mocks.getProviderNodes,
}));

vi.mock("@/lib/oauth/providers", () => ({
  backfillCodexEmails: vi.fn(async () => {}),
  backfillCodeBuddyIntlIdentity: vi.fn(async () => {}),
}));

const { GET } = await import("@/app/api/providers/client/route.js");

function fakeRepoResults() {
  mocks.getClientUsageMeta.mockResolvedValue({
    providers: ["claude", "openai-compatible-chat-omop"],
    eligibleCount: 2,
    statusCounts: { total: 2, active: 1, exhausted: 1, unavailable: 0, disabled: 0 },
  });
  mocks.getClientUsageConnections.mockResolvedValue({
    total: 1,
    connections: [{ id: "c1", provider: "openai-compatible-chat-omop", authType: "apikey" }],
  });
}

async function callClient() {
  const res = await GET(new Request("http://localhost/api/providers/client"));
  expect(res.status).toBe(200);
  return res.json();
}

describe("usage client route: compatible provider nodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRepoResults();
    mocks.getProviderNodes.mockResolvedValue([
      { id: "openai-compatible-chat-omop", type: "openai-compatible" },
      { id: "openai-compatible-responses-relay", type: "openai-compatible" },
      { id: "anthropic-compatible-proxy", type: "anthropic-compatible" },
      { id: "custom-embedding-vec", type: "custom-embedding" },
    ]);
  });

  it("includes LLM compatible node ids in supported AND apikey lists passed to the repo", async () => {
    await callClient();

    const expectedCompat = [
      "openai-compatible-chat-omop",
      "openai-compatible-responses-relay",
      "anthropic-compatible-proxy",
    ];

    for (const repoMock of [mocks.getClientUsageMeta, mocks.getClientUsageConnections]) {
      const call = repoMock.mock.calls[0][0];
      for (const id of expectedCompat) {
        expect(call.supportedProviders).toContain(id);
        expect(call.apiKeyProviders).toContain(id);
      }
    }
  });

  it("excludes custom-embedding nodes (not LLM providers) from the lists", async () => {
    await callClient();
    const call = mocks.getClientUsageMeta.mock.calls[0][0];
    expect(call.supportedProviders).not.toContain("custom-embedding-vec");
  });

  it("keeps the static registry lists intact alongside the node ids", async () => {
    await callClient();
    const call = mocks.getClientUsageMeta.mock.calls[0][0];
    // Spot-check a built-in usage provider survives the merge.
    expect(call.supportedProviders).toContain("claude");
    expect(call.supportedProviders.length).toBeGreaterThan(
      ["openai-compatible-chat-omop", "openai-compatible-responses-relay", "anthropic-compatible-proxy"].length,
    );
  });

  it("falls back to the static lists when node lookup fails", async () => {
    mocks.getProviderNodes.mockRejectedValue(new Error("db down"));
    const body = await callClient();
    expect(body.connections).toHaveLength(1);
    const call = mocks.getClientUsageMeta.mock.calls[0][0];
    expect(call.supportedProviders).not.toContain("openai-compatible-chat-omop");
    expect(call.apiKeyProviders).not.toContain("openai-compatible-chat-omop");
  });

  it("returns no node ids when no compatible nodes exist", async () => {
    mocks.getProviderNodes.mockResolvedValue([{ id: "custom-embedding-vec", type: "custom-embedding" }]);
    await callClient();
    const call = mocks.getClientUsageConnections.mock.calls[0][0];
    expect(call.supportedProviders.filter((id) => id.startsWith("openai-compatible") || id.startsWith("anthropic-compatible"))).toEqual([]);
  });

  it("surfaces repo statusCounts and connections to the dashboard payload", async () => {
    const body = await callClient();
    expect(body.statusCounts).toEqual({ total: 2, active: 1, exhausted: 1, unavailable: 0, disabled: 0 });
    expect(body.providerOptions).toContain("openai-compatible-chat-omop");
    expect(body.connections[0].provider).toBe("openai-compatible-chat-omop");
  });
});
