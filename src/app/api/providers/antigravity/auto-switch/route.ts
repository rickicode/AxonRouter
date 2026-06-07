"use server";

import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const settings = await getCurrentSettings();
    const autoSwitch = settings?.antigravityAutoSwitch || {};

    return NextResponse.json({
      enabled: autoSwitch.enabled === true,
      activeConnectionId: typeof autoSwitch.activeConnectionId === "string"
        ? autoSwitch.activeConnectionId
        : null,
      lastRotatedAt: typeof autoSwitch.lastRotatedAt === "string"
        ? autoSwitch.lastRotatedAt
        : null,
      lastRotatedFrom: typeof autoSwitch.lastRotatedFrom === "string"
        ? autoSwitch.lastRotatedFrom
        : null,
      lastRotatedTo: typeof autoSwitch.lastRotatedTo === "string"
        ? autoSwitch.lastRotatedTo
        : null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to get Antigravity CLI auto-switch settings";
    console.error("Error getting Antigravity CLI auto-switch settings:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json() as Record<string, unknown>;
    const enabled = body.enabled === true;
    const activeConnectionId = typeof body.activeConnectionId === "string"
      ? body.activeConnectionId
      : null;

    const currentSettings = await getCurrentSettings();
    const current = currentSettings?.antigravityAutoSwitch || {};

    const updated = {
      ...current,
      enabled,
      ...(activeConnectionId !== undefined ? { activeConnectionId } : {}),
    };

    await updateCurrentSettings({ antigravityAutoSwitch: updated });

    return NextResponse.json({
      enabled,
      activeConnectionId: updated.activeConnectionId || null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update Antigravity CLI auto-switch settings";
    console.error("Error updating Antigravity CLI auto-switch settings:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
