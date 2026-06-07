"use server";

import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  getActiveCodexAccount,
  setActiveCodexAccount,
} from "@/lib/codexAutoSwitch";

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const account = await getActiveCodexAccount();
    return NextResponse.json(
      account || { connectionId: null, connectionName: null, email: null, planType: null, remainingPercent: null },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to get active Codex account";
    console.error("Error getting active Codex account:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json() as { connectionId?: string | null };
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : null;
    const success = await setActiveCodexAccount(connectionId);

    if (!success && connectionId) {
      return NextResponse.json(
        { error: "Connection not found or not a valid Codex account" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, activeConnectionId: connectionId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to set active Codex account";
    console.error("Error setting active Codex account:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
