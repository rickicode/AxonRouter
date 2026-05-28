"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useNotificationStore } from "@/store/notificationStore";
import { fetchJson } from "@/shared/query";

const STATUS_CONFIG = {
  available: { icon: "check_circle", color: "#22c55e", label: "Available" },
  cooldown: { icon: "schedule", color: "#f59e0b", label: "Cooldown" },
  unavailable: { icon: "error", color: "#ef4444", label: "Unavailable" },
  unknown: { icon: "help", color: "#6b7280", label: "Unknown" },
};

export default function ModelAvailabilityBadge() {
  const availabilityQuery = useQuery({
    queryKey: ["models", "availability"],
    queryFn: ({ signal }) => fetchJson<any>("/api/models/availability", { signal }),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  const data = availabilityQuery.data ?? null;
  const loading = availabilityQuery.isPending;
  const [expanded, setExpanded] = useState(false);
  const [clearing, setClearing] = useState(null);
  const ref = useRef(null);
  const notify = useNotificationStore();

  const fetchStatus = () => { void availabilityQuery.refetch(); };

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setExpanded(false);
    };
    if (expanded) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [expanded]);

  const handleClearCooldown = async (provider, model) => {
    setClearing(`${provider}:${model}`);
    try {
      const res = await fetch("/api/models/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clearCooldown", provider, model }),
      });
      if (res.ok) {
        notify.success(`Cooldown cleared for ${model}`);
        await fetchStatus();
      } else {
        notify.error("Failed to clear cooldown");
      }
    } catch {
      notify.error("Failed to clear cooldown");
    } finally {
      setClearing(null);
    }
  };

  if (loading) return null;

  const models = data?.models || [];
  const unavailableCount = data?.unavailableCount || models.filter((m) => m.status !== "available").length;
  const isHealthy = unavailableCount === 0;
  const byProvider = {};
  models.forEach((m) => {
    if (m.status === "available") return;
    const key = m.provider || "unknown";
    if (!byProvider[key]) byProvider[key] = [];
    byProvider[key].push(m);
  });

  return (
    <div className="relative" ref={ref}>
      {expanded && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-[4px] border border-border bg-popover shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <AppIcon name={isHealthy ? "verified" : "warning"} size={16} style={{ color: isHealthy ? "#22c55e" : "#f59e0b" }} />
              <span className="text-sm font-semibold text-foreground">Model Status</span>
            </div>
            <Button variant="ghost" size="icon-xs" onClick={fetchStatus} title="Refresh">
              <AppIcon name="refresh" size={14} />
            </Button>
          </div>
          <div className="max-h-60 overflow-y-auto px-4 py-3">
            {isHealthy ? (
              <p className="py-2 text-center text-sm text-muted-foreground">All models are responding normally.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {Object.entries(byProvider).map(([provider, rawProvModels]) => {
                  const provModels: any[] = Array.isArray(rawProvModels) ? rawProvModels : [];
                  return (
                  <div key={provider}>
                    <p className="mb-1.5 text-xs font-semibold capitalize text-foreground">{provider}</p>
                    <div className="flex flex-col gap-1">
                      {provModels.map((m) => {
                        const status = STATUS_CONFIG[m.status] || STATUS_CONFIG.unknown;
                        const isClearing = clearing === `${m.provider}:${m.model}`;
                        return (
                          <div key={`${m.provider}-${m.model}`} className="flex items-center justify-between rounded-[4px] bg-secondary/50 px-2.5 py-1.5">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <AppIcon name={status.icon} size={14} className="shrink-0" style={{ color: status.color }} />
                              <span className="truncate font-mono text-xs text-foreground">{m.model}</span>
                            </div>
                            {m.status === "cooldown" && (
                              <Button size="xs" variant="ghost" onClick={() => handleClearCooldown(m.provider, m.model)} disabled={isClearing} className="ml-2 text-[10px]">
                                {isClearing ? "..." : "Clear"}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
