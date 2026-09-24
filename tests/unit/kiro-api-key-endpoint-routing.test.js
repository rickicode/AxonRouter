import { describe, expect, it } from "vitest";
import { KiroExecutor } from "../../open-sse/executors/kiro.js";

const RUNTIME = "https://runtime.us-east-1.kiro.dev/generateAssistantResponse";
const CODEWHISPERER = "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse";
const Q = "https://q.us-east-1.amazonaws.com/generateAssistantResponse";

function credentials(authMethod, region = "us-east-1") {
  return { providerSpecificData: { authMethod, region } };
}

describe("Kiro auth-aware endpoint routing", () => {
  const executor = new KiroExecutor();

  it("routes API-key inference through Amazon Q before other surfaces", () => {
    expect(executor.getOrderedBaseUrls(credentials("api_key"))).toEqual([
      Q,
      CODEWHISPERER,
      RUNTIME,
    ]);
  });

  it("routes Builder ID OAuth through Amazon Q first (runtime path deprecated)", () => {
    expect(executor.getOrderedBaseUrls(credentials("builder-id"))).toEqual([
      Q,
      CODEWHISPERER,
      RUNTIME,
    ]);
  });

  it("routes external IdP through Amazon Q first", () => {
    expect(executor.getOrderedBaseUrls(credentials("external_idp"))).toEqual([
      Q,
      CODEWHISPERER,
      RUNTIME,
    ]);
  });

  it("never sends x-amz-sso-bearer on API-key auth", () => {
    const headers = executor.buildHeaders(
      { apiKey: "KEY-123", accessToken: "KEY-123", providerSpecificData: { authMethod: "api_key" } },
      false, "https://q.us-east-1.amazonaws.com/x");
    expect(headers["Authorization"]).toBe("Bearer KEY-123");
    expect(headers["x-amz-sso-bearer"]).toBeUndefined();
  });

  it("still sends x-amz-sso-bearer on OAuth auth", () => {
    const headers = executor.buildHeaders(
      { accessToken: "tok", providerSpecificData: { authMethod: "builder-id" } },
      false, "https://q.us-east-1.amazonaws.com/x");
    expect(headers["x-amz-sso-bearer"]).toBe("tok");
  });

  it("rejects malformed account regions with a clear error", () => {
    expect(() => executor.getOrderedBaseUrls(
      { providerSpecificData: { authMethod: "builder-id", region: "us-east-1/evil" } }
    )).toThrow(/invalid AWS region/);
    expect(() => executor.getOrderedBaseUrls(
      { providerSpecificData: { authMethod: "builder-id", region: "" } }
    )).not.toThrow();
  });

  it("regionalizes AWS endpoints for IDC with Q first", () => {
    expect(executor.getOrderedBaseUrls(credentials("idc", "eu-west-1"))).toEqual([
      "https://q.eu-west-1.amazonaws.com/generateAssistantResponse",
      "https://codewhisperer.eu-west-1.amazonaws.com/generateAssistantResponse",
      RUNTIME,
    ]);
  });

  it("retries only endpoint/auth-surface failures, not payload-invalid 400s", () => {
    expect(executor.shouldRetry(400, 0)).toBe(false);
    expect(executor.shouldRetry(401, 1)).toBe(true);
    expect(executor.shouldRetry(403, 2)).toBe(false);
    expect(executor.shouldRetry(422, 0)).toBe(false);
  });

  it("builds endpoint-specific headers", () => {
    const auth = { accessToken: "test-key", providerSpecificData: { authMethod: "api_key" } };
    const qHeaders = executor.buildHeaders(auth, true, Q);
    const codeWhispererHeaders = executor.buildHeaders(auth, true, CODEWHISPERER);
    const runtimeHeaders = executor.buildHeaders(auth, true, RUNTIME);

    expect(qHeaders.TokenType).toBe("API_KEY");
    expect(qHeaders["X-Amz-Target"]).toBeUndefined();
    expect(codeWhispererHeaders["X-Amz-Target"]).toBe(
      "AmazonCodeWhispererStreamingService.GenerateAssistantResponse"
    );
    expect(runtimeHeaders["X-Amz-Target"]).toBeUndefined();
  });
});
