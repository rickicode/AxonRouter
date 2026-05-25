type LocalDbModule = Pick<typeof import("@/lib/localDb"), "validateApiKey" | "getApiKeys" | "createApiKey" | "getApiKeyById" | "updateApiKey" | "deleteApiKey">;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

type ApiKeyRecord = {
  key?: string | null;
  isActive?: boolean;
};

export async function validateCurrentApiKey(apiKey: string) {
  const { validateApiKey } = await loadLocalDb();
  return validateApiKey(apiKey);
}

export async function getCurrentActiveApiKey(): Promise<string | null> {
  const { getApiKeys } = await loadLocalDb();
  const keys = (await getApiKeys()) as ApiKeyRecord[];
  return keys.find((key) => key.isActive !== false)?.key || null;
}

export async function getCurrentApiKeys() {
  const { getApiKeys } = await loadLocalDb();
  return getApiKeys();
}

export async function createCurrentApiKey(name: string, machineId: string) {
  const { createApiKey } = await loadLocalDb();
  return createApiKey(name, machineId);
}

export async function getCurrentApiKeyById(id: string) {
  const { getApiKeyById } = await loadLocalDb();
  return getApiKeyById(id);
}

export async function updateCurrentApiKey(id: string, data: Record<string, unknown>) {
  const { updateApiKey } = await loadLocalDb();
  return updateApiKey(id, data);
}

export async function deleteCurrentApiKey(id: string) {
  const { deleteApiKey } = await loadLocalDb();
  return deleteApiKey(id);
}
