"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Card from "./Card";
import Button from "./Button";
import Modal from "./Modal";
import Input from "./Input";
import Icon from "@/shared/components/Icon";
import { cn } from "@/shared/utils/cn";

const LOGS_POLL_MS = 3000;

const STATUS_FILTERS = [
 { value: "all", label: "All", icon: "list" },
 { value: "ok", label: "OK", icon: "check_circle" },
 { value: "failed", label: "Failed", icon: "cancel" },
 { value: "pending", label: "Pending", icon: "hourglass_empty" },
];

function classifyStatus(status) {
 const s = String(status || "").toUpperCase();
 if (s.includes("PENDING")) return "pending";
 if (s.includes("FAILED") || s.includes("ERROR")) return "failed";
 if (s.includes("OK")) return "ok";
 return "other";
}

const STATUS_META = {
 ok: { label: "OK", icon: "check_circle", chip: "bg-success/10 text-success border-success/30", row: "", badge: "success" },
  failed: { label: "FAILED", icon: "cancel", chip: "bg-danger/10 text-danger border-danger/30", row: "row-failed", badge: "error" },
 pending: { label: "PENDING", icon: "hourglass_empty", chip: "bg-warning/10 text-warning border-warning/30", row: "row-pending", badge: "warning" },
 other: { label: "-", icon: "help", chip: "bg-surface-3 text-text-muted border-border", row: "", badge: "default" },
};

/**
 * Normalize a log entry into a structured object.
 * Handles both JSON objects (new format from API) and pipe-delimited
 * strings (legacy format from older API responses).
 */
function parseLogEntry(entry) {
 if (entry && typeof entry === "object") return entry;
 if (typeof entry === "string") {
 const parts = entry.split(" | ");
 if (parts.length >= 7) {
 return {
 datetime: parts[0] || "-",
 model: parts[1] || "-",
 provider: parts[2] || "-",
 account: parts[3] || "-",
 sent: parts[4] || "-",
 received: parts[5] || "-",
 status: parts[6] || "-",
 };
 }
 }
 return null;
}

function relativeTime(datetimeStr) {
 if (!datetimeStr) return "";
 const d = new Date(datetimeStr.replace(/-/g, "/"));
 if (Number.isNaN(d.getTime())) return "";
 const diff = Math.floor((Date.now() - d.getTime()) / 1000);
 if (diff < 60) return "just now";
 if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
 if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
 return `${Math.floor(diff / 86400)}d ago`;
}

function StatusChip({ status, size = "md" }) {
 const kind = classifyStatus(status);
 const meta = STATUS_META[kind];
 return (
 <span
 className={cn(
 "inline-flex items-center gap-1 rounded-sm border font-semibold",
 size === "sm" ? "px-1.5 py-1 text-[11px]" : "px-2 py-1 text-[11px]",
 meta.chip
 )}
      >
        <Icon name={meta.icon} size={18} />
        {String(status || meta.label).toUpperCase()}
      </span>
 );
}

export default function RequestLogger({ detailsOpen = false, onToggleDetails, initialStatus = "all" }) {
 const [logs, setLogs] = useState([]);
 const [loading, setLoading] = useState(true);
 const [autoRefresh, setAutoRefresh] = useState(true);
 const [fetchError, setFetchError] = useState(null);
 const [selectedLog, setSelectedLog] = useState(null);
 const [isModalOpen, setIsModalOpen] = useState(false);
 const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() =>
    initialStatus === "failed" ? "failed" : initialStatus === "success" || initialStatus === "ok" ? "ok" : "all"
  );
 const abortRef = useRef(null);

 const fetchLogs = useCallback(async (showLoading = true) => {
 // Abort any in-flight poll so stale responses never overwrite newer data
 abortRef.current?.abort();
 const ctrl = new AbortController();
 abortRef.current = ctrl;
 if (showLoading) setLoading(true);
 setFetchError(null);
 try {
 const res = await fetch("/api/usage/request-logs", { signal: ctrl.signal });
 if (!res.ok) {
 const errData = await res.json().catch(() => ({}));
 throw new Error(errData?.error || `Failed to load logs (${res.status})`);
 }
 const data = await res.json();
 if (ctrl.signal.aborted) return;
 // Normalize: accept array of objects or legacy pipe-delimited strings
 const normalized = Array.isArray(data)
 ? data.map(parseLogEntry).filter(Boolean)
 : [];
 setLogs(normalized);
 } catch (error) {
 if (error.name === "AbortError" || ctrl.signal.aborted) return;
 setFetchError(error.message || "Failed to fetch logs");
 } finally {
 if (showLoading && !ctrl.signal.aborted) setLoading(false);
 }
 }, []);

 useEffect(() => {
 const t = setTimeout(() => fetchLogs(), 0);
 return () => { clearTimeout(t); abortRef.current?.abort(); };
 }, [fetchLogs]);

 // Auto-refresh: paused while the tab is hidden (background polls waste CPU +
 // DB); resumes with an immediate catch-up fetch when the tab becomes visible.
 useEffect(() => {
 if (!autoRefresh) return;
 let timer = null;
 const start = () => {
 if (!timer) timer = setInterval(() => {
 if (!document.hidden) fetchLogs(false);
 }, LOGS_POLL_MS);
 };
 const stop = () => {
 clearInterval(timer);
 timer = null;
 };
 const onVisibility = () => {
 if (document.hidden) stop();
 else { start(); fetchLogs(false); }
 };
 if (!document.hidden) start();
 document.addEventListener("visibilitychange", onVisibility);
 return () => {
 stop();
 document.removeEventListener("visibilitychange", onVisibility);
 };
 }, [autoRefresh, fetchLogs]);

 const handleOpenDetail = (log) => {
 setSelectedLog({
 raw: log.raw || `${log.datetime} | ${log.model} | ${log.provider} | ${log.account} | ${log.sent} | ${log.received} | ${log.status}`,
 datetime: log.datetime || "-",
 model: log.model || "-",
 provider: log.provider || "-",
 account: log.account || "-",
 sent: log.sent || "-",
 received: log.received || "-",
 status: log.status || "-",
 });
 setIsModalOpen(true);
 };

 const handleCloseModal = () => {
 setIsModalOpen(false);
 setSelectedLog(null);
 };

 // Derived: counts + filtered list (memoized so renders stay cheap at 200 rows)
 const { counts, filtered } = useMemo(() => {
 const q = search.toLowerCase().trim();
 const counts = { ok: 0, failed: 0, pending: 0 };
 for (const log of logs) {
 const kind = classifyStatus(log.status);
 if (kind in counts) counts[kind] += 1;
 }
 const filtered = logs.filter((log) => {
 if (statusFilter !== "all" && classifyStatus(log.status) !== statusFilter) return false;
 if (!q) return true;
 return (
 log.model?.toLowerCase().includes(q) ||
 log.provider?.toLowerCase().includes(q) ||
 log.account?.toLowerCase().includes(q) ||
 String(log.status || "").toLowerCase().includes(q) ||
 String(log.datetime || "").includes(q)
 );
 });
 return { counts, filtered };
 }, [logs, search, statusFilter]);

 const statusText = (log) => classifyStatus(log.status);

 return (
 <div className="flex min-w-0 flex-col gap-3">
 {/* Header: title + controls */}
 <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
 <div className="flex items-baseline gap-2 min-w-0">
 <h2 className="text-sm font-semibold text-text-main shrink-0">Request Logs</h2>
 <span className="rounded-sm border border-border bg-surface px-1.5 text-[11px] font-mono text-text-muted">
 {logs.length}
 </span>
 </div>
 <div className="flex items-center gap-2">
 <label className="text-xs font-medium text-text-muted flex items-center gap-2 cursor-pointer select-none">
 <span className="hidden sm:inline">Auto Refresh (3s)</span>
 <span className="sm:hidden">Auto (3s)</span>
 <button
 type="button"
 onClick={() => setAutoRefresh(!autoRefresh)}
 className={cn(
 "relative inline-flex h-5 w-9 items-center rounded-full focus:outline-none cursor-pointer",
 autoRefresh ? "bg-primary" : "bg-surface-2 border border-border"
 )}
 role="switch"
 aria-checked={autoRefresh}
 aria-label="Auto refresh logs"
 >
 <span
 className={cn(
 "inline-block h-3 w-3 transform rounded-sm bg-surface transition-transform",
 autoRefresh ? "translate-x-5" : "translate-x-1"
 )}
 />
 </button>
 </label>
          {onToggleDetails && (
            <Button
              variant="secondary"
              size="sm"
              icon={detailsOpen ? "expand_less" : "manage_search"}
              onClick={onToggleDetails}
              aria-expanded={detailsOpen}
              aria-controls="request-details-panel"
              className={detailsOpen ? "border-primary/40 bg-primary/10 text-primary" : ""}
            >
              {detailsOpen ? "Hide Trace Details" : "Detailed Traces"}
            </Button>
          )}
 <Button variant="ghost" size="sm" onClick={() => fetchLogs(true)} icon="refresh" aria-label="Refresh logs">
 <span className="hidden sm:inline">Refresh</span>
 </Button>
 </div>
 </div>

 {/* Filter bar: search + status filter */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
 <div className="w-full sm:max-w-xs">
 <Input
 type="search"
placeholder="Search model, provider, account…"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 icon="search"
 inputClassName="h-11 sm:h-8"
 />
 </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter status">
 {STATUS_FILTERS.map((f) => {
 const active = statusFilter === f.value;
 const count = f.value === "all" ? logs.length : counts[f.value] ?? 0;
 return (
 <button
 key={f.value}
 type="button"
 onClick={() => setStatusFilter(f.value)}
 aria-pressed={active}
 className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-xs font-medium sm:min-h-8 sm:px-2",
 active
 ? "bg-primary/10 border-primary/30 text-primary"
 : "bg-surface border-border text-text-muted hover:text-text-main hover:bg-surface-2"
 )}
              >
                <Icon name={f.icon} size={18} />
                {f.label}
 {count > 0 && (
 <span className={cn(
 "rounded-sm px-1 text-[11px] font-mono",
 active ? "bg-primary/10 text-primary" : "bg-surface-3 text-text-muted"
 )}>
 {count}
 </span>
 )}
 </button>
 );
 })}
 </div>
 </div>

 {fetchError && (
 <div
 role="alert"
 className="flex items-center justify-between gap-3 rounded-sm border border-danger/30 bg-danger/10 h-8 px-3 text-sm text-danger"
 >
 <div className="flex items-center gap-2 min-w-0">
 <Icon className="shrink-0" name="error" size={18} />
 <span className="truncate">{fetchError}</span>
 </div>
 <Button variant="ghost" size="sm" onClick={() => fetchLogs(true)} className="shrink-0">
 Retry
 </Button>
 </div>
 )}

 <Card padding="none" className="overflow-hidden bg-surface-2">
 {loading && logs.length === 0 ? (
 <div className="p-3 text-center text-text-muted text-xs flex flex-col items-center gap-2">
 <Icon className="text-text-muted animate-spin" name="progress_activity" size={18} />
Loading logs…
 </div>
 ) : filtered.length === 0 ? (
          <div className="p-3 text-center text-text-muted text-xs flex flex-col items-center gap-2">
            <Icon name={logs.length === 0 ? "receipt_long" : "search_off"} size={18} className="text-text-muted" />
{logs.length === 0 ? "No logs recorded yet." : `No logs match the filter${search ? ` "${search}"` : ""}.`}
 </div>
 ) : (
 <>
 {/* Mobile Card List (< sm) */}
 <div className="sm:hidden divide-y divide-border-subtle" role="list">
 {filtered.map((log, i) => {
 const kind = statusText(log);
 return (
 <button
 key={`mob-${i}`}
 type="button"
 onClick={() => handleOpenDetail(log)}
 aria-label={`Detail log ${log.model} status ${log.status}`}
 className={cn(
 "w-full text-left p-3 space-y-3 hover:bg-surface-2 focus-visible:outline-none focus-visible:relative",
 kind === "pending" ? "bg-primary/[0.04]" : kind === "failed" ? "bg-danger/[0.04]" : ""
 )}
 >
 {/* Model + time */}
 <div className="flex items-start justify-between gap-2">
 <span className="font-mono text-xs font-medium text-text-main break-all min-w-0 flex-1">
 {log.model}
 </span>
 <span className="text-[11px] text-text-muted font-mono whitespace-nowrap shrink-0 text-right">
 {relativeTime(log.datetime) || log.datetime}
 </span>
 </div>

 {/* Provider + account + tokens */}
 <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
 <span className="px-1.5 py-1 rounded-sm bg-surface-2 border border-border text-[11px] font-medium text-text-muted">
 {log.provider}
 </span>
 {log.account && log.account !== "-" && (
 <span className="text-text-muted truncate max-w-[140px]" title={log.account}>
 {log.account}
 </span>
 )}
 <span className="ml-auto font-mono">
 <span className="text-primary font-medium">{log.sent}↑</span>
 <span className="text-text-muted mx-0.5">/</span>
 <span className="text-success font-medium">{log.received}↓</span>
 </span>
 </div>

 {/* Status */}
 <div className="pt-0.5">
 <StatusChip status={log.status} size="sm" />
 </div>
 </button>
 );
 })}
 </div>

 {/* Desktop Table (sm+) — page scroll, no inner scrollbar */}
 <div className="hidden sm:block font-mono text-xs">
 <table className="data-table w-full text-left" aria-label="Request logs">
 <thead>
 <tr>
                <th scope="col" className="px-3 h-8 whitespace-nowrap text-xs font-medium text-text-muted">Time</th>
                <th scope="col" className="px-3 h-8 text-xs font-medium text-text-muted">Model</th>
                <th scope="col" className="px-3 h-8 whitespace-nowrap text-xs font-medium text-text-muted">Provider</th>
                <th scope="col" className="px-3 h-8 whitespace-nowrap text-xs font-medium text-text-muted">Account</th>
 <th scope="col" className="px-3 h-8 text-right whitespace-nowrap text-xs font-medium text-text-muted">Token In/Out</th>
 <th scope="col" className="px-3 h-8 whitespace-nowrap text-xs font-medium text-text-muted">Status</th>
 </tr>
 </thead>
 <tbody>
 {filtered.map((log, i) => {
 const kind = statusText(log);
 const meta = STATUS_META[kind];
 return (
 <tr
 key={i}
 onClick={() => handleOpenDetail(log)}
 className={cn("cursor-pointer", meta.row)}
 tabIndex={0}
 onKeyDown={(e) => { if (e.key === "Enter") handleOpenDetail(log); }}
 aria-label={`Detail log ${log.model}`}
 >
 <td className="px-3 h-8 text-text-muted whitespace-nowrap text-sm">
 <div className="flex flex-col">
 <span>{log.datetime}</span>
 <span className="text-[11px] text-text-muted/70">{relativeTime(log.datetime)}</span>
 </div>
 </td>
 <td className="px-3 h-8 font-semibold break-all max-w-[260px] text-sm">
 {log.model}
 </td>
 <td className="px-3 h-8 whitespace-nowrap text-sm">
 <span className="px-1.5 py-1 rounded-sm bg-surface-2 border border-border text-[11px] font-medium text-text-muted">
 {log.provider}
 </span>
 </td>
 <td className="px-3 h-8 truncate max-w-[160px] text-sm" title={log.account}>{log.account}</td>
 <td className="px-3 h-8 text-right whitespace-nowrap text-sm">
 <span className="text-primary font-medium">{log.sent}↑</span>
 <span className="text-text-muted mx-1">/</span>
 <span className="text-success font-medium">{log.received}↓</span>
 </td>
 <td className="px-3 h-8 whitespace-nowrap text-sm">
 <StatusChip status={log.status} size="sm" />
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </>
 )}
 </Card>

 {/* Footer summary */}
 <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
 <span>
Showing <span className="font-medium text-text-main">{filtered.length}</span> of {logs.length} logs · loaded from the request history database
 </span>
 {autoRefresh && (
 <span className="inline-flex items-center gap-1.5">
 <span className="inline-block size-1.5 rounded-full bg-success animate-pulse" aria-hidden="true" />
Auto-refresh active (3s)
 </span>
 )}
 </div>

 <Modal
 isOpen={isModalOpen}
 onClose={handleCloseModal}
title={selectedLog?.status?.includes("FAILED") || selectedLog?.status?.includes("ERROR") ? "Request Error Details" : "Request Log Details"}
 size="full"
 >
 {selectedLog && (
 <div className="flex flex-col gap-3">
 <StatusChip status={selectedLog.status} />

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
 <div className="flex flex-col gap-1">
<span className="text-[11px] font-medium text-text-muted">Time</span>
 <span className="font-mono text-text-main text-sm">{selectedLog.datetime}</span>
 </div>
 <div className="flex flex-col gap-1">
 <span className="text-[11px] font-medium text-text-muted">Provider</span>
 <span className="font-mono text-text-main text-sm">{selectedLog.provider}</span>
 </div>
 <div className="flex flex-col gap-1 sm:col-span-2">
 <span className="text-[11px] font-medium text-text-muted">Model</span>
 <span className="font-mono font-medium text-text-main break-all text-sm">{selectedLog.model}</span>
 </div>
 <div className="flex flex-col gap-1">
<span className="text-[11px] font-medium text-text-muted">Account</span>
 <span className="font-mono text-text-main break-all text-sm" title={selectedLog.account}>{selectedLog.account}</span>
 </div>
 <div className="flex flex-col gap-1">
<span className="text-[11px] font-medium text-text-muted">Tokens In / Out</span>
 <span className="font-mono text-sm">
 <span className="text-primary font-medium">{selectedLog.sent}↑</span>
 <span className="text-text-muted mx-1">/</span>
 <span className="text-success font-medium">{selectedLog.received}↓</span>
 </span>
 </div>
 </div>

 <div className="flex flex-col gap-1.5">
 <div className="flex items-center justify-between">
 <span className="text-[11px] font-medium text-text-muted">Raw Log</span>
 <button
 type="button"
 onClick={() => navigator.clipboard?.writeText(selectedLog.raw || "")}
 className="text-[11px] text-primary hover:underline"
 >
Copy
 </button>
 </div>
 <pre className="rounded-sm border border-border -subtle p-3 text-xs font-mono text-text-main whitespace-pre-wrap break-all bg-surface">
 {selectedLog.raw}
 </pre>
 </div>

 {(selectedLog.status.includes("FAILED") || selectedLog.status.includes("ERROR")) && (
 <p className="text-xs text-text-muted">
Tip: Check <span className="font-mono">/dashboard/providers</span> for provider health and retry the request. Use the log timestamp to correlate with server console output.
 </p>
 )}
 </div>
 )}
 </Modal>
 </div>
 );
}
