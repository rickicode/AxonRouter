const crypto = require("crypto");

const ENCRYPT_ALGO = "aes-256-gcm";
const ENCRYPT_SALT = "axonrouter-mitm-pwd";

let _getSettings = null;
let _updateSettings = null;

function initPasswordStoreHooks(getSettingsFn, updateSettingsFn) {
  _getSettings = getSettingsFn;
  _updateSettings = updateSettingsFn;
}

function getCachedPassword() {
  return globalThis.__mitmSudoPassword || null;
}

function setCachedPassword(pwd) {
  globalThis.__mitmSudoPassword = pwd;
}

function deriveKey() {
  try {
    const { machineIdSync } = require("node-machine-id");
    const raw = machineIdSync();
    return crypto.createHash("sha256").update(raw + ENCRYPT_SALT).digest();
  } catch {
    return crypto.createHash("sha256").update(ENCRYPT_SALT).digest();
  }
}

function encryptPassword(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPT_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptPassword(stored) {
  try {
    const [ivHex, tagHex, dataHex] = stored.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ENCRYPT_ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(Buffer.from(dataHex, "hex")) + decipher.final("utf8");
  } catch {
    return null;
  }
}

async function saveMitmSettings(enabled, password) {
  if (!_updateSettings) return;
  const updates: any = { mitmEnabled: enabled };
  if (password) {
    updates.mitmSudoEncrypted = encryptPassword(password);
  }
  await _updateSettings(updates);
}

async function clearEncryptedPassword() {
  if (!_updateSettings) return;
  await _updateSettings({ mitmSudoEncrypted: null });
}

async function loadEncryptedPassword() {
  if (!_getSettings) return null;
  try {
    const settings = await _getSettings();
    if (!settings.mitmSudoEncrypted) return null;
    return decryptPassword(settings.mitmSudoEncrypted);
  } catch {
    return null;
  }
}

module.exports = {
  initPasswordStoreHooks,
  getCachedPassword,
  setCachedPassword,
  saveMitmSettings,
  clearEncryptedPassword,
  loadEncryptedPassword,
};
