"use client";

import { useState } from "react";
import Modal from "@/shared/components/Modal";
import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

export default function FailureResponseModal({
 isOpen,
 onClose,
 targetTitle,
 targetType = "model",
 failures = [],
 loading = false,
}) {
 const [selectedIndex, setSelectedIndex] = useState(0);
 const [copied, setCopied] = useState(false);

 const selected = failures[selectedIndex] || failures[0] || null;

 const handleCopy = (payload) => {
 if (!payload) return;
 const text = typeof payload === "object" ? JSON.stringify(payload, null, 2) : String(payload);
 navigator.clipboard?.writeText(text);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 };

 const getStatusBadgeVariant = (code) => {
 const num = Number(code);
 if (num === 429) return "warning";
 if (num >= 500) return "error";
 if (num >= 400) return "orange";
 return "error";
 };

 return (
 <Modal
 isOpen={isOpen}
 onClose={onClose}
 title={
 <div className="flex items-center gap-2 min-w-0 pr-3">
 <Icon name="error" size={18} className="text-danger shrink-0" />
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className="text-sm font-semibold text-text-main truncate">
 Failure Responses
 </span>
 <Badge variant="neutral" size="sm">
 {targetType === "model" ? "Model" : "Provider"}
 </Badge>
 </div>
 {targetTitle && (
 <p className="text-xs text-text-muted font-mono truncate" title={targetTitle}>
 {targetTitle}
 </p>
 )}
 </div>
 </div>
 }
 size="full"
 className="max-w-4xl"
 >
 {loading ? (
 <div className="flex flex-col items-center justify-center p-3 text-text-muted gap-3">
 <Icon name="progress_activity" size={18} className="animate-spin text-primary" />
 <span className="text-xs">Fetching failure traces & responses…</span>
 </div>
 ) : !failures.length ? (
 <div className="flex flex-col items-center justify-center p-3 text-text-muted gap-2 border border-dashed border-border rounded-sm">
 <Icon name="check_circle" size={18} className="text-success" />
 <p className="text-sm font-semibold text-text-main">
 No Failure Payloads Found
 </p>
 <p className="text-xs text-center max-w-md">
 No recent archived failure traces for this target. The failure count in
 analytics was aggregated from telemetry events or older requests.
 </p>
 <a
          href={`/dashboard/usage?tab=logs&details=1&status=failed${
            targetType === "provider" ? `&provider=${encodeURIComponent(targetTitle)}` : `&model=${encodeURIComponent(targetTitle)}`
          }`}
 className="mt-2 text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
 >
  Open Request Details <Icon name="open_in_new" size={18} />
 </a>
 </div>
 ) : (
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 max-h-[70vh] min-h-[400px]">
 {/* List of failed instances */}
 <div className="lg:col-span-5 flex flex-col border border-border rounded-sm bg-surface-2/40 overflow-hidden">
 <div className="p-3 border-b border-border bg-surface-2/80 flex items-center justify-between h-8">
 <span className="text-[11px] font-medium text-text-muted">
 Failed Events ({failures.length})
 </span>
 <span className="text-[11px] text-text-muted">
 Select to inspect
 </span>
 </div>

 <div className="flex-1 overflow-y-auto divide-y divide-border/60">
 {failures.map((item, idx) => {
 const isSelected = idx === selectedIndex;
 const statusCode =
 item.response?.status ||
 item.statusCode ||
 item.status ||
 "500";
 const errorSummary =
 item.error ||
 item.response?.error ||
 item.response?.message ||
 (typeof item.response === "string" ? item.response : null) ||
 "Request failed";
 const errorStr =
 typeof errorSummary === "object"
 ? errorSummary.message || JSON.stringify(errorSummary)
 : String(errorSummary);

 return (
 <button
 type="button"
 key={item.id || idx}
 onClick={() => {
 setSelectedIndex(idx);
 setCopied(false);
 }}
className={cn(
  "w-full p-3 text-left flex flex-col gap-1.5 cursor-pointer rounded-sm",
  isSelected
    ? "bg-primary/10 ring-1 ring-primary/30"
    : "hover:bg-surface-2/80",
)}
 >
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-1.5">
 <Badge variant={getStatusBadgeVariant(statusCode)} size="sm">
 {statusCode}
 </Badge>
 <span className="text-[11px] font-mono text-text-muted">
 {item.timestamp
 ? new Date(item.timestamp).toLocaleTimeString("en-US", {
 hour: "2-digit",
 minute: "2-digit",
 second: "2-digit",
 })
 : "Recent"}
 </span>
 </div>
 {item.latency?.total ? (
 <span className="text-[11px] font-mono text-text-muted">
 {Math.round(item.latency.total)}ms
 </span>
 ) : null}
 </div>

 <p className="text-xs font-medium text-text-main line-clamp-2 break-all">
 {errorStr}
 </p>

 <div className="flex items-center gap-2 text-[11px] text-text-muted">
 <span className="truncate">{item.provider || "gateway"}</span>
 <span>•</span>
 <span className="truncate">{item.model || "—"}</span>
 </div>
 </button>
 );
 })}
 </div>
 </div>

 {/* Detailed payload viewer */}
 <div className="lg:col-span-7 flex flex-col border border-border rounded-sm bg-surface overflow-hidden">
 {selected ? (
 <div className="flex flex-col h-full">
 {/* Meta info bar */}
 <div className="p-3 border-b border-border bg-surface-2/60 flex flex-wrap items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <Badge
 variant={getStatusBadgeVariant(
 selected.response?.status || selected.statusCode || selected.status,
 )}
 size="sm"
 >
 Status: {selected.response?.status || selected.statusCode || selected.status || "Failed"}
 </Badge>
 <span className="text-xs text-text-muted font-mono">
 {selected.timestamp
 ? new Date(selected.timestamp).toLocaleString("en-US")
 : "Unknown timestamp"}
 </span>
 </div>

 <button
 type="button"
 onClick={() =>
 handleCopy(
 selected.response ||
 selected.providerResponse ||
 selected.error ||
 selected,
 )
 }
 className="inline-flex items-center gap-1 px-2.5 text-xs font-medium rounded-sm border border-border bg-surface hover:bg-surface-2 text-text-main cursor-pointer h-8"
 >
<Icon name={copied ? "check" : "content_copy"} size={18} />
 {copied ? "Copied!" : "Copy Payload"}
 </button>
 </div>

 {/* Error highlights */}
 <div className="p-3 bg-danger/10 border-b border-danger/30 flex flex-col gap-1">
 <span className="text-[11px] font-medium text-danger flex items-center gap-1">
 <Icon name="error" size={18} />
 Error Summary
 </span>
 <p className="text-xs font-medium text-danger break-words">
 {typeof selected.error === "object"
 ? selected.error?.message || JSON.stringify(selected.error)
 : String(
 selected.error ||
 selected.response?.error ||
 selected.response?.message ||
 "Request failed with non-2xx status",
 )}
 </p>
 </div>

 {/* Response Code Block */}
 <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-2">
 <div className="flex items-center justify-between">
 <span className="text-[11px] font-medium text-text-muted">
 Full Response Payload
 </span>
 <span className="text-[11px] font-mono text-text-muted">
 JSON / Raw
 </span>
 </div>

 <pre className="flex-1 max-h-[350px] overflow-auto rounded-sm border border-border bg-surface/80 p-3 font-mono text-xs text-text-main whitespace-pre-wrap break-all select-all bg-surface">
 {JSON.stringify(
 selected.response ||
 selected.providerResponse ||
 selected.error || {
 error: selected.error || "Unknown error",
 status: selected.status,
 },
 null,
 2,
 )}
 </pre>
 </div>

 {/* Footer link to Request Details */}
 <div className="p-3 border-t border-border bg-surface-2/40 flex items-center justify-between h-8">
 <a
          href={`/dashboard/usage?tab=logs&details=1&status=failed&provider=${encodeURIComponent(
            selected.provider || "",
          )}&model=${encodeURIComponent(selected.model || "")}`}
 className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
 >
 <Icon name="open_in_new" size={18} />
  View trace in Request Details
 </a>
 <Button variant="ghost" size="sm" onClick={onClose}>
 Close
 </Button>
 </div>
 </div>
 ) : (
 <div className="flex items-center justify-center h-full text-text-muted text-xs">
 Select an event from the left to view payload.
 </div>
 )}
 </div>
 </div>
 )}
 </Modal>
 );
}
