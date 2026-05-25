type LocalDbModule = typeof import("./localDb");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("./localDb");
}

export async function getCurrentProviderConnectionById(connectionId: string) {
  const { getProviderConnectionById } = await loadLocalDb();
  return getProviderConnectionById(connectionId);
}

export async function getCurrentQuotaExhaustedThresholdPercent() {
  const { getSettings } = await loadLocalDb();
  const settings = await getSettings();
  const threshold = Number(settings?.quotaExhaustedThresholdPercent);
  return Number.isFinite(threshold) ? threshold : undefined;
}
