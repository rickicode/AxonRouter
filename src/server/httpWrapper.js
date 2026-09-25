// TCP socket peer sanitization & HTTP server wrapping.
// Ensures client IP is derived from the real socket rather than spoofable headers.
import http from "node:http";
import crypto from "node:crypto";
import zlib from "node:zlib";

const origCreate = http.createServer.bind(http);
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

export function wrapCompression(req, res) {
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
    gzip.on("data", (chunk) => origWrite(chunk));
    gzip.on("end", () => origEnd());
    gzip.on("error", () => {
      try {
        origEnd();
      } catch {}
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
    return gzip.write(chunk, typeof enc === "function" ? enc : cb);
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
    const finish = () => gzip.end();
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
  return origCreate(...rest, wrapped);
};

export { PEER_TOKEN, origCreate };
