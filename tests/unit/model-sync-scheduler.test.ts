import { beforeEach, describe, expect, it, vi } from "vitest";

const getSettings = vi.fn();
const runModelSyncBatch = vi.fn();

vi.mock("@/lib/localDb", () => ({
  getSettings,
}));

vi.mock("@/lib/providerModels/syncRunner", () => ({
  runModelSyncBatch,
}));

describe("model sync scheduler", () => {
  beforeEach(() => {
    vi.resetModules();
    getSettings.mockReset();
    runModelSyncBatch.mockReset();
  });

  it("keeps noAuth auto-sync scheduled when full modelSync is off", async () => {
    getSettings.mockResolvedValue({ modelSync: { enabled: false, intervalMinutes: 60 } });
    const { ModelSyncScheduler } = await import("../../src/lib/providerModels/scheduler.ts");
    const scheduler = new ModelSyncScheduler({ logger: { log() {}, warn() {}, error() {} } });
    const status = await scheduler.start();
    expect(status.enabled).toBe(false);
    expect(status.nextRunAt).toEqual(expect.any(String));
    scheduler.stop();
  });

  it("runs a scheduled batch when enabled", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue({ modelSync: { enabled: true, intervalMinutes: 1 } });
    runModelSyncBatch.mockResolvedValue({
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "success",
      message: "Synced 1 connection.",
      results: [{}],
    });

    const { ModelSyncScheduler } = await import("../../src/lib/providerModels/scheduler.ts");
    const scheduler = new ModelSyncScheduler({ logger: { log() {}, warn() {}, error() {} } });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(runModelSyncBatch).toHaveBeenCalled();
    const status = scheduler.getStatus();
    expect(status.lastRun).toMatchObject({ status: "success", total: 1 });
    scheduler.stop();
    vi.useRealTimers();
  });
});
