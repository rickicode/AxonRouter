import { describe, expect, it } from "vitest";
import {
  filterQuotasByVisibility,
  getHiddenQuotaRows,
  parseQuotaData,
  trimHiddenQuotaKeys,
  getConnectionsEmptyMessage,
  sortVisibleConnections,
} from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

describe("provider quota visibility", () => {
  const data = {
    quotas: {
      "gemini-pro-agent": {
        displayName: "Gemini 3.1 Pro (High)",
        used: 200,
        total: 1000,
        resetAt: "2026-07-04T00:00:00Z",
        remainingPercentage: 80,
      },
      "claude-opus-4-6-thinking": {
        displayName: "Claude Opus 4.6 (Thinking)",
        used: 100,
        total: 1000,
        resetAt: "2026-07-04T00:00:00Z",
        remainingPercentage: 90,
      },
    },
  };

  it("groups Antigravity model quotas into Gemini and Claude families", () => {
    const quotas = parseQuotaData("antigravity", data);
    expect(quotas.map((q) => q.modelKey)).toEqual([
      "gemini",
      "claude",
    ]);
    expect(quotas[0].name).toBe("Gemini (Flash / Pro)");
    expect(quotas[1].name).toBe("Claude (Sonnet / Opus)");
  });

  it("shows all quotas by default and hides configured provider rows", () => {
    const quotas = parseQuotaData("antigravity", data);
    expect(filterQuotasByVisibility("antigravity", quotas, {})).toHaveLength(2);

    const visibility = {
      antigravity: { hidden: ["claude"] },
    };
    const visible = filterQuotasByVisibility("antigravity", quotas, visibility);
    const hidden = getHiddenQuotaRows("antigravity", quotas, visibility);

    expect(visible.map((q) => q.modelKey)).toEqual(["gemini"]);
    expect(hidden.map((q) => q.modelKey)).toEqual(["claude"]);
  });

  it("trims stale or obsolete model keys", () => {
    const quotas = parseQuotaData("antigravity", data);
    const trimmed = trimHiddenQuotaKeys(["claude", "stale-model-xyz", "gemini-3.8-flash-low"], quotas);
    expect(trimmed).toEqual(["claude"]);

    const visibility = {
      antigravity: { hidden: ["claude", "stale-model-xyz"] },
    };
    const visible = filterQuotasByVisibility("antigravity", quotas, visibility);
    const hidden = getHiddenQuotaRows("antigravity", quotas, visibility);

    expect(visible.map((q) => q.modelKey)).toEqual(["gemini"]);
    expect(hidden.map((q) => q.modelKey)).toEqual(["claude"]);
  });

  it("does not apply one provider hidden list to another provider", () => {
    const quotas = parseQuotaData("antigravity", data);
    const visibility = {
      codex: { hidden: ["gemini"] },
    };
    expect(filterQuotasByVisibility("antigravity", quotas, visibility)).toHaveLength(2);
  });

  it("returns search-specific empty message when search query is provided", () => {
    const msg = getConnectionsEmptyMessage(
      { eligibleConnections: 5, providerFilteredConnections: 0 },
      "all",
      "all",
      "my-account@example.com"
    );
    expect(msg.icon).toBe("search_off");
    expect(msg.title).toBe("No Accounts Found");
    expect(msg.description).toContain("my-account@example.com");
  });

  it("returns filter-specific empty message when search query is empty", () => {
    const msg = getConnectionsEmptyMessage(
      { eligibleConnections: 5, providerFilteredConnections: 0 },
      "codex",
      "active",
      ""
    );
    expect(msg.icon).toBe("filter_alt_off");
    expect(msg.title).toBe("No Accounts Match Current Filters");
    expect(msg.description).toContain("codex");
  });

  it("returns enabled-specific guidance when 'all' filter has no enabled accounts", () => {
    const msg = getConnectionsEmptyMessage(
      { eligibleConnections: 5, providerFilteredConnections: 0 },
      "all",
      "all",
      ""
    );
    expect(msg.icon).toBe("filter_alt_off");
    expect(msg.description).toContain("Turned off tab");
  });

  it("sorts disabled accounts to the very bottom regardless of priority", () => {
    const conns = [
      { id: "1", provider: "freebuff", isActive: false, priority: 1, name: "disabled-1" },
      { id: "2", provider: "freebuff", isActive: true, priority: 10, name: "active-1" },
      { id: "3", provider: "freebuff", isActive: false, priority: 2, name: "disabled-2" },
      { id: "4", provider: "freebuff", isActive: true, priority: 5, name: "active-2" },
    ];
    const sorted = sortVisibleConnections(conns, {}, false, "all", "default");
    expect(sorted.map((c) => c.name)).toEqual([
      "active-1",
      "active-2",
      "disabled-1",
      "disabled-2",
    ]);
  });
});
