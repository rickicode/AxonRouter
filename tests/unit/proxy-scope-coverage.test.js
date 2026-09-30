import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Every code path that resolves a proxy pool for a real upstream call has to carry
// a `proxyPoolScope`. Without one, pickProxyPoolId() receives scope=null and
// fitPoolIds() is a silent no-op — the executor keeps re-picking a pool that
// another request already reported as unfit (region block, per-IP limit, dead
// egress). That was true of the TokenHarbor/OpenRouter failover paths and of the
// quota refresh, which additionally passed the connection ROW instead of
// providerSpecificData and therefore resolved to "no proxy" at all.
const SCANNED = [
  "src/app/api/v1/models/route.js",
  "src/app/api/usage/[connectionId]/route.js",
  "src/app/api/usage/[connectionId]/codex-reset-credits/route.js",
  "src/app/api/providers/[id]/models/route.js",
  "src/app/api/providers/[id]/test/testUtils.js",
  "src/domain/quotaCache.js",
  "src/sse/services/auth.js",
  "src/sse/services/jevProxy.js",
  "src/sse/services/antigravityQuota.js",
  "src/sse/services/capabilityProxy.js",
  "src/sse/handlers/chat.js",
  "open-sse/executors/openrouter.js",
  "open-sse/executors/tokenharbor.js",
];

// A call that pins one already-chosen pool, or passes no proxy config at all,
// has no rotation to filter — scope would be meaningless there. Matched against
// the captured ARGUMENT, not the whole line, so these are arg-only patterns.
const NEEDS_SCOPE_NEITHER = [/proxyPoolId\s*:/, /^\s*\{\s*\}?\s*[,)]/];

// The scope may sit on the object literal above the call, or — for a multi-line
// argument list — on the line just below it, so the window straddles the call.
const CTX_BEFORE = 12;
const CTX_AFTER = 4;

function callSites(src) {
  const lines = src.split("\n");
  const out = [];
  lines.forEach((line, i) => {
    const m = line.match(/resolveConnectionProxyConfig\((.*)$/);
    if (!m) return;
    out.push({ line: i + 1, arg: m[1], idx: i });
  });
  return out;
}

describe("proxy pool scope coverage", () => {
  it("scans the expected files", () => {
    for (const f of SCANNED) {
      const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
      expect(callSites(src).length, `${f} should call resolveConnectionProxyConfig`).toBeGreaterThan(0);
    }
  });

  it("every rotating proxy resolution carries a proxyPoolScope", () => {
    const gaps = [];
    for (const f of SCANNED) {
      const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
      const lines = src.split("\n");
      for (const c of callSites(src)) {
        if (NEEDS_SCOPE_NEITHER.some((re) => re.test(c.arg))) continue;
        const ctx = lines
          .slice(Math.max(0, c.idx - CTX_BEFORE), c.idx + CTX_AFTER + 1)
          .join("\n");
        if (!ctx.includes("proxyPoolScope")) gaps.push(`${f}:${c.line}`);
      }
    }
    expect(gaps, `unscoped proxy resolution(s): ${gaps.join(", ")}`).toEqual([]);
  });

  it("quota refresh passes providerSpecificData, not the connection row", () => {
    // resolveConnectionProxyConfig reads psd.proxyPoolIds / psd.proxyGroup. A
    // connection row nests them one level down, so passing the row made every
    // quota refresh go out on direct egress with no proxy at all.
    const src = readFileSync(new URL("../../src/domain/quotaCache.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/resolveConnectionProxyConfig\(conn\s*\)/);
    expect(src).toMatch(/resolveConnectionProxyConfig\(\s*psd\s*,\s*conn\.id\s*\)/);
  });

  it("executor failover paths scope the picker they re-resolve", () => {
    for (const f of ["open-sse/executors/tokenharbor.js", "open-sse/executors/openrouter.js"]) {
      const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
      const lines = src.split("\n");
      const sites = callSites(src);
      expect(sites.length, `${f} should have failover call sites`).toBeGreaterThan(0);
      for (const c of sites) {
        // The first argument is a psd built one line above; resolve that variable
        // back to its declaration and require the scope to be part of it.
        const ident = c.arg.match(/^\s*([A-Za-z_$][\w$]*)/)?.[1];
        expect(ident, `${f}:${c.line} should pass a named psd`).toBeTruthy();
        let decl = null;
        for (let i = c.idx - 1; i >= Math.max(0, c.idx - 8); i--) {
          if (new RegExp(`(const|let)\\s+${ident}\\s*=`).test(lines[i])) { decl = lines[i]; break; }
        }
        expect(decl, `${f}:${c.line} should declare ${ident}`).toBeTruthy();
        expect(decl, `${f}:${c.line}: ${ident} must be built with proxyPoolScope`)
          .toMatch(/proxyPoolScope/);
      }
    }
  });
});