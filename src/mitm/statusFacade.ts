const { loadMitmStatusRuntime } = require("@/lib/mitm/statusFacadeRuntime");

async function loadMitmStatusModule() {
  return loadMitmStatusRuntime();
}

async function getMitmStatusForApi() {
  const mod = await loadMitmStatusModule();
  const status = await mod.getMitmStatus();
  const hasCachedPassword = !!mod.getCachedPassword() || !!(await mod.loadEncryptedPassword());
  return { status, hasCachedPassword };
}

function initDbHooks(getSettings, updateSettings) {
  return loadMitmStatusModule().then((mod) => mod.initDbHooks(getSettings, updateSettings));
}

function getCachedPassword() {
  return globalThis.__mitmSudoPassword || null;
}

async function loadEncryptedPassword() {
  const mod = await loadMitmStatusModule();
  return await mod.loadEncryptedPassword();
}

module.exports = {
  getMitmStatusForApi,
  initDbHooks,
  getCachedPassword,
  loadEncryptedPassword,
};

