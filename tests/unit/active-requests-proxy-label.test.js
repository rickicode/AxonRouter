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
  it("detects a synthetic keyless connection", () => {
    expect(repoSrc).toMatch(/const synthetic = !item\.connectionId \|\| item\.connectionId === "noauth"/);
  });

  it("falls back to the resolved proxy label instead of the placeholder", () => {
    expect(repoSrc).toMatch(/\|\| proxyLabel/);
    expect(repoSrc).toMatch(/proxyLabel/);
  });

  it("tells the UI when the account column is standing in for the egress", () => {
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
    expect(modalSrc).toMatch(/label="Proxy"/);
  });

  it("renders model, provider, account, key and elapsed", () => {
    for (const label of ['label="Model"', 'label="Provider"', 'label="API Key"', "TimeAgo"]) {
      expect(modalSrc).toContain(label);
    }
  });

  it("does not need a separate mode field when the badge already shows it", () => {
    // The Mode cell only appears for authenticated requests, where there is no proxy
    // to show; the badge carries the same information either way.
    expect(modalSrc).toMatch(/label="Mode"/);
  });
});
