const fs = require("fs");

function readLiveOrPersistedPid({ serverProcess, serverPid, getPidFilePath, isProcessAlive }) {
  let running = serverProcess !== null && !serverProcess.killed;
  let pid = serverPid;

  if (!running) {
    try {
      if (fs.existsSync(getPidFilePath())) {
        const savedPid = parseInt(fs.readFileSync(getPidFilePath(), "utf-8").trim(), 10);
        if (savedPid && isProcessAlive(savedPid)) {
          running = true;
          pid = savedPid;
        } else {
          fs.unlinkSync(getPidFilePath());
        }
      }
    } catch {
      // ignore state probing failures
    }
  }

  return { running, pid };
}

function readPersistedPidForStop({ serverProcess, getPidFilePath }) {
  if (serverProcess && !serverProcess.killed) return serverProcess.pid;
  try {
    return parseInt(fs.readFileSync(getPidFilePath(), "utf-8").trim(), 10);
  } catch {
    return null;
  }
}

function persistServerPid(getPidFilePath, serverPid) {
  fs.writeFileSync(getPidFilePath(), String(serverPid));
}

function clearPersistedServerPid(getPidFilePath) {
  try {
    fs.unlinkSync(getPidFilePath());
  } catch {
    // ignore
  }
}

module.exports = {
  readLiveOrPersistedPid,
  readPersistedPidForStop,
  persistServerPid,
  clearPersistedServerPid,
};
