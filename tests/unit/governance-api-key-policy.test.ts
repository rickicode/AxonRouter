import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSettings = vi.fn();
const getCurrentProviderConnections = vi.fn();
const updateCurrentProviderConnection = vi.fn();
const getApiKeys = vi.fn();

vi.mock("@/lib/settingsAccess", () => ({
  getCurrentSettings,
  getCurrentProviderConnections,
  updateCurrentProviderConnection,
}));

vi.mock("@/lib/localDb", () => ({
  getApiKeys,
  getProviderConnections: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/shared/constants/providers", () => ({
  FREE_PROVIDERS: {},
  resolveProviderId: (provider: string) => provider,
}));

describe("governance apiKeyPolicies enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentProviderConnections.mockResolvedValue([]);
    updateCurrentProviderConnection.mockResolvedValue(null);
  });

  it("blocks a provider when the caller API key policy disallows it", async () => {
    getCurrentSettings.mockResolvedValue({
      governance: {
        enabled: true,
        allowedProviders: [],
        monthlyBudgetCapUsd: 0,
        apiKeyPolicies: {
          "key-record-1": {
            allowedProviders: ["anthropic"],
            monthlyBudgetCapUsd: 0,
          },
        },
      },
    });
    getApiKeys.mockResolvedValue([
      { id: "key-record-1", key: "sk-test-123", isActive: true },
    ]);

    const { getProviderCredentials } = await import("../../src/sse/services/auth.tsx");
    const result = await getProviderCredentials(
      "openai",
      null,
      "gpt-4.1",
      null,
      { requestApiKey: "sk-test-123" }
    );

    expect(result).toMatchObject({
      deniedByGovernance: true,
      reasonCode: "provider_not_allowed",
    });
  });

  it("does not apply apiKeyPolicies when the caller API key is absent", async () => {
    getCurrentSettings.mockResolvedValue({
      governance: {
        enabled: true,
        allowedProviders: [],
        monthlyBudgetCapUsd: 0,
        apiKeyPolicies: {
          "key-record-1": {
            allowedProviders: ["anthropic"],
            monthlyBudgetCapUsd: 0,
          },
        },
      },
    });
    getApiKeys.mockResolvedValue([
      { id: "key-record-1", key: "sk-test-123", isActive: true },
    ]);

    const { evaluateGovernancePolicy } = await import("../../src/lib/governance/policy.ts");
    const result = await evaluateGovernancePolicy({
      settings: await getCurrentSettings(),
      providerId: "openai",
      apiKey: null,
    });

    expect(result).toEqual({ allowed: true, reasonCode: null, reasonDetail: null });
  });
});
