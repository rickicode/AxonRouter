import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { V4 } from "paseto";
import { MANAGEMENT_SESSION_TTL_SECONDS } from "../../src/lib/auth/managementSession";

const keyPair = crypto.generateKeyPairSync("ed25519");

vi.mock("@/lib/settingsAccess", () => ({
  getCurrentSettings: vi.fn(async () => ({ auditLogEnabled: true })),
}));

vi.mock("@/lib/security/ipValidator", () => ({
  getClientIP: vi.fn(() => "127.0.0.1"),
  isLocalRequest: vi.fn(() => false),
}));

vi.mock("@/lib/security/auditLog", () => ({
  auditLog: {
    log: vi.fn(),
  },
}));

vi.mock("@/lib/security/pasetoKeys", () => ({
  getPasetoPrivateKey: vi.fn(() => keyPair.privateKey),
  getPasetoPublicKey: vi.fn(() => keyPair.publicKey),
}));

describe("requireManagementAuth with PASETO", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/api/requireManagementAuth");
  });

  it("accepts valid management token", async () => {
    const { requireManagementAuth } = await import("@/lib/api/requireManagementAuth");
    const token = await V4.sign({ authenticated: true }, keyPair.privateKey, { expiresIn: "3 days" });
    const req = new Request("http://remote.test/api/providers", {
      headers: { cookie: `auth_token=${token}` },
    });

    const result = await requireManagementAuth(req);
    expect(result).toBeNull();
  });

  it("rejects invalid token", async () => {
    const { requireManagementAuth } = await import("@/lib/api/requireManagementAuth");
    const req = new Request("http://remote.test/api/providers", {
      headers: { cookie: "auth_token=invalid-token" },
    });

    const result = await requireManagementAuth(req);
    expect(result?.status).toBe(401);
  });

  it("rejects missing token when localhost bypass does not apply", async () => {
    const { requireManagementAuth } = await import("@/lib/api/requireManagementAuth");
    const req = new Request("http://remote.test/api/providers");

    const result = await requireManagementAuth(req);
    expect(result?.status).toBe(401);
  });
});

vi.mock("next/headers", () => {
  const set = vi.fn();
  return {
    cookies: vi.fn(async () => ({ set })),
    __setCookieSpy: set,
  };
});

vi.mock("@/lib/security/productionConfig", () => ({
  assertProductionConfigReady: vi.fn(),
}));

vi.mock("@/lib/auth/loginSettingsAccess", () => ({
  getLoginSettings: vi.fn(async () => ({ password: "$2a$10$3wS2f8m96V9IIGiDk8x2eecJ3E2NfJfOCf3KeK4D5zMVOsJctH0jW" })),
}));

describe("POST /api/auth/login PASETO cookie", () => {
  it("sets auth cookie with expected flags", async () => {
    const bcrypt = await import("bcryptjs");
    vi.spyOn(bcrypt.default, "compare").mockResolvedValueOnce(true as never);

    const { POST } = await import("../../src/app/api/auth/login/route");
    const headersModule = await import("next/headers");

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "any" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const setSpy = (headersModule as any).__setCookieSpy;
    expect(setSpy).toHaveBeenCalled();
    const [, token, options] = setSpy.mock.calls[0];
    expect(typeof token).toBe("string");
    expect(token.startsWith("v4.public.")).toBe(true);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(MANAGEMENT_SESSION_TTL_SECONDS);
  });
});
