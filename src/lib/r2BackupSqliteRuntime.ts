import fs from "node:fs";

import { DB_SQLITE_FILE } from "./sqliteHelpers";

export function buildRestoreBackupLocalPath() {
  return `${DB_SQLITE_FILE}.pre-restore-${Date.now()}`;
}

export function ensureSqliteBackupExists() {
  if (!fs.existsSync(DB_SQLITE_FILE)) {
    throw new Error(`SQLite file not found: ${DB_SQLITE_FILE}`);
  }
}

export function readSqliteBackupFile() {
  ensureSqliteBackupExists();
  return fs.readFileSync(DB_SQLITE_FILE);
}

export function restoreSqliteBackupFile(backupData: Buffer, backupLocalPath: string) {
  if (fs.existsSync(DB_SQLITE_FILE)) {
    fs.copyFileSync(DB_SQLITE_FILE, backupLocalPath);
  }

  fs.writeFileSync(DB_SQLITE_FILE, backupData);

  return {
    previousBackup: fs.existsSync(backupLocalPath) ? backupLocalPath : null,
  };
}
