import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentProviderConnections } from "@/lib/connectionAccess";
import { getRoutingLatencySummary } from "@/lib/routingLatency";
import { getRequestDetails } from "@/lib/usageDb";

type Severity = "critical" | "high" | "medium" | "low";

type Connection = {
  id?: string | number | null;
  provider?: string | null;
  defaultModel?: string | null;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  routingStatus?: string | null;
  healthStatus?: string | null;
  quotaState?: string | null;
  resetAt?: string | null;
  lastCheckedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type RoutingLatencySummary = {
  p95?: number | null;
  windowMs?: number | null;
  count?: number | null;
  lastAt?: string | number | Date | null;
};

type RequestTraceSummary = {
  lastEventType?: string | null;
  mode?: string | null;
  eventCount?: number | null;
};

type RequestDetail = {
  id?: string | number | null;
  provider?: string | null;
  model?: string | null;
  status?: string | null;
  correlationId?: string | null;
  timestamp?: string | null;
  traceSummary?: RequestTraceSummary | null;
};

type Incident = {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  summary: string;
  provider: string | null;
  model: string | null;
  tenant: string | null;
  correlationId: string | null;
  blastRadius: Record<string, unknown>;
  actionHints: string[];
  links: Record<string, string | null>;
  timestamp: string;
};

type RequestDetailsResult = {
  details?: RequestDetail[] | null;
};

function severityRank(severity: string | null | undefined): number {
  return severity === "critical" ? 3 : severity === "high" ? 2 : severity === "medium" ? 1 : 0;
}

function hasFutureReset(resetAt: string | null | undefined): boolean {
  if (!resetAt) return false;
  const timestamp = new Date(resetAt).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function isTimeWindowQuotaProvider(provider: string | null | undefined): boolean {
  return provider === "codex" || provider === "kiro" || provider === "amazon-q";
}

function shouldCreateQuotaIncident(connection: Connection = {}): boolean {
  if (connection?.quotaState !== "exhausted") return false;
  if (isTimeWindowQuotaProvider(connection?.provider)) return false;
  if (hasFutureReset(connection?.resetAt)) return false;
  return true;
}

function buildConnectionIncidents(connections: Connection[] = []): Incident[] {
  const incidents: Incident[] = [];
  for (const connection of connections) {
    if (connection?.reasonCode === "provider_not_allowed" || connection?.reasonCode === "budget_cap_exceeded") {
      incidents.push({
        id: `gov-${connection.id}`,
        type: "governance-policy",
        severity: "high",
        title: `${connection.provider} blocked by governance`,
        summary: connection?.reasonDetail || connection?.reasonCode || "Governance policy denied routing",
        provider: connection?.provider || null,
        model: connection?.defaultModel || null,
        tenant: null,
        correlationId: null,
        blastRadius: { provider: connection?.provider || null, connectionId: connection?.id || null },
        actionHints: ["Review routing guardrails", "Update allowlist or budget cap", "Inspect recent spend"],
        links: {
          provider: connection?.provider ? `/dashboard/providers/${connection.provider}` : null,
          usage: `/dashboard/usage`,
        },
        timestamp: connection?.lastCheckedAt || connection?.updatedAt || connection?.createdAt || new Date().toISOString(),
      });
    }
    if (connection?.routingStatus === "blocked" || connection?.healthStatus === "error" || connection?.healthStatus === "degraded") {
      incidents.push({
        id: `conn-${connection.id}`,
        type: "provider-health",
        severity: connection?.healthStatus === "error" ? "critical" : "high",
        title: `${connection.provider} connection degraded`,
        summary: connection?.reasonDetail || connection?.reasonCode || "Connection is not healthy",
        provider: connection?.provider || null,
        model: connection?.defaultModel || null,
        tenant: null,
        correlationId: null,
        blastRadius: {
          provider: connection?.provider || null,
          connectionId: connection?.id || null,
        },
        actionHints: ["Inspect trace details", "Disable affected route", "Re-authenticate or retry provider"],
        links: {
          provider: connection?.provider ? `/dashboard/providers/${connection.provider}` : null,
          usage: connection?.provider ? `/dashboard/usage` : null,
        },
        timestamp: connection?.lastCheckedAt || connection?.updatedAt || connection?.createdAt || new Date().toISOString(),
      });
    }
    if (shouldCreateQuotaIncident(connection)) {
      incidents.push({
        id: `quota-${connection.id}`,
        type: "quota-exhausted",
        severity: "high",
        title: `${connection.provider} quota exhausted`,
        summary: connection?.reasonDetail || connection?.reasonCode || "Provider quota exhausted",
        provider: connection?.provider || null,
        model: connection?.defaultModel || null,
        tenant: null,
        correlationId: null,
        blastRadius: {
          provider: connection?.provider || null,
          connectionId: connection?.id || null,
        },
        actionHints: ["Reroute traffic", "Top up quota", "Temporarily disable exhausted connection"],
        links: {
          provider: connection?.provider ? `/dashboard/providers/${connection.provider}` : null,
          usage: `/dashboard/usage`,
        },
        timestamp: connection?.lastCheckedAt || connection?.updatedAt || connection?.createdAt || new Date().toISOString(),
      });
    }
  }
  return incidents;
}

function buildLatencyIncidents(summary?: RoutingLatencySummary | null): Incident[] {
  const incidents: Incident[] = [];
  if ((summary?.p95 || 0) > 2000) {
    incidents.push({
      id: "latency-p95",
      type: "routing-latency",
      severity: "high",
      title: "Routing latency degraded",
      summary: `p95 routing latency is ${Math.round(summary.p95 as number)}ms`,
      provider: null,
      model: null,
      tenant: null,
      correlationId: null,
      blastRadius: { windowMs: summary.windowMs, sampleCount: summary.count },
      actionHints: ["Inspect recent traces", "Rollback recent routing changes", "Reduce retry depth"],
      links: {
        usage: `/dashboard/usage`,
        analytics: `/dashboard/analytics`,
      },
      timestamp: new Date(summary.lastAt || Date.now()).toISOString(),
    });
  }
  return incidents;
}

function buildTraceIncidents(details: RequestDetail[] = []): Incident[] {
  const incidents: Incident[] = [];
  for (const detail of details) {
    const traceSummary = detail?.traceSummary;
    if (!traceSummary) continue;
    if (traceSummary.lastEventType === "fallback" || detail?.status === "error") {
      incidents.push({
        id: `trace-${detail.id}`,
        type: "fallback-storm",
        severity: detail?.status === "error" ? "high" : "medium",
        title: `Fallback activity on ${detail.model || detail.provider || "request"}`,
        summary: `Last trace event: ${traceSummary.lastEventType || "unknown"}`,
        provider: detail?.provider || null,
        model: detail?.model || null,
        tenant: null,
        correlationId: detail?.correlationId || null,
        blastRadius: {
          mode: traceSummary.mode || null,
          eventCount: traceSummary.eventCount || 0,
        },
        actionHints: ["Open trace detail", "Inspect fallback chain", "Tune retry/fallback policy"],
        links: {
          usage: `/dashboard/usage?tab=details`,
        },
        timestamp: detail?.timestamp || new Date().toISOString(),
      });
    }
  }
  return incidents;
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const [connections, routingLatency, requestDetailsResult] = await Promise.all([
      getCurrentProviderConnections(),
      Promise.resolve(getRoutingLatencySummary()),
      getRequestDetails({ page: 1, pageSize: 50 }),
    ]);

    const incidents = [
      ...buildConnectionIncidents((connections || []) as Connection[]),
      ...buildLatencyIncidents(routingLatency as RoutingLatencySummary | null | undefined),
      ...buildTraceIncidents(((requestDetailsResult as RequestDetailsResult | null | undefined)?.details || []) as RequestDetail[]),
    ].sort((left, right) => {
      const severityDelta = severityRank(right.severity) - severityRank(left.severity);
      if (severityDelta !== 0) return severityDelta;
      return new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime();
    });

    return NextResponse.json(
      {
        incidents,
        summary: {
          total: incidents.length,
          critical: incidents.filter((incident) => incident.severity === "critical").length,
          high: incidents.filter((incident) => incident.severity === "high").length,
          medium: incidents.filter((incident) => incident.severity === "medium").length,
        },
        routingLatency,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to load incidents", message }, { status: 500 });
  }
}
