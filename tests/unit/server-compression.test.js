// wrapCompression must emit a valid gzip stream with Content-Encoding: gzip.
// The old bug wrote plain JS first and appended an empty gzip trailer (0x8b at 530).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import http from "node:http";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);

let server;
let baseUrl;

beforeAll(async () => {
  require("../../server.js");
  server = http.createServer((req, res) => {
    if (req.url === "/static.js") {
      res.setHeader("content-type", "application/javascript; charset=UTF-8");
      res.end("(self.webpackChunk_N=[\"main-app\"]);");
      return;
    }
    if (req.url === "/write-before-head") {
      res.setHeader("content-type", "application/javascript");
      res.write("(self.webpackChunk_N=[1]);");
      res.end();
      return;
    }
    if (req.url === "/sse") {
      res.setHeader("content-type", "text/event-stream");
      res.end("data: x\n\n");
      return;
    }
    res.setHeader("content-type", "text/plain");
    res.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function rawGet(path, headers) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port: server.address().port, path, headers: headers || {} },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
  });
}

describe("server.js wrapCompression", () => {
  it("gzips JS with Content-Encoding and valid stream", async () => {
    const { headers, body } = await rawGet("/static.js", { "accept-encoding": "gzip" });
    expect(headers["content-encoding"]).toBe("gzip");
    expect(body[0]).toBe(0x1f);
    expect(body[1]).toBe(0x8b);
    const plain = zlib.gunzipSync(body).toString("utf8");
    expect(plain).toBe('(self.webpackChunk_N=["main-app"]);');
    // Must not be plain body + empty gzip trailer
    expect(body.includes(Buffer.from([0x8b]))).toBe(true);
    const wrong = Buffer.concat([Buffer.from('(self.webpackChunk_N=["main-app"]);'), body]);
    // original bug: plain then empty gzip — gunzip of concat must fail; pure gzip must succeed
    expect(() => zlib.gunzipSync(wrong)).toThrow();
    expect(() => zlib.gunzipSync(body)).not.toThrow();
  });

  it("compresses when write() runs before writeHead()", async () => {
    const { headers, body } = await rawGet("/write-before-head", { "accept-encoding": "gzip" });
    expect(headers["content-encoding"]).toBe("gzip");
    const plain = zlib.gunzipSync(body).toString("utf8");
    expect(plain).toBe('(self.webpackChunk_N=[1]);');
  });

  it("leaves SSE uncompressed", async () => {
    const { headers, body } = await rawGet("/sse", { "accept-encoding": "gzip" });
    expect(headers["content-encoding"]).toBeUndefined();
    expect(body.toString()).toBe("data: x\n\n");
  });

  it("returns identity when client does not accept gzip", async () => {
    const { headers, body } = await rawGet("/static.js", {});
    expect(headers["content-encoding"]).toBeUndefined();
    expect(body.toString()).toBe('(self.webpackChunk_N=["main-app"]);');
  });
});
