import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(async () => []),
  getProviderConnectionById: vi.fn(async () => null),
  getBatchProviderQuotas: vi.fn(async () => []),
  getUsageSnapshotByConnectionId: vi.fn(async () => null),
  getSettings: vi.fn(async () => ({})),
  getProxyPools: vi.fn(async () => []),
  validateApiKey: vi.fn(async () => null),
  updateProviderConnection: vi.fn(async () => ({})),
}));
vi.mock("@/lib/cache/client.js", () => ({
  setAccountCooldown: vi.fn(async () => true),
  isAccountInCooldown: vi.fn(async () => false),
  setModelCooldown: vi.fn(async () => true),
  isModelInCooldown: vi.fn(async () => false),
  getBatchCooldowns: vi.fn(async () => new Set()),
  getCachedConnections: vi.fn(async () => null),
  setCachedConnections: vi.fn(async () => {}),
  invalidateCachedConnections: vi.fn(async () => {}),
  getLkg: vi.fn(async () => null),
  setLkg: vi.fn(async () => true),
  delLkg: vi.fn(async () => true),
  getDeadCircuit: vi.fn(async () => 0),
  incrDeadCircuit: vi.fn(async () => 1),
  resetDeadCircuit: vi.fn(async () => true),
}));
vi.mock("@/shared/constants/providers.js", () => ({
  FREE_PROVIDERS: {},
  resolveProviderId: (p) => p,
}));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
  pickProxyPoolId: vi.fn(() => null),
}));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));
vi.mock("open-sse/services/usage/google.js", () => ({ getAntigravityUsage: vi.fn() }));
vi.mock("open-sse/services/usage/freebuff.js", () => ({
  getFreebuffQuotaCache: vi.fn(() => new Map()),
  handleFreebuffQuotaError: vi.fn(async () => null),
}));
vi.mock("open-sse/executors/freebuff.js", () => ({
  canonicalFreebuffModel: (m) => m,
  FreebuffExecutor: class {},
}));

const { extractValidationUrl } = await import("../../src/sse/services/auth.js");

describe("extractValidationUrl", () => {
  it("parses Google RPC ErrorInfo details[].metadata.validation_url", () => {
    const err = JSON.stringify({
      error: {
        code: 403,
        message: "Verification required",
        status: "PERMISSION_DENIED",
        details: [{
          reason: "VALIDATION_REQUIRED",
          metadata: { validation_url: "https://accounts.google.com/verify/v1" },
        }],
      },
    });
    expect(extractValidationUrl(err)).toEqual({
      url: "https://accounts.google.com/verify/v1",
      message: "Verification required",
    });
  });

  it("finds deeply nested validationUrl (proxy-wrapped bodies)", () => {
    const err = JSON.stringify({
      status: 403,
      data: { response: { error: { info: { validationUrl: "https://verify.example/new-url" } } } },
    });
    expect(extractValidationUrl(err)?.url).toBe("https://verify.example/new-url");
  });

  it("prefers the validation key over a docs URL in message text", () => {
    const err = JSON.stringify({
      error: {
        message: "See https://docs.example.com/auth for details",
        metadata: { validation_url: "https://verify.example/real" },
      },
    });
    expect(extractValidationUrl(err)?.url).toBe("https://verify.example/real");
  });

  it("falls back to key=value regex form", () => {
    expect(extractValidationUrl('403 ... validation_url="https://verify.example/rx" ...')?.url)
      .toBe("https://verify.example/rx");
  });

  it("falls back to a bare verification URL in human text", () => {
    expect(extractValidationUrl("Action required: visit https://verify.example/act-9 to verify your account")?.url)
      .toBe("https://verify.example/act-9");
  });

  it("extracts a real Google signin/continue validation link (no marker in URL)", () => {
    const err = "Action required (VALIDATION_REQUIRED): complete verification to continue: " +
      "https://accounts.google.com/signin/continue?sarp=1&scc=1&continue=https://developers.google.com/gemini-code-assist/auth/auth_success_gemini&plt=AKgnsbvN7j5uYJKIs5joyNBbas4DLifq0o4aEp75Uf1GI3Hs0kWGxe8o-XTFxXccJlJXWx0e5SHxc3Fjnp1UExqrztj6ZzXlZaERV6-bKxalB5atNAS0-PQXpoPR7OaWstsSY8gMWMRr&flowName=GlifWebSignIn&authuser";
    const got = extractValidationUrl(err)?.url;
    expect(got).toContain("accounts.google.com/signin/continue");
    expect(got).toContain("flowName=GlifWebSignIn");
  });

  it("returns null when no action-required marker exists", () => {
    expect(extractValidationUrl("429 quota exceeded, retry later")).toBe(null);
    expect(extractValidationUrl("")).toBe(null);
    expect(extractValidationUrl(null)).toBe(null);
  });

  it("rejects non-URL validation values", () => {
    expect(extractValidationUrl(JSON.stringify({ error: { metadata: { validation_url: 12345 } } }))).toBe(null);
  });
  it("extracts validation URL from Google 403 rawBody with details and metadata", () => {
    const rawBody = JSON.stringify({
      error: {
        code: 403,
        message: "Verify your account to continue.",
        status: "PERMISSION_DENIED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "VALIDATION_REQUIRED",
            domain: "cloudcode-pa.googleapis.com",
            metadata: {
              validation_error_message: "Verify your account to continue.",
              validation_url: "https://accounts.google.com/signin/continue?test=123"
            }
          }
        ]
      }
    });
    const res = extractValidationUrl(rawBody);
    expect(res).toBeTruthy();
    expect(res.url).toBe("https://accounts.google.com/signin/continue?test=123");
    expect(res.message).toBe("Verify your account to continue.");
  });
});
