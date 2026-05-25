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
  function getDataDir() {
    if (process.env.DATA_DIR) return process.env.DATA_DIR;
    if (process.platform === "win32") {
      return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "axonrouter");
    }
    return path.join(os.homedir(), ".axonrouter");
  }
  return {
    getDataDir,
    get DATA_DIR() { return getDataDir(); },
  };
});
