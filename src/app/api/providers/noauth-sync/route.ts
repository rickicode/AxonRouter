import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { syncNoAuthProviderModels } from "@/lib/providerModels/noAuthSync";

export const dynamic = "force-dynamic";

/**
 * POST /api/providers/noauth-sync
 * Body: { providerId?: string }
 *
 * Triggers a live model sync for noAuth providers (e.g. OpenCode Free).
 * These providers have no DB connection, so they fetch directly from the
 * public models endpoint.
 */
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const providerId = typeof body?.providerId === "string" && body.providerId.trim()
      ? body.providerId.trim()
      : undefined;

    const results = await syncNoAuthProviderModels(providerId);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("noauth-sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync models" },
      { status: 500 },
    );
  }
}
