const path = require("path");

function isNodeModulesServerPath(serverPath) {
  return Boolean(serverPath && serverPath.includes(`${path.sep}node_modules${path.sep}`));
}

function resolveRuntimeServerTarget(dataDir) {
  const runtimeDir = path.join(dataDir, "runtime", "mitm");
  const runtimeServer = path.join(runtimeDir, "server.ts");
  return { runtimeDir, runtimeServer };
}

module.exports = {
  isNodeModulesServerPath,
  resolveRuntimeServerTarget,
};
