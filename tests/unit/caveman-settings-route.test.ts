import { beforeEach, describe, expect, it, vi } from "vitest";

const getSettings = vi.fn();
const updateSettings = vi.fn();
const getUsageWorkerStatus = vi.fn();
const applyOutboundProxyEnv = vi.fn();
const isCloudEnabled = vi.fn();
const syncToCloud = vi.fn();

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      status: init?.status || 200,
      body,
      json: async () => body,
    })),
  },
}));

vi.mock("@/lib/localDb", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSettings,
    updateSettings,
    isCloudEnabled,
  };
});

vi.mock("@/lib/network/outboundProxy", () => ({
  applyOutboundProxyEnv,
}));

vi.mock("@/lib/usageWorker/client", () => ({
  getUsageWorkerClient: () => ({
    getStatus: getUsageWorkerStatus,
  }),
}));

vi.mock("@/lib/cloudSync", () => ({
  syncToCloud,
}));

vi.mock("../../src/lib/api/requireManagementAuth.ts", () => ({
  requireManagementAuth: vi.fn(async () => null),
}));

describe("/api/settings caveman settings", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    isCloudEnabled.mockResolvedValue(false);
    syncToCloud.mockResolvedValue(undefined);
  });

  it("PATCH updates enabled without losing current level", async () => {
    const currentSettings = {
      cloudEnabled: false,
      caveman: { enabled: false, level: "ultra", applyToPassthrough: false },
    };
    const updatedSettings = {
      ...currentSettings,
      caveman: { enabled: true, level: "ultra", applyToPassthrough: false },
    };

    getSettings.mockResolvedValue(currentSettings);
    updateSettings.mockResolvedValue(updatedSettings);

    const { PATCH } = await import("../../src/app/api/settings/route.ts");
    const response = await PATCH(new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caveman: { enabled: true } }),
    }));

    expect(response.status).toBe(200);
    expect(updateSettings).toHaveBeenCalledWith({
      caveman: { enabled: true, level: "ultra", applyToPassthrough: false },
    });
  });

  it("PATCH normalizes invalid level while preserving enabled state", async () => {
    const currentSettings = {
      cloudEnabled: false,
      caveman: { enabled: true, level: "lite", applyToPassthrough: true },
    };
    const updatedSettings = {
      ...currentSettings,
      caveman: { enabled: true, level: "full", applyToPassthrough: true },
    };

    getSettings.mockResolvedValue(currentSettings);
    updateSettings.mockResolvedValue(updatedSettings);

    const { PATCH } = await import("../../src/app/api/settings/route.ts");
    const response = await PATCH(new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caveman: { level: "verbose" } }),
    }));

    expect(response.status).toBe(200);
    expect(updateSettings).toHaveBeenCalledWith({
      caveman: { enabled: true, level: "full", applyToPassthrough: true },
    });
  });
});
