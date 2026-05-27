const fs = require("fs");
const path = require("path");
const {
  isProductionServerPathMode,
  getMitmServerPathOverride,
} = require("./serverPathEnvRuntime");

function isCompleteMitmServer(serverPath) {
  if (!fs.existsSync(serverPath)) return false;

  // Single directory listing reduces repeated fs.existsSync branching.
  let dirEntries;
  try {
    dirEntries = new Set(fs.readdirSync(path.dirname(serverPath)));
  } catch {
    return false;
  }

  if (!dirEntries.has("config.ts") || !dirEntries.has("paths.ts") || !dirEntries.has("cert") || !dirEntries.has("handlers")) {
    return false;
  }

  return fs.existsSync(path.join(path.dirname(serverPath), "cert", "generate.ts"))
    && fs.existsSync(path.join(path.dirname(serverPath), "handlers", "antigravity.ts"));
}

function resolveBundledServerPathFromCandidates() {
  const overridePath = getMitmServerPathOverride();
  if (overridePath) return overridePath;

  const packagedServerPath = path.join(__dirname, "server.ts");

  // In production we always use the packaged path directly to avoid
  // extra runtime path-probing and filesystem branching.
  if (isProductionServerPathMode()) {
    return packagedServerPath;
  }

  const candidates = [
    packagedServerPath,
    path.join(process.cwd(), "src", "mitm", "server.ts"),
  ];

  const complete = candidates.find(isCompleteMitmServer);
  if (complete) return complete;

  return candidates.find((candidate) => fs.existsSync(candidate)) || packagedServerPath;
}

module.exports = {
  resolveBundledServerPathFromCandidates,
};
