import { NextResponse } from "next/server";

export async function GET() {
  const checks: Record<string, boolean> = {};

  // Check main DB
  try {
    const { getSqliteDb } = await import("@/lib/sqliteHelpers");
    getSqliteDb().prepare("SELECT 1").get();
    checks.db = true;
  } catch {
    checks.db = false;
  }

  // Check usage DB
  try {
    const { getUsageDbInstance } = await import("@/lib/usageDb/core");
    getUsageDbInstance().prepare("SELECT 1").get();
    checks.usageDb = true;
  } catch {
    checks.usageDb = false;
  }

  const ok = Object.values(checks).every(Boolean);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
