"use server";

import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { checkAndRotateCodexAccount, getActiveCodexAccount } from "@/lib/codexAutoSwitch";
import { getCurrentProviderConnections } from "@/lib/connectionAccess";

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const newConnectionId = await checkAndRotateCodexAccount();

    if (newConnectionId) {
      // Get the account display name
      const connections = await getCurrentProviderConnections({
        provider: "codex",
        isActive: true,
      });
      const conn = connections.find((c: any) => c.id === newConnectionId);
      const accountName = conn?.name || conn?.email || conn?.displayName || null;

      return NextResponse.json({
        rotated: true,
        newConnectionId,
        newAccountName: accountName,
      });
    }

    return NextResponse.json({
      rotated: false,
      message: "No rotation needed or no other healthy account available",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to rotate Codex account";
    console.error("Error rotating Codex account:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
