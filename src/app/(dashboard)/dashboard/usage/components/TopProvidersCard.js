"use client";

import { useMemo, useState } from "react";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import { formatTokens } from "@/shared/utils/formatTokens";
import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

const ERROR_CATEGORY_LABELS = {
 upstream: { label: "Upstream 5xx", color: "bg-danger", textColor: "text-danger" },
 rate_limit: { label: "Rate Limit 429", color: "bg-warning", textColor: "text-warning" },
 auth: { label: "Auth 401/403", color: "bg-primary", textColor: "text-primary" },
 timeout: { label: "Timeout 408/504", color: "bg-info", textColor: "text-info" },
 cancelled: { label: "Cancelled 499", color: "bg-text-muted", textColor: "text-text-muted" },
 stream: { label: "Stream Error", color: "bg-warning", textColor: "text-warning" },
 internal: { label: "Internal 500", color: "bg-danger", textColor: "text-danger" },
 unknown: { label: "Unknown", color: "bg-text-muted", textColor: "text-text-muted" },
};

const fmt = (n) => formatTokens(n);

const fmtMs = (ms) => {
 if (!ms && ms !== 0) return "—";
 if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
 return `${Math.round(ms)}ms`;
};

function SuccessBar({ rate }) {
 const pct = Math.min(100, Math.max(0, Number(rate) || 0));
 const color =
 pct >= 95 ? "bg-success" : pct >= 80 ? "bg-warning" : "bg-danger";
 return (
 <div className="flex items-center gap-2 min-w-0">
 <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
 <div
 className={cn("h-full rounded-sm", color)}
 style={{ width: `${pct}%` }}
 />
 </div>
 <span
 className={cn(
 "text-[11px] font-medium tabular-nums shrink-0",
 pct >= 95
 ? "text-success"
 : pct >= 80
 ? "text-warning"
 : "text-danger",
 )}
 >
 {pct.toFixed(1)}%
 </span>
 </div>
 );
}

function ErrorBreakdownRow({ errorBreakdown, totalFailures }) {
 const entries = Object.entries(errorBreakdown).sort((a, b) => b[1] - a[1]);
 if (!entries.length) return <span className="text-text-muted text-[11px]">—</span>;
 return (
 <div className="flex flex-wrap gap-1">
 {entries.map(([cat, count]) => {
 const meta = ERROR_CATEGORY_LABELS[cat] || ERROR_CATEGORY_LABELS.unknown;
 return (
 <span
 key={cat}
 className={cn(
 "inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-[11px] font-medium border",
 cat === "upstream" ? "bg-danger/10 border-danger/30 text-danger" :
 cat === "rate_limit" ? "bg-warning/10 border-warning/30 text-warning" :
 cat === "auth" ? "bg-primary/10 border-primary/30 text-primary" :
 cat === "timeout" ? "bg-info/10 border-info/30 text-info" :
 cat === "cancelled" ? "bg-text-muted/10 border-border text-text-muted" :
 cat === "stream" ? "bg-warning/10 border-warning/30 text-warning" :
 cat === "internal" ? "bg-danger/10 border-danger/30 text-danger" :
 "bg-text-muted/10 border-border text-text-muted"
 )}
 title={`${meta.label}: ${count} errors`}
 >
 {meta.label}
 <span className="opacity-80">×{count}</span>
 </span>
 );
 })}
 </div>
 );
}

export default function TopProvidersCard({ byProvider = [], onProviderClick, onInspectFailures, className }) {
 const [sortBy, setSortBy] = useState("count");

 const sorted = useMemo(() => {
 return [...byProvider].sort((a, b) => {
 if (sortBy === "count") return b.count - a.count;
 if (sortBy === "success_rate") return b.successRate - a.successRate;
 if (sortBy === "failures") return b.failureCount - a.failureCount;
 if (sortBy === "latency") return (a.p50LatencyMs ?? Infinity) - (b.p50LatencyMs ?? Infinity);
 if (sortBy === "tokens") return (b.totalInputTokens + b.totalOutputTokens) - (a.totalInputTokens + a.totalOutputTokens);
 return b.count - a.count;
 });
 }, [byProvider, sortBy]);

 const maxCount = useMemo(() => Math.max(...byProvider.map((r) => r.count), 1), [byProvider]);

 const sortOptions = [
 { id: "count", label: "Requests" },
 { id: "success_rate", label: "Success Rate" },
 { id: "failures", label: "Failed" },
 { id: "latency", label: "Latency" },
 { id: "tokens", label: "Tokens" },
 ];

 if (!byProvider.length) {
 return (
 <Card
 title="Top Providers"
 icon="hub"
 padding="md"
 className={cn("flex min-w-0 flex-col gap-3", className)}
 >
 <div className="flex h-32 items-center justify-center text-xs text-text-muted">
 No provider data in selected time range.
 </div>
 </Card>
 );
 }

 return (
 <Card
 title="Top Providers"
 subtitle="Request volume, success rate, latency, and error breakdown per provider"
 icon="hub"
 padding="md"
 className={cn("flex min-w-0 flex-col gap-3 overflow-hidden", className)}
 action={
 <div className="flex items-center gap-1 flex-wrap">
 {sortOptions.map((opt) => (
 <button
 key={opt.id}
 type="button"
 onClick={() => setSortBy(opt.id)}
 className={cn(
 "px-2 py-1 rounded-sm text-[11px] font-medium cursor-pointer",
 sortBy === opt.id
 ? "bg-surface-3 text-text-main font-semibold border border-border"
 : "text-text-muted hover:text-text-main",
 )}
 >
 {opt.label}
 </button>
 ))}
 </div>
 }
 >
 <div className="overflow-x-auto rounded-sm border border-border">
 <table className="data-table data-table-sticky-first w-full min-w-[760px] text-left text-xs" aria-label="Top providers breakdown">
 <thead>
 <tr className="text-text-muted font-medium text-[11px]">
 <th scope="col" className="h-8 px-3 w-8 text-center text-xs font-medium text-text-muted">#</th>
 <th scope="col" className="h-8 px-3 text-xs font-medium text-text-muted">Provider</th>
 <th scope="col" className="h-8 px-3 w-24 text-right text-xs font-medium text-text-muted">Requests</th>
 <th scope="col" className="h-8 px-3 w-40 text-xs font-medium text-text-muted">Success Rate</th>
 <th scope="col" className="h-8 px-3 w-28 text-right text-xs font-medium text-text-muted">Success / Failed</th>
 <th scope="col" className="h-8 px-3 w-20 text-right text-xs font-medium text-text-muted">P50</th>
 <th scope="col" className="h-8 px-3 w-20 text-right text-xs font-medium text-text-muted">P95</th>
 <th scope="col" className="h-8 px-3 w-24 text-right text-xs font-medium text-text-muted">Tokens</th>
 <th scope="col" className="h-8 px-3 text-xs font-medium text-text-muted">Error Breakdown</th>
 </tr>
 </thead>
 <tbody>
 {sorted.map((row, i) => {
 const barWidth = Math.round((row.count / maxCount) * 100);
 return (
 <tr
 key={row.provider}
 className="hover:bg-surface-2/60 group"
 >
 {/* Rank */}
 <th scope="row" className="h-8 px-3 text-center text-text-muted font-mono text-[11px] font-normal text-xs font-medium">
 {i + 1}
 </th>

 {/* Provider name + volume bar */}
 <td className="h-8 px-3 text-sm">
 <button
 type="button"
 onClick={() => onProviderClick?.(row.provider)}
 className="flex flex-col gap-1 min-w-0 w-full text-left cursor-pointer"
 title={`Filter by ${row.provider}`}
 aria-label={`Filter by ${row.provider}`}
 >
 <span className="font-medium text-text-main group-hover:text-primary truncate">
 {row.provider}
 </span>
 <div className="h-1 rounded-sm bg-surface-3 overflow-hidden w-full max-w-[140px]">
 <div
 className="h-full rounded-sm bg-primary/50"
 style={{ width: `${barWidth}%` }}
 />
 </div>
 </button>
 </td>

 {/* Requests */}
 <td className="h-8 px-3 text-right font-mono font-semibold text-text-main text-sm">
 {fmt(row.count)}
 </td>

 {/* Success Rate bar */}
 <td className="h-8 px-3 text-sm">
 <SuccessBar rate={row.successRate} />
 </td>

 {/* Success / Failed */}
 <td className="h-8 px-3 text-right font-mono text-xs whitespace-nowrap text-sm">
 <span className="text-success font-medium">{fmt(row.successCount)}</span>
 <span className="text-text-muted mx-1">/</span>
 {row.failureCount > 0 && onInspectFailures ? (
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation();
 onInspectFailures(row);
 }}
 className="text-danger font-medium hover:underline cursor-pointer inline-flex items-center gap-0.5"
 title="Inspect failure responses for this provider"
 >
 <Icon name="bug_report" size={18} />
 {fmt(row.failureCount)}
 </button>
 ) : (
 <span className={row.failureCount > 0 ? "text-danger font-medium" : "text-text-muted"}>
 {fmt(row.failureCount)}
 </span>
 )}
 </td>

 {/* P50 latency */}
 <td className="h-8 px-3 text-right font-mono text-text-muted text-[11px] text-sm">
 {fmtMs(row.p50LatencyMs)}
 </td>

 {/* P95 latency */}
 <td className="h-8 px-3 text-right font-mono text-text-muted text-[11px] text-sm">
 {fmtMs(row.p95LatencyMs)}
 </td>

 {/* Tokens */}
 <td className="h-8 px-3 text-right font-mono text-text-muted text-[11px] text-sm">
 {fmt(row.totalInputTokens + row.totalOutputTokens)}
 </td>

 {/* Error breakdown */}
 <td className="h-8 px-3 text-sm">
 <ErrorBreakdownRow
 errorBreakdown={row.errorBreakdown}
 totalFailures={row.failureCount}
 />
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </Card>
 );
}
