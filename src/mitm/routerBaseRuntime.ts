const { DEFAULT_AXONROUTER_BASE_URL } = require("./runtimeDefaults");
const DEFAULT_MITM_ROUTER_BASE = DEFAULT_AXONROUTER_BASE_URL;

let _getSettings = null;
let _updateSettings = null;

function initRouterBaseHooks(getSettingsFn, updateSettingsFn) {
  _getSettings = getSettingsFn;
  _updateSettings = updateSettingsFn;
}

function normalizeMitmRouterBaseUrlInput(input) {
  if (input == null || String(input).trim() === "") {
    return DEFAULT_MITM_ROUTER_BASE;
  }
  const value = String(input).trim().replace(/\/+$/, "");
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("MITM router URL must use http or https");
  }
  return value;
}

async function resolveMitmRouterBaseUrl() {
  if (!_getSettings) return DEFAULT_MITM_ROUTER_BASE;
  try {
    const s = await _getSettings();
    return normalizeMitmRouterBaseUrlInput(s && s.mitmRouterBaseUrl);
  } catch {
    return DEFAULT_MITM_ROUTER_BASE;
  }
}

async function setMitmRouterBaseUrl(input) {
  if (!_updateSettings) return normalizeMitmRouterBaseUrlInput(input);
  const normalized = normalizeMitmRouterBaseUrlInput(input);
  await _updateSettings({ mitmRouterBaseUrl: normalized });
  return normalized;
}

module.exports = {
  DEFAULT_MITM_ROUTER_BASE,
  initRouterBaseHooks,
  normalizeMitmRouterBaseUrlInput,
  resolveMitmRouterBaseUrl,
  setMitmRouterBaseUrl,
};
