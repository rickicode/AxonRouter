import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/combos/auto-seed
 * Smart auto-seed: detect active providers and build/update auto combos.
 * If combo exists → update models. If not → create.
 */
export async function POST(request: NextRequest) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { applySmartSeed } = await import("@/lib/smart-router/smart-seed");
    const result = await applySmartSeed();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[auto-seed] Error:", error);
    return NextResponse.json({ error: "Failed to auto-seed combos" }, { status: 500 });
  }
}

/**
 * GET /api/combos/auto-seed
 * Preview what combos would be generated (dry run).
 */
export async function GET(request: NextRequest) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { buildSmartSeedCombos } = await import("@/lib/smart-router/smart-seed");
    const combos = await buildSmartSeedCombos();
    return NextResponse.json({ combos });
  } catch (error) {
    console.error("[auto-seed] Preview error:", error);
    return NextResponse.json({ error: "Failed to preview auto-seed" }, { status: 500 });
  }
}
