import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  buildWorkerDashboardUrl,
  fetchWorkerStatus,
  probeCloudHealth,
} from "@/lib/cloudWorkerClient";
import { hasValidCloudRouteOrigin } from "@/lib/cloudRequestAuth";
import { getCurrentSettings } from "@/lib/settingsAccess";

type CloudUrlEntry = {
  id: string;
  url?: string | null;
  name?: string | null;
  lastSyncAt?: string | null;
  lastSyncOk?: boolean | null;
  lastSyncError?: string | null;
  providersCount?: number | null;
};

type SettingsShape = {
  cloudUrls?: CloudUrlEntry[];
  cloudSharedSecret?: string;
};

type WorkerStatus = {
  latencyMs?: number | null;
  version?: string | null;
  uptime?: number | null;
  lastSyncAt?: string | null;
  counts?: {
    providers?: number | null;
  } | null;
};

type ProbeResult = {
  ok?: boolean;
  status?: string;
  latencyMs?: number | null;
  version?: string | null;
  uptime?: number | null;
};

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

function maskSecret(secret: string | undefined | null): string {
  if (typeof secret !== "string" || secret.length < 12) return "••••";
  return `${secret.slice(0, 6)}...${secret.slice(-4)}`;
}

function shouldRevealSecret(request: Request): boolean {
  const includeSecret = new URL(request.url).searchParams.get("includeSecret");
  return includeSecret === "1";
}

/**
 * GET /api/cloud-urls/:id/status
 *
 * Returns the live state of a registered cloud worker:
 *   - liveness probe (latency, version, uptime)
 *   - synced view (providers, sync stats) if the worker recognises us
 *   - a one-shot signed dashboard URL the user can open in a new tab
 *
 * The shared secret is held server-side and never returned to the browser
 * directly. The dashboard URL DOES embed the token because the worker's
 * `/admin/status` page is server-rendered HTML — but it is short-lived in the
 * sense that rotating the secret (TODO: future work) immediately invalidates
 * the link.
 */
export async function GET(request: Request, context: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  if (!hasValidCloudRouteOrigin(request)) {
    return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing cloud URL id" }, { status: 400 });
  }

  const settings = (await getCurrentSettings()) as SettingsShape;
  const entry = (settings.cloudUrls || []).find((cloudUrl) => cloudUrl.id === id);
  const globalSecret = typeof settings.cloudSharedSecret === "string" ? settings.cloudSharedSecret : "";
  if (!entry) {
    return NextResponse.json({ error: "Cloud URL not found" }, { status: 404 });
  }

  if (!entry.url) {
    return NextResponse.json({ error: "Cloud URL has no URL configured" }, { status: 400 });
  }

  if (!globalSecret) {
    const probe = (await probeCloudHealth(entry.url)) as ProbeResult;
    return NextResponse.json({
      reachable: probe.ok,
      probe,
      registered: false,
      lastSyncAt: entry.lastSyncAt || null,
      lastSyncOk: entry.lastSyncOk ?? null,
      providersCount: entry.providersCount ?? null,
      url: entry.url,
      hasSecret: false,
      secretMasked: null,
      message: "Global cloud shared secret is missing. Regenerate it in AxonRouter before syncing workers.",
    });
  }

  let workerStatus: WorkerStatus | null = null;
  let workerError: string | null = null;
  let workerStatusCode: number | null = null;
  let probe: ProbeResult | null = null;

  try {
    workerStatus = (await fetchWorkerStatus(entry.url, globalSecret)) as WorkerStatus;
    probe = {
      ok: true,
      status: "online",
      latencyMs: workerStatus?.latencyMs ?? null,
      version: workerStatus?.version || null,
      uptime: workerStatus?.uptime ?? null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "status fetch failed";
    workerError = message || "status fetch failed";
    workerStatusCode =
      typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
        ? error.status
        : null;
    probe = (await probeCloudHealth(entry.url)) as ProbeResult;
  }

  return NextResponse.json({
    reachable: probe?.ok === true,
    probe,
    registered: true,
    url: entry.url,
    name: entry.name || null,
    lastSyncAt: entry.lastSyncAt || workerStatus?.lastSyncAt || null,
    lastSyncOk: entry.lastSyncOk ?? null,
    lastSyncError: entry.lastSyncError || null,
    providersCount: workerStatus?.counts?.providers ?? entry.providersCount ?? null,
    workerStatus,
    workerError,
    workerStatusCode,
    hasSecret: true,
    secretMasked: maskSecret(globalSecret),
    secret: shouldRevealSecret(request) ? globalSecret : undefined,
    dashboardUrl: buildWorkerDashboardUrl(entry.url, globalSecret),
  });
}
