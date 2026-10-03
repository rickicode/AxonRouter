// Active in-flight requests: the payload the dashboard renders, and the one field
// that needed real work rather than layout.
//
// The account column used to read "noauth" for every keyless provider. That is the
// literal connection id auth.js synthesises for providers with noAuth — it says
// nothing about where a request actually went. Those requests now carry the egress
// pool, and getActiveRequests resolves it to a readable label, so the dashboard can
// show the proxy instead.
//
// A source-level guard is included because the whole point of this change is that a
// placeholder id must never reach the Account column again, and that is a property of
// usageRepo's mapping rather than of anything the unit tests can observe.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveActiveRequestAccount } from "../../src/lib/db/repos/usageRepo.js";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const repoSrc = readFileSync(
  new URL("../../src/lib/db/repos/usageRepo.js", import.meta.url),
  "utf8"
);
const modalSrc = readFileSync(
  new URL(
    "../../src/app/(dashboard)/dashboard/usage/components/realtime/ActiveRequestsModal.js",
    import.meta.url
  ),
  "utf8"
);
const schemaSrc = readFileSync(new URL("../../src/lib/db/schema.pg.js", import.meta.url), "utf8");
const chatCoreSrc = readFileSync(
  new URL("../../open-sse/handlers/chatCore.js", import.meta.url),
  "utf8"
);

describe("active_requests carries the egress pool", () => {
  it("the column exists and is additive", () => {
    expect(schemaSrc).toMatch(
      /ALTER TABLE active_requests ADD COLUMN IF NOT EXISTS proxy_pool_id TEXT/
    );
    expect(schemaSrc).toMatch(/proxy_pool_id TEXT,/);
  });

  it("is written on insert", () => {
    expect(repoSrc).toMatch(/INSERT INTO active_requests \([^)]*proxy_pool_id/);
  });

  it("is read back on the active-request query", () => {
    expect(repoSrc).toMatch(/SELECT request_id, model, provider, connection_id, api_key, is_stream, proxy_pool_id/);
  });
});

describe("chatCore reports the pool it is using", () => {
  it("passes the resolved pool id when registering the request", () => {
    expect(chatCoreSrc).toMatch(/activeProxyPoolId/);
    expect(chatCoreSrc).toMatch(/proxyPoolId: activeProxyPoolId/);
  });

  it("reads the pool from the credentials, not from proxyOptions", () => {
    // proxyOptions is built further down the function than the registration, so
    // reading it here would always be null.
    expect(chatCoreSrc).toMatch(/credentials\?\.providerSpecificData\?\.proxyPoolId/);
  });
});

describe("the placeholder account id is replaced, not just relabelled", () => {
  it("is wired up through the tested helper", () => {
    expect(repoSrc).toMatch(/resolveActiveRequestAccount\(item, connectionMap, poolMap\)/);
    expect(repoSrc).toMatch(/accountIsProxy: synthetic/);
    expect(repoSrc).toMatch(/proxyLabel,/);
  });

  it("resolves a pool id to a readable label, not a raw uuid", () => {
    expect(repoSrc).toMatch(/getProxyPoolLabelMap/);
    expect(repoSrc).toMatch(/SELECT p\.id, p\.name, p\.proxy_url, g\.name AS group_name/);
    // Falls back to the host so a nameless pool is still recognisable.
    expect(repoSrc).toMatch(/new URL\(r\.proxy_url\)\.host/);
  });
});

// Behavioural, not source-level. This shipped broken: the account column read "noauth"
// on a live keyless request while proxyLabel sat next to it, resolved and correct. The
// inline `||` chain preferred the truthy literal "noauth" over the proxy fallback, and
// the only assertion then in place checked that the fallback was *mentioned* — which a
// broken chain satisfies perfectly.
describe("resolveActiveRequestAccount", () => {
  const CONNS = { "conn-1": "user@example.com" };
  const POOLS = { "pool-1": "BrightData DC ID 042 (superproxy)" };

  it("shows the proxy instead of the placeholder for a keyless request", () => {
    const r = resolveActiveRequestAccount(
      { connectionId: "noauth", proxyPoolId: "pool-1", provider: "opencode" },
      CONNS,
      POOLS
    );
    expect(r.account).toBe("BrightData DC ID 042 (superproxy)");
    expect(r.account).not.toBe("noauth");
    expect(r.accountIsProxy).toBe(true);
    expect(r.proxyLabel).toBe("BrightData DC ID 042 (superproxy)");
  });

  it("treats a missing connection id the same way", () => {
    const r = resolveActiveRequestAccount(
      { connectionId: null, proxyPoolId: "pool-1", provider: "opencode" },
      CONNS,
      POOLS
    );
    expect(r.account).toBe("BrightData DC ID 042 (superproxy)");
    expect(r.accountIsProxy).toBe(true);
  });

  it("says so explicitly when a keyless request has no proxy recorded", () => {
    // Better than inventing an account, and better than the old "Unknown Account".
    const r = resolveActiveRequestAccount(
      { connectionId: "noauth", proxyPoolId: null, provider: "opencode" },
      CONNS,
      POOLS
    );
    expect(r.account).toBe("Keyless, no proxy recorded (opencode)");
    expect(r.accountIsProxy).toBe(true);
    expect(r.proxyLabel).toBeNull();
  });

  it("still prefers a real account for an authenticated request", () => {
    const r = resolveActiveRequestAccount(
      { connectionId: "conn-1", proxyPoolId: "pool-1", provider: "antigravity" },
      CONNS,
      POOLS
    );
    expect(r.account).toBe("user@example.com");
    expect(r.accountIsProxy).toBe(false);
    // The proxy is still reported so the UI can show it as its own field.
    expect(r.proxyLabel).toBe("BrightData DC ID 042 (superproxy)");
  });

  it("falls back to the raw connection id when the account map misses", () => {
    const r = resolveActiveRequestAccount(
      { connectionId: "conn-unknown", provider: "antigravity" },
      CONNS,
      POOLS
    );
    expect(r.account).toBe("conn-unknown");
    expect(r.accountIsProxy).toBe(false);
  });

  it("names the provider when a keyless row has no proxy at all", () => {
    // No connection id and no pool id: the request is still attributable to a
    // provider, and naming it beats an invented account or a bare placeholder.
    const r = resolveActiveRequestAccount({ provider: "xai" }, CONNS, POOLS);
    expect(r.account).toBe("Keyless, no proxy recorded (xai)");
    expect(r.accountIsProxy).toBe(true);
  });

  it("never reaches for an invented account name", () => {
    // The old chain ended in "Unknown Account (...)", but that operand was
    // unreachable on the authenticated branch and misleading on the keyless one.
    expect(repoSrc).not.toMatch(/Unknown Account \(/);
  });

  it("treats a pool id with no resolved label as no proxy rather than leaking the id", () => {
    const r = resolveActiveRequestAccount(
      { connectionId: "noauth", proxyPoolId: "pool-gone", provider: "opencode" },
      CONNS,
      POOLS
    );
    // pool-gone is absent from POOLS, so there is no label to show. Showing the raw
    // uuid would be noise; showing that it is unknown is honest.
    expect(r.account).toBe("Keyless, no proxy recorded (opencode)");
    expect(r.account).not.toContain("pool-gone");
  });

  it("never returns the literal placeholder in any case", () => {
    const cases = [
      { connectionId: "noauth", proxyPoolId: "pool-1", provider: "opencode" },
      { connectionId: "noauth", provider: "opencode" },
      { connectionId: null, provider: "opencode" },
      { provider: "opencode" },
    ];
    for (const item of cases) {
      expect(resolveActiveRequestAccount(item, CONNS, POOLS).account).not.toBe("noauth");
    }
  });
});

describe("the modal renders every field and labels the proxy", () => {
  it("is a responsive grid, not a clipped table", () => {
    expect(modalSrc).toMatch(/grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3/);
    // The six-column table with fixed max-widths inside overflow-hidden is what made
    // this unusable on a phone. Asserted against className so the comments that
    // explain the history do not count as usage, and the only max-w-* left is the
    // modal's own width.
    expect(modalSrc).not.toMatch(/<table/);
    expect(modalSrc).not.toMatch(/<th\b/);
    expect(modalSrc).not.toMatch(/className="[^"]*overflow-hidden/);
  });

  it("wraps values rather than truncating them", () => {
    expect(modalSrc).toMatch(/break-words/);
  });

  it("labels the account field as Proxy for a keyless request", () => {
    expect(modalSrc).toMatch(/accountIsProxy \? "Proxy" : "Account"/);
    expect(modalSrc).toMatch(/accountIsProxy \? "lan" : "account_circle"/);
  });
  it("shows the proxy as its own field when there is a real account", () => {
    expect(modalSrc).toMatch(/req\.proxyLabel/);
  });

  it("renders model route with provider slash, account, proxy and elapsed without noisy api key", () => {
    expect(modalSrc).toMatch(/formatProviderModel/);
    expect(modalSrc).toMatch(/TimeAgo/);
    expect(modalSrc).not.toMatch(/clientApiKey/);
    expect(modalSrc).not.toMatch(/label="API Key"/);
  });

  it("formats provider and model with a slash prefix like ag/gemini", () => {
    expect(modalSrc).toMatch(/formatProviderModel\(req\.provider, req\.model\)/);
    expect(modalSrc).toMatch(/alias \? \(/);
  });

  it("has no field that only repeats the mode badge", () => {
    // A "Mode" cell existed to fill the slot when there was no proxy to show. It only
    // restated the STREAM/JSON badge already on the card, which is a control with no
    // purpose behind it.
    expect(modalSrc).not.toMatch(/label="Mode"/);
  });
});

// Anti-slop Hard Gates applied to this component: R-02 (no em dash in copy),
// R-04 (no cliche icons), R-27 (loading/error state, not just empty).
describe("anti-slop gates on the in-flight modal", () => {
  it("R-02: no em dash anywhere in the render path", () => {
    // Strip comments before scanning. Filtering on "line starts with //" misses the
    // continuation lines of a wrapped comment, and an em dash can also hide inside a
    // multi-line JSX text node, which is where a real violation in the chain editor
    // was hiding past a line-based filter.
    const rendered = modalSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(rendered).not.toMatch(/—/);
  });

  it("R-04: no lightning icon, which is on the cliche list", () => {
    expect(modalSrc).not.toMatch(/name="bolt"/);
  });

  it("R-27/R-38: says so when the feed is stale instead of claiming live", () => {
    // syncActiveRequests swallows its own errors, so a dead feed leaves the last rows
    // on screen. Presenting those as live is worse than showing nothing.
    expect(modalSrc).toMatch(/activeFeedStale/);
    expect(modalSrc).toMatch(/Reconnecting, list may be out of date/);
    expect(modalSrc).toMatch(/Not refreshing/);
  });

  it("stops the pulsing dot when the feed is stale", () => {
    // The ping is the strongest claim the component makes that data is arriving. Left
    // running next to a "reconnecting" banner the UI contradicts itself, and the dot
    // is the part an operator glances at rather than reads.
    const ping = modalSrc.match(/animate-ping/g) || [];
    expect(ping).toHaveLength(1);
    expect(modalSrc).toMatch(/\{!activeFeedStale && \(\s*<span[^>]*animate-ping/s);
  });

  it("does not claim nothing is running when the feed is down", () => {
    // With a dead feed and zero rows, "No active in-flight requests" is a claim the
    // component cannot support. It has to distinguish "nothing is in flight" from
    // "I cannot see anything".
    expect(modalSrc).toMatch(/Cannot see in-flight requests while the feed is down/);
    expect(modalSrc).toMatch(/not a report that nothing is running/);
    // The reassuring wording may only survive on the branch that has a live feed.
    const staleBranch = modalSrc.indexOf("Cannot see in-flight requests");
    const emptyLabel = modalSrc.indexOf("No active in-flight requests");
    expect(emptyLabel).toBeGreaterThan(staleBranch);
  });

  it("does not repeat the liveness claim twice", () => {
    // A footer used to read "Live updates active" regardless of feed health, right
    // below a header that now reports staleness. Two statements of the same fact, one
    // of which cannot be true, is worse than one.
    expect(modalSrc).not.toMatch(/Live updates active/);
  });

  it("R-38: a missing value is spelled out, not shown as a dash", () => {
    // A dash is indistinguishable from an empty value at a glance.
    expect(modalSrc).toMatch(/not reported/);
    expect(modalSrc).not.toMatch(/\|\| "—"/);
  });
});

describe("the feed staleness flag is actually derived from a success", () => {
  const statsSrc = src("../../src/shared/components/UsageStats.js");

  it("stamps only successful fetches", () => {
    // The stamp has to be inside the success branch; stamping on dispatch would keep
    // reporting "live" through an outage.
    const stamp = statsSrc.indexOf("lastActiveSyncRef.current = Date.now()");
    const fetchOk = statsSrc.indexOf("(r.ok ? r.json() : null)");
    expect(stamp).toBeGreaterThan(-1);
    expect(fetchOk).toBeGreaterThan(-1);
    expect(stamp).toBeGreaterThan(fetchOk);
  });

  it("checks staleness on a timer and clears it with the rest", () => {
    expect(statsSrc).toMatch(/stalenessWatch = setInterval/);
    expect(statsSrc).toMatch(/clearInterval\(stalenessWatch\)/);
  });
});
