// src/lib/security/auditLog.js
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const APP_NAME = "axonrouter";

type NodePathModule = typeof import("node:path");
type NodeOsModule = typeof import("node:os");
type NodeFsModule = typeof import("node:fs/promises");

async function getNodeRuntime() {
  const [fs, path, os]: [NodeFsModule, NodePathModule, NodeOsModule] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
    import("node:os"),
  ]);

  return { fs, path, os };
}

async function getDefaultLogFile() {
  const { path, os } = await getNodeRuntime();
  const dataDir = process.platform === "win32"
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "axonrouter")
    : path.join(os.homedir(), ".axonrouter");
  return path.join(/*turbopackIgnore: true*/ dataDir, "audit.log");
}

class AuditLogger {
  enabled: boolean;
  maxSize: number;

  constructor() {
    this.enabled = true;
    this.maxSize = DEFAULT_MAX_SIZE;
  }

  async rotate(logFile: string) {
    try {
      const { fs } = await getNodeRuntime();

      // Shift existing rotated files (.3 -> delete, .2 -> .3, .1 -> .2)
      for (let i = 3; i >= 1; i--) {
        const oldFile = logFile + "." + i;
        const newFile = logFile + "." + (i + 1);

        const oldFileExists = await fs.access(oldFile).then(() => true).catch(() => false);
        if (!oldFileExists) continue;

        if (i === 3) {
          await fs.unlink(oldFile);
        } else {
          await fs.rename(oldFile, newFile);
        }
      }

      const logFileExists = await fs.access(logFile).then(() => true).catch(() => false);
      if (logFileExists) {
        await fs.rename(logFile, logFile + ".1");
      }
    } catch (error) {
      console.error("[AuditLog] Failed to rotate log:", error instanceof Error ? error.message : String(error));
    }
  }

  async log(event, data, logFile?: string) {
    if (!this.enabled) return;

    try {
      const { fs, path } = await getNodeRuntime();
      const resolvedLogFile = logFile || await getDefaultLogFile();
      const entry = {
        timestamp: new Date().toISOString(),
        event,
        ...data,
      };

      const line = JSON.stringify(entry) + "\n";
      const dir = path.dirname(resolvedLogFile);

      await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });

      const stats = await fs.stat(/*turbopackIgnore: true*/ resolvedLogFile).catch(() => null);
      if (stats && stats.size >= this.maxSize) {
        await this.rotate(resolvedLogFile);
      }

      await fs.appendFile(resolvedLogFile, line, "utf-8");
    } catch (error) {
      console.error("[AuditLog] Failed to write log:", error instanceof Error ? error.message : String(error));
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  setMaxSize(size) {
    this.maxSize = size;
  }
}

export const auditLog = new AuditLogger();
export { AuditLogger }; // Export class for testing
