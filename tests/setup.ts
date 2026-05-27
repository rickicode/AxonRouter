import { vi } from "vitest";

// Auto-mock management auth to allow all requests in unit tests.
// Tests that specifically test auth behavior should vi.doUnmock this.
vi.mock("@/lib/api/requireManagementAuth", () => ({
  requireManagementAuth: vi.fn().mockResolvedValue(null),
}));

// Allow tests to override DATA_DIR via process.env.DATA_DIR for isolation
vi.mock("@/lib/dataDir", () => {
  const path = require("path");
  const os = require("os");
  const fs = require("fs");
  function getDataDir() {
    if (process.env.DATA_DIR) return process.env.DATA_DIR;
    if (process.platform === "win32") {
      return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "axonrouter");
    }
    return path.join(os.homedir(), ".axonrouter");
  }
  const SEP = process.platform === "win32" ? "\\" : "/";
  return {
    getDataDir,
    get DATA_DIR() { return getDataDir(); },
    resolveDataPath: (...segments: string[]) => getDataDir() + SEP + segments.join(SEP),
    getDbSqliteFile: () => getDataDir() + SEP + "db.sqlite",
    getDbJsonFile: () => getDataDir() + SEP + "db.json",
    ensureDataDir: () => {
      const dir = getDataDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    },
    dataDirExists: () => fs.existsSync(getDataDir()),
    dataFileExists: (p: string) => fs.existsSync(p),
    readDataFile: (p: string, enc: string) => fs.readFileSync(p, enc),
    renameDataFile: (o: string, n: string) => fs.renameSync(o, n),
    unlinkDataFile: (p: string) => fs.unlinkSync(p),
    mkdirForData: (p: string, opts?: any) => fs.mkdirSync(p, opts),
  };
});
