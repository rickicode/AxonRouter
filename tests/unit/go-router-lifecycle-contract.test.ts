import { beforeEach, describe, expect, it, vi } from "vitest";

const managerMock = vi.hoisted(() => ({
  getGoRouterStatus: vi.fn(),
  restartGoRouter: vi.fn(),
  updateGoRouterSettings: vi.fn(),
}));

vi.mock("../../src/lib/goRouter/manager.ts", () => managerMock);
vi.mock("../../src/lib/api/requireManagementAuth.ts", () => ({
  requireManagementAuth: vi.fn(async () => null),
}));

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/go-router", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Go router lifecycle contract", () => {
  beforeEach(() => {
    vi.resetModules();
    managerMock.getGoRouterStatus.mockReset();
    managerMock.restartGoRouter.mockReset();
    managerMock.updateGoRouterSettings.mockReset();
  });

  it("uses AxonRouter defaults and keeps the Go router alternative", async () => {
    const { DEFAULT_GO_ROUTER_SETTINGS, getGoRouterBinaryPath, normalizeGoRouterSettings } = await import(
      "../../src/lib/goRouter/config.ts"
    );

    expect(DEFAULT_GO_ROUTER_SETTINGS).toEqual({
      enabled: false,
      host: "127.0.0.1",
      port: 12778,
    });
    expect(getGoRouterBinaryPath("/home/alice")).toBe("/home/alice/.axonrouter/bin/axonrouter-go-router");
    expect(normalizeGoRouterSettings({ enabled: true, host: "0.0.0.0", port: "12779" })).toMatchObject({
      enabled: true,
      host: "0.0.0.0",
      port: 12779,
      endpointUrl: "http://0.0.0.0:12779/v1",
      mode: "alternative",
    });
  });

  it("dashboard status exposes status, endpoint, settings, and process state", async () => {
    managerMock.getGoRouterStatus.mockResolvedValue({
      enabled: true,
      running: true,
      pid: 42,
      host: "127.0.0.1",
      port: 12778,
      endpointUrl: "http://127.0.0.1:12778/v1",
      binaryPath: "/home/alice/.axonrouter/bin/axonrouter-go-router",
      lastError: null,
    });

    const { GET } = await import("../../src/app/api/go-router/route.ts");
    const response = await GET(new Request("http://localhost/api/go-router"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      enabled: true,
      running: true,
      endpointUrl: "http://127.0.0.1:12778/v1",
      binaryPath: "/home/alice/.axonrouter/bin/axonrouter-go-router",
    });
  });

  it("dashboard settings can enable, disable, and change host or port", async () => {
    managerMock.updateGoRouterSettings.mockResolvedValue({
      enabled: true,
      running: false,
      host: "127.0.0.1",
      port: 12779,
      endpointUrl: "http://127.0.0.1:12779/v1",
    });

    const { PATCH } = await import("../../src/app/api/go-router/route.ts");
    const response = await PATCH(jsonRequest({ enabled: true, host: "127.0.0.1", port: 12779 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(managerMock.updateGoRouterSettings).toHaveBeenCalledWith({
      enabled: true,
      host: "127.0.0.1",
      port: 12779,
    });
    expect(body.endpointUrl).toBe("http://127.0.0.1:12779/v1");
  });

  it("dashboard restart delegates to the lifecycle manager", async () => {
    managerMock.restartGoRouter.mockResolvedValue({
      enabled: true,
      running: true,
      host: "127.0.0.1",
      port: 12778,
      endpointUrl: "http://127.0.0.1:12778/v1",
    });

    const { POST } = await import("../../src/app/api/go-router/restart/route.ts");
    const response = await POST(new Request("http://localhost/api/go-router/restart", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(managerMock.restartGoRouter).toHaveBeenCalledOnce();
    expect(body).toMatchObject({ running: true, endpointUrl: "http://127.0.0.1:12778/v1" });
  });
});
