"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import AppIcon from "@/shared/components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { fetchJson, useInvalidate } from "@/shared/query";

function SeverityBadge({ severity }: { severity: string }) {
  const variant = severity === "critical" ? "destructive" : severity === "high" ? "outline" : "secondary";
  return <Badge variant={variant} className="text-[10px] uppercase tracking-[0.12em]">{severity}</Badge>;
}

export default function IncidentsTab() {
  const inv = useInvalidate();
  const [actingId, setActingId] = useState("");

  const incidentsQuery = useQuery({
    queryKey: ["incidents"],
    queryFn: ({ signal }) => fetchJson<any>("/api/incidents", { signal }),
    refetchInterval: 15000,
  });

  const data = incidentsQuery.data ?? { incidents: [], summary: {}, routingLatency: null };
  const loading = incidentsQuery.isPending;

  const rerouteMutation = useMutation({
    retry: false,
    mutationFn: async (provider: string) => {
      await fetch("/api/incidents/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reroute", provider }) });
    },
    onSuccess: () => { inv.providers(); },
    onSettled: () => { void incidentsQuery.refetch(); },
  });

  const disableRouteMutation = useMutation({
    retry: false,
    mutationFn: async (provider: string) => {
      await fetch("/api/incidents/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disable-route", provider }) });
    },
    onSuccess: () => { inv.providers(); },
    onSettled: () => { void incidentsQuery.refetch(); },
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Summary stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="border-border/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Critical</p>
          <p className="mt-1 text-xl font-bold text-[var(--color-danger)]">{data.summary.critical || 0}</p>
        </Card>
        <Card className="border-border/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">High</p>
          <p className="mt-1 text-xl font-bold text-[var(--color-warning)]">{data.summary.high || 0}</p>
        </Card>
        <Card className="border-border/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Total</p>
          <p className="mt-1 text-xl font-bold">{data.summary.total || 0}</p>
        </Card>
        <Card className="border-border/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">P95 Latency</p>
          <p className="mt-1 text-xl font-bold">{data.routingLatency?.p95 ? `${Math.round(data.routingLatency.p95)}ms` : "—"}</p>
        </Card>
      </div>

      {/* Incident list */}
      <Card className="border-border/60 p-0">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <AppIcon name="error" size={15} className="text-[var(--color-danger)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Active incidents</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Auto-refresh 15s</span>
            <Button variant="ghost" size="icon-xs" onClick={() => void incidentsQuery.refetch()} title="Refresh">
              <AppIcon name="refresh" size={14} />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Spinner /> Loading...
          </div>
        ) : data.incidents.length === 0 ? (
          <Empty className="border-0 py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon"><AppIcon name="check" /></EmptyMedia>
              <EmptyTitle>No active incidents</EmptyTitle>
              <EmptyDescription>Provider errors, fallback spikes, and quota issues will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y divide-[var(--color-border)]/60">
            {data.incidents.map((incident) => (
              <div key={incident.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={incident.severity} />
                    <span className="text-xs text-muted-foreground">{incident.provider || "—"} · {incident.type}</span>
                  </div>
                  <p className="text-sm font-medium text-[var(--color-text-main)]">{incident.title}</p>
                  <p className="text-xs text-muted-foreground">{incident.summary}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{new Date(incident.timestamp).toLocaleString()}</p>
                </div>
                {incident.provider && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="secondary" disabled={rerouteMutation.isPending && actingId === incident.id} onClick={() => { setActingId(incident.id); rerouteMutation.mutate(incident.provider); }}>
                      {rerouteMutation.isPending && actingId === incident.id && <Spinner data-icon="inline-start" />}
                      Reroute
                    </Button>
                    <Button size="sm" variant="ghost" disabled={disableRouteMutation.isPending && actingId === incident.id} onClick={() => { setActingId(incident.id); disableRouteMutation.mutate(incident.provider); }}>
                      Disable
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
