import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Observability config & Combo Analytics fallback", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
  });

  it("getObservabilityConfig treats OBSERVABILITY_ENABLED as authoritative over ENABLE_REQUEST_LOGS", async () => {
    process.env.ENABLE_REQUEST_LOGS = "false";
    process.env.OBSERVABILITY_ENABLED = "true";

    const { getObservabilityConfig } = await import("../../src/lib/db/repos/requestDetailsRepo.js");
    const cfg = await getObservabilityConfig();
    expect(cfg.enabled).toBe(true);
  });

  it("getObservabilityConfig disables observability when OBSERVABILITY_ENABLED is false", async () => {
    process.env.OBSERVABILITY_ENABLED = "false";

    const { getObservabilityConfig } = await import("../../src/lib/db/repos/requestDetailsRepo.js");
    const cfg = await getObservabilityConfig();
    expect(cfg.enabled).toBe(false);
  });

  it("getComboAnalytics falls back to usage_history when request_details has no combo rows", async () => {
    process.env.OBSERVABILITY_ENABLED = "true";

    const mockDb = {
      all: vi.fn((sql) => {
        // If querying request_details, return empty
        if (sql.includes("FROM request_details")) {
          return Promise.resolve([]);
        }
        // If querying usage_history for combos
        if (sql.includes("FROM usage_history") && !sql.includes("GROUP BY 1, 2, 3") && !sql.includes("meta->>'difficulty'")) {
          return Promise.resolve([
            {
              combo_name: "auto/coding",
              total: 10,
              success: 9,
              errors: 1,
              avg_latency_s: 1.25,
              last_seen: "2026-09-28T00:00:00.000Z",
            },
          ]);
        }
        // If querying usage_history for members
        if (sql.includes("FROM usage_history") && sql.includes("GROUP BY 1, 2, 3")) {
          return Promise.resolve([
            {
              combo_name: "auto/coding",
              model: "mimo-v2.6-flash-free",
              provider: "opencode",
              total: 10,
              success: 9,
              errors: 1,
              avg_latency_s: 1.25,
              last_seen: "2026-09-28T00:00:00.000Z",
              sample_error: "rate limit",
              sample_status: "429",
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    };

    vi.doMock("../../src/lib/db/driver.js", () => ({
      getAdapter: vi.fn().mockResolvedValue(mockDb),
    }));

    const { getComboAnalytics } = await import("../../src/lib/db/repos/requestDetailsRepo.js");
    const analytics = await getComboAnalytics({ timeFrom: "2026-09-27T00:00:00.000Z" });

    expect(analytics.combos).toHaveLength(1);
    expect(analytics.combos[0].comboName).toBe("auto/coding");
    expect(analytics.combos[0].total).toBe(10);
    expect(analytics.combos[0].success).toBe(9);
    expect(analytics.combos[0].errors).toBe(1);

    expect(analytics.members).toHaveLength(1);
    expect(analytics.members[0].comboName).toBe("auto/coding");
    expect(analytics.members[0].model).toBe("mimo-v2.6-flash-free");
    expect(analytics.members[0].provider).toBe("opencode");
  });
});
