const fs = require("fs");
const path = require("path");
const { isProductionServerPathMode } = require("./serverPathEnvRuntime");
const {
  isNodeModulesServerPath,
  resolveRuntimeServerTarget,
} = require("./serverPathCopyPlannerRuntime");
const { shouldReuseRuntimeServerSource } = require("./serverPathCopyStateRuntime");

function ensureRuntimeServerFromNodeModules({ bundledPath, dataDir, log }) {
  try {
    if (!bundledPath || !fs.existsSync(bundledPath)) return bundledPath;

    // In production, avoid runtime filesystem copy decisions and use packaged server directly.
    if (isProductionServerPathMode()) {
      return bundledPath;
    }

    // Only the packaged node_modules server is self-contained enough to copy safely.
    if (!isNodeModulesServerPath(bundledPath)) {
      return bundledPath;
    }

    const { runtimeDir, runtimeServer } = resolveRuntimeServerTarget(dataDir);

    if (shouldReuseRuntimeServerSource({ bundledPath, runtimeServer })) {
      return runtimeServer;
    }

    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.copyFileSync(bundledPath, runtimeServer);
    return runtimeServer;
  } catch (e) {
    try {
      log?.(`[MITM] runtime copy failed: ${e.message}`);
    } catch {
      // ignore logging failures
    }
    return bundledPath;
  }
}

module.exports = {
  ensureRuntimeServerFromNodeModules,
};
