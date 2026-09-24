import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCodebuffUserAgent,
  getCodebuffCliVersion,
  refreshCodebuffVersion,
  DEFAULT_CODEBUFF_CLI_VERSION,
  __resetCodebuffVersionCache,
} from "../../open-sse/services/freebuffVersion.js";

describe("freebuffVersion service", () => {
  const originalEnv = process.env.CODEBUFF_CLI_VERSION;

  beforeEach(() => {
    delete process.env.CODEBUFF_CLI_VERSION;
    __resetCodebuffVersionCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CODEBUFF_CLI_VERSION = originalEnv;
    } else {
      delete process.env.CODEBUFF_CLI_VERSION;
    }
  });

  it("returns default Codebuff-CLI User-Agent when cache is fresh and env unset", () => {
    const ua = getCodebuffUserAgent();
    expect(ua).toBe(`Codebuff-CLI/${DEFAULT_CODEBUFF_CLI_VERSION}`);
    expect(getCodebuffCliVersion()).toBe(DEFAULT_CODEBUFF_CLI_VERSION);
  });

  it("prefers process.env.CODEBUFF_CLI_VERSION override when set", () => {
    process.env.CODEBUFF_CLI_VERSION = "2.0.0";
    expect(getCodebuffUserAgent()).toBe("Codebuff-CLI/2.0.0");
    expect(getCodebuffCliVersion()).toBe("2.0.0");
  });

  it("fetches and caches latest version from registry on refreshCodebuffVersion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: "1.2.3" }),
      }),
    );

    const version = await refreshCodebuffVersion(true);
    expect(version).toBe("1.2.3");
    expect(getCodebuffUserAgent()).toBe("Codebuff-CLI/1.2.3");
  });

  it("fails open and retains default version when registry fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network offline")),
    );

    const version = await refreshCodebuffVersion(true);
    expect(version).toBe(DEFAULT_CODEBUFF_CLI_VERSION);
    expect(getCodebuffUserAgent()).toBe(`Codebuff-CLI/${DEFAULT_CODEBUFF_CLI_VERSION}`);
  });
});
