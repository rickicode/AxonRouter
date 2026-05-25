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

export async function clearAccountError(...args: Parameters<typeof import("./auth").clearAccountError>) {
  const auth = await loadAuth();
  return auth.clearAccountError(...args);
}
