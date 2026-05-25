type LocalDbModule = Pick<typeof import("@/lib/localDb"), "getPricing">;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentPricing() {
  const { getPricing } = await loadLocalDb();
  return getPricing();
}
