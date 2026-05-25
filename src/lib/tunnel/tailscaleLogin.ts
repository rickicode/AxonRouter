import { spawn } from "child_process";
import { isTailscaleLoggedIn } from "./tailscaleStatus";
import { getTailscaleBin, getTailscaleSocketArgs, startDaemonWithPassword } from "./tailscaleDaemonRuntime";

function tsArgs(...args: string[]) {
  return [...getTailscaleSocketArgs(), ...args];
}

async function ensureDaemon() {
  return startDaemonWithPassword("");
}

export function startLogin(hostname?: string) {
  const bin = getTailscaleBin();
  if (!bin) return Promise.reject(new Error("Tailscale not installed"));

  return new Promise((resolve, reject) => {
    ensureDaemon();

    if (isTailscaleLoggedIn()) {
      resolve({ alreadyLoggedIn: true });
      return;
    }

    const args = tsArgs("up", "--accept-routes");
    if (hostname) args.push(`--hostname=${hostname}`);
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      windowsHide: true,
    });

    let resolved = false;
    let output = "";

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      child.unref();
      const url = parseAuthUrl(output);
      if (url) resolve({ authUrl: url });
      else reject(new Error("tailscale up timed out without auth URL"));
    }, 15000);

    function parseAuthUrl(text: string) {
      const match = text.match(/https:\/\/login\.tailscale\.com\/a\/[a-zA-Z0-9]+/);
      return match ? match[0] : null;
    }

    const handleData = (data: Buffer) => {
      output += data.toString();
      const url = parseAuthUrl(output);
      if (url && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        child.unref();
        resolve({ authUrl: url });
      }
    };

    child.stdout.on("data", handleData);
    child.stderr.on("data", handleData);

    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      reject(err);
    });

    child.on("exit", (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      const url = parseAuthUrl(output);
      if (url) resolve({ authUrl: url });
      else if (code === 0 || isTailscaleLoggedIn()) resolve({ alreadyLoggedIn: true });
      else reject(new Error(`tailscale up exited with code ${code}`));
    });
  });
}
