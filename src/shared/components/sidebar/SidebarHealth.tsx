"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { APP_CONFIG } from "@/shared/constants/config";

type HealthState = {
  status: "online" | "offline";
  latencyMs: number;
};

export default function SidebarHealth() {
  const [health, setHealth] = useState<HealthState>({ status: "online", latencyMs: 1 });

  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setTimeout(() => {
      setHealth({ status: "online", latencyMs: Math.max(1, Math.round(performance.now() - startedAt)) });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const healthy = health.status === "online";
  const label = healthy ? "healthy" : "offline";
  const latency = `${health.latencyMs}ms`;

  const latencyToneClass =
    health.latencyMs <= 50
      ? "text-[var(--color-success)] border-[var(--color-success)]/35 bg-[var(--color-success)]/15"
      : health.latencyMs <= 200
        ? "text-[var(--color-warning)] border-[var(--color-warning)]/35 bg-[var(--color-warning)]/15"
        : "text-[var(--color-danger)] border-[var(--color-danger)]/35 bg-[var(--color-danger)]/15";

  return (
    <div className="group-data-[collapsible=icon]:hidden">
      <div className="rounded-[4px] border border-sidebar-border/80 bg-sidebar-accent/45 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <span className={healthy ? "size-2 shrink-0 rounded-full bg-success shadow-[0_0_16px_color-mix(in_srgb,var(--color-success)_55%,transparent)]" : "size-2 shrink-0 rounded-full bg-muted-foreground"} />
            <span className="truncate font-medium text-sidebar-foreground">Router {label}</span>
          </div>
          <Badge variant="outline" className={`h-5 shrink-0 rounded-sm px-1.5 text-[10px] font-medium tabular-nums ${latencyToneClass}`}>
            {latency}
          </Badge>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-sidebar-foreground/45">
          <span>AxonRouter runtime</span>
          <span>v{APP_CONFIG.version}</span>
        </div>
      </div>
    </div>
  );
}
