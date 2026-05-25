import { describe, expect, it, vi } from "vitest";

import { getMorphKeyOrder } from "../../src/lib/morph/keySelection.ts";

describe("Morph key selection cooldown handling", () => {
  it("skips cooldown keys whose retry window is still in the future", () => {
    const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const result = getMorphKeyOrder({
      apiKeys: [
        { email: "cooldown@example.com", key: "mk-cool", status: "cooldown", isExhausted: false, nextRetryAt: future },
        { email: "active@example.com", key: "mk-active", status: "active", isExhausted: false },
      ],
      roundRobinEnabled: false,
      rotationKey: "apply",
    });

    expect(result.keyOrder).toHaveLength(1);
    expect(result.keyOrder[0].email).toBe("active@example.com");
  });

  it("allows cooldown keys back into rotation after retry time has passed", () => {
    const past = new Date(Date.now() - 60_000).toISOString();

    const result = getMorphKeyOrder({
      apiKeys: [
        { email: "cooldown@example.com", key: "mk-cool", status: "cooldown", isExhausted: false, nextRetryAt: past },
      ],
      roundRobinEnabled: false,
      rotationKey: "apply",
    });

    expect(result.keyOrder).toHaveLength(1);
    expect(result.keyOrder[0].email).toBe("cooldown@example.com");
  });
});
