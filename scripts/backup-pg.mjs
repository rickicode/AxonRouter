#!/usr/bin/env node
/**
 * Standalone Database Backup Engine: PostgreSQL -> Compressed .sql.gz
 * Usage:
 *   DATABASE_URL="postgres://axonrouter:password123@localhost:5432/axonrouter" node scripts/backup-pg.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const pgUrl = process.env.DATABASE_URL || "postgres://axonrouter:password123@localhost:5432/axonrouter";
const dataDir = process.env.DATA_DIR || path.join(process.env.HOME || "", ".axonrouter");
const backupDir = path.join(dataDir, "backups");

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

async function backup() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const targetFile = path.join(backupDir, `axonrouter-pg-${timestamp}.sql.gz`);

  console.log(`[BACKUP] Initiating PostgreSQL backup...`);
  console.log(`[BACKUP] Target: ${targetFile}`);

  try {
    // Check if pg_dump is installed
    await execAsync(`pg_dump --version`);
    const cmd = `pg_dump "${pgUrl}" | gzip > "${targetFile}"`;
    await execAsync(cmd);
    const stats = fs.statSync(targetFile);
    console.log(`✓ Backup successfully created: ${(stats.size / 1024).toFixed(2)} KB`);

    // Retention prune: keep last 7 days backups
    pruneOldBackups(backupDir, 7);
  } catch (err) {
    console.warn(`! pg_dump not available in host environment or failed: ${err.message}`);
    console.log(`[BACKUP] For Docker container deployment, run: docker exec -t axonrouter-postgres pg_dump -U axonrouter axonrouter | gzip > backup.sql.gz`);
  }
}

function pruneOldBackups(dir, daysToKeep = 7) {
  try {
    const files = fs.readdirSync(dir);
    const cutoffMs = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    for (const f of files) {
      if (!f.startsWith("axonrouter-pg-") || !f.endsWith(".sql.gz")) continue;
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs < cutoffMs) {
        fs.unlinkSync(fullPath);
        console.log(`[BACKUP] Pruned old backup: ${f}`);
      }
    }
  } catch {}
}

backup();
