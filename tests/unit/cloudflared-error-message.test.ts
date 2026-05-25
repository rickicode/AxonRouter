import { describe, expect, it } from "vitest";

describe("cloudflared exit errors", () => {
  it("includes recent stderr lines in formatted exit errors", async () => {
    const mod = await import("../../src/lib/tunnel/cloudflared.ts");

    const error = mod.__test_buildCloudflaredExitError(1, "failed to connect to edge\npermission denied\n");

    expect(error.message).toMatch(/code 1/);
    expect(error.message).toMatch(/permission denied/);
  });
});
