type LocalDbModule = typeof import("@/lib/localDb");
type R2BackupClientModule = typeof import("./r2BackupClient");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

async function loadR2BackupClient(): Promise<R2BackupClientModule> {
  return import("./r2BackupClient");
}

export async function publishRuntimeArtifactsFromCurrentSettings() {
  const { getSettings } = await loadLocalDb();
  const settings = await getSettings();
  const mod = await loadR2BackupClient();
  return mod.publishRuntimeArtifactsFromSettings({ settings });
}

export async function readBackupArtifactFromCurrentSettings() {
  const { getSettings } = await loadLocalDb();
  const settings = await getSettings();
  const mod = await loadR2BackupClient();
  return mod.readBackupArtifactFromSettings({ settings });
}

export async function restoreFromCurrentBackupSettings() {
  const { getSettings } = await loadLocalDb();
  const settings = await getSettings();
  const mod = await loadR2BackupClient();
  return mod.restoreFromDirectBackupSettings({ settings });
}

export async function testR2Connection(config: unknown) {
  const mod = await loadR2BackupClient();
  return mod.testR2Connection(config);
}
