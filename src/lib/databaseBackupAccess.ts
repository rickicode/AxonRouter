import { getCurrentSettings } from "@/lib/settingsAccess";

type LocalDbBackupModule = Pick<typeof import("@/lib/localDb"), "exportDb" | "importDb">;

async function loadLocalDbBackup(): Promise<LocalDbBackupModule> {
  return import("@/lib/localDb");
}

export async function exportCurrentDatabase() {
  const { exportDb } = await loadLocalDbBackup();
  return exportDb();
}

export async function importCurrentDatabase(payload: unknown) {
  const { importDb } = await loadLocalDbBackup();
  await importDb(payload);
}

export async function getCurrentSettingsAfterDatabaseImport() {
  return getCurrentSettings();
}
