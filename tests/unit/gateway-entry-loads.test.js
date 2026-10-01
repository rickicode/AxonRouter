// The gateway entrypoint must load.
//
// This exists because a change removed the rate limiter's counter declaration but
// left the function that used it, producing two top-level `isRateLimited`
// declarations. Node rejects that while compiling the module, so axonrouter-api
// crash-looped on start and served nothing.
//
// `node --check gateway/server.js` passed the whole time, which is the part worth
// remembering: it parses the file as CommonJS, while the gateway loads it through the
// ESM loader. The duplicate was only ever visible when the container tried to boot.
// So the check here parses as ESM, the way the entrypoint is actually loaded.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SERVER = new URL("../../gateway/server.js", import.meta.url);
const src = () => readFileSync(SERVER, "utf8");

/** Parse a copy under an .mjs extension, which forces the ESM loader's parser. */
function parsesAsEsm(source) {
  const dir = mkdtempSync(join(tmpdir(), "gw-esm-"));
  const file = join(dir, "server.mjs");
  writeFileSync(file, source);
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err.stderr || err.message) };
  }
}

describe("gateway/server.js loads as ESM", () => {
  it("has no duplicate top-level declarations", () => {
    // The specific failure: a second `isRateLimited` at module scope.
    const topLevelFns = [...src().matchAll(/^(?:async )?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    const topLevelConsts = [...src().matchAll(/^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]);
    const seen = new Map();
    for (const name of [...topLevelFns, ...topLevelConsts]) {
      seen.set(name, (seen.get(name) || 0) + 1);
    }
    const dupes = [...seen].filter(([, n]) => n > 1).map(([name]) => name);
    expect(dupes, `duplicate top-level declaration(s): ${dupes.join(", ")}`).toEqual([]);
  });

  it("parses under the ESM loader, not just as CommonJS", () => {
    // Catches anything else that only the real loader rejects: top-level await in a
    // file the container treats as ESM, bad import syntax, and so on.
    const res = parsesAsEsm(src());
    expect(res.ok, res.message || "").toBe(true);
  });

  it("still uses the shared limiter, with no per-process counter left behind", () => {
    // A leftover Map would silently restore the WORKERS x limit behaviour.
    const s = src();
    expect(s).not.toMatch(/ipRequestBuckets/);
    expect(s).not.toMatch(/RATE_LIMIT_WINDOW_MS/);
    expect(s).toMatch(/checkRateLimit\(ip/);
  });

  it("awaits the limiter at the one call site", () => {
    // isRateLimited became async when the counter moved off-process. A call site that
    // forgot to await would test a Promise against a boolean and always pass.
    expect(src()).toMatch(/if \(await isRateLimited\(peer\)\)/);
  });
});