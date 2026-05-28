import { describe, expect, it, vi, beforeEach } from "vitest";

const createProviderConnection = vi.fn(async (data) => ({ id: "conn-freebuff", ...data }));
const getProviderConnections = vi.fn(async () => []);
const updateProviderConnection = vi.fn(async (id, data) => ({ id, ...data }));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: any, init?: any) => ({
      status: init?.status || 200,
      body,
      json: async () => body,
    }),
  },
}));

vi.mock("@/lib/localDb", () => ({
  createProviderConnection,
  getProviderConnections,
  updateProviderConnection,
}));

describe("Freebuff provider wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    createProviderConnection.mockClear();
    getProviderConnections.mockClear();
    updateProviderConnection.mockClear();
  });

  it("registers Freebuff as an API-key provider with metadata support", async () => {
    const { FREE_TIER_PROVIDERS, resolveProviderId } = await import("../../src/shared/constants/providers.ts");

    expect(FREE_TIER_PROVIDERS.freebuff).toMatchObject({
      id: "freebuff",
      alias: "fb",
      name: "Freebuff",
      hasProviderSpecificData: true,
    });
    expect(resolveProviderId("fb")).toBe("freebuff");
  });

  it("imports multiple Freebuff accounts with distinct names and metadata", async () => {
    const { POST: importPOST } = await import("../../src/app/api/credentials/import/route.ts");

    const response = await importPOST(new Request("http://localhost/api/credentials/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "universal-credentials",
        entries: [
          {
            provider: "freebuff",
            authType: "apikey",
            name: "Freebuff A",
            apiKey: "token-a",
            providerSpecificData: {
              fingerprint: "fp-a",
              accountId: "acct-a",
              authMethod: "manual-token",
            },
          },
          {
            provider: "freebuff",
            authType: "apikey",
            name: "Freebuff B",
            apiKey: "token-b",
            providerSpecificData: {
              fingerprint: "fp-b",
              accountId: "acct-b",
              authMethod: "import-session",
            },
          },
        ],
      }),
    }));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      created: 2,
      updated: 0,
      imported: 2,
    });

    expect(createProviderConnection).toHaveBeenCalledTimes(2);
    expect(createProviderConnection).toHaveBeenNthCalledWith(1, expect.objectContaining({
      provider: "freebuff",
      authType: "apikey",
      name: "Freebuff A",
      apiKey: "token-a",
      providerSpecificData: expect.objectContaining({
        fingerprint: "fp-a",
        accountId: "acct-a",
        authMethod: "manual-token",
      }),
    }));
    expect(createProviderConnection).toHaveBeenNthCalledWith(2, expect.objectContaining({
      provider: "freebuff",
      authType: "apikey",
      name: "Freebuff B",
      apiKey: "token-b",
      providerSpecificData: expect.objectContaining({
        fingerprint: "fp-b",
        accountId: "acct-b",
        authMethod: "import-session",
      }),
    }));
  });
});
