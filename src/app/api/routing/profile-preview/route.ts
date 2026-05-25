import { NextResponse } from "next/server";
import {
  getCurrentProviderConnections,
  getCurrentSettings,
} from "@/lib/settingsAccess";
import { getUsageAnalyticsFromDb } from "@/lib/usageDb/queries/analytics";
import {
  getRoutingProfilePreset,
  rankConnectionsForPolicy,
  ROUTING_PROFILE_PRESETS,
} from "@/lib/routing/profilePolicy";

type UsageAnalyticsRow = {
  provider: string;
  cost?: number | string | null;
  requests?: number | string | null;
};

type UsageAnalyticsResult = {
  byProvider?: UsageAnalyticsRow[];
};

type RankedConnection = {
  id: string;
  provider: string;
  name?: string | null;
  displayName?: string | null;
  email?: string | null;
  routingScore?: unknown;
  routingScoreBreakdown?: unknown;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const settings: any = await getCurrentSettings();
  const activeProfile = settings?.routing?.profile || settings?.routingProfile || "balanced";
  const profile = searchParams.get("profile") || activeProfile;
  const preset = getRoutingProfilePreset(profile);
  const provider = searchParams.get("provider") || undefined;
  const sampleConnections = provider
    ? await getCurrentProviderConnections({ provider, isActive: true })
    : [];
  const analytics = getUsageAnalyticsFromDb({ period: "30d" }) as UsageAnalyticsResult | null | undefined;
  const byProviderRows = analytics?.byProvider || [];
  const telemetry = {
    byProvider: Object.fromEntries(byProviderRows.map((row) => [row.provider, row])),
    maxCost: Math.max(0, ...byProviderRows.map((row) => Number(row.cost || 0))),
    maxRequests: Math.max(0, ...byProviderRows.map((row) => Number(row.requests || 0))),
  };
  const rankedSample = provider
    ? rankConnectionsForPolicy(sampleConnections.slice(0, 5), preset, telemetry)
    : [];

  return NextResponse.json(
    {
      activeProfile,
      preset,
      profiles: Object.values(ROUTING_PROFILE_PRESETS),
      sampleRanking: (rankedSample as RankedConnection[]).map((connection) => ({
        id: connection.id,
        provider: connection.provider,
        name: connection.name || connection.displayName || connection.email || connection.id,
        routingScore: connection.routingScore,
        routingScoreBreakdown: connection.routingScoreBreakdown,
      })),
      telemetrySummary: {
        provider,
        maxCost: telemetry.maxCost,
        maxRequests: telemetry.maxRequests,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
