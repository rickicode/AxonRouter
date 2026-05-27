#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { exit } from "node:process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { defaultPort: DEFAULT_AXONROUTER_PORT } = require("../src/shared/constants/runtimeDefaults.json");
const { version: APP_VERSION } = require("../package.json");

const SERVICE_COMMAND_NAMES = new Set([
  "install-service",
  "uninstall-service",
  "check-service",
  "status",
  "start",
  "stop",
  "restart",
  "help",
]);

export function parseArgs(args) {
  const forwardArgs = [];
  let port = null;
  let serviceCommand = null;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if ((value === "--port" || value === "-p") && args[index + 1]) {
      port = args[index + 1];
      index += 1;
      continue;
    }

    if (value === "mcp") {
      forwardArgs.push(value);
      continue;
    }

    if (value.startsWith("--port=")) {
      port = value.slice("--port=".length);
      continue;
    }

    // Detect service commands (positional form)
    if (!serviceCommand && SERVICE_COMMAND_NAMES.has(value)) {
      serviceCommand = value;
      continue;
    }

    // Detect service commands (flag form: --install-service, --stop, etc.)
    if (!serviceCommand && value.startsWith("--")) {
      const flagName = value.slice(2);
      if (SERVICE_COMMAND_NAMES.has(flagName)) {
        serviceCommand = flagName;
        continue;
      }
    }

    forwardArgs.push(value);
  }

  return {
    forwardArgs,
    port,
    serviceCommand,
  };
}

export function resolveNextCliPath() {
  return require.resolve("next/dist/bin/next");
}

function normalizePort(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }

  return String(parsed);
}

function getBaseUrl(port) {
  const hostname = process.env.HOSTNAME || "localhost";
  const protocol = process.env.HTTPS === "true" ? "https" : "http";
  return `${protocol}://${hostname}:${port}`;
}

function printStartupSummary({ port, hasStandaloneServer, standaloneServerPath }) {
  const baseUrl = getBaseUrl(port);
  console.log(`[Start] AxonRouter v${APP_VERSION} starting on port ${port}`);
  console.log(`[Start] Dashboard: ${baseUrl}/dashboard`);
  console.log(`[Start] API: ${baseUrl}/v1`);
  console.log(
    `[Start] Runtime: ${hasStandaloneServer ? `standalone (${standaloneServerPath})` : "next start fallback"}`
  );
}

function printMissingRuntimeHelp(projectRoot, standaloneServerPath) {
  console.error("");
  console.error("[Start] Cannot find a runnable production runtime for AxonRouter.");
  console.error(`[Start] Checked standalone server: ${standaloneServerPath}`);
  console.error(`[Start] Package root: ${projectRoot}`);
  console.error("[Start] This usually means one of these things:");
  console.error("  1. You are running from a package install that does not include a built Next.js standalone server.");
  console.error("  2. The app has not been built yet in this directory.");
  console.error("  3. You are starting the command from the wrong folder.");
  console.error("");
  console.error("[Start] Try one of these options:");
  console.error("  - Run from a source checkout after building it: npm run build && npm run start");
  console.error("  - Or publish/install a package that includes the standalone runtime files.");
  console.error("");
}

async function startMcpServer(projectRoot) {
  const bridgePath = path.join(projectRoot, "scripts", "mcp-stdio.js");
  const child = spawn(process.execPath, [bridgePath], {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`MCP bridge exited with signal ${signal}`));
        return;
      }
      resolve(code ?? 0);
    });
  });
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageRoot = path.join(import.meta.dirname, "..");
  const launchCwd = process.cwd();
  const projectRoot = packageRoot;

  if (args.forwardArgs[0] === "mcp") {
    await startMcpServer(projectRoot);
    return;
  }

  // Handle service management commands before any server startup logic
  if (args.serviceCommand) {
    const { handleServiceCommand } = await import("./service.js");
    handleServiceCommand(args.serviceCommand);
    return;
  }

  // Check for unrecognized commands
  if (args.forwardArgs.length > 0 && args.forwardArgs[0] !== "mcp") {
    const unknownCmd = args.forwardArgs[0];
    if (!unknownCmd.startsWith("-") && isNaN(Number(unknownCmd))) {
      console.error(`\x1b[31m[AxonRouter] Unknown command: ${unknownCmd}\x1b[0m`);
      console.error("");
      const { showHelp } = await import("./service.js");
      showHelp();
      exit(1);
    }
  }

  const standaloneServerPath = resolveStandaloneServerPath(projectRoot);
  const requestedPort = args.port || process.env.PORT || DEFAULT_AXONROUTER_PORT;
  const port = normalizePort(requestedPort);

  if (!port) {
    console.error("");
    console.error(`[Start] Invalid port: ${requestedPort}`);
    console.error("[Start] Port must be an integer between 1 and 65535.");
    console.error("[Start] Examples:");
    console.error("  axonrouter --port 3000");
    console.error("  PORT=3000 axonrouter");
    console.error("");
    exit(1);
  }

  process.env.PORT = port;

  const hasStandaloneServer = fs.existsSync(standaloneServerPath);
  let nextCliPath = null;

  const sourceCheckoutAvailable = hasSourceCheckout(projectRoot);
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev && hasStandaloneServer && sourceCheckoutAvailable && isStandaloneBuildStale(projectRoot, standaloneServerPath)) {
    console.log("[Start] Standalone build is stale; rebuilding production bundle first.");
    await rebuildStandaloneBundle(projectRoot);
  }

  if (hasStandaloneServer && shouldSyncStandaloneAssets(standaloneServerPath)) {
    syncStandaloneAssets(projectRoot, standaloneServerPath);
  }

  if (!hasStandaloneServer) {
    try {
      nextCliPath = resolveNextCliPath();
      console.log("[Start] Standalone server.js not found; falling back to next start.");
    } catch (error) {
      printMissingRuntimeHelp(projectRoot, standaloneServerPath);
      console.error("[Start] Additional detail:", error.message);
      exit(1);
    }
  }

  if (!(await isPortAvailable(port))) {
    const baseUrl = getBaseUrl(port);

    console.error("");
    console.error(`[Start] Cannot start AxonRouter because port ${port} is already in use.`);
    console.error("[Start] AxonRouter needs a free port for the dashboard and API server.");
    console.error("[Start] Expected URLs on this port:");
    console.error(`  Dashboard: ${baseUrl}/dashboard`);
    console.error(`  API: ${baseUrl}/v1`);
    console.error("");
    console.error("[Start] Choose one of these options:");
    console.error(`  1. Stop the process using port ${port}`);
    console.error(`     fuser -k ${port}/tcp`);
    console.error(`     lsof -ti :${port} | xargs -r kill -9`);
    console.error("  2. Start AxonRouter on a different port");
    console.error("     PORT=3000 axonrouter");
    console.error("     axonrouter --port 3000");
    console.error("");
    exit(1);
  }

  printStartupSummary({ port, hasStandaloneServer, standaloneServerPath });
  console.log(`[Start] Launch directory: ${launchCwd}`);

  const child = hasStandaloneServer
    ? spawn(process.execPath, [standaloneServerPath, ...args.forwardArgs], {
        stdio: "inherit",
        env: process.env,
        shell: false,
      })
    : spawn(process.execPath, [nextCliPath, "start", "--port", port, ...args.forwardArgs], {
        stdio: "inherit",
        env: process.env,
        shell: false,
      });

  let forcedExitCode = null;

  if (!child) {
    throw new Error("Failed to start production server process.");
  }

  child.stdout?.on?.("error", () => {});
  child.stderr?.on?.("error", () => {});

  child.on("error", (error) => {
    console.error("[Start] Failed to start production server process:", error);
    exit(1);
  });

  let shutdownTimer = null;
  const forceChildExit = (signal) => {
    if (shutdownTimer || child.killed) return;

    child.kill(signal);
    shutdownTimer = setTimeout(() => {
      if (!child.killed) {
        console.warn(`[Start] Child did not exit after ${signal}; forcing SIGKILL`);
        child.kill("SIGKILL");
      }
    }, 5000);
  };

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      forceChildExit(signal);
    });
  }

  child.on("exit", (code, signal) => {
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }

    if (signal) {
      exit(128 + (signal === "SIGINT" ? 2 : signal === "SIGTERM" ? 15 : signal === "SIGHUP" ? 1 : 1));
      return;
    }

    if (forcedExitCode !== null) {
      exit(forcedExitCode);
      return;
    }

    exit(code ?? 0);
  });
}

export function resolveStandaloneServerPath(projectRoot = process.cwd()) {
  const dockerStyleStandaloneServerPath = path.join(projectRoot, "server.js");
  if (fs.existsSync(dockerStyleStandaloneServerPath)) {
    return dockerStyleStandaloneServerPath;
  }

  return path.join(projectRoot, ".next", "standalone", "server.js");
}

export function hasStandaloneRuntime(standaloneServerPath) {
  return Boolean(standaloneServerPath) && fs.existsSync(standaloneServerPath);
}

export function getLatestMtimeMs(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return 0;
  }

  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    return stat.mtimeMs;
  }

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  if (entries.length === 0) {
    return stat.mtimeMs;
  }

  let latest = 0;
  for (const entry of entries) {
    latest = Math.max(latest, getLatestMtimeMs(path.join(targetPath, entry.name)));
  }
  return latest;
}

export function getBuildInputPaths(projectRoot) {
  return [
    path.join(projectRoot, "src"),
    path.join(projectRoot, "scripts"),
    path.join(projectRoot, "public"),
    path.join(projectRoot, "package.json"),
    path.join(projectRoot, "package-lock.json"),
    path.join(projectRoot, "next.config.ts"),
  ];
}

function hasSourceCheckout(projectRoot) {
  const hasSourceMarkers = ["src", "app", "pages", "next.config.ts", "scripts/ensure-middleware-manifest.js"].some(
    (relativePath) => fs.existsSync(path.join(projectRoot, relativePath))
  );
  return hasSourceMarkers && fs.existsSync(path.join(projectRoot, "package-lock.json"));
}

export function getStandaloneOutputPaths(standaloneServerPath) {
  const standaloneRoot = path.dirname(standaloneServerPath);
  return [
    standaloneServerPath,
    path.join(standaloneRoot, ".next", "server"),
    path.join(standaloneRoot, ".next", "static"),
  ];
}

export function isStandaloneBuildStale(projectRoot, standaloneServerPath) {
  if (!hasStandaloneRuntime(standaloneServerPath)) {
    return false;
  }

  const buildOutputTime = getStandaloneOutputPaths(standaloneServerPath).reduce(
    (latest, currentPath) => Math.max(latest, getLatestMtimeMs(currentPath)),
    0
  );
  const newestInputTime = getBuildInputPaths(projectRoot).reduce(
    (latest, currentPath) => Math.max(latest, getLatestMtimeMs(currentPath)),
    0
  );

  return newestInputTime > buildOutputTime;
}

export function rebuildStandaloneBundle(projectRoot) {
  return new Promise((resolve, reject) => {
    const nextCliPath = resolveNextCliPath();
    const buildEnv = {
      ...process.env,
      NODE_ENV: "production",
    };

    const buildChild = spawn(process.execPath, [nextCliPath, "build", "--turbopack"], {
      cwd: projectRoot,
      stdio: "inherit",
      env: buildEnv,
      shell: false,
    });

    buildChild.on("error", reject);
    buildChild.on("exit", async (code, signal) => {
      if (signal) {
        reject(new Error(`Standalone rebuild exited with signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Standalone rebuild exited with code ${code}`));
        return;
      }

      try {
        await import(pathToFileURL(path.join(projectRoot, "scripts", "ensure-middleware-manifest.js")).href);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function shouldSyncStandaloneAssets(standaloneServerPath) {
  if (!standaloneServerPath) {
    return false;
  }

  const normalizedPath = path.normalize(standaloneServerPath);
  const nestedStandaloneSegment = `${path.sep}.next${path.sep}standalone${path.sep}`;
  return normalizedPath.includes(nestedStandaloneSegment);
}

export function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port: Number(port), host: "0.0.0.0" }, () => {
      server.close(() => resolve(true));
    });
  });
}

export function syncStandaloneAssets(projectRoot, standaloneServerPath) {
  const standaloneRoot = path.dirname(standaloneServerPath);
  const sourceStaticDir = path.join(projectRoot, ".next", "static");
  const sourcePublicDir = path.join(projectRoot, "public");
  const sourceMitmDir = path.join(projectRoot, "src", "mitm");
  const standaloneStaticDir = path.join(standaloneRoot, ".next", "static");
  const standalonePublicDir = path.join(standaloneRoot, "public");
  const standaloneMitmDir = path.join(standaloneRoot, "src", "mitm");

  // Skip sync if we don't have write permission to the standalone directory
  // (e.g. global npm install owned by root, running as non-root user)
  try {
    fs.accessSync(standaloneRoot, fs.constants.W_OK);
  } catch {
    // No write access - assets are already in place from npm publish/install
    return;
  }

  if (fs.existsSync(sourceStaticDir)) {
    fs.mkdirSync(path.dirname(standaloneStaticDir), { recursive: true });
    fs.rmSync(standaloneStaticDir, { recursive: true, force: true });
    fs.cpSync(sourceStaticDir, standaloneStaticDir, { recursive: true, force: true });
  }

  if (fs.existsSync(sourcePublicDir)) {
    fs.rmSync(standalonePublicDir, { recursive: true, force: true });
    fs.cpSync(sourcePublicDir, standalonePublicDir, { recursive: true, force: true });
  }

  if (fs.existsSync(sourceMitmDir)) {
    fs.mkdirSync(path.dirname(standaloneMitmDir), { recursive: true });
    fs.rmSync(standaloneMitmDir, { recursive: true, force: true });
    fs.cpSync(sourceMitmDir, standaloneMitmDir, { recursive: true, force: true });
  }

  console.log("[Start] Synced standalone public/static assets.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error("[start] Failed to bootstrap server:", error);
    exit(1);
  });
}
