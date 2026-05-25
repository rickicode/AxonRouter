const fs = require("fs");
const path = require("path");
const os = require("os");
const { generateCert } = require("./cert/generate");
const { installCert, uninstallCert, checkCertInstalled } = require("./cert/install");
const { isCertExpired } = require("./cert/rootCA");
const { MITM_DIR } = require("./paths");
const { isSudoAvailable } = require("./dns/dnsConfig");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

let _getSettings = null;
let _updateSettings = null;

function initCertRuntimeHooks(getSettingsFn, updateSettingsFn) {
  _getSettings = getSettingsFn;
  _updateSettings = updateSettingsFn;
}

async function getMitmCertStatus() {
  const rootCACertPath = path.join(MITM_DIR, "rootCA.crt");
  const certExists = fs.existsSync(rootCACertPath);
  const certTrusted = certExists ? await checkCertInstalled(rootCACertPath) : false;
  return { certExists, certTrusted, rootCACertPath };
}

async function ensureMitmRootCertReady({
  sudoPassword,
  getCachedPassword,
  loadEncryptedPassword,
  log,
}: {
  sudoPassword?: string;
  getCachedPassword: () => string | null | undefined;
  loadEncryptedPassword: () => Promise<string | null | undefined>;
  log: (msg: string) => void;
}) {
  const rootCACertPath = path.join(MITM_DIR, "rootCA.crt");
  const rootCAKeyPath = path.join(MITM_DIR, "rootCA.key");
  const certExists = fs.existsSync(rootCACertPath) && fs.existsSync(rootCAKeyPath);

  if (!certExists || isCertExpired(rootCACertPath)) {
    if (certExists) {
      log("🔐 Cert expired — uninstalling old cert...");
      const password = sudoPassword || getCachedPassword() || (await loadEncryptedPassword());
      try {
        await uninstallCert(password, rootCACertPath);
      } catch {
        // best effort
      }
    }
    log("🔐 Generating Root CA...");
    await generateCert();
  }

  const rootCATrusted = await checkCertInstalled(rootCACertPath);
  const linuxNoSystemTrust = !IS_WIN && !IS_MAC && !isSudoAvailable();
  if (!rootCATrusted) {
    log("🔐 Cert: not trusted → installing...");
    const password = sudoPassword || getCachedPassword() || (await loadEncryptedPassword());
    if (linuxNoSystemTrust) {
      log(`🔐 Cert: skipping system trust (no sudo). Install ${rootCACertPath} as a trusted CA on machines that use this proxy.`);
    } else {
      if (!password && !IS_WIN) {
        throw new Error("Sudo password required to install Root CA certificate");
      }
      try {
        await installCert(password, rootCACertPath);
        log("🔐 Cert: ✅ trusted");
      } catch (e: any) {
        throw new Error(`Failed to trust certificate: ${e?.message || String(e)}`);
      }
    }
  } else {
    log("🔐 Cert: already trusted ✅");
  }

  if (_updateSettings) {
    await _updateSettings({ mitmCertInstalled: true }).catch(() => {});
  }

  return { rootCACertPath };
}

async function trustMitmRootCert({
  sudoPassword,
  getCachedPassword,
  loadEncryptedPassword,
  setCachedPassword,
  log,
}: {
  sudoPassword?: string;
  getCachedPassword: () => string | null | undefined;
  loadEncryptedPassword: () => Promise<string | null | undefined>;
  setCachedPassword: (password: string | null) => void;
  log: (msg: string) => void;
}) {
  const rootCACertPath = path.join(MITM_DIR, "rootCA.crt");
  if (!fs.existsSync(rootCACertPath)) throw new Error("Root CA not found. Start server first to generate it.");
  if (!IS_WIN && !IS_MAC && !isSudoAvailable()) {
    log(`🔐 Cert: system trust unavailable (no sudo). Use file: ${rootCACertPath}`);
    return;
  }
  const password = sudoPassword || getCachedPassword() || (await loadEncryptedPassword());
  if (!password && !IS_WIN) throw new Error("Sudo password required to trust certificate");
  await installCert(password, rootCACertPath);
  if (password) setCachedPassword(password);
}

module.exports = {
  initCertRuntimeHooks,
  getMitmCertStatus,
  ensureMitmRootCertReady,
  trustMitmRootCert,
};
