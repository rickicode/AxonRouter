/**
 * AxonRouter Worker Relay Proxy — Node.js (VPS) entry point
 *
 * Runs the same relay handler as a standard Node.js HTTP server.
 * Uses native fetch (Node 18+) or falls back gracefully.
 *
 * Usage:
 *   node --import tsx src/server.ts          # dev with tsx
 *   node dist/server.js                       # production build
 *
 * Environment variables:
 *   PORT          - listen port (default: 8787)
 *   HOST          - listen host (default: 0.0.0.0)
 *   ALLOWED_HOSTS - comma-separated allowed target hosts (optional)
 */

import { createServer } from "http";
import { handleRequest } from "./index.js";

const PORT = parseInt(process.env.PORT || "8787", 10);
const HOST = process.env.HOST || "0.0.0.0";

const env: Record<string, unknown> = {
  ALLOWED_HOSTS: process.env.ALLOWED_HOSTS,
};

const server = createServer(async (req, res) => {
  try {
    // Build the full URL from the incoming request
    const protocol = "http"; // proxy itself is HTTP; upstream is always HTTPS
    const url = `${protocol}://${req.headers.host || `localhost:${PORT}`}${req.url}`;

    // Collect request headers into a Headers object
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        // skip host — the handler strips it anyway, and the proxy
        // should not leak its own Host to upstream
        if (key === "host") continue;
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
    }

    // Read request body for non-GET/HEAD
    let body: ReadableStream<Uint8Array> | null = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = new ReadableStream({
        start(controller) {
          req.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
          req.on("end", () => controller.close());
          req.on("error", (err) => controller.error(err));
        },
      });
    }

    // Construct a web-standard Request object
    const webRequest = new Request(url, {
      method: req.method || "GET",
      headers,
      body,
      // @ts-expect-error duplex is needed for streaming body
      duplex: "half",
    });

    // Delegate to the shared handler
    const webResponse = await handleRequest(webRequest, env);

    // Write response status and headers
    const responseHeaders: Record<string, string> = {};
    webResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    res.writeHead(webResponse.status, responseHeaders);

    // Stream the response body
    if (webResponse.body) {
      const reader = webResponse.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch (streamErr) {
        // Client disconnected — that's fine
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
    }

    res.end();
  } catch (err) {
    console.error("[RelayProxy] Unhandled error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[RelayProxy] Listening on http://${HOST}:${PORT}`);
  console.log(`[RelayProxy] Health: http://${HOST}:${PORT}/health`);
  if (process.env.ALLOWED_HOSTS) {
    console.log(`[RelayProxy] Allowed hosts: ${process.env.ALLOWED_HOSTS}`);
  } else {
    console.log(`[RelayProxy] Allowed hosts: * (all https:// targets)`);
  }
});

// Graceful shutdown
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`[RelayProxy] Received ${signal}, shutting down...`);
    server.close(() => process.exit(0));
    // Force exit after 5s if connections don't close
    setTimeout(() => process.exit(1), 5000);
  });
}
