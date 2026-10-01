// Provider topology retention: a provider that just finished serving a request must
// stay on the graph as a standby node, and only leave after 5 idle minutes.
//
// The regression this locks: visibility was computed from the ACTIVE set alone and
// returned an empty list whenever nothing was in flight, so a provider's icon
// vanished the instant its request completed. The 5-minute retention window was
// already being tracked (lastUsedRef / usedSnapshot with its own pruning timer) but
// nothing ever read it — the window existed and did nothing.
//
// The rule was inlined in a useMemo inside a JSX component, and this repo has no DOM
// test harness, so it shipped broken unnoticed. Hence a pure module plus these tests.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  RETENTION_MS,
  advanceRetention,
  selectVisibleProviders,
} from "../../src/app/(dashboard)/dashboard/usage/components/providerTopologyVisibility.js";

const CATALOGUE = [
  { provider: "openrouter" },
  { provider: "tokenharbor" },
  { provider: "cline-free" },
];

describe("topology retention window", () => {
  it("is the five minutes the operator asked for", () => {
    expect(RETENTION_MS).toBe(5 * 60 * 1000);
  });
});

describe("selectVisibleProviders", () => {
  it("keeps a provider visible after its request finished", () => {
    // The bug: this returned [] because the provider was no longer active.
    const visible = selectVisibleProviders(CATALOGUE, new Set(["openrouter"]));
    expect(visible.map((p) => p.provider)).toEqual(["openrouter"]);
  });

  it("keeps every provider that is active or still inside the window", () => {
    const visible = selectVisibleProviders(CATALOGUE, new Set(["openrouter", "tokenharbor"]));
    expect(visible.map((p) => p.provider).sort()).toEqual(["openrouter", "tokenharbor"]);
  });

  it("shows nothing only when nothing has been used at all", () => {
    expect(selectVisibleProviders(CATALOGUE, new Set())).toEqual([]);
  });

  it("still renders a provider that served traffic without a catalogue entry", () => {
    const visible = selectVisibleProviders(CATALOGUE, new Set(["unknown-provider"]));
    expect(visible).toEqual([{ provider: "unknown-provider" }]);
  });

  it("prefers the catalogue entry so labels and icons are not lost", () => {
    const visible = selectVisibleProviders(
      [{ provider: "openrouter", label: "OpenRouter", icon: "or" }],
      new Set(["openrouter"])
    );
    expect(visible[0].label).toBe("OpenRouter");
  });

  it("matches provider ids case-insensitively", () => {
    expect(selectVisibleProviders([{ provider: "OpenRouter" }], new Set(["openrouter"]))).toHaveLength(1);
  });

  it("does not mutate the caller's set", () => {
    const used = new Set(["openrouter"]);
    selectVisibleProviders(CATALOGUE, used);
    expect(Array.from(used)).toEqual(["openrouter"]);
  });
});

describe("advanceRetention", () => {
  const T0 = 1_700_000_000_000;

  it("stamps a newly active provider and shows it", () => {
    const { lastUsedAt, visible } = advanceRetention({}, ["openrouter"], T0);
    expect(lastUsedAt.openrouter).toBe(T0);
    expect(visible.has("openrouter")).toBe(true);
  });

  it("keeps a finished provider visible right up to the window", () => {
    let state = advanceRetention({}, ["openrouter"], T0);
    // Request finished: nothing is active any more, but the stamp remains.
    const justBefore = advanceRetention(state.lastUsedAt, [], T0 + RETENTION_MS - 1);
    expect(justBefore.visible.has("openrouter")).toBe(true);
    // ...and it leaves the graph once the window closes.
    const justAfter = advanceRetention(state.lastUsedAt, [], T0 + RETENTION_MS);
    expect(justAfter.visible.has("openrouter")).toBe(false);
    expect(Object.keys(justAfter.lastUsedAt)).not.toContain("openrouter");
  });

  it("refreshes the window when the provider comes back", () => {
    const first = advanceRetention({}, ["openrouter"], T0);
    const later = advanceRetention(first.lastUsedAt, ["openrouter"], T0 + RETENTION_MS - 1000);
    // Still visible well past the original window, because it was re-stamped.
    const after = advanceRetention(later.lastUsedAt, [], T0 + RETENTION_MS + 2000);
    expect(after.visible.has("openrouter")).toBe(true);
  });

  it("keeps an active provider visible even if its stamp is older than the window", () => {
    // Retention governs how long a provider lingers AFTER going idle; it must never
    // hide live traffic, however stale the previous stamp is.
    const stale = { openrouter: T0 - RETENTION_MS * 10 };
    const { visible } = advanceRetention(stale, ["openrouter"], T0);
    expect(visible.has("openrouter")).toBe(true);
  });

  it("never mutates the map it is given", () => {
    const original = { openrouter: T0 };
    advanceRetention(original, ["tokenharbor"], T0 + RETENTION_MS * 2);
    expect(original).toEqual({ openrouter: T0 });
  });

  it("ignores empty and malformed provider ids", () => {
    const { lastUsedAt, visible } = advanceRetention({}, ["", null, undefined], T0);
    expect(Object.keys(lastUsedAt)).toEqual([]);
    expect(visible.size).toBe(0);
  });

  it("tracks several providers independently", () => {
    let state = advanceRetention({}, ["openrouter", "tokenharbor"], T0);
    // tokenharbor keeps serving; openrouter went quiet 4 minutes ago.
    state = advanceRetention(state.lastUsedAt, ["tokenharbor"], T0 + 4 * 60 * 1000);
    expect(state.visible.has("tokenharbor")).toBe(true);
    expect(state.visible.has("openrouter")).toBe(true);
    // Ten minutes after openrouter was last seen it is gone, tokenharbor remains.
    const later = advanceRetention(state.lastUsedAt, ["tokenharbor"], T0 + 10 * 60 * 1000);
    expect(later.visible.has("openrouter")).toBe(false);
    expect(later.visible.has("tokenharbor")).toBe(true);
  });
});

describe("the component actually uses the retention set", () => {
  // Source-level guard. The bug lived in a useMemo, and the pure helper above
  // cannot catch a component that keeps computing visibility some other way — so
  // assert the component routes visibility through the helper and the shared
  // constant rather than through the active set alone.
  const src = readFileSync(
    new URL("../../src/app/(dashboard)/dashboard/usage/components/ProviderTopology.js", import.meta.url),
    "utf8"
  );

  it("imports the shared retention constant and helpers", () => {
    expect(src).toMatch(/import\s*\{[^}]*RETENTION_MS as PROVIDER_RETENTION_MS[^}]*\}\s*from\s*"\.\/providerTopologyVisibility\.js"/);
    expect(src).toMatch(/advanceRetention/);
  });

  it("computes visible providers from the retained set, not the active set", () => {
    expect(src).toMatch(/selectVisibleProviders\(providers,\s*usedProviderSet\)/);
  });

  it("no longer hides the whole graph when nothing is in flight", () => {
    // The exact regression: an early return of [] keyed on the active set.
    expect(src).not.toMatch(/rawActiveSet\.size === 0[\s\S]{0,120}return \[\]/);
  });

  it("keeps no second, divergent copy of the retention window", () => {
    // Two different windows would mean "shown" and "retained" disagree over time.
    expect(src).not.toMatch(/5 \* 60 \* 1000/);
  });
});
