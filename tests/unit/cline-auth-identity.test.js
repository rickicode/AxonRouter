import { describe, expect, it } from "vitest";

const { buildClineHeaders, getClineAccessToken } = await import("../../open-sse/shared/clineAuth.js");

describe("cline auth identity", () => {
  it("sends cline-cli identity headers (passes free-tier gate)", () => {
    const h = buildClineHeaders("tok123");
    expect(h["X-CLIENT-TYPE"]).toBe("cline-cli");
    expect(h["X-CLIENT-VERSION"]).toBe("3.0.61");
    expect(h["X-CORE-VERSION"]).toBe("3.0.61");
    expect(h["User-Agent"]).toBe("Cline/3.0.61");
  });

  it("prefixes WorkOS JWT tokens with workos:", () => {
    const fakeJwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123";
    const h = buildClineHeaders(fakeJwt);
    expect(h.Authorization).toBe(`Bearer workos:${fakeJwt}`);
  });

  it("sends API keys as plain Bearer (no workos: prefix)", () => {
    const apiKey = "clp_abc123def456";
    const h = buildClineHeaders(apiKey, {}, { isApiKey: true });
    expect(h.Authorization).toBe(`Bearer ${apiKey}`);
  });

  it("sends non-JWT OAuth tokens as plain Bearer via workos: check", () => {
    const nonJwt = "not-a-jwt-token";
    const h = buildClineHeaders(nonJwt);
    // non-JWT → getClineAccessToken returns trimmed value as-is → Bearer
    expect(h.Authorization).toBe(`Bearer ${nonJwt}`);
  });

  it("sets platform as cli", () => {
    const h = buildClineHeaders("tok");
    expect(h["X-PLATFORM"]).toBe("cli");
    expect(h["X-PLATFORM-VERSION"]).toBe("3.0.61");
  });
});
