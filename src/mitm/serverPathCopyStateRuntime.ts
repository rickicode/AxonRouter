const fs = require("fs");

function shouldReuseRuntimeServerSource({ bundledPath, runtimeServer }) {
  if (!fs.existsSync(runtimeServer)) return false;
  try {
    return fs.statSync(bundledPath).size === fs.statSync(runtimeServer).size;
  } catch {
    return false;
  }
}

module.exports = {
  shouldReuseRuntimeServerSource,
};
