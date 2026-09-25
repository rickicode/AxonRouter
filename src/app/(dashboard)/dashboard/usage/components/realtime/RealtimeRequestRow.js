"use client";

import { useState } from "react";
import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import { cn } from "@/shared/utils/cn";
import { fmt, TimeAgo } from "./realtimeHelpers";
import Icon from "@/shared/components/Icon";

export default function RealtimeRequestRow({ req, onOpenError }) {
 const r = req;
 const isOk = !r.status || r.status === "ok" || r.status === "success";

 return (
 <tr className={cn("", !isOk && "row-failed")}>
 {/* Status Dot + Text */}
 <td className="h-8 px-3 text-center text-sm">
 {!isOk ? (
 <button
 type="button"
 onClick={() => onOpenError(r)}
 className="inline-flex items-center justify-center size-5 rounded-sm bg-danger/10 text-danger hover:bg-danger/10 cursor-pointer"
 title={`Failed (${r.status || "error"}) - Click to view error`}
 aria-label={`Failed (${r.status || "error"}) - Click to view error`}
 >
 <Icon name="close" size={18} />
 </button>
 ) : (
 <span
 className="inline-flex items-center justify-center size-5 rounded-sm bg-success/10 text-success"
 title="Success (200 OK)"
 >
<Icon name="check" size={18} />
 </span>
 )}
 </td>

 {/* Format Type (STREAM vs JSON) */}
 <td className="h-8 px-3 text-sm">
 {r.isStream ? (
 <span className="inline-flex items-center gap-1 rounded-sm bg-info/10 border border-info/30 px-2 py-1 text-[11px] font-medium text-info">
<Icon name="wifi_tethering" size={11} />
 STREAM
 </span>
 ) : (
 <span className="inline-flex items-center gap-1 rounded-sm bg-primary/10 border border-primary/30 px-2 py-1 text-[11px] font-medium text-primary">
<Icon name="code" size={11} />
 JSON
 </span>
 )}
 </td>

 {/* Stream State (Streaming vs Completed) */}
 <td className="h-8 px-3 text-sm">
 <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
 <span className="size-1.5 rounded-full bg-text-muted/60" />
 Completed
 </span>
 </td>

      {/* Model */}
      <td
        className="h-8 px-3 font-mono font-medium text-text-main text-xs sm:text-sm min-w-[140px] max-w-[200px] md:max-w-[320px] lg:max-w-[460px] xl:max-w-none truncate"
        title={r.model}
      >
        {r.model}
      </td>

 {/* Provider */}
 <td className="h-8 px-3 text-sm">
 <Badge variant="neutral" size="sm">
 {r.provider || "unknown"}
 </Badge>
 </td>

 {/* Upstream account */}
 <td className="h-8 px-3 truncate max-w-[180px] text-sm" title={r.account || "Direct request"}>
 <span className="inline-flex items-center gap-1 text-text-muted">
 <Icon name="account_circle" size={18} />
 <span className="text-[11px] text-text-main truncate">{r.account || "Direct request"}</span>
 </span>
 </td>

 {/* Client API Key */}
 <td className="h-8 px-3 truncate max-w-[150px] text-sm" title={r.rawApiKey || r.apiKey}>
 <span className="inline-flex items-center gap-1 text-text-muted">
<Icon name="key" size={18} />
 <span className="font-mono text-[11px] text-text-main truncate">
 {r.clientApiKey || r.apiKey || "Default Key"}
 </span>
 </span>
 </td>

      {/* Tokens */}
      <td className="h-8 px-3 text-right whitespace-nowrap font-mono text-xs">
        <span className="text-primary font-medium" title={`In: ${Number(r.promptTokens || 0).toLocaleString("en-US")}`}>
          {fmt(r.promptTokens)}↑
        </span>{" "}
        <span className="text-success font-medium" title={`Out: ${Number(r.completionTokens || 0).toLocaleString("en-US")}`}>
          {fmt(r.completionTokens)}↓
        </span>
      </td>

      {/* When */}
      <td className="h-8 px-3 text-right text-text-muted whitespace-nowrap text-xs font-mono">
        <TimeAgo timestamp={r.timestamp} />
      </td>
 {/* Action */}
 <td className="h-8 px-3 text-center whitespace-nowrap text-sm">
 {!isOk || r.error ? (
 <Button
 type="button"
 variant="danger"
 size="sm"
 onClick={() => onOpenError(r)}
 className="!h-8 !px-2 !text-xs font-medium inline-flex items-center gap-1"
 >
 <Icon name="error" size={18} />
 Show Error
 </Button>
 ) : (
 <span className="text-text-muted text-[11px]">—</span>
 )}
 </td>
 </tr>
 );
}

export function RealtimeRequestCardMobile({ req, onOpenError }) {
  const r = req;
  const isOk = !r.status || r.status === "ok" || r.status === "success";
  const [expanded, setExpanded] = useState(false);
  const hasCreds = Boolean(r.account || r.clientApiKey || r.apiKey);
  const hasError = !isOk || Boolean(r.error);

  return (
    <div className="border-b border-border last:border-b-0 hover:bg-surface-2">
      {/* Two dense lines: at 177px per record a 30-row stream was five viewports.
          Identity and volume stay visible; credentials expand on demand. */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={hasCreds ? expanded : undefined}
        className="flex w-full flex-col gap-1 px-3 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
<span className={`flex shrink-0 items-center gap-1.5 ${isOk ? "text-success" : "text-danger"}`} aria-label={isOk ? "Success" : "Failed"}>
  <span className={`size-2 rounded-full ${isOk ? "bg-success" : "bg-danger"}`} />
  <span className="text-[10px] font-medium sm:text-xs">{isOk ? "OK" : "Failed"}</span>
</span>
          <span className="truncate font-mono text-xs font-medium text-text-main" title={r.model}>
            {r.model}
          </span>
          {hasError && (
            <Icon name="error" size={15} className="shrink-0 text-danger" />
          )}
<Icon
  name={expanded ? "expand_less" : "expand_more"}
  size={15}
  className="ml-auto shrink-0 text-text-muted"
/>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[11px] text-text-muted">
          <span className="truncate">{r.provider || "unknown"}</span>
          <span aria-hidden="true" className="text-text-muted/40">·</span>
          <span className="shrink-0 font-mono">{r.isStream ? "STREAM" : "JSON"}</span>
          <span aria-hidden="true" className="text-text-muted/40">·</span>
          <span className="shrink-0 font-mono tabular-nums">
            <span className="text-primary">{fmt(r.promptTokens)}↑</span>{" "}
            <span className="text-success">{fmt(r.completionTokens)}↓</span>
          </span>
          <span className="ml-auto shrink-0 whitespace-nowrap font-mono">
            <TimeAgo timestamp={r.timestamp} />
          </span>
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-1.5 px-3 pb-2.5 text-[11px] text-text-muted">
          <div className="flex items-center gap-1.5">
            <Icon className="shrink-0" name="account_circle" size={18} />
            <span className="truncate text-text-main">{r.account || "Direct request"}</span>
          </div>
          {(r.clientApiKey || r.apiKey) && (
            <div className="flex items-center gap-1.5 font-mono">
              <Icon className="shrink-0" name="key" size={18} />
              <span className="truncate">{r.clientApiKey || r.apiKey}</span>
            </div>
          )}
          {hasError && onOpenError && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => onOpenError(r)}
              className="mt-0.5 w-fit"
            >
              <Icon name="error" size={18} />
              Show Error
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
