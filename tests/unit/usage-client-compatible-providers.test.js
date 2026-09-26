import { describe, it, expect, beforeEach, vi } from "vitest";

// Custom compatible nodes (openai-compatible-* / anthropic-compatible-*) do NOT
// have upstream quota APIs and must not appear in the Quota Tracker (/api/providers/client).
// Only providers with usage tracking features in USAGE_SUPPORTED_PROVIDERS /
// USAGE_APIKEY_PROVIDERS should be passed to the repo queries.

const mocks = vi.hoisted(() => ({
  getClientUsageMeta: vi.fn(),
  getClientUsageConnections: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: vi.fn(async () => null),
  getClientUsageMeta: mocks.getClientUsageMeta,
  getClientUsageConnections: mocks.getClientUsageConnections,
}));

vi.mock("@/lib/oauth/providers", () => ({
  backfillCodexEmails: vi.fn(async () => {}),
  backfillCodeBuddyIntlIdentity: vi.fn(async () => {}),
}));

const { GET } = await import("@/app/api/providers/client/route.js");

function fakeRepoResults() {
  mocks.getClientUsageMeta.mockResolvedValue({
    providers: ["claude"],
    eligibleCount: 1,
    statusCounts: { total: 1, active: 1, exhausted: 0, unavailable: 0, disabled: 0 },
  });
  mocks.getClientUsageConnections.mockResolvedValue({
    total: 1,
    connections: [{ id: "c1", provider: "claude", authType: "oauth" }],
  });
}

async function callClient() {
  const res = await GET(new Request("http://localhost/api/providers/client"));
  expect(res.status).toBe(200);
  return res.json();
}

describe("usage client route: custom compatible providers exclusion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRepoResults();
  });

  it("does NOT include compatible node ids in supported or apikey lists passed to repo", async () => {
    await callClient();

    const excludedCompat = [
      "openai-compatible-chat-omop",
      "openai-compatible-responses-relay",
      "anthropic-compatible-proxy",
    ];

    for (const repoMock of [mocks.getClientUsageMeta, mocks.getClientUsageConnections]) {
      const call = repoMock.mock.calls[0][0];
      for (const id of excludedCompat) {
        expect(call.supportedProviders).not.toContain(id);
        expect(call.apiKeyProviders).not.toContain(id);
      }
    }
  });

  it("keeps the static registry lists intact", async () => {
    await callClient();
    const call = mocks.getClientUsageMeta.mock.calls[0][0];
    expect(call.supportedProviders).toContain("claude");
  });

  it("surfaces repo statusCounts and connections to the dashboard payload", async () => {
    const body = await callClient();
    expect(body.statusCounts).toEqual({ total: 1, active: 1, exhausted: 0, unavailable: 0, disabled: 0 });
    expect(body.providerOptions).toContain("claude");
    expect(body.connections[0].provider).toBe("claude");
  });
});
