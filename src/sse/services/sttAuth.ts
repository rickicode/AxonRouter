async function loadAuth() {
  return import("./auth");
}

export async function getProviderCredentials(...args: Parameters<typeof import("./auth").getProviderCredentials>) {
  const auth = await loadAuth();
  return auth.getProviderCredentials(...args);
}

export async function markAccountUnavailable(...args: Parameters<typeof import("./auth").markAccountUnavailable>) {
  const auth = await loadAuth();
  return auth.markAccountUnavailable(...args);
}

export async function extractApiKey(...args: Parameters<typeof import("./auth").extractApiKey>) {
  const auth = await loadAuth();
  return auth.extractApiKey(...args);
}

export async function isValidApiKey(...args: Parameters<typeof import("./auth").isValidApiKey>) {
  const auth = await loadAuth();
  return auth.isValidApiKey(...args);
}

export async function hasApiKeys() {
  const auth = await loadAuth();
  return auth.hasApiKeys();
}
