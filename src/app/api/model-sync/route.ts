import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";
import { ensureModelSyncSchedulerStarted } from "@/lib/providerModels/bootstrap";
import { getEligibleModelSyncConnections, runModelSyncBatch } from "@/lib/providerModels/syncRunner";
import { getModelSyncScheduler } from "@/lib/providerModels/scheduler";
import { normalizeModelSyncSettings } from "@/lib/providerModels/syncSettings";

export const dynamic = "force-dynamic";

type RouteError = Error & {
  message: string;
};

type PatchBody = {
  modelSync?: Record<string, unknown>;
};

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const settings = await getCurrentSettings();
    await ensureModelSyncSchedulerStarted();
    const modelSync = normalizeModelSyncSettings(settings?.modelSync || {});
    const eligibleConnections = await getEligibleModelSyncConnections();
    const scheduler = getModelSyncScheduler();

    return NextResponse.json({
      settings: modelSync,
      eligibleConnections: eligibleConnections.map((connection) => ({
        id: connection.id,
        provider: connection.provider,
        name: connection.name || connection.displayName || connection.email || connection.id,
      })),
      scheduler: scheduler.getStatus(),
    });
  } catch (error) {
    const routeError = error as RouteError;
    console.error("Error reading model sync status:", routeError);
    return NextResponse.json({ error: routeError.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as PatchBody;
    const settings = await getCurrentSettings();
    const nextModelSync = normalizeModelSyncSettings({
      ...(settings?.modelSync || {}),
      ...(body?.modelSync && typeof body.modelSync === "object" && !Array.isArray(body.modelSync)
        ? body.modelSync
        : {}),
    });
    const updated = await updateCurrentSettings({ modelSync: nextModelSync });
    await ensureModelSyncSchedulerStarted();
    return NextResponse.json({ settings: updated.modelSync, scheduler: getModelSyncScheduler().getStatus() });
  } catch (error) {
    const routeError = error as RouteError;
    console.error("Error updating model sync settings:", routeError);
    return NextResponse.json({ error: routeError.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const result = await runModelSyncBatch();
    return NextResponse.json(result);
  } catch (error) {
    const routeError = error as RouteError;
    console.error("Error running model sync batch:", routeError);
    return NextResponse.json({ error: routeError.message }, { status: 500 });
  }
}
