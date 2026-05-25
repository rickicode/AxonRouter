const { DATA_DIR } = require("./paths");
const { ensureRuntimeServerFromNodeModules } = require("./serverPathCopyRuntime");
const { resolveBundledServerPathFromCandidates } = require("./serverPathResolverRuntime");
const { resolveCachedServerPath, clearCachedServerPath } = require("./serverPathCacheRuntime");

function resolveBundledServerPath() {
  return resolveBundledServerPathFromCandidates();
}

function ensureRuntimeServer(bundledPath, log) {
  return ensureRuntimeServerFromNodeModules({
    bundledPath,
    dataDir: /*turbopackIgnore: true*/ DATA_DIR,
    log,
  });
}

function getServerPath(log) {
  return resolveCachedServerPath(() => ensureRuntimeServer(resolveBundledServerPath(), log));
}

module.exports = {
  resolveBundledServerPath,
  ensureRuntimeServer,
  getServerPath,
  clearCachedServerPath,
};
