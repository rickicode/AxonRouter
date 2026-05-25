import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAVEMAN_SETTINGS,
  normalizeCavemanSettings,
  resolveCavemanPrompt,
} from "../../open-sse/config/caveman.ts";
import { mergeSettingsWithDefaults } from "../../src/lib/localDb/normalize.ts";

describe("caveman settings", () => {
  it("defaults to disabled full mode with passthrough enabled", () => {
    expect(DEFAULT_CAVEMAN_SETTINGS).toEqual({
      enabled: false,
      level: "full",
      applyToPassthrough: true,
    });
    expect(normalizeCavemanSettings()).toEqual(DEFAULT_CAVEMAN_SETTINGS);
  });

  it("normalizes invalid values safely", () => {
    expect(normalizeCavemanSettings({
      enabled: "yes",
      level: "verbose",
      applyToPassthrough: false,
    })).toEqual({
      enabled: false,
      level: "full",
      applyToPassthrough: false,
    });
  });

  it("merges into local DB settings defaults", () => {
    const settings = mergeSettingsWithDefaults({
      caveman: { enabled: true, level: "ultra" },
    });

    expect(settings.caveman).toEqual({
      enabled: true,
      level: "ultra",
      applyToPassthrough: true,
    });
  });

  it("resolves prompts only when enabled", () => {
    expect(resolveCavemanPrompt({ enabled: false, level: "full" })).toBe("");
    expect(resolveCavemanPrompt({ enabled: true, level: "lite" })).toContain("Respond tersely");
    expect(resolveCavemanPrompt({ enabled: true, level: "ultra" })).toContain("ultra-terse");
  });
});
