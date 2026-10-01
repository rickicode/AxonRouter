/**
 * Regression tests for the Zed OAuth port (upstream 7a436d20).
 *
 * - The Zed IDE keyring reader (Linux secret-tool path) discovers a signed-in
 *   session and always yields a system_id.
 * - POST /api/oauth/zed/import validates the pasted signature payload, saves an
 *   "imported" connection, and rejects malformed/empty input without crashing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const state = vi.hoisted(() => ({
  home: "",
  execFile: vi.fn(),
}));

const json = vi.hoisted(() => vi.fn((body, init) => ({ status: init?.status ?? 200, body })));

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal();
  const os = actual.default || actual;
  return {
    ...actual,
    default: { ...os, homedir: () => state.home },
    homedir: () => state.home,
  };
});

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal();
  const os = actual.default || actual;
  const execFile = (...args) => state.execFile(...args);
  return { ...actual, default: { ...os, execFile }, execFile };
});

vi.mock("@/lib/http/response.js", () => ({
  NextResponse: { json },
  HttpNextResponse: { json },
}));

vi.mock("@/models", () => ({
  createProviderConnection: vi.fn(async (data) => ({
    id: "conn-1",
    provider: data.provider,
    email: data.email,
    displayName: data.displayName,
    providerSpecificData: data.providerSpecificData,
  })),
}));

vi.mock("open-sse/shared/zedAuth.js", () => ({
  fetchZedAuthenticatedUser: vi.fn(async () => ({
    email: "zed@example.com",
    name: "Zed User",
    default_organization_id: "org-1",
  })),
  resolveZedOrganizationId: vi.fn(() => "org-1"),
}));

const { readZedIdeCredentials } = await import("../../src/lib/oauth/utils/zedCredentials.js");
const { POST: importZed } = await import("../../src/app/api/oauth/zed/import/route.js");

// secret-tool prints attributes on stderr and label/secret on stdout.
const SECRET_TOOL_OUTPUT = [
  "[/60]",
  "attribute.url = https://zed.dev",
  "attribute.username = 4242",
  "label = zed-github-account",
  'secret = {"access_token":"zdt_live_abc"}',
].join("\n");

const okExecFile = (stdout, stderr = "") => {
  const execFile = (file, args, options, callback) => {
    const done = typeof options === "function" ? options : callback;
    done(null, { stdout, stderr });
  };
  return execFile;
};

const failExecFile = (err) => {
  const execFile = (file, args, options, callback) => {
    const done = typeof options === "function" ? options : callback;
    done(err);
  };
  return execFile;
};

let home;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "axonrouter-zed-"));
  state.home = home;
  state.execFile.mockReset();
  json.mockClear();
  // Keep the temp home authoritative; a real XDG dir would leak the host's code.
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_DATA_HOME;
});

afterEach(async () => {
  if (home) await rm(home, { recursive: true, force: true });
});

describe("readZedIdeCredentials (Linux keyring)", () => {
  it("returns the signed-in user + token and mints a system_id", async () => {
    state.execFile.mockImplementation(okExecFile("", SECRET_TOOL_OUTPUT));

    const result = await readZedIdeCredentials();

    expect(result.found).toBe(true);
    expect(result.userId).toBe("4242");
    expect(result.accessToken).toBe('{"access_token":"zdt_live_abc"}');
    expect(result.credentialsUrl).toBe("https://zed.dev");
    expect(typeof result.systemId).toBe("string");
    expect(result.systemId.length).toBeGreaterThan(0);
  });

  it("reports not-found (no throw) when the keyring holds no Zed entry", async () => {
    state.execFile.mockImplementation(okExecFile("", "attribute.url = https://other.dev"));

    const result = await readZedIdeCredentials();

    expect(result.found).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("explains a missing secret-tool binary", async () => {
    const err = new Error("spawn secret-tool ENOENT");
    err.code = "ENOENT";
    state.execFile.mockImplementation(failExecFile(err));

    const result = await readZedIdeCredentials();

    expect(result.found).toBe(false);
    expect(result.error).toMatch(/secret-tool/);
  });
});

describe("POST /api/oauth/zed/import", () => {
  const post = (body) => ({ json: async () => body });

  it("validates and saves an imported session", async () => {
    const res = await importZed(
      post({ accessToken: "zdt_live_abc", userId: 4242, systemId: "sys-1" }),
    );

    expect(res.body.success).toBe(true);
    expect(res.body.connection).toEqual({
      id: "conn-1",
      provider: "zed",
      email: "zed@example.com",
      displayName: "Zed User",
    });
  });

  it("rejects an empty access token with 400", async () => {
    const res = await importZed(post({ accessToken: "   ", userId: "4242" }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Access token/);
  });

  it("rejects a missing user id with 400", async () => {
    const res = await importZed(post({ accessToken: "zdt_live_abc" }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/User id/);
  });

  it("surfaces a token-validation failure as 401 instead of crashing", async () => {
    const mod = await import("open-sse/shared/zedAuth.js");
    mod.fetchZedAuthenticatedUser.mockRejectedValueOnce(new Error("invalid token"));

    const res = await importZed(post({ accessToken: "bad-token", userId: "4242" }));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid token");
  });
});