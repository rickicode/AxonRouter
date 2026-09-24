export const DEFAULT_CODEBUFF_CLI_VERSION = "1.1.12";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FETCH_TIMEOUT_MS = 3500;

let cachedVersion = DEFAULT_CODEBUFF_CLI_VERSION;
let lastFetchedAt = Date.now(); // default cache starts warm; updated asynchronously
let refreshPromise = null;

/**
 * Fetch latest codebuff-cli version from npm registry.
 * Fail-open: returns cached or default version on any error.
 */
export async function refreshCodebuffVersion(force = false) {
  if (process.env.CODEBUFF_CLI_VERSION) {
    cachedVersion = process.env.CODEBUFF_CLI_VERSION.trim();
    return cachedVersion;
  }

  const now = Date.now();
  if (!force && lastFetchedAt && now - lastFetchedAt < CACHE_TTL_MS) {
    return cachedVersion;
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch("https://registry.npmjs.org/codebuff-cli/latest", {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.version && typeof data.version === "string") {
          cachedVersion = data.version.trim();
          lastFetchedAt = Date.now();
        }
      }
    } catch {
      // Fail-open: keep cachedVersion
    } finally {
      refreshPromise = null;
    }
    return cachedVersion;
  })();

  return refreshPromise;
}

/**
 * Return current Codebuff-CLI User-Agent.
 * Triggers background refresh if cache is stale.
 */
export function getCodebuffUserAgent() {
  const version = process.env.CODEBUFF_CLI_VERSION?.trim() || cachedVersion;
  const now = Date.now();
  if (!process.env.CODEBUFF_CLI_VERSION && (!lastFetchedAt || now - lastFetchedAt >= CACHE_TTL_MS)) {
    refreshCodebuffVersion().catch(() => {});
  }
  return `Codebuff-CLI/${version}`;
}

export function getCodebuffCliVersion() {
  return process.env.CODEBUFF_CLI_VERSION?.trim() || cachedVersion;
}

export function __resetCodebuffVersionCache(version = DEFAULT_CODEBUFF_CLI_VERSION) {
  cachedVersion = version;
  lastFetchedAt = Date.now();
  refreshPromise = null;
}
