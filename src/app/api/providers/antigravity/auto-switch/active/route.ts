"use server";

import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  getActiveAntigravityAccount,
  setActiveAntigravityAccount,
} from "@/lib/antigravityAutoSwitch";

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const account = await getActiveAntigravityAccount();
    return NextResponse.json(
      account || { connectionId: null, connectionName: null, email: null, projectId: null },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to get active Antigravity CLI account";
    console.error("Error getting active Antigravity CLI account:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json() as { connectionId?: string | null };
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : null;
    const success = await setActiveAntigravityAccount(connectionId);

    if (!success && connectionId) {
      return NextResponse.json(
        { error: "Connection not found or not a valid Antigravity account" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, activeConnectionId: connectionId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to set active Antigravity CLI account";
    console.error("Error setting active Antigravity CLI account:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
