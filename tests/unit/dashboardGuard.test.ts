// tests/unit/dashboardGuard.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock dependencies
vi.mock("@/lib/security/ipValidator", () => ({
  isLocalRequest: vi.fn(),
  getClientIP: vi.fn()
}));

vi.mock("@/lib/localDb", () => ({
  getSettings: vi.fn()
}));

import { proxy } from "../../src/dashboardGuard.ts";
import { isLocalRequest, getClientIP } from "@/lib/security/ipValidator";
import { getSettings } from "@/lib/localDb";

describe("Dashboard Guard - IP Validation", () => {
  it("allows localhost access to ALWAYS_PROTECTED paths", async () => {
    isLocalRequest.mockReturnValue(true);
    getSettings.mockResolvedValue({});

    const mockRequest = {
      nextUrl: { pathname: "/api/shutdown" },
      headers: { get: () => "localhost" },
      cookies: { get: () => null }
    };

    const response = await proxy(mockRequest);
    expect(response.status).not.toBe(401);
  });

  it("denies remote access to ALWAYS_PROTECTED paths", async () => {
    isLocalRequest.mockReturnValue(false);
    getSettings.mockResolvedValue({});

    const mockRequest = {
      nextUrl: { pathname: "/api/shutdown" },
      headers: { get: () => "example.com" },
      cookies: { get: () => null }
    };

    const response = await proxy(mockRequest);
    expect(response.status).toBe(401);
  });

  it("denies remote update triggers without a session token", async () => {
    isLocalRequest.mockReturnValue(false);
    getSettings.mockResolvedValue({});

    const mockRequest = {
      nextUrl: { pathname: "/api/version/update" },
      headers: { get: () => "example.com" },
      cookies: { get: () => null }
    };

    const response = await proxy(mockRequest);
    expect(response.status).toBe(401);
  });

  it("uses IP validator instead of Host header", async () => {
    getClientIP.mockReturnValue("192.168.1.100");
    isLocalRequest.mockReturnValue(false);
    getSettings.mockResolvedValue({});

    const mockRequest = {
      nextUrl: { pathname: "/api/settings" },
      headers: { get: (name) => name === "host" ? "localhost" : null },
      cookies: { get: () => null }
    };

    await proxy(mockRequest);
    
    // Verify IP validator was called, not Host header check
    expect(isLocalRequest).toHaveBeenCalled();
  });
});

vi.mock("@/lib/security/auditLog", () => ({
  auditLog: {
    log: vi.fn()
  }
}));

import { auditLog } from "@/lib/security/auditLog";

describe("Dashboard Guard - Audit Logging", () => {
  it("logs auth bypass attempts", async () => {
    isLocalRequest.mockReturnValue(false);
    getClientIP.mockReturnValue("192.168.1.100");
    getSettings.mockResolvedValue({ auditLogEnabled: true });

    const mockRequest = {
      nextUrl: { pathname: "/api/shutdown" },
      headers: { get: () => "example.com" },
      cookies: { get: () => null }
    };

    await proxy(mockRequest);
    
    expect(auditLog.log).toHaveBeenCalledWith(
      "auth_bypass_attempt",
      expect.objectContaining({
        ip: "192.168.1.100",
        path: "/api/shutdown",
        allowed: false
      })
    );
  });

  it("logs successful localhost bypass", async () => {
    isLocalRequest.mockReturnValue(true);
    getClientIP.mockReturnValue("127.0.0.1");
    getSettings.mockResolvedValue({ auditLogEnabled: true });

    const mockRequest = {
      nextUrl: { pathname: "/api/settings" },
      headers: { get: () => "localhost" },
      cookies: { get: () => null }
    };

    await proxy(mockRequest);
    
    expect(auditLog.log).toHaveBeenCalledWith(
      "auth_bypass_attempt",
      expect.objectContaining({
        ip: "127.0.0.1",
        path: "/api/settings",
        allowed: true,
        reason: "localhost_whitelist"
      })
    );
  });
});

describe("Dashboard Guard - Integration Tests", () => {
  it("requires auth for protected API routes without a session token", async () => {
    isLocalRequest.mockReturnValue(false);
    getClientIP.mockReturnValue("203.0.113.5");
    getSettings.mockResolvedValue({
      auditLogEnabled: true
    });

    const mockRequest = {
      nextUrl: { pathname: "/api/settings" },
      url: "http://example.com/api/settings",
      headers: { get: () => "example.com" },
      cookies: { get: () => null }
    };

    const response = await proxy(mockRequest);
    expect(response.status).toBe(401);
  });

  it("end-to-end: localhost access allowed", async () => {
    isLocalRequest.mockReturnValue(true);
    getClientIP.mockReturnValue("127.0.0.1");
    getSettings.mockResolvedValue({ 
      auditLogEnabled: true,
      ipWhitelist: ["127.0.0.1"]
    });

    const mockRequest = {
      nextUrl: { pathname: "/app" },
      url: "http://localhost:12711/dashboard",
      headers: { get: () => "localhost" },
      cookies: { get: () => null }
    };

    const response = await proxy(mockRequest);
    expect(response.status).not.toBe(401);
  });

  it("end-to-end: remote access denied without JWT", async () => {
    isLocalRequest.mockReturnValue(false);
    getClientIP.mockReturnValue("203.0.113.5");
    getSettings.mockResolvedValue({ 
      auditLogEnabled: true
    });

    const mockRequest = {
      nextUrl: { pathname: "/app" },
      url: "http://example.com/dashboard",
      headers: { get: () => "example.com" },
      cookies: { get: () => null }
    };

    const response = await proxy(mockRequest);
    expect(response.status).toBe(307); // NextResponse.redirect uses 307
  });

  it("allows remote access to /api/settings/require-login without JWT", async () => {
    isLocalRequest.mockReturnValue(false);
    getClientIP.mockReturnValue("203.0.113.5");
    getSettings.mockResolvedValue({});

    const mockRequest = {
      nextUrl: { pathname: "/api/settings/require-login" },
      url: "http://example.com/api/settings/require-login",
      headers: { get: () => "example.com" },
      cookies: { get: () => null }
    };

    const response = await proxy(mockRequest);
    expect(response.status).not.toBe(401);
  });
});
