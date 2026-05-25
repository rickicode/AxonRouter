const fs = require("fs");
const path = require("path");
const { addDNSEntry, removeDNSEntry, removeAllDNSEntries, checkAllDNSStatus, TOOL_HOSTS } = require("./dns/dnsConfig");

const IS_WIN = process.platform === "win32";

function getAllToolHosts() {
  return Object.values(TOOL_HOSTS).flat();
}

function removeWindowsHostsEntries(err) {
  const hostsFile = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts");
  const allHosts = getAllToolHosts();
  try {
    const hostsContent = fs.readFileSync(hostsFile, "utf8");
    const filtered = hostsContent
      .split(/\r?\n/)
      .filter((line) => !allHosts.some((host) => line.includes(host)))
      .join("\r\n");
    fs.writeFileSync(hostsFile, filtered, "utf8");
    require("child_process").execSync("ipconfig /flushdns", { windowsHide: true });
  } catch (e) {
    err(`Failed to clean hosts: ${e.message}`);
  }
}

async function clearAllDnsEntries(sudoPassword, err) {
  if (IS_WIN) {
    removeWindowsHostsEntries(err);
    return;
  }
  await removeAllDNSEntries(sudoPassword);
}

function readDnsStatus() {
  return checkAllDNSStatus();
}

async function enableDnsForTool(tool, password) {
  await addDNSEntry(tool, password);
}

async function disableDnsForTool(tool, password) {
  await removeDNSEntry(tool, password);
}

module.exports = {
  clearAllDnsEntries,
  readDnsStatus,
  enableDnsForTool,
  disableDnsForTool,
};
