const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const zlib = require("zlib");
const { pathToFileURL } = require("url");
process.env.PORT = process.env.PORT || "3777";

const origCreate = http.createServer.bind(http);

// Streaming gzip for compressible text responses (HTML/JS/CSS/JSON/SVG).
// Skips SSE, already-encoded bodies, HEAD, 204/304, and non-text payloads.
// gzip must be decided and write/end swapped BEFORE any body byte — otherwise
// the plain body bypasses the stream and an empty gzip trailer is appended
// (Invalid or unexpected token / 0x8b mid-JS).
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

// Per-process secret proving x-axonrouter-real-ip was stamped below rather than sent by the client.
// A bare `next start` / `next dev` never loads this file, so it cannot produce a matching
// header even though the env var is inherited by child processes. Named like x-axonrouter-cli-token
// so the request-detail header sanitizer redacts it too.
const PEER_TOKEN = crypto.randomBytes(24).toString("hex");
process.env.NINEROUTER_PEER_TOKEN = PEER_TOKEN;

let quotaCacheStarted = false;

function startBackgroundTokenRefreshFromCustomServer() {
  if (backgroundRefreshStarted) return;
  backgroundRefreshStarted = true;
  // Prefer source path (repo / standalone that still has src). Fail-open if missing
  // — initializeApp also starts the same scheduler when the Next app boots.
  const modPath = path.join(__dirname, "src", "sse", "services", "backgroundTokenRefresh.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        m.startBackgroundTokenRefresh();
      } catch (e) {
        console.error("[BackgroundTokenRefresh] start failed:", e && e.message ? e.message : e);
      }
      const stop = () => {
        try {
          m.stopBackgroundTokenRefresh();
        } catch {
          /* ignore */
        }
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((e) => {
      // Expected in published CLI standalone (src/ not on disk). App bootstrap covers it.
      if (process.env.DEBUG_BACKGROUND_TOKEN_REFRESH) {
        console.error("[BackgroundTokenRefresh] import failed:", e && e.message ? e.message : e);
      }
    });
}

function startQuotaCacheFromCustomServer() {
  if (quotaCacheStarted) return;
  quotaCacheStarted = true;
  const modPath = path.join(__dirname, "src", "domain", "quotaCache.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        m.startBackgroundRefresh();
      } catch (e) {
        console.error("[QuotaCache] start failed:", e && e.message ? e.message : e);
      }
      const stop = () => {
        try {
          m.stopBackgroundRefresh();
        } catch {}
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((e) => {
      if (process.env.DEBUG_QUOTA_CACHE) {
        console.error("[QuotaCache] import failed:", e && e.message ? e.message : e);
      }
    });
}

// Wrap Next standalone HTTP server: derive client IP from the TCP socket
// (unspoofable) and strip client-supplied forwarding headers so downstream
// rate-limiting keys on the real peer address instead of attacker-controlled XFF.
http.createServer = (...args) => {
  const handler = args.find((a) => typeof a === "function");
  const rest = args.filter((a) => typeof a !== "function");
  if (!handler) return origCreate(...args);
  const wrapped = (req, res) => {
    const socketIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
    const xff = req.headers["x-forwarded-for"];
    const xRealIp = req.headers["x-real-ip"];
    const viaProxy = !!(xff || xRealIp);
    const isLoopbackProxy = socketIp === "127.0.0.1" || socketIp === "::1" || socketIp === "::ffff:127.0.0.1";
    // Trust forwarding headers only when the TCP peer is a local reverse proxy.
    // Direct/public sockets remain keyed by the unspoofable peer address.
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
  server.once("listening", () => {
    startQuotaCacheFromCustomServer();
  });
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
      Object.assign(replay, { method: req.method, url: req.url, headers: req.headers, complete: true });
      if (received) replay.push(Buffer.concat(chunks, received).subarray(0, contentLength));
      replay.push(null);
      const res = new http.ServerResponse(replay);
      res.shouldKeepAlive = false;
      res.assignSocket(socket);
      res.once("finish", () => socket.end());
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
      socket.resume();
    }
    delete req.headers.upgrade;
    delete req.headers["http2-settings"];
    req.headers.connection = "close";
    return true;
  };
  return server;
};

if (require.main === module) {
  const standalone = path.join(__dirname, "server.js");
  if (fs.existsSync(standalone)) {
    require(standalone);
  } else {
    // Repo checkout has no standalone build next to us. `next start` builds its HTTP
    // server in-process, so the wrapper above still sanitizes every request.
    const nextBin = require.resolve("next/dist/bin/next");
    process.argv = [process.argv[0], nextBin, "start", ...process.argv.slice(2)];
    require(nextBin);
  }
}
