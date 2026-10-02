import { describe, it, expect, vi } from "vitest";

// The login route must answer a client error for a bad body. bcrypt.compare() with
// a non-string throws "Illegal arguments", which previously surfaced as HTTP 500
// on the login screen.
const noStore = { "Cache-Control": "no-store" };

function req(body) {
  return new Request("http://local/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

vi.mock("@/lib/localDb", () => ({
  getSettings: vi.fn(async () => ({ authMode: "password" })),
  updateSettings: vi.fn(async () => {}),
}));
vi.mock("@/lib/http/headers.js", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/auth/dashboardSession", () => ({
  setDashboardAuthCookie: () => {},
  createDashboardAuthToken: async () => "tok",
  shouldUseSecureCookie: () => false,
}));
vi.mock("@/lib/auth/oidc", () => ({ isOidcConfigured: () => false }));
vi.mock("@/lib/auth/saml.js", () => ({ isSamlConfigured: () => false }));
vi.mock("@/lib/auth/loginLimiter", () => ({
  checkLock: () => ({ locked: false }),
  recordFail: () => ({ remainingBeforeLock: 5 }),
  recordSuccess: () => {},
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/dashboardGuard", () => ({ isLocalRequest: () => true }));

const { POST } = await import("../../src/app/api/auth/login/route.js");

describe("POST /api/auth/login body validation", () => {
  it("rejects a missing password with 400, not 500", async () => {
    const res = await POST(req("{}"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/password is required/i);
  });

  it("rejects a malformed JSON body with 400, not 500", async () => {
    const res = await POST(req("not-json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/malformed json/i);
  });

  it("rejects a non-string password with 400", async () => {
    const res = await POST(req(JSON.stringify({ password: 12345 })));
    expect(res.status).toBe(400);
  });
});
