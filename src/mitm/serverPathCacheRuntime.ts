let serverPathCache = null;

function resolveCachedServerPath(resolveFn) {
  if (!serverPathCache) {
    serverPathCache = resolveFn();
  }
  return serverPathCache;
}

function clearCachedServerPath() {
  serverPathCache = null;
}

module.exports = {
  resolveCachedServerPath,
  clearCachedServerPath,
};
