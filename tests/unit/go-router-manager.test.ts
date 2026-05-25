import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: { goRouter: { enabled: false, host: "127.0.0.1", port: 12778 } },
  spawn: vi.fn(),
  child: {
    pid: 1234,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    unref: vi.fn(),
  },
}));

vi.mock("node:child_process", () => ({ spawn: state.spawn }));
vi.mock("../../src/lib/localDb.ts", () => ({
  getSettings: vi.fn(async () => state.settings),
  updateSettings: vi.fn(async (updates) => {
    state.settings = { ...state.settings, ...updates };
    return state.settings;
  }),
}));

describe("Go router manager", () => {
  beforeEach(() => {
    vi.resetModules();
    state.settings = { goRouter: { enabled: false, host: "127.0.0.1", port: 12778 } };
    state.child.kill.mockReset();
    state.child.on.mockReset();
    state.child.once.mockReset();
    state.child.unref.mockReset();
    state.spawn.mockReset().mockReturnValue(state.child);
  });

  it("does not start a child process while disabled", async () => {
    const { ensureGoRouter } = await import("../../src/lib/goRouter/manager.ts");

    const status = await ensureGoRouter();

    expect(state.spawn).not.toHaveBeenCalled();
    expect(status).toMatchObject({ enabled: false, running: false, pid: null });
  });

  it("starts a separate Go router child process when enabled", async () => {
    state.settings.goRouter.enabled = true;
    const { ensureGoRouter } = await import("../../src/lib/goRouter/manager.ts");

    const status = await ensureGoRouter();

    expect(state.spawn).toHaveBeenCalledWith(
      expect.stringContaining(".axonrouter/bin/axonrouter-go-router"),
      ["--host", "127.0.0.1", "--port", "12778", "--upstream-base-url", "http://127.0.0.1:12711"],
      expect.objectContaining({ stdio: "ignore", detached: false }),
    );
    expect(state.child.unref).toHaveBeenCalledOnce();
    expect(status).toMatchObject({ enabled: true, running: true, pid: 1234 });
  });

  it("restart stops the existing process before starting a fresh one", async () => {
    state.settings.goRouter.enabled = true;
    const { ensureGoRouter, restartGoRouter } = await import("../../src/lib/goRouter/manager.ts");

    await ensureGoRouter();
    await restartGoRouter();

    expect(state.child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(state.spawn).toHaveBeenCalledTimes(2);
  });
});
