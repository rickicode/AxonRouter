type LocalDbModule = typeof import("@/lib/localDb");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export function extractApiKey(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

export async function isValidApiKey(apiKey: string) {
  const { validateApiKey } = await loadLocalDb();
  return validateApiKey(apiKey);
}

export async function hasApiKeys() {
  const { getApiKeys } = await loadLocalDb();
  const keys = await getApiKeys();
  return keys.length > 0;
}
