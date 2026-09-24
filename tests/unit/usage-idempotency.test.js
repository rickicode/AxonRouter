// DB-level idempotency for usage writes: two concurrent completions of the
// same upstream attempt (same request_id) must produce exactly one history
// row and one counting increment. Requires live Postgres (DATABASE_URL),
// same as postgres-e2e.test.js — skipped otherwise.
import { describe, it, expect } from "vitest";
import { getAdapter } from "@/lib/db/driver.js";
import { saveRequestUsage } from "@/lib/db/repos/usageRepo.js";

const hasDb = !!process.env.DATABASE_URL;
const describeDb = hasDb ? describe : describe.skip;

describeDb("usage write idempotency", () => {
  it("double saveRequestUsage with same request_id counts once", async () => {
    const db = await getAdapter();
    const requestId = `idem-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ts = new Date().toISOString();
    const entry = () => ({
      provider: "idem-provider",
      model: "idem-model",
      tokens: { prompt_tokens: 10, completion_tokens: 5 },
      timestamp: ts,
      requestId,
      apiKey: "idem-key",
      endpoint: "/v1/chat/completions",
      isStream: false,
    });

    await Promise.all([saveRequestUsage(entry()), saveRequestUsage(entry())]);

    const rows = await db.all(
      `SELECT id FROM usage_history WHERE request_id = $1`,
      [requestId],
    );
    expect(rows.length).toBe(1);

    await db.run(`DELETE FROM usage_history WHERE request_id = $1`, [requestId]);
  });

  it("entries without request_id keep legacy dedupe behavior", async () => {
    const db = await getAdapter();
    const ts = new Date().toISOString();
    const entry = () => ({
      provider: "idem-provider-legacy",
      model: "idem-model-legacy",
      tokens: { prompt_tokens: 7, completion_tokens: 3 },
      timestamp: ts,
      apiKey: "idem-key",
      endpoint: "/v1/chat/completions",
      isStream: false,
    });

    await saveRequestUsage(entry());
    await saveRequestUsage(entry());

    const rows = await db.all(
      `SELECT id FROM usage_history WHERE provider = $1 AND timestamp = $2`,
      ["idem-provider-legacy", ts],
    );
    expect(rows.length).toBe(1);

    await db.run(`DELETE FROM usage_history WHERE provider = $1 AND timestamp = $2`,
      ["idem-provider-legacy", ts]);
  });
});
