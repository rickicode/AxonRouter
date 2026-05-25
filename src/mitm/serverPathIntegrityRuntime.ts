const fs = require("fs");
const path = require("path");

function hasMitmServerCompanionFiles(serverPath) {
  const dir = path.dirname(serverPath);
  return fs.existsSync(path.join(dir, "config.ts"))
    && fs.existsSync(path.join(dir, "paths.ts"))
    && fs.existsSync(path.join(dir, "cert", "generate.ts"))
    && fs.existsSync(path.join(dir, "handlers", "antigravity.ts"));
}

module.exports = {
  hasMitmServerCompanionFiles,
};
