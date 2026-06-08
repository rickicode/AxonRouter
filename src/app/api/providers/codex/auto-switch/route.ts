"use server";

import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";

const DEFAULT_THRESHOLD = 10;

function normalizeThreshold(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_THRESHOLD;
  return Math.max(1, Math.min(99, Math.round(num)));
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const settings = await getCurrentSettings();
    const codexAutoSwitch = settings?.codexAutoSwitch || {};

    return NextResponse.json({
      enabled: codexAutoSwitch.enabled === true,
      thresholdPercent: normalizeThreshold(codexAutoSwitch.thresholdPercent),
      activeConnectionId: typeof codexAutoSwitch.activeConnectionId === "string"
        ? codexAutoSwitch.activeConnectionId
        : null,
      lastRotatedAt: typeof codexAutoSwitch.lastRotatedAt === "string"
        ? codexAutoSwitch.lastRotatedAt
        : null,
      lastRotatedFrom: typeof codexAutoSwitch.lastRotatedFrom === "string"
        ? codexAutoSwitch.lastRotatedFrom
        : null,
      lastRotatedTo: typeof codexAutoSwitch.lastRotatedTo === "string"
        ? codexAutoSwitch.lastRotatedTo
        : null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to get Codex auto-switch settings";
    console.error("Error getting Codex auto-switch settings:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json() as Record<string, unknown>;
    const currentSettings = await getCurrentSettings();
    const current = currentSettings?.codexAutoSwitch || {};

    const updated = {
      ...current,
    };

    if (body.enabled !== undefined) {
      updated.enabled = body.enabled === true;
    }
    if (body.thresholdPercent !== undefined) {
      updated.thresholdPercent = normalizeThreshold(body.thresholdPercent);
    }
    if (body.activeConnectionId !== undefined) {
      updated.activeConnectionId = typeof body.activeConnectionId === "string"
        ? body.activeConnectionId
        : null;
    }

    await updateCurrentSettings({ codexAutoSwitch: updated });

    return NextResponse.json({
      enabled: updated.enabled === true,
      thresholdPercent: updated.thresholdPercent,
      activeConnectionId: updated.activeConnectionId || null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update Codex auto-switch settings";
    console.error("Error updating Codex auto-switch settings:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
