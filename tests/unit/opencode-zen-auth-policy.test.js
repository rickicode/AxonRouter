import { describe, expect, it } from "vitest";
import { isFatalAuthError } from "../../open-sse/services/accountFallback.js";

describe("OpenCode Zen credential policy", () => {
  it("keeps billing/model entitlement 401s model-scoped", () => {
    expect(isFatalAuthError(401, "No payment method. Add a payment method")).toBe(true);
    expect(isFatalAuthError(401, "Model is not supported for this workspace")).toBe(true);
  });

  it("still identifies explicit invalid API keys as fatal", () => {
    expect(isFatalAuthError(401, "Invalid API key")).toBe(true);
    expect(isFatalAuthError(401, "invalid_grant: refresh token revoked")).toBe(true);
  });
});
