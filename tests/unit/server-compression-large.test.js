// Regression: large chunked JSON via patched res.write must not deadlock.
// Old bug: patched write returned gzip.write()===true while the socket lagged;
// callers relying on res.write()===false + res "drain" never resumed → hang.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import http from "node:http";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);

const servers = [];

function makeServer(size, chunkSize) {
  const big = JSON.stringify({
    rows: Array.from({ length: Math.max(1, size / 138) }, (_, i) => ({ a: i, b: "x".repeat(100) })),
  });
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    let i = 0;
    (function w() {
      while (i < big.length) {
        const part = big.slice(i, i + chunkSize);
        i += chunkSize;
        if (!res.write(part)) {
          res.once("drain", w);
          return;
        }
      }
      res.end();
    })();
  });
  servers.push(server);
  return { server, len: big.length };
}

function get(port, headers) {
  return new Promise((resolve, reject) => {
    const rq = http.get({ host: "127.0.0.1", port, path: "/x", headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
    });
    rq.setTimeout(5000, () => rq.destroy(new Error("timeout")));
    rq.on("error", reject);
  });
}

beforeAll(async () => {
  require("../../server.js");
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
});

describe("wrapCompression large chunked bodies", () => {
  it.each([
    [5000, 500],
    [107052, 500],
    [345000, 500],
    [1000000, 500],
    [345000, 8000],
  ])("no hang at %i bytes (chunk=%i)", async (size, chunk) => {
    const { server, len } = makeServer(size, chunk);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const res = await get(server.address().port, { "accept-encoding": "gzip" });
    expect(res.headers["content-encoding"]).toBe("gzip");
    const plain = zlib.gunzipSync(res.body).toString();
    expect(plain.length).toBe(len);
  });
});
