type R2BackupClientModule = typeof import("./r2BackupClient");

async function loadR2BackupClient(): Promise<R2BackupClientModule> {
  return import("./r2BackupClient");
}

export async function publishRuntimeArtifactsFromSettings(options: {
  settings: unknown;
}) {
  const mod = await loadR2BackupClient();
  return mod.publishRuntimeArtifactsFromSettings(options as never);
}
