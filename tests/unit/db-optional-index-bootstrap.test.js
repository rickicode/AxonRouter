// Database bootstrap robustness.
//
// initAdapter() runs PG_SCHEMA_SQL inside a transaction it awaits. That constant is
// executed as one multi-statement exec, so a single unparseable statement aborts the
// transaction, initAdapter rejects, getAdapter never resolves, and every
// database-backed route in the process fails at once.
//
// That is not hypothetical. A GIN index over a jsonb expression written without its
// inner parentheses — `USING GIN (data->'a'->'b')` instead of `USING GIN ((...))` —
// was rejected at "->", and /api/proxy-pools started returning 500 "Failed to fetch
// proxy pools" while the other 51,662 connections and the rest of the schema were
// perfectly fine. An index that only makes something faster must not be able to stop
// the application booting.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const driverSrc = read("../../src/lib/db/driver.js");
const schemaSrc = read("../../src/lib/db/schema.pg.js");

describe("optional indexes are separated from the bootstrap transaction", () => {
  it("exports them as their own constant", () => {
    expect(schemaSrc).toMatch(/export const PG_OPTIONAL_INDEX_SQL/);
    expect(driverSrc).toMatch(/PG_OPTIONAL_INDEX_SQL/);
  });

  it("runs them after the bootstrap transaction, not inside it", () => {
    // Inside the transaction a failure would abort the whole bootstrap, which is the
    // bug. Outside it, a failure costs the query plan and nothing else.
    const execIdx = driverSrc.indexOf("adapter.exec(PG_OPTIONAL_INDEX_SQL)");
    const txEnd = driverSrc.indexOf("await adapter.transaction(async (tx) =>");
    expect(txEnd).toBeGreaterThan(-1);
    expect(execIdx).toBeGreaterThan(txEnd);
    // And it must not be handed the transaction handle.
    expect(driverSrc).not.toMatch(/tx\.exec\(PG_OPTIONAL_INDEX_SQL\)/);
  });

  it("does not let an optional-index failure reject the adapter", () => {
    // The catch is the whole point. Asserted on the shape rather than by booting a
    // database, because the failure being defended against is a boot failure.
    const block = driverSrc.slice(
      driverSrc.indexOf("adapter.exec(PG_OPTIONAL_INDEX_SQL)") - 120,
      driverSrc.indexOf("adapter.exec(PG_OPTIONAL_INDEX_SQL)") + 220
    );
    expect(block).toMatch(/catch/);
    expect(block).toMatch(/Optional index bootstrap skipped/);
    expect(block).not.toMatch(/throw err/);
  });

  it("keeps the performance-only indexes out of the required schema", () => {
    const required = schemaSrc.slice(0, schemaSrc.indexOf("export const PG_OPTIONAL_INDEX_SQL"));
    for (const idx of ["idx_pc_proxy_pool_id", "idx_pc_proxy_pool_ids"]) {
      expect(required, `${idx} must not be in the bootstrap schema`).not.toMatch(idx);
      expect(schemaSrc).toMatch(idx);
    }
  });
});

describe("jsonb expression indexes are syntactically valid", () => {
  // Postgres rejects `USING GIN (expr)` without the inner parentheses, at "->". The
  // statement is valid SQL to read and invalid to run, which is why it needs a gate
  // rather than a reviewer's eye.
  // Only the template literal. Everything after the export includes
  // ensureMonthlyPartitions, whose partition indexes are built per-suffix inside a
  // loop and are deliberately not part of this constant.
  const from = schemaSrc.indexOf("export const PG_OPTIONAL_INDEX_SQL");
  const optional = schemaSrc.slice(from, schemaSrc.indexOf("\n`;", from));

  it("double-parenthesises every GIN expression", () => {
    const gin = [...optional.matchAll(/USING GIN \(([^)]*)\)/g)].map((m) => m[0]);
    expect(gin.length).toBeGreaterThan(0);
    for (const stmt of gin) {
      expect(stmt, `GIN expression needs inner parens: ${stmt}`).toMatch(/USING GIN \(\(/);
    }
  });

  it("double-parenthesises every plain btree expression too", () => {
    // Same failure mode: an index over an expression needs the inner node wrapped.
    const btree = [...optional.matchAll(/ON\s+\w+\s+\((?![\s(]*\()([^)]*->[^)]*)\)/g)].map((m) => m[0]);
    for (const stmt of btree) {
      expect(stmt, `btree expression needs inner parens: ${stmt}`).toMatch(/ON\s+\w+\s+\(\(/);
    }
  });

  it("stays idempotent, since it runs on every boot", () => {
    const creates = [...optional.matchAll(/CREATE\s+INDEX\s+(CONCURRENTLY\s+)?IF NOT EXISTS/g)];
    expect(creates.length).toBeGreaterThan(0);
    expect(optional.match(/CREATE\s+INDEX\s+(CONCURRENTLY\s+)?IF NOT EXISTS/g).length)
      .toBe([...optional.matchAll(/CREATE\s+INDEX/g)].length);
  });

  it("uses CONCURRENTLY so a large table is not locked against live traffic", () => {
    // provider_connections holds 51663 rows. An index build without CONCURRENTLY takes
    // a write lock for the duration.
    const creates = [...optional.matchAll(/CREATE INDEX\s+[^;]+;/g)].map((m) => m[0]);
    for (const stmt of creates) {
      expect(stmt, `index build must be concurrent: ${stmt.slice(0, 60)}`)
        .toMatch(/CREATE INDEX CONCURRENTLY/);
    }
  });
});

describe("the required schema still fails loudly", () => {
  // The separation must not turn into silence for things the application actually
  // needs. PG_SCHEMA_SQL failing has to keep rejecting the adapter.
  it("rethrows a bootstrap failure", () => {
    const from = driverSrc.indexOf("await adapter.transaction(async (tx) =>");
    const tx = driverSrc.slice(from, driverSrc.indexOf("return adapter;", from));
    expect(tx).toMatch(/Bootstrap schema error/);
    expect(tx).toMatch(/throw err/);
  });
});