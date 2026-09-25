#!/usr/bin/env node
// AxonRouter server runner — replaces server.js
// Wraps http.createServer for TCP socket peer sanitization and streaming compression.

const http = require("http");
const crypto = require("crypto");
const zlib = require("zlib");

const origCreate = http._origCreateServer || http.createServer.bind(http);
http._origCreateServer = origCreate;
const PEER_TOKEN = crypto.randomBytes(24).toString("hex");
process.env.AXONROUTER_PEER_TOKEN = PEER_TOKEN;

const COMPRESSIBLE_RE = /^(text\/|application\/(?:json|javascript|x-javascript|xml|svg\+xml))/;

function appendVary(value, token) {
  const parts = String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.some((p) => p.toLowerCase() === token.toLowerCase())) parts.push(token);
  return parts.join(", ");
}

function wrapCompression(req, res) {
  if (req.method === "HEAD") return;
  const accept = String(req.headers["accept-encoding"] || "");
  if (!/\bgzip\b/i.test(accept)) return;
  if (res.getHeader("content-encoding")) return;

  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  const origWriteHead = res.writeHead.bind(res);

  let decided = false;
  let shouldCompress = false;
  let gzip = null;
  let drainForwarded = false;

  function ensureGzip() {
    if (decided) return shouldCompress;
    decided = true;
    const contentType = String(res.getHeader("content-type") || "");
    const alreadyEncoded = res.getHeader("content-encoding");
    shouldCompress =
      !alreadyEncoded &&
      COMPRESSIBLE_RE.test(contentType) &&
      !/text\/event-stream/i.test(String(contentType));
    if (!shouldCompress) return false;
    res.removeHeader("content-length");
    res.setHeader("content-encoding", "gzip");
    res.setHeader("vary", appendVary(res.getHeader("vary"), "Accept-Encoding"));
    gzip = zlib.createGzip({ level: 6 });
    // Backpressure-correct: pump via pipe. The previous on("data") pump ignored
    // origWrite's return value, so large JSON bodies (>~100KB) filled the socket
    // buffer and deadlocked mid-stream (browser saw a hang, spinner never ended).
    // end:false — res.end() is ours to call when gzip finishes (finish handler).
    gzip.on("data", (chunk) => origWrite(chunk));
    gzip.on("end", () => origEnd());
    // Honor socket backpressure: pause the gzip stream when the socket says stop,
    // resume on drain. This is what pipe() does internally.
    gzip.on("error", () => {
      try {
        origEnd();
      } catch {
        /* socket already gone */
      }
    });
    return true;
  }

  res.writeHead = function writeHeadPatched(status, reason, headers) {
    let hdrs = headers;
    if (reason && typeof reason === "object" && !Array.isArray(reason)) {
      hdrs = reason;
      reason = undefined;
    }
    if (hdrs && typeof hdrs === "object" && !Array.isArray(hdrs)) {
      for (const [k, v] of Object.entries(hdrs)) {
        const lk = String(k).toLowerCase();
        if (lk === "content-length" || lk === "content-encoding") continue;
        res.setHeader(k, v);
      }
    }
    ensureGzip();
    if (shouldCompress) {
      res.removeHeader("content-length");
      res.setHeader("content-encoding", "gzip");
      return reason === undefined ? origWriteHead(status) : origWriteHead(status, reason);
    }
    if (hdrs && typeof hdrs === "object" && !Array.isArray(hdrs)) {
      return reason === undefined ? origWriteHead(status) : origWriteHead(status, reason);
    }
    if (reason === undefined) return origWriteHead(status);
    if (typeof reason === "string") return origWriteHead(status, reason);
    return origWriteHead(status, reason, headers);
  };

  res.write = function writePatched(chunk, enc, cb) {
    ensureGzip();
    if (!shouldCompress) {
      if (typeof enc === "function") return origWrite(chunk, enc);
      return origWrite(chunk, enc, cb);
    }
    if (!chunk) return typeof enc === "function" ? enc.call(res) : true;
    // Honor BOTH backpressure layers:
    // - gzip.write() may return false when its internal queue is full; the caller
    //   then waits for res "drain" — forward gzip's drain to res so the wait ends.
    // - The socket may lag behind the gzip stream; pause gzip while origWrite
    //   reports backpressure so data never accumulates unbounded.
    let gzipOk;
    let writeCb = null;
    if (typeof enc === "function") {
      gzipOk = gzip.write(chunk, enc);
    } else if (typeof cb === "function") {
      gzipOk = gzip.write(chunk, enc, cb);
      writeCb = cb;
    } else {
      gzipOk = gzip.write(chunk, enc);
    }
    if (!gzipOk) {
      // gzip queue full: make res.drain fire when gzip drains so callers
      // that awaited res.write()===false resume (streaming handlers do).
      if (!drainForwarded) {
        drainForwarded = true;
        gzip.once("drain", () => {
          drainForwarded = false;
          res.emit("drain");
        });
      }
      return false;
    }
    return true;
  };

  res.end = function endPatched(chunk, enc, cb) {
    ensureGzip();
    if (typeof chunk === "function") {
      cb = chunk;
      chunk = null;
      enc = undefined;
    } else if (typeof enc === "function") {
      cb = enc;
      enc = undefined;
    }
    if (!shouldCompress) {
      if (typeof cb === "function") return origEnd(chunk, cb);
      if (enc === undefined) return origEnd(chunk);
      return origEnd(chunk, enc, cb);
    }
    const finish = () => {
      gzip.end();
    };
    // endPatched completes when the gzip stream finishes piping out; surface
    // that through res "finish" so callers awaiting res.end() resolve correctly.
    if (chunk && typeof chunk !== "function") {
      gzip.write(chunk, enc, finish);
    } else {
      finish();
    }
    if (typeof cb === "function") res.once("finish", cb);
    return res;
  };
}

http.createServer = (...args) => {
  const handler = args.find((a) => typeof a === "function");
  const rest = args.filter((a) => typeof a !== "function");
  if (!handler) return origCreate(...args);
  const wrapped = (req, res) => {
    const socketIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
    const xff = req.headers["x-forwarded-for"];
    const xRealIp = req.headers["x-real-ip"];
    const viaProxy = !!(xff || xRealIp);
    const isLoopbackProxy =
      socketIp === "127.0.0.1" || socketIp === "::1" || socketIp === "::ffff:127.0.0.1";
    const proxyIp = xRealIp || (xff ? String(xff).split(",")[0].trim() : "");
    const ip = isLoopbackProxy && proxyIp ? proxyIp : socketIp;

    delete req.headers["x-axonrouter-real-ip"];
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-axonrouter-via-proxy"];
    delete req.headers["x-axonrouter-peer-token"];
    req.headers["x-axonrouter-real-ip"] = ip;
    req.headers["x-axonrouter-peer-token"] = PEER_TOKEN;
    if (viaProxy) req.headers["x-axonrouter-via-proxy"] = "1";
    wrapCompression(req, res);
    return handler(req, res);
  };
  const server = origCreate(...rest, wrapped);
const origEmit = server.emit;
  // JBR 25 sends h2c upgrades that the HTTP/1.1 server would otherwise close.
  server.emit = function (event, ...eventArgs) {
    const [req, socket, head] = eventArgs;
    if (event !== "upgrade" || String(req.headers.upgrade || "").toLowerCase() !== "h2c") {
      return origEmit.call(this, event, ...eventArgs);
    }

    const contentLength = Number(req.headers["content-length"] || 0);
    // Cap buffered body: an unauthenticated upgrade with a giant
    // content-length would buffer until OOM.
    const H2C_MAX_BODY = 32 * 1024 * 1024;
    if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > H2C_MAX_BODY) {
      socket.destroy();
      return true;
    }
    const chunks = [head];
    let received = head.length;
    const serve = () => {
      // Replay the upgraded request through the existing HTTP/1.1 handler.
      const replay = new http.IncomingMessage(socket);
      Object.assign(replay, {
        method: req.method,
        url: req.url,
        headers: { ...req.headers, connection: "close" },
        complete: true,
      });
      delete replay.headers.upgrade;
      delete replay.headers["http2-settings"];
      if (received) replay.push(Buffer.concat(chunks, received).subarray(0, contentLength));
      replay.push(null);
      replay.shouldKeepAlive = false;
      const res = new http.ServerResponse(replay);
      res.assignSocket(socket);
      res.shouldKeepAlive = false;
      res.setHeader("connection", "close");
      res.once("finish", () => {
        socket.destroy();
      });
      Promise.resolve().then(() => wrapped(replay, res)).catch((error) => {
        console.error("Failed to downgrade h2c request", error);
        socket.destroy();
      });
    };
    if (received >= contentLength) serve();
    else {
      // Slowloris guard: an upgrade that stalls mid-body must not hold a
      // socket (and its buffered chunks) open forever.
      socket.setTimeout(30000, () => socket.destroy());
      socket.on("data", function readBody(chunk) {
        chunks.push(chunk);
        received += chunk.length;
        if (received < contentLength) return;
        socket.setTimeout(0);
        socket.off("data", readBody);
        serve();
      });
      process.nextTick(() => socket.resume());
    }
    delete req.headers.upgrade;
    delete req.headers["http2-settings"];
    req.headers.connection = "close";
    return true;
  };
  return server;
};


if (require.main === module) {
  import("./src/server/webServer.mjs").catch((err) => {
    console.error("[Server] Boot error:", err);
    process.exit(1);
  });
}

module.exports = { PEER_TOKEN, origCreate, wrapCompression };
