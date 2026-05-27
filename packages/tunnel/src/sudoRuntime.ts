import os from "os";
import { execSyncCmd, spawnCmd } from "@axonrouter/data-dir";

const IS_WINDOWS = os.platform() === "win32";

function isSudoAvailable() {
  if (IS_WINDOWS) return false;
  try {
    execSyncCmd("command -v sudo", { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export function execWithPassword(command: string, password: string) {
  return new Promise<string>((resolve, reject) => {
    const useSudo = isSudoAvailable();
    const child = useSudo
      ? spawnCmd("sudo", ["-S", "sh", "-c", command], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
      : spawnCmd("sh", ["-c", command], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Exit code ${code}`));
    });

    if (useSudo) {
      child.stdin.write(`${password}\n`);
      child.stdin.end();
    }
  });
}
