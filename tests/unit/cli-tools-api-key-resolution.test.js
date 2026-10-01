/**
 * Port of upstream c4690307 + 06eda8b0 into AxonRouter's CLI-tools writers.
 *
 * - Applying Claude settings must not clobber an ANTHROPIC_AUTH_TOKEN that is
 *   already in ~/.claude/settings.json (a real key or earlier config).
 * - Writers must never persist the "sk_axonrouter" placeholder / a literal
 *   fallback key: they resolve the first active dashboard key from the DB.
 *
 * The routes write to real files under os.homedir(), so this test points
 * homedir at a throwaway dir and mocks the DB + response shim.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const state = vi.hoisted(() => ({
  home: "",
  apiKeys: [],
}));

const json = vi.hoisted(() =>
  vi.fn((body, init) => ({ status: init?.status ?? 200, body })),
);

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal();
  const os = actual.default || actual;
  return {
    ...actual,
    default: { ...os, homedir: () => state.home },
    homedir: () => state.home,
  };
});

vi.mock("@/lib/db", () => ({
  getApiKeys: vi.fn(async () => state.apiKeys),
}));

vi.mock("@/lib/http/response.js", () => ({
  NextResponse: { json },
  HttpNextResponse: { json },
}));

// `which claude` must fail so the CLI "installed" probe is deterministic.
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal();
  const os = actual.default || actual;
  const exec = (command, options, callback) => {
    const done = typeof options === "function" ? options : callback;
    if (done) done(new Error("not installed"));
  };
  return { ...actual, default: { ...os, exec }, exec };
});

const { POST: applyClaude } = await import(
  "../../src/app/api/cli-tools/claude-settings/route.js"
);
const { POST: applyCopilot } = await import(
  "../../src/app/api/cli-tools/copilot-settings/route.js"
);
const { POST: applyDeepSeek } = await import(
  "../../src/app/api/cli-tools/deepseek-tui-settings/route.js"
);

const post = (body) => ({ json: async () => body });

let home;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "axonrouter-cli-tools-"));
  state.home = home;
  state.apiKeys = [];
  json.mockClear();
});

afterEach(async () => {
  if (home) await rm(home, { recursive: true, force: true });
});

describe("Claude settings apply keeps an existing ANTHROPIC_AUTH_TOKEN", () => {
  const settingsPath = () => join(home, ".claude", "settings.json");

  it("preserves a user-set token instead of overwriting it", async () => {
    await mkdir(join(home, ".claude"), { recursive: true });
    await writeFile(
      settingsPath(),
      JSON.stringify({
        hasCompletedOnboarding: true,
        env: {
          ANTHROPIC_BASE_URL: "http://localhost:3777/v1",
          ANTHROPIC_AUTH_TOKEN: "sk-user-real",
        },
      }),
    );

    const res = await applyClaude(
      post({
        env: {
          ANTHROPIC_BASE_URL: "http://localhost:3777",
          ANTHROPIC_AUTH_TOKEN: "sk_axonrouter",
        },
      }),
    );

    expect(res.body.success).toBe(true);
    const written = JSON.parse(await readFile(settingsPath(), "utf-8"));
    expect(written.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-user-real");
    // base URL is still normalized/applied
    expect(written.env.ANTHROPIC_BASE_URL).toBe("http://localhost:3777/v1");
  });

  it("writes the token when settings.json has none", async () => {
    const res = await applyClaude(
      post({
        env: {
          ANTHROPIC_BASE_URL: "http://localhost:3777",
          ANTHROPIC_AUTH_TOKEN: "sk-fresh",
        },
      }),
    );

    expect(res.body.success).toBe(true);
    const written = JSON.parse(await readFile(settingsPath(), "utf-8"));
    expect(written.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-fresh");
  });
});

describe("CLI writers resolve a real key instead of a placeholder", () => {
  const copilotConfigPath = () =>
    join(home, ".config", "Code", "User", "chatLanguageModels.json");

  const readCopilotEntry = async () => {
    const raw = await readFile(copilotConfigPath(), "utf-8");
    return JSON.parse(raw).find((e) => e.name === "AxonRouter");
  };

  it("copilot: falls back to the first active dashboard key", async () => {
    state.apiKeys = [
      { key: "sk-inactive", isActive: false },
      { key: "sk-db-active", isActive: true },
    ];

    const res = await applyCopilot(
      post({ baseUrl: "http://localhost:3777", apiKey: "", models: ["gpt-4"] }),
    );

    expect(res.body.success).toBe(true);
    expect((await readCopilotEntry()).apiKey).toBe("sk-db-active");
  });

  it("copilot: never writes the placeholder when no active key exists", async () => {
    state.apiKeys = [];

    await applyCopilot(
      post({ baseUrl: "http://localhost:3777", apiKey: "", models: ["gpt-4"] }),
    );

    const entry = await readCopilotEntry();
    expect(entry.apiKey).toBe("");
    expect(entry.apiKey).not.toBe("sk_axonrouter");
  });

  it("copilot: prefers an explicitly selected key", async () => {
    state.apiKeys = [{ key: "sk-db-active", isActive: true }];

    await applyCopilot(
      post({
        baseUrl: "http://localhost:3777",
        apiKey: "sk-explicit",
        models: ["gpt-4"],
      }),
    );

    expect((await readCopilotEntry()).apiKey).toBe("sk-explicit");
  });

  it("deepseek-tui: writes the resolved active key, never the placeholder", async () => {
    state.apiKeys = [{ key: "sk-db-active", isActive: true }];

    const res = await applyDeepSeek(
      post({ baseUrl: "http://localhost:3777", apiKey: "sk_axonrouter", model: "deepseek-chat" }),
    );

    expect(res.body.success).toBe(true);
    const toml = await readFile(join(home, ".deepseek", "config.toml"), "utf-8");
    expect(toml).toContain('api_key = "sk-db-active"');
    expect(toml).not.toContain("sk_axonrouter");
  });
});