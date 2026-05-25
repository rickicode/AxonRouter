// Usage Worker Client - Communicates with the isolated background worker process

import { instrumentUsageWorker } from "@/lib/observability/otel";
import fs from "node:fs";
import path from "node:path";
async function loadChildProcessSpawn() {
  const childProcess = await import("node:child_process");
  return childProcess.spawn;
}

const appGlobal = (global.__appSingleton ??= {});
const WORKER_REQUEST_TIMEOUT_MS = 30000;
const WORKER_RESTART_COOLDOWN_MS = 3000;

function createWorkerPath() {
  const projectRoot = getProjectRoot();

  const candidates = [
    path.join(
      /*turbopackIgnore: true*/ projectRoot,
      "src",
      "lib",
      "usageWorker",
      "workerBootstrap.ts",
    ),
    path.join(
      /*turbopackIgnore: true*/ projectRoot,
      ".next",
      "standalone",
      "src",
      "lib",
      "usageWorker",
      "workerBootstrap.ts",
    ),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) return candidate;
  }

  throw new Error(
    `[UsageWorker] Cannot find workerBootstrap.ts. Tried:\n${candidates.join("\n")}`,
  );
}

function createWorkerRequestTimeoutError(command) {
  return new Error(`Usage worker request timed out: ${command}`);
}

function isWorkerRequestTimeout(error, command) {
  return error?.message === `Usage worker request timed out: ${command}`;
}

function getProjectRoot() {
  if (process.env.WORKER_PROJECT_ROOT) return process.env.WORKER_PROJECT_ROOT;
  if (
    process
      .cwd()
      .endsWith(path.join(/*turbopackIgnore: true*/ ".next", "standalone"))
  ) {
    return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "..");
  }
  return process.cwd();
}

function isIpcClosedError(error) {
  return error?.code === "EPIPE" || error?.code === "ERR_IPC_CHANNEL_CLOSED";
}

function killWorkerProcess(worker) {
  if (!worker) return;

  try {
    if (worker.connected) {
      worker.disconnect();
    }
  } catch {}

  try {
    worker.kill("SIGKILL");
  } catch {}
}

function createWorkerEnv() {
  const { NODE_OPTIONS, ...env } = process.env;

  return {
    ...env,
    NODE_OPTIONS: [
      NODE_OPTIONS,
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
    ]
      .filter(Boolean)
      .join(" "),
    WORKER_PROJECT_ROOT: getProjectRoot(),
  };
}

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export class UsageWorkerClient {
  logger: any;
  worker: any;
  readyPromise: Promise<any> | null;
  requestSequence: number;
  pendingRequests: Map<string, PendingRequest>;
  latestStatus: any;
  lastError: string | null;
  lastStartFailedAt: number;
  consecutiveFailures: number;
  cleanupRegistered: boolean;

  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.worker = null;
    this.readyPromise = null;
    this.requestSequence = 0;
    this.pendingRequests = new Map();
    this.latestStatus = null;
    this.lastError = null;
    this.lastStartFailedAt = 0;
    this.consecutiveFailures = 0;
    this.cleanupRegistered = false;
  }

  registerCleanupHandlers() {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    const cleanup = () => {
      killWorkerProcess(this.worker);
    };

    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }

  async ensureWorker() {
    return instrumentUsageWorker(
      "parent.ensure_worker",
      {
        "usage_worker.parent_process": true,
        "usage_worker.connected": this.worker?.connected === true,
        "usage_worker.consecutive_failures": this.consecutiveFailures,
      },
      async () => {
        if (this.worker && this.worker.connected) {
          return this.worker;
        }

        if (this.readyPromise) {
          await this.readyPromise;
          return this.worker;
        }

        const now = Date.now();
        if (
          this.lastStartFailedAt &&
          now - this.lastStartFailedAt < WORKER_RESTART_COOLDOWN_MS
        ) {
          throw new Error("Usage worker restart is cooling down");
        }
        if (this.consecutiveFailures >= 5) {
          throw new Error("Usage worker disabled after 5 consecutive failures");
        }

        let startupOutput = "";
        const workerPath = createWorkerPath();
        const spawnWorker = await loadChildProcessSpawn();
        const worker = spawnWorker(process.execPath, [workerPath], {
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          env: createWorkerEnv(),
          cwd: getProjectRoot(),
        });

        this.worker = worker;
        this.registerCleanupHandlers();
        worker.stdout?.on("data", (chunk) => {
          process.stdout.write(chunk);
        });
        worker.stderr?.on("data", (chunk) => {
          const text = chunk.toString();
          startupOutput = `${startupOutput}${text}`.slice(-8000);
          process.stderr.write(chunk);
        });

        this.readyPromise = new Promise((resolve, reject) => {
          const handleReady = (message) => {
            if (message?.type !== "ready") return;
            cleanup();
            this.consecutiveFailures = 0;
            resolve(worker);
          };

          const handleError = (error) => {
            cleanup();
            this.lastStartFailedAt = Date.now();
            this.consecutiveFailures++;
            reject(error);
          };

          const handleExit = (code, signal) => {
            cleanup();
            this.lastStartFailedAt = Date.now();
            this.consecutiveFailures++;
            reject(
              new Error(
                `Usage worker exited during startup with code ${code}${signal ? ` signal ${signal}` : ""}${startupOutput ? `\n${startupOutput}` : ""}`,
              ),
            );
          };

          const cleanup = () => {
            worker.off("message", handleReady);
            worker.off("error", handleError);
            worker.off("exit", handleExit);
          };

          worker.on("message", handleReady);
          worker.once("error", handleError);
          worker.once("exit", handleExit);
        });

        worker.on("message", (message) => this.handleWorkerMessage(message));
        worker.on("error", (error) => this.handleWorkerError(error));
        worker.on("exit", (code, signal) =>
          this.handleWorkerExit(code, signal),
        );

        try {
          await this.readyPromise;
          this.logger.log?.("[UsageWorker] Worker process started");
          return worker;
        } catch (error) {
          this.readyPromise = null;
          this.worker = null;
          throw error;
        }
      },
    );
  }

  handleWorkerMessage(message) {
    if (!message || typeof message !== "object") return;

    if (message.type === "status_update") {
      this.latestStatus = message.status;
      return;
    }

    if (message.type === "result" || message.type === "error") {
      const pending = this.pendingRequests.get(message.requestId);
      if (!pending) return;

      clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(message.requestId);

      if (message.type === "result") {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(message.error));
      }
    }
  }

  handleWorkerError(error) {
    if (isIpcClosedError(error)) {
      return;
    }

    this.lastError = error?.message || String(error);
    this.logger.error?.("[UsageWorker] Worker error:", error);
  }

  handleWorkerExit(code, signal) {
    this.logger.warn?.(
      `[UsageWorker] Worker exited with code ${code}${signal ? ` signal ${signal}` : ""}`,
    );
    this.resetWorkerState();
  }

  resetWorkerState() {
    this.worker = null;
    this.readyPromise = null;

    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("Worker process terminated"));
    }
    this.pendingRequests.clear();
  }

  async request(command, payload = {}) {
    return instrumentUsageWorker(
      "parent.request",
      {
        "usage_worker.parent_process": true,
        "usage_worker.command": command,
      },
      async () => {
        const worker = await this.ensureWorker();
        const requestId = `usage-worker-${Date.now()}-${(this.requestSequence += 1)}`;

        return await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            this.pendingRequests.delete(requestId);
            reject(createWorkerRequestTimeoutError(command));
          }, WORKER_REQUEST_TIMEOUT_MS);

          this.pendingRequests.set(requestId, { resolve, reject, timeoutId });
          try {
            worker.send({ requestId, command, ...payload });
          } catch (error) {
            clearTimeout(timeoutId);
            this.pendingRequests.delete(requestId);
            reject(error);
          }
        });
      },
    );
  }

  async start() {
    await this.ensureWorker();
    return this.latestStatus || { started: true, workerReady: true };
  }

  async getStatus() {
    if (this.latestStatus) {
      this.request("status").catch(() => {});
      return {
        ...this.latestStatus,
        ...(this.lastError ? { workerError: this.lastError } : {}),
      };
    }

    try {
      return await this.request("status");
    } catch (error) {
      if (this.latestStatus) {
        return {
          ...this.latestStatus,
          workerError: error?.message || this.lastError,
        };
      }
      throw error;
    }
  }

  async runNow(reason = "manual") {
    return this.request("runNow", { reason });
  }

  async runAllNow(reason = "manual_full_refresh") {
    try {
      return await this.request("runAllNow", { reason });
    } catch (error) {
      if (!isWorkerRequestTimeout(error, "runAllNow")) {
        throw error;
      }

      this.logger.warn?.(
        "[UsageWorker] runAllNow timed out; restarting worker to override active run",
      );
      killWorkerProcess(this.worker);
      this.resetWorkerState();

      return await this.request("runAllNow", { reason });
    }
  }

  async stop() {
    const worker = this.worker;

    if (worker?.connected) {
      try {
        worker.send({
          requestId: `usage-worker-stop-${Date.now()}`,
          command: "stop",
        });
      } catch (error) {
        if (!isIpcClosedError(error)) {
          this.logger.warn?.(
            "[UsageWorker] Failed to send stop command:",
            error,
          );
        }
      }
    }

    killWorkerProcess(worker);
    this.resetWorkerState();
    return { stopped: true };
  }
}

export function getUsageWorkerClient(options = {}) {
  if (!appGlobal.usageWorkerClient) {
    appGlobal.usageWorkerClient = new UsageWorkerClient(options);
  }

  return appGlobal.usageWorkerClient;
}
