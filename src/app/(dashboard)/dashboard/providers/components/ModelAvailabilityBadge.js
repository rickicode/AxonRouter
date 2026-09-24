"use client";

/**
 * ModelAvailabilityBadge — compact inline status indicator
 *
 * Shows green when all models are operational, or amber/red when there are
 * issues, with a hover popover for details and cooldown clearing.
 *
 * Fetch is lazy: only fires when the popover is opened (or refreshed by
 * the user). Previously this polled every 30 s unconditionally, which was
 * dead weight because the trigger button was commented-out.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import Icon from "@/shared/components/Icon";

const STATUS_CONFIG = {
 available: { icon: "check_circle", color: "#22c55e", label: "Available" },
 cooldown: { icon: "schedule", color: "#f59e0b", label: "Cooldown" },
 unavailable: { icon: "error", color: "#ef4444", label: "Unavailable" },
 unknown: { icon: "help", color: "#6b7280", label: "Unknown" },
};

export default function ModelAvailabilityBadge() {
 const [data, setData] = useState(null);
 const [expanded, setExpanded] = useState(false);
 const [clearing, setClearing] = useState(null);
 const ref = useRef(null);
 const notify = useNotificationStore();

 const fetchStatus = useCallback(async () => {
 try {
 const res = await fetch("/api/models/availability");
 if (res.ok) {
 const json = await res.json();
 setData(json);
 }
 } catch {
 // silent fail — user can retry via refresh button
 }
 }, []);

 // Lazy fetch: only when popover opens (or refresh button clicked)
 useEffect(() => {
 if (!expanded) return;
 let cancelled = false;
 queueMicrotask(() => {
 if (!cancelled) fetchStatus();
 });
 return () => { cancelled = true; };
 }, [expanded, fetchStatus]);

 // Close popover on outside click
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

 const models = data?.models || [];
 const unavailableCount =
 data?.unavailableCount ||
 models.filter((m) => m.status !== "available").length;
 const isHealthy = unavailableCount === 0;

 // Group unhealthy models by provider
 const byProvider = {};
 models.forEach((m) => {
 if (m.status === "available") return;
 const key = m.provider || "unknown";
 if (!byProvider[key]) byProvider[key] = [];
 byProvider[key].push(m);
 });

 return (
 <div className="relative" ref={ref}>
 {/* Button was commented-out — restore on-demand toggle */}
 <button
 onClick={() => setExpanded(!expanded)}
 className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-medium border ${
 isHealthy
 ? "bg-success/10 border-success/30 text-success hover:bg-success/10"
 : "bg-warning/10 border-warning/30 text-warning hover:bg-warning/10"
 }`}
 >
 <Icon name={isHealthy ? "verified" : "warning"} size={18} />
 {isHealthy
 ? "All models operational"
 : `${unavailableCount} model${unavailableCount !== 1 ? "s" : ""} with issues`}
 </button>

 {expanded && (
 <div className="absolute top-full right-0 mt-2 w-80 bg-surface border border-border rounded-sm z-50 overflow-hidden">
 <div className="flex items-center justify-between h-8 px-3 border-b border-border bg-bg">
 <div className="flex items-center gap-2">
 <Icon name={isHealthy ? "verified" : "warning"} size={18} style={{ color: isHealthy ? "#22c55e" : "#f59e0b" }} />
 <span className="text-sm font-semibold text-text-main">
 Model Status
 </span>
 </div>
 <button
 onClick={fetchStatus}
 className="size-8 rounded-sm hover:bg-surface-2 text-text-muted hover:text-text-main"
 title="Refresh"
 >
 <Icon name="refresh" size={18} />
 </button>
 </div>

<div className="px-3 py-2 max-h-60 overflow-y-auto">
 {!data ? (
 <p className="text-sm text-text-muted text-center h-8">
 Loading...
 </p>
 ) : isHealthy ? (
 <p className="text-sm text-text-muted text-center h-8">
 All models are responding normally.
 </p>
 ) : (
 <div className="flex flex-col gap-3">
 {Object.entries(byProvider).map(([provider, provModels]) => (
 <div key={provider}>
 <p className="text-xs font-medium text-text-main mb-1.5 capitalize">
 {provider}
 </p>
 <div className="flex flex-col gap-1">
 {provModels.map((m) => {
 const status =
 STATUS_CONFIG[m.status] || STATUS_CONFIG.unknown;
 const isClearing =
 clearing === `${m.provider}:${m.model}`;
 return (
 <div
 key={`${m.provider}-${m.model}`}
 className="flex items-center justify-between px-2.5 py-2 rounded-sm bg-surface/30"
 >
 <div className="flex items-center gap-1.5 min-w-0">
 <Icon name={status.icon} size={18} className="shrink-0" style={{ color: status.color }} />
 <div className="flex flex-col min-w-0">
 <span className="font-mono text-xs text-text-main truncate">
 {m.model}
 </span>
 {m.status === "cooldown" && m.until && (
 <span className="text-[11px] text-text-muted truncate">
 until{" "}
 {new Date(m.until).toLocaleString()}
 </span>
 )}
 </div>
 </div>
 {m.status === "cooldown" && (
 <Button
 size="sm"
 variant="ghost"
 onClick={() =>
 handleClearCooldown(m.provider, m.model)
 }
 disabled={isClearing}
 className="text-[11px] px-1.5! py-1! ml-2"
 >
 {isClearing ? "..." : "Clear"}
 </Button>
 )}
 </div>
 );
 })}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 );
}
