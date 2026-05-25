import { beforeEach, describe, expect, it } from "vitest";

import { clearComboRotationState, getRotatedModels } from "../../open-sse/services/combo.tsx";
import { mergeSettingsWithDefaults } from "../../src/lib/localDb.ts";

describe("combo sticky round-robin", () => {
  beforeEach(() => {
    clearComboRotationState();
  });

  it("keeps the same primary model for the configured sticky limit before rotating", () => {
    const models = ["openai/gpt-4.1", "anthropic/claude-sonnet-4", "gemini/gemini-2.5-pro"];

    const first = getRotatedModels(models, "my-combo", "round-robin", 2);
    const second = getRotatedModels(models, "my-combo", "round-robin", 2);
    const third = getRotatedModels(models, "my-combo", "round-robin", 2);
    const fourth = getRotatedModels(models, "my-combo", "round-robin", 2);

    expect(first[0]).toBe("openai/gpt-4.1");
    expect(second[0]).toBe("openai/gpt-4.1");
    expect(third[0]).toBe("anthropic/claude-sonnet-4");
    expect(fourth[0]).toBe("anthropic/claude-sonnet-4");
  });

  it("preserves combo sticky limits through settings normalization", () => {
    const normalized = mergeSettingsWithDefaults({
      routing: {
        comboStrategies: {
          research: {
            strategy: "round-robin",
            stickyLimit: 4,
          },
        },
      },
    });

    expect(normalized.routing.comboStrategies.research).toEqual({
      strategy: "round-robin",
      stickyLimit: 4,
    });
    expect(normalized.comboStrategies.research).toEqual({
      fallbackStrategy: "round-robin",
      stickyRoundRobinLimit: 4,
    });
  });
});
