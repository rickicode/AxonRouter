import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_SYNC_SETTINGS, normalizeModelSyncSettings } from "../../src/lib/providerModels/syncSettings.ts";

describe("model sync settings", () => {
  it("keeps the default cadence at two days", () => {
    expect(DEFAULT_MODEL_SYNC_SETTINGS.intervalMinutes).toBe(2880);
  });

  it("provides sane defaults", () => {
    expect(DEFAULT_MODEL_SYNC_SETTINGS).toMatchObject({
      enabled: true,
      intervalMinutes: 2880,
      lastRunStatus: "idle",
    });
  });

  it("normalizes provider-scoped sync settings", () => {
    expect(normalizeModelSyncSettings({
      enabled: true,
      intervalMinutes: "30",
      providers: {
        codex: { enabled: true, intervalMinutes: "15", lastRunStatus: "success" },
      },
    })).toEqual({
      enabled: true,
      intervalMinutes: 30,
      providers: {
        codex: {
          enabled: true,
          intervalMinutes: 15,
          lastRunAt: null,
          lastRunStatus: "success",
          lastRunMessage: "",
        },
      },
      lastRunAt: null,
      lastRunStatus: "idle",
      lastRunMessage: "",
    });
  });
});
