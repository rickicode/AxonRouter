import { beforeEach, describe, expect, it, vi } from "vitest";

const emitter = {
  on: vi.fn(),
  off: vi.fn(),
};

const getConsoleLogs = vi.fn(() => []);
const initConsoleLogCapture = vi.fn();

vi.mock("@/lib/consoleLogBuffer", () => ({
  getConsoleLogs,
  getConsoleEmitter: () => emitter,
  initConsoleLogCapture,
}));

describe("/api/translator/console-logs/stream route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getConsoleLogs.mockReturnValue([]);
  });

  it("cleans up listeners when the request abort signal fires", async () => {
    const controller = new AbortController();
    const { GET } = await import("../../src/app/api/translator/console-logs/stream/route.ts");

    await GET(new Request("http://localhost/api/translator/console-logs/stream", {
      signal: controller.signal,
    }));

    expect(emitter.on).toHaveBeenCalledWith("line", expect.any(Function));
    expect(emitter.on).toHaveBeenCalledWith("clear", expect.any(Function));

    controller.abort();

    expect(emitter.off).toHaveBeenCalledWith("line", expect.any(Function));
    expect(emitter.off).toHaveBeenCalledWith("clear", expect.any(Function));
  });
});
