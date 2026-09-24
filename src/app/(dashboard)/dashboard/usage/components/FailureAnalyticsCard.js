"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import SegmentedControl from "@/shared/components/SegmentedControl";
import { cn } from "@/shared/utils/cn";
import FailureResponseModal from "./FailureResponseModal";
import Icon from "@/shared/components/Icon";

export default function FailureAnalyticsCard({
 data,
 onSelectModel,
 onSelectProvider,
 className,
}) {
 const [viewMode, setViewMode] = useState("models"); // "models" | "providers" | "recent"
 const [sortBy, setSortBy] = useState("failures"); // "failures" | "rate"
 const [search, setSearch] = useState("");
 
 // Modal state
 const [isModalOpen, setIsModalOpen] = useState(false);
 const [modalTarget, setModalTarget] = useState({ title: "", type: "model" });
 const [modalFailures, setModalFailures] = useState([]);
 const [modalLoading, setModalLoading] = useState(false);

 // Recent failures tab state
 const [recentFailures, setRecentFailures] = useState([]);
 const [recentLoading, setRecentLoading] = useState(false);

 // Derive model failure stats
  const modelsWithFailures = useMemo(() => {
  if (!data?.models) return [];
  return data.models
  .map((m) => {
  const failures = Number(m.failures || m.failure_count || 0);
  const requests = Number(m.requests || m.count || 0);
  const failureRate = requests > 0 ? (failures / requests) * 100 : 0;
  return {
  ...m,
  failures,
  requests,
  failureRate,
  };
  })
  .filter((m) => {
  if (!search) return true;
  const s = search.toLowerCase();
  return (
  m.model?.toLowerCase().includes(s) ||
  m.provider?.toLowerCase().includes(s)
  );
  })
  .sort((a, b) => {
  if (sortBy === "rate") {
  return b.failureRate - a.failureRate || b.failures - a.failures;
  }
  return b.failures - a.failures || b.failureRate - a.failureRate;
  });
  }, [data, sortBy, search]);

  // Derive provider failure stats
  const providersWithFailures = useMemo(() => {
  if (!data?.byProvider) return [];
  return data.byProvider
  .map((p) => {
  const failures = Number(p.failureCount ?? p.failures ?? 0);
  const requests = Number(p.count ?? p.requests ?? 0);
  const failureRate = requests > 0 ? (failures / requests) * 100 : 0;
  return {
  ...p,
  failures,
  requests,
  failureRate,
  };
  })
  .filter((p) => {
  if (!search) return true;
  return p.provider?.toLowerCase().includes(search.toLowerCase());
  })
  .sort((a, b) => {
  if (sortBy === "rate") {
  return b.failureRate - a.failureRate || b.failures - a.failures;
  }
  return b.failures - a.failures || b.failureRate - a.failureRate;
  });
  }, [data, sortBy, search]);

 // Total failed attempts
 const totalFailures = useMemo(() => {
 return Number(data?.summary?.failureCount || 0);
 }, [data?.summary?.failureCount]);

 // Fetch recent failure traces
 const fetchRecentFailures = useCallback(async () => {
 setRecentLoading(true);
 try {
 const res = await fetch("/api/usage/analytics/failures?limit=30");
 if (res.ok) {
 const json = await res.json();
 setRecentFailures(json.recentFailures || []);
 }
 } catch (e) {
 console.error("Failed to fetch recent failures:", e);
 } finally {
 setRecentLoading(false);
 }
 }, []);

 // When switching to "recent" tab, load failures
  useEffect(() => {
  if (viewMode === "recent") {
  queueMicrotask(() => fetchRecentFailures());
  }
  }, [viewMode, fetchRecentFailures]);

 // Open inspection modal for a specific model or provider
 const inspectFailures = async (target, type = "model") => {
 const title = type === "model" ? `${target.provider}/${target.model}` : target.provider;
 setModalTarget({ title, type });
 setIsModalOpen(true);
 setModalLoading(true);
 setModalFailures([]);

 try {
 const params = new URLSearchParams({
 limit: "25",
 });
 if (type === "model") {
 params.set("provider", target.provider);
 params.set("model", target.model);
 } else {
 params.set("provider", target.provider);
 }

 // First try /api/usage/analytics/failures
 const res = await fetch(`/api/usage/analytics/failures?${params.toString()}`);
 if (res.ok) {
 const json = await res.json();
 if (json.recentFailures && json.recentFailures.length > 0) {
 setModalFailures(json.recentFailures);
 setModalLoading(false);
 return;
 }
 }

 // Fallback: /api/usage/request-details?status=failed
 const fallbackParams = new URLSearchParams({
 status: "failed",
 pageSize: "25",
 });
 if (type === "model") {
 fallbackParams.set("provider", target.provider);
 fallbackParams.set("model", target.model);
 } else {
 fallbackParams.set("provider", target.provider);
 }
 const fallbackRes = await fetch(`/api/usage/request-details?${fallbackParams.toString()}`);
 if (fallbackRes.ok) {
 const fbJson = await fallbackRes.json();
 setModalFailures(fbJson.details || []);
 }
 } catch (err) {
 console.error("Error inspecting failures:", err);
 } finally {
 setModalLoading(false);
 }
 };

 const getStatusBadgeVariant = (code) => {
 const num = Number(code);
 if (num === 429) return "warning";
 if (num >= 500) return "error";
 if (num >= 400) return "orange";
 return "error";
 };

 return (
 <>
 <Card
 title="Failure Intelligence & Error Responses"
 subtitle="Rank models and providers by failed requests and inspect their exact failure responses"
 icon="bug_report"
 padding="none"
 className={cn("flex min-w-0 flex-col overflow-hidden", className)}
 action={
        <SegmentedControl
          options={[
            { value: "models", label: "Failed Models" },
            { value: "providers", label: "Failed Providers" },
            { value: "recent", label: "Recent Responses", icon: "terminal" },
          ]}
          value={viewMode}
          onChange={setViewMode}
          size="touch"
          snap
          aria-label="Failure analytics view"
        />
 }
 >
 {/* Controls Bar */}
 <div className="p-3 sm:p-3 border-b border-border bg-surface-2/40 flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
 <div className="relative w-full">
 <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-sm pointer-events-none" />
 <input
 type="text"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder={
 viewMode === "models"
 ? "Filter model or provider…"
 : viewMode === "providers"
 ? "Filter provider name…"
 : "Search failure traces…"
 }
 className="w-full pl-8 pr-3 py-2 text-xs rounded-sm border border-border bg-surface text-text-main placeholder:text-text-muted focus:outline-none"
 />
 </div>
 </div>

 {viewMode !== "recent" && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted text-[11px] font-medium">Sort:</span>
          <SegmentedControl
            options={[
              { value: "failures", label: "Most Failures" },
              { value: "rate", label: "Highest Failure %" },
            ]}
            value={sortBy}
            onChange={setSortBy}
            size="touch"
            snap
            aria-label="Sort failures"
          />
        </div>
)}
</div>

{/* Content Body */}
 {totalFailures === 0 && viewMode !== "recent" ? (
 <div className="p-3 text-center flex flex-col items-center justify-center gap-2">
 <Icon name="verified" size={18} className="text-success" />
 <p className="font-semibold text-sm text-text-main">
 Zero Request Failures Recorded
 </p>
 <p className="text-xs text-text-muted max-w-sm">
 All routed requests across all providers and models completed successfully in this period.
 </p>
 </div>
 ) : (
 <>
 {/* VIEW: FAILED MODELS */}
 {viewMode === "models" && (
 <>
 {/* Mobile Cards (<sm) */}
 <div className="sm:hidden data-cards">
 {modelsWithFailures.map((m, idx) => (
 <div key={`${m.provider}/${m.model}`} className="p-3 flex flex-col gap-3">
 <div className="flex items-start justify-between gap-2">
 <div className="flex items-center gap-2 min-w-0">
 <span className="size-5 rounded-sm bg-surface-3 flex items-center justify-center font-mono font-medium text-[11px] text-text-muted shrink-0">
 {idx + 1}
 </span>
 <div className="min-w-0">
 <h4 className="font-medium text-xs text-text-main break-all">
 {m.model}
 </h4>
 <p className="text-[11px] text-text-muted font-mono">
 {m.provider}
 </p>
 </div>
 </div>
 <Badge variant={m.failureRate > 20 ? "error" : m.failureRate > 5 ? "warning" : "neutral"} size="sm">
 {m.failureRate.toFixed(1)}% fail
 </Badge>
 </div>

 <div className="grid grid-cols-2 gap-2 text-xs bg-surface-2/60 rounded-sm p-3 border border-border">
 <div>
 <span className="text-[11px] text-text-muted block">Failed Requests</span>
 <span className="font-mono font-semibold text-danger text-sm">
 {m.failures.toLocaleString()}
 </span>
 </div>
 <div>
 <span className="text-[11px] text-text-muted block">Total Attempts</span>
 <span className="font-mono font-semibold text-text-main text-sm">
 {m.requests.toLocaleString()}
 </span>
 </div>
 </div>

 <Button
 variant="secondary"
 size="sm"
 className="w-full min-h-[44px] flex items-center justify-center gap-1.5"
 onClick={() => inspectFailures(m, "model")}
 >
 <Icon name="bug_report" size={18} className="text-danger" />
 Inspect Error Responses
 </Button>
 </div>
 ))}
 {!modelsWithFailures.length && (
 <div className="p-3 text-center text-xs text-text-muted">
 No models matching filter with failed requests.
 </div>
 )}
 </div>

 {/* Desktop Table (sm+) */}
 <div className="hidden sm:block overflow-x-auto">
 <table className="data-table w-full min-w-[800px] text-left text-xs" aria-label="Failed models ranking">
 <thead className="text-[11px] font-medium text-text-muted">
 <tr>
 <th className="h-8 px-3 w-12 text-center text-xs font-medium text-text-muted">#</th>
 <th className="h-8 px-3 text-xs font-medium text-text-muted">Model</th>
 <th className="h-8 px-3 text-xs font-medium text-text-muted">Provider</th>
 <th className="h-8 px-3 text-xs font-medium text-text-muted">Failed Requests</th>
 <th className="h-8 px-3 text-xs font-medium text-text-muted">Failure Rate</th>
 <th className="h-8 px-3 text-xs font-medium text-text-muted">Total Requests</th>
 <th className="h-8 px-3 text-right text-xs font-medium text-text-muted">Error Payloads</th>
 </tr>
 </thead>
 <tbody>
 {modelsWithFailures.map((m, idx) => (
 <tr key={`${m.provider}/${m.model}`} className="hover:bg-surface-2/60">
 <td className="h-8 px-3 text-center font-mono font-semibold text-text-muted text-sm">
 {idx + 1}
 </td>
 <td className="h-8 px-3 font-semibold text-text-main text-sm">
 <span
 className="hover:text-primary cursor-pointer break-all"
 onClick={() => onSelectModel?.(m.provider, m.model)}
 title="Filter by this model"
 >
 {m.model}
 </span>
 </td>
 <td className="h-8 px-3 text-sm">
 <Badge variant="neutral" size="sm">
 {m.provider}
 </Badge>
 </td>
 <td className="h-8 px-3 font-mono font-semibold text-danger text-sm">
 {m.failures.toLocaleString()}
 </td>
 <td className="h-8 px-3 text-sm">
 <div className="flex items-center gap-2 max-w-[140px]">
 <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
 <div
 className={cn(
 "h-full rounded-sm",
 m.failureRate > 25 ? "bg-danger" : m.failureRate > 10 ? "bg-warning" : "bg-text-muted",
 )}
 style={{ width: `${Math.min(100, Math.max(m.failureRate, 2))}%` }}
 />
 </div>
 <span className="font-mono font-medium text-[11px]">
 {m.failureRate.toFixed(1)}%
 </span>
 </div>
 </td>
 <td className="h-8 px-3 font-mono text-text-muted text-sm">
 {m.requests.toLocaleString()}
 </td>
 <td className="h-8 px-3 text-right text-sm">
 <button
 type="button"
 onClick={() => inspectFailures(m, "model")}
 className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-sm border border-danger/30 bg-danger/10 hover:bg-danger/10 text-danger cursor-pointer"
 >
 <Icon name="bug_report" size={18} />
 View Responses
 </button>
 </td>
 </tr>
 ))}
 {!modelsWithFailures.length && (
 <tr>
 <td colSpan={7} className="p-3 text-center text-text-muted h-8 px-3 text-sm">
 No models matching filter with failed requests.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </>
 )}

 {/* VIEW: FAILED PROVIDERS */}
 {viewMode === "providers" && (
 <>
 {/* Mobile Cards (<sm) */}
 <div className="sm:hidden data-cards">
 {providersWithFailures.map((p, idx) => (
 <div key={p.provider} className="p-3 flex flex-col gap-3">
 <div className="flex items-start justify-between gap-2">
 <div className="flex items-center gap-2 min-w-0">
 <span className="size-5 rounded-sm bg-surface-3 flex items-center justify-center font-mono font-medium text-[11px] text-text-muted shrink-0">
 {idx + 1}
 </span>
 <h4 className="font-medium text-xs text-text-main truncate">
 {p.provider}
 </h4>
 </div>
 <Badge variant={p.failureRate > 20 ? "error" : p.failureRate > 5 ? "warning" : "neutral"} size="sm">
 {p.failureRate.toFixed(1)}% fail
 </Badge>
 </div>

 <div className="grid grid-cols-2 gap-2 text-xs bg-surface-2/60 rounded-sm p-3 border border-border">
 <div>
 <span className="text-[11px] text-text-muted block">Failed Requests</span>
 <span className="font-mono font-semibold text-danger text-sm">
 {p.failures.toLocaleString()}
 </span>
 </div>
 <div>
 <span className="text-[11px] text-text-muted block">Total Attempts</span>
 <span className="font-mono font-semibold text-text-main text-sm">
 {p.requests.toLocaleString()}
 </span>
 </div>
 </div>

 {p.errorBreakdown && Object.keys(p.errorBreakdown).length > 0 && (
 <div className="flex flex-wrap gap-1">
 {Object.entries(p.errorBreakdown).map(([cat, count]) => (
 <span
 key={cat}
 className="px-1.5 py-1 rounded-sm text-[11px] font-mono bg-danger/10 text-danger border border-danger/30"
 >
 {cat}: {count}
 </span>
 ))}
 </div>
 )}

 <Button
 variant="secondary"
 size="sm"
 className="w-full min-h-[44px] flex items-center justify-center gap-1.5"
 onClick={() => inspectFailures(p, "provider")}
 >
 <Icon name="bug_report" size={18} className="text-danger" />
 Inspect Error Responses
 </Button>
 </div>
 ))}
 {!providersWithFailures.length && (
 <div className="p-3 text-center text-xs text-text-muted">
 No providers matching filter with failed requests.
 </div>
 )}
 </div>

 {/* Desktop Table (sm+) */}
 <div className="hidden sm:block overflow-x-auto">
 <table className="data-table w-full min-w-[800px] text-left text-xs" aria-label="Failed providers ranking">
 <thead className="text-[11px] font-medium text-text-muted">
 <tr>
 <th className="h-8 px-3 w-12 text-center text-xs font-medium text-text-muted">#</th>
 <th className="h-8 px-3 text-xs font-medium text-text-muted">Provider</th>
 <th className="h-8 px-3 text-xs font-medium text-text-muted">Failed Requests</th>
 <th className="h-8 px-3 text-xs font-medium text-text-muted">Failure Rate</th>
 <th className="h-8 px-3 text-xs font-medium text-text-muted">Total Requests</th>
 <th className="h-8 px-3 text-xs font-medium text-text-muted">Error Breakdown</th>
 <th className="h-8 px-3 text-right text-xs font-medium text-text-muted">Error Payloads</th>
 </tr>
 </thead>
 <tbody>
 {providersWithFailures.map((p, idx) => (
 <tr key={p.provider} className="hover:bg-surface-2/60">
 <td className="h-8 px-3 text-center font-mono font-semibold text-text-muted text-sm">
 {idx + 1}
 </td>
 <td className="h-8 px-3 font-semibold text-text-main text-sm">
 <span
 className="hover:text-primary cursor-pointer"
 onClick={() => onSelectProvider?.(p.provider)}
 title="Filter by this provider"
 >
 {p.provider}
 </span>
 </td>
 <td className="h-8 px-3 font-mono font-semibold text-danger text-sm">
 {p.failures.toLocaleString()}
 </td>
 <td className="h-8 px-3 text-sm">
 <div className="flex items-center gap-2 max-w-[140px]">
 <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
 <div
 className={cn(
 "h-full rounded-sm",
 p.failureRate > 25 ? "bg-danger" : p.failureRate > 10 ? "bg-warning" : "bg-text-muted",
 )}
 style={{ width: `${Math.min(100, Math.max(p.failureRate, 2))}%` }}
 />
 </div>
 <span className="font-mono font-medium text-[11px]">
 {p.failureRate.toFixed(1)}%
 </span>
 </div>
 </td>
 <td className="h-8 px-3 font-mono text-text-muted text-sm">
 {p.requests.toLocaleString()}
 </td>
 <td className="h-8 px-3 text-sm">
 {p.errorBreakdown && Object.keys(p.errorBreakdown).length > 0 ? (
 <div className="flex flex-wrap gap-1">
 {Object.entries(p.errorBreakdown).map(([cat, count]) => (
 <span
 key={cat}
 className="px-1.5 py-1 rounded-sm text-[11px] font-mono bg-surface-3 text-text-muted border border-border"
 >
 {cat}: {count}
 </span>
 ))}
 </div>
 ) : (
 <span className="text-text-muted">—</span>
 )}
 </td>
 <td className="h-8 px-3 text-right text-sm">
 <button
 type="button"
 onClick={() => inspectFailures(p, "provider")}
 className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-sm border border-danger/30 bg-danger/10 hover:bg-danger/10 text-danger cursor-pointer"
 >
 <Icon name="bug_report" size={18} />
 View Responses
 </button>
 </td>
 </tr>
 ))}
 {!providersWithFailures.length && (
 <tr>
 <td colSpan={7} className="p-3 text-center text-text-muted h-8 px-3 text-sm">
 No providers matching filter with failed requests.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </>
 )}

 {/* VIEW: RECENT TRACES / PAYLOADS */}
 {viewMode === "recent" && (
 <div className="p-3 sm:p-3 flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <span className="text-xs text-text-muted font-medium">
 Showing latest archived failure responses and payloads
 </span>
 <button
 type="button"
 onClick={fetchRecentFailures}
 disabled={recentLoading}
 className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
 >
<Icon name="refresh" size={18} className={recentLoading ? "animate-spin" : undefined} />
 Refresh
 </button>
 </div>

 {recentLoading ? (
 <div className="p-3 text-center flex flex-col items-center justify-center gap-2 text-text-muted text-xs">
 <Icon name="progress_activity" size={18} className="animate-spin text-primary" />
 Loading recent failure traces…
 </div>
 ) : !recentFailures.length ? (
 <div className="p-3 text-center text-xs text-text-muted border border-dashed border-border rounded-sm">
 No recent failure traces recorded in database.
 </div>
 ) : (
 <div className="divide-y divide-border/60 border border-border rounded-sm bg-surface overflow-hidden">
 {recentFailures.map((item, idx) => {
 const statusCode =
 item.response?.status ||
 item.statusCode ||
 item.status ||
 "500";
 const errorSummary =
 item.error ||
 item.response?.error ||
 item.response?.message ||
 "Request failed";
 const errorStr =
 typeof errorSummary === "object"
 ? errorSummary.message || JSON.stringify(errorSummary)
 : String(errorSummary);

 return (
 <div key={item.id || idx} className="p-3 flex flex-col gap-2 hover:bg-surface-2">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <Badge variant={getStatusBadgeVariant(statusCode)} size="sm">
 {statusCode}
 </Badge>
 <span className="font-medium text-xs text-text-main">
 {item.model || "Unknown model"}
 </span>
 <Badge variant="neutral" size="sm">
 {item.provider || "Gateway"}
 </Badge>
 </div>

 <span className="text-[11px] font-mono text-text-muted">
 {item.timestamp ? new Date(item.timestamp).toLocaleString("en-US") : "Recent"}
 </span>
 </div>

 <p className="text-xs font-medium text-danger break-words bg-danger/10 border border-danger/30 rounded-sm p-3">
 {errorStr}
 </p>

 {/* Raw response payload */}
 <div className="relative mt-1">
 <pre className="max-h-[140px] overflow-auto rounded-sm border border-border bg-surface p-3 text-xs font-mono text-text-main whitespace-pre-wrap break-all">
 {JSON.stringify(item.response || item.providerResponse || item.error || {}, null, 2)}
 </pre>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 )}
 </>
 )}
 </Card>

 {/* Failure Response Inspection Modal */}
 <FailureResponseModal
 isOpen={isModalOpen}
 onClose={() => setIsModalOpen(false)}
 targetTitle={modalTarget.title}
 targetType={modalTarget.type}
 failures={modalFailures}
 loading={modalLoading}
 />
 </>
 );
}
