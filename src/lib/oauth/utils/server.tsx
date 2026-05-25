import http from "http";
import type { AddressInfo } from "net";
import { URL } from "url";

type CallbackParams = Record<string, string>;
type CallbackHandler = (params: CallbackParams) => void;
type WaitForCallbackPromise = Promise<CallbackParams> & {
  __onCallback?: CallbackHandler;
};

type ServerStartResult = {
  server: http.Server;
  port: number;
  close: () => void;
};

type NodeErrorWithCode = Error & {
  code?: string;
};

/**
 * Start a local HTTP server to receive OAuth callback
 * @param {Function} onCallback - Called with query params when callback received
 * @param {number} fixedPort - Optional fixed port number (default: random)
 * @returns {Promise<{server: http.Server, port: number, close: Function}>}
 */
export function startLocalServer(onCallback: CallbackHandler, fixedPort: number | null = null): Promise<ServerStartResult> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost`);

      if (url.pathname === "/callback" || url.pathname === "/auth/callback") {
        const params = Object.fromEntries(url.searchParams);

        // Send success response to browser with auto-close attempt
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authentication Successful</title>
  <style>
    body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .success { color: #22c55e; font-size: 3rem; }
    h1 { margin: 1rem 0; }
    p { color: #666; }
    #countdown { font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="success">&#10003;</div>
    <h1>Authentication Successful</h1>
    <p id="message">Closing in <span id="countdown">3</span> seconds...</p>
  </div>
  <script>
    let count = 3;
    const countdown = document.getElementById("countdown");
    const message = document.getElementById("message");
    const timer = setInterval(() => {
      count--;
      countdown.textContent = count;
      if (count <= 0) {
        clearInterval(timer);
        window.close();
        setTimeout(() => {
          message.textContent = "Please close this tab manually.";
        }, 500);
      }
    }, 1000);
  </script>
</body>
</html>`);

        // Call callback with params
        onCallback(params);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    // Listen on fixed port or find available port
    const portToUse = fixedPort || 0;
    server.listen(portToUse, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? (address as AddressInfo).port : portToUse;
      resolve({
        server,
        port,
        close: () => server.close(),
      });
    });

    server.on("error", (err: NodeErrorWithCode) => {
      if (err.code === "EADDRINUSE" && fixedPort) {
        reject(new Error(`Port ${fixedPort} is already in use. Please close other applications using this port.`));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Wait for callback with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>} - Callback params
 */
export function waitForCallback(timeoutMs = 300000): WaitForCallbackPromise {
  const callbackPromise = new Promise<CallbackParams>((resolve, reject) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Authentication timeout"));
      }
    }, timeoutMs);

    const onCallback: CallbackHandler = (params) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(params);
      }
    };

    // Return the callback function
    (callbackPromise as WaitForCallbackPromise).__onCallback = onCallback;
  }) as WaitForCallbackPromise;

  return callbackPromise;
}

// Singleton proxy server for Codex OAuth callback on fixed port
let codexProxyServer: http.Server | null = null;
let codexProxyTimeout: ReturnType<typeof setTimeout> | null = null;

const CODEX_PROXY_TIMEOUT_MS = 300000; // 5 minutes

/**
 * Start a proxy server on Codex fixed port (1455) that redirects callback to the app port.
 * Returns { success: true } if started, or { success: false } if port is busy.
 */
export function startCodexProxy(appPort: number): Promise<{ success: boolean; reason?: string }> {
  return new Promise((resolve) => {
    // Already running
    if (codexProxyServer) {
      resolve({ success: true });
      return;
    }

    const CODEX_PORT = 1455;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");

      if (url.pathname === "/callback" || url.pathname === "/auth/callback") {
        // Redirect to app port with all query params preserved
        const redirectUrl = `http://localhost:${appPort}/callback${url.search}`;
        res.writeHead(302, { Location: redirectUrl });
        res.end();

        // Auto-close after redirect
        stopCodexProxy();
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(CODEX_PORT, "127.0.0.1", () => {
      codexProxyServer = server;
      // Auto-cleanup after timeout
      codexProxyTimeout = setTimeout(() => stopCodexProxy(), CODEX_PROXY_TIMEOUT_MS);
      resolve({ success: true });
    });

    server.on("error", (err: NodeErrorWithCode) => {
      if (err.code === "EADDRINUSE") {
        resolve({ success: false, reason: "port_busy" });
      } else {
        resolve({ success: false, reason: err.message });
      }
    });
  });
}

/**
 * Stop the Codex proxy server and cleanup
 */
export function stopCodexProxy() {
  if (codexProxyTimeout) {
    clearTimeout(codexProxyTimeout);
    codexProxyTimeout = null;
  }
  if (codexProxyServer) {
    codexProxyServer.close();
    codexProxyServer = null;
  }
}

