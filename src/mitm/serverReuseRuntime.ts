const fs = require("fs");

function readReusableServerPid(getPidFilePath, isProcessAlive) {
  try {
    if (!fs.existsSync(getPidFilePath())) return null;
    const savedPid = parseInt(fs.readFileSync(getPidFilePath(), "utf-8").trim(), 10);
    if (savedPid && isProcessAlive(savedPid)) return savedPid;
    fs.unlinkSync(getPidFilePath());
    return null;
  } catch {
    return null;
  }
}

module.exports = {
  readReusableServerPid,
};
