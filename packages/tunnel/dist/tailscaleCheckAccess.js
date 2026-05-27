import os from "os";
import { execSyncCmd } from "@axonrouter/data-dir";
import { isTailscaleDaemonRunning, isTailscaleInstalled, isTailscaleLoggedIn } from "./tailscaleStatus";
const EXTENDED_PATH = `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ""}`;
function hasBrew() {
    try {
        execSyncCmd("which brew", { stdio: "ignore", windowsHide: true, env: { ...process.env, PATH: EXTENDED_PATH } });
        return true;
    }
    catch {
        return false;
    }
}
export function getTailscaleCheckPayload() {
    const installed = isTailscaleInstalled();
    const platform = os.platform();
    const brewAvailable = platform === "darwin" && hasBrew();
    const daemonRunning = installed ? isTailscaleDaemonRunning() : false;
    const loggedIn = daemonRunning ? isTailscaleLoggedIn() : false;
    return { installed, loggedIn, platform, brewAvailable, daemonRunning };
}
