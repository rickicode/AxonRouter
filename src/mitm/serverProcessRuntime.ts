const fs = require("fs");
const { pollMitmHealth } = require("./healthRuntime");
const { getPidFilePath, getProcessUsingPort443 } = require("./processRuntime");

function attachMitmProcessHandlers({
  serverProcess,
  isWin,
  setCachedPassword,
  clearEncryptedPassword,
  setMitmIsRestarting,
  scheduleMitmRestart,
  resetServerRefs,
  log,
  err,
  apiKey,
}: {
  serverProcess: any;
  isWin: boolean;
  setCachedPassword: (value: string | null) => void;
  clearEncryptedPassword: () => Promise<void>;
  setMitmIsRestarting: (value: boolean) => void;
  scheduleMitmRestart: (apiKey: string) => Promise<void> | void;
  resetServerRefs: () => void;
  log: (msg: string) => void;
  err: (msg: string) => void;
  apiKey: string;
}) {
  let startError: string | null = null;

  serverProcess.stdout.on("data", (data: Buffer) => {
    process.stdout.write(data);
  });

  serverProcess.stderr.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg && (isWin || (!msg.includes("Password:") && !msg.includes("password for")))) {
      err(msg);
      startError = msg;
    }
    if (!isWin && (msg.includes("incorrect password") || msg.includes("no password was provided"))) {
      setCachedPassword(null);
      void clearEncryptedPassword();
      setMitmIsRestarting(true);
    }
  });

  serverProcess.on("exit", (code: number) => {
    log(`Server exited (code: ${code})`);
    resetServerRefs();
    try {
      fs.unlinkSync(getPidFilePath());
    } catch {
      // ignore
    }
    if (code !== 0) {
      void scheduleMitmRestart(apiKey);
    }
  });

  return {
    getStartError: () => startError,
  };
}

async function waitForMitmHealth({
  timeoutMs,
  port,
  serverProcess,
  getStartError,
}: {
  timeoutMs: number;
  port: number;
  serverProcess: any;
  getStartError: () => string | null;
}) {
  const health = await pollMitmHealth(timeoutMs, port);
  if (!health) {
    if (serverProcess && !serverProcess.killed) {
      try {
        serverProcess.kill();
      } catch {
        // ignore
      }
    }
    const processUsing443 = getProcessUsingPort443();
    const portInfo = processUsing443 ? ` Port 443 already in use by ${processUsing443}.` : "";
    const reason = getStartError() || `Check sudo password or port 443 access.${portInfo}`;
    throw new Error(`MITM server failed to start. ${reason}`);
  }
  return health;
}

module.exports = {
  attachMitmProcessHandlers,
  waitForMitmHealth,
};
