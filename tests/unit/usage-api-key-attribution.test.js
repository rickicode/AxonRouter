// Live usage stats must attribute per-API-key usage to the key that spent it.
//
// API keys minted from one install share the sk-{machineId} prefix. Keying the
// byApiKey bucket on a head-only mask (maskApiKey kept 8 chars) collapsed two
// such keys into ONE bucket per model/provider, so the dashboard showed one
// holder's tokens under the other's name.
//
// The bucket is now keyed by a SHA-256 digest of the full key — unique per key
// (collision gone) and non-invertible. The raw key must NOT replace it: the
// bucket id is persisted in usage_daily's day JSON and shipped verbatim as an
// object key by /api/usage/stats, so a cleartext key there would be a new
// at-rest and over-the-wire secret. The masked value still rides on the bucket
// for display.
//
// Requires live Postgres (DATABASE_URL), same as the other db-backed tests —
// skipped otherwise.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

let tempDir;
let db;

beforeAll(async () => {
  if (!hasDb) return;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axonrouter-api-key-attribution-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("../../src/lib/db/index.js");
  await db.initDb();
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

const save = (entry) => db.saveRequestUsage({
  connectionId: "c1",
  endpoint: "/v1/chat",
  status: "ok",
  ...entry,
});

describeDb("Usage stats API key attribution", () => {
  it("keeps API keys with the same masked prefix in separate buckets", async () => {
    // Both keys share the whole 8-char head "sk-machi", which is exactly the
    // collision the old mask produced.
    const apiKeyA = "sk-machine-aaaaaa-11111111";
    const apiKeyB = "sk-machine-bbbbbb-22222222";
    const provider = `attr-provider-${Date.now()}`;
    const model = "attr-model";

    await save({ provider, model, apiKey: apiKeyA, tokens: { prompt_tokens: 10, completion_tokens: 5 } });
    await save({ provider, model, apiKey: apiKeyB, tokens: { prompt_tokens: 20, completion_tokens: 10 } });
    await db.flushUsageQueue();

    const stats = await db.getUsageStats("24h");
    const entries = Object.values(stats.byApiKey).filter((e) => e.rawModel === model && e.provider === provider);

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.promptTokens).sort((a, b) => a - b)).toEqual([10, 20]);
    // The masked value stays distinguishable in the UI (tail retained).
    expect(entries.map((e) => e.apiKeyMasked).sort()).toEqual([
      "sk-machi***1111",
      "sk-machi***2222",
    ]);
  });

  it("stores byApiKey bucket ids as digests, never the raw key", async () => {
    const raw = "sk-machine-secret-9f8e7d6c";
    const provider = `attr-secret-${Date.now()}`;

    await save({ provider, model: "secret-model", apiKey: raw, tokens: { prompt_tokens: 4, completion_tokens: 2 } });
    await db.flushUsageQueue();

    const stats = await db.getUsageStats("24h");
    const bucket = Object.values(stats.byApiKey).find((e) => e.provider === provider);
    expect(bucket).toBeDefined();
    expect(bucket.apiKeyMasked).toBe("sk-machi***7d6c");

    // The raw key travels through a one-way digest: the persisted day rollup —
    // the object keys of usage_daily.data.byApiKey — must not contain it.
    const { getAdapter } = await import("../../src/lib/db/driver.js");
    const adapter = await getAdapter();
    const rows = await adapter.all(`SELECT data FROM usage_daily ORDER BY date_key ASC`);
    expect(JSON.stringify(rows)).not.toContain(raw);

    const bucketKey = Object.keys(stats.byApiKey).find((k) => k.includes(provider));
    expect(bucketKey).not.toContain(raw);
    expect(bucketKey.startsWith("k")).toBe(true);
  });
});