import { beforeEach, describe, expect, it, vi } from "vitest";

const getSettings = vi.fn();
const atomicUpdateSettings = vi.fn();
const exportDb = vi.fn(async () => ({}));
const getProviderConnections = vi.fn(async () => []);
const getActiveCloudEntry = vi.fn();
const refreshWorkerRuntime = vi.fn();
const pushWorkerRuntimeSync = vi.fn();
const publishRuntimeArtifactsFromSettings = vi.fn();

vi.mock("@/lib/localDb", () => ({
  getSettings,
  atomicUpdateSettings,
  exportDb,
  getProviderConnections,
}));

vi.mock("@/lib/cloudUrlResolver", () => ({
  getActiveCloudEntry,
}));

vi.mock("@/lib/cloudWorkerClient", () => ({
  refreshWorkerRuntime,
  pushWorkerRuntimeSync,
}));

vi.mock("@/lib/r2BackupClient", () => ({
  publishRuntimeArtifactsFromSettings,
}));

describe("cloudSync", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    atomicUpdateSettings.mockImplementation(async (mutator) => mutator({ cloudUrls: [] }));
    publishRuntimeArtifactsFromSettings.mockResolvedValue({
      backup: { ok: true },
      runtime: { ok: true },
      eligible: { ok: true },
      credentials: { ok: true },
      runtimeConfig: { ok: true },
      sqlite: { ok: true, skipped: true },
    });
  });

  it("publishes required runtime artifacts before refreshing cloud workers", async () => {
    getSettings.mockResolvedValue({
      r2Config: {
        accountId: "0123456789abcdef0123456789abcdef",
        endpoint: "https://acct.r2.cloudflarestorage.com",
        bucket: "bucket",
        accessKeyId: "key",
        secretAccessKey: "secret",
        region: "auto",
      },
      cloudSharedSecret: "global-secret-1",
      cloudUrls: [
        { id: "worker-1", url: "https://worker.example.com" },
      ],
    });
    refreshWorkerRuntime.mockResolvedValue({ success: true, refreshedAt: "2026-04-30T00:00:00.000Z" });
    pushWorkerRuntimeSync.mockResolvedValue({ success: true, generatedAt: "2026-04-30T00:00:00.000Z" });

    const { syncToCloud } = await import("@/lib/cloudSync");
    const result = await syncToCloud();

    expect(publishRuntimeArtifactsFromSettings).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        r2Config: expect.objectContaining({ bucket: "bucket" }),
      }),
    });
    expect(pushWorkerRuntimeSync).toHaveBeenCalledWith(
      "https://worker.example.com",
      "global-secret-1",
      expect.any(Object)
    );
    expect(result).toMatchObject({
      success: true,
      workersOk: 1,
      workersFailed: 0,
      runtimeArtifactUpload: {
        credentials: { ok: true },
        runtimeConfig: { ok: true },
      },
    });
  });

  it("fails before worker refresh when private R2 is not configured", async () => {
    getSettings.mockResolvedValue({
      cloudSharedSecret: "global-secret-1",
      cloudUrls: [
        { id: "worker-1", url: "https://worker.example.com" },
      ],
    });

    const { syncToCloud } = await import("@/lib/cloudSync");

    await expect(syncToCloud()).rejects.toThrow(
      "Cloud sync requires a valid private R2 configuration so backup and bootstrap snapshots can be uploaded"
    );
    expect(publishRuntimeArtifactsFromSettings).not.toHaveBeenCalled();
    expect(refreshWorkerRuntime).not.toHaveBeenCalled();
  });

  it("fails before worker refresh when private R2 config is incomplete", async () => {
    getSettings.mockResolvedValue({
      r2Config: {
        accountId: "",
        endpoint: "https://acct.r2.cloudflarestorage.com",
        bucket: "bucket",
        accessKeyId: "key",
        secretAccessKey: "",
        region: "auto",
      },
      cloudSharedSecret: "global-secret-1",
      cloudUrls: [
        { id: "worker-1", url: "https://worker.example.com" },
      ],
    });

    const { syncToCloud } = await import("@/lib/cloudSync");

    await expect(syncToCloud()).rejects.toThrow(
      "Cloud sync requires a valid private R2 configuration so backup and bootstrap snapshots can be uploaded"
    );
    expect(publishRuntimeArtifactsFromSettings).not.toHaveBeenCalled();
    expect(refreshWorkerRuntime).not.toHaveBeenCalled();
  });

  it("fails before worker refresh when required runtime artifact uploads are incomplete", async () => {
    getSettings.mockResolvedValue({
      r2Config: {
        accountId: "0123456789abcdef0123456789abcdef",
        endpoint: "https://acct.r2.cloudflarestorage.com",
        bucket: "bucket",
        accessKeyId: "key",
        secretAccessKey: "secret",
        region: "auto",
      },
      cloudSharedSecret: "global-secret-1",
      cloudUrls: [
        { id: "worker-1", url: "https://worker.example.com" },
      ],
    });
    publishRuntimeArtifactsFromSettings.mockResolvedValue({
      backup: { ok: true },
      runtime: { ok: true },
      eligible: { ok: true },
      credentials: { ok: false, error: "credentials upload failed" },
      runtimeConfig: { ok: true },
      sqlite: { ok: true, skipped: true },
    });

    const { syncToCloud } = await import("@/lib/cloudSync");

    await expect(syncToCloud()).rejects.toThrow(
      "Cloud sync aborted: credentials: credentials upload failed"
    );
    expect(refreshWorkerRuntime).not.toHaveBeenCalled();
  });

  it("publishes artifacts before refreshing the active worker", async () => {
    getSettings.mockResolvedValue({
      r2Config: {
        accountId: "0123456789abcdef0123456789abcdef",
        endpoint: "https://acct.r2.cloudflarestorage.com",
        bucket: "bucket",
        accessKeyId: "key",
        secretAccessKey: "secret",
        region: "auto",
      },
      cloudSharedSecret: "global-secret-1",
    });
    getActiveCloudEntry.mockResolvedValue({
      id: "worker-1",
      url: "https://worker.example.com",
    });
    refreshWorkerRuntime.mockResolvedValue({ success: true, refreshedAt: "2026-04-30T00:00:00.000Z" });
    pushWorkerRuntimeSync.mockResolvedValue({ success: true, generatedAt: "2026-04-30T00:00:00.000Z" });

    const { syncToCloudActive } = await import("@/lib/cloudSync");

    await expect(syncToCloudActive()).resolves.toMatchObject({ success: true });
    expect(publishRuntimeArtifactsFromSettings).toHaveBeenCalledTimes(1);
    expect(pushWorkerRuntimeSync).toHaveBeenCalledTimes(1);
  });
});
