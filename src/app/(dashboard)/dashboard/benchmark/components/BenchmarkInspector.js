"use client";

import { Badge, Button, Modal } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

export default function BenchmarkInspector({ attempt, onClose }) {
  const { copied, copy } = useCopyToClipboard();

  if (!attempt) return null;

  const getBadgeVariant = (status) => {
    switch (status) {
      case "passed":
        return "success";
      case "rate_limited":
        return "warning";
      case "cancelled":
      case "skipped":
        return "default";
      default:
        return "error";
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={attempt.model}
      size="full"
      footer={
        <Button size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4 text-xs font-mono">
        {/* Status & Meta */}
        <div className="flex flex-wrap items-center gap-2 font-bold text-text-main text-sm">
          <Badge variant={getBadgeVariant(attempt.status)}>
            {attempt.status?.toUpperCase()}
          </Badge>
          {attempt.http_status ? (
            <span
              className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                attempt.http_status === 200
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : attempt.http_status === 429
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-400"
              }`}
            >
              HTTP {attempt.http_status}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-text-muted font-mono truncate -mt-2">
          Suite: <span className="font-semibold uppercase text-text-main">{attempt.suite}</span> (Rep {attempt.rep || 1}) · Account:{" "}
          <span>{attempt.account_name || attempt.connection_id || "-"}</span>
          {attempt.format ? ` · Format: ${attempt.format.toUpperCase()}` : ""}
        </div>

        {/* Body */}
        <div className="space-y-4">
          {/* Telemetry Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-lg border border-border bg-surface-3 p-2.5">
              <div className="text-text-muted text-[10px] uppercase">Quality Score</div>
              <div className="text-sm font-bold text-text-main mt-0.5">{attempt.score ?? "-"} / 100</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-3 p-2.5">
              <div className="text-text-muted text-[10px] uppercase">TTFT (First Byte)</div>
              <div className="text-sm font-bold text-text-main mt-0.5">
                {attempt.ttft_ms ? `${attempt.ttft_ms}ms` : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-3 p-2.5">
              <div className="text-text-muted text-[10px] uppercase">Total Latency</div>
              <div className="text-sm font-bold text-text-main mt-0.5">
                {attempt.total_ms ? `${attempt.total_ms}ms` : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-3 p-2.5">
              <div className="text-text-muted text-[10px] uppercase">Speed</div>
              <div className="text-sm font-bold text-text-main mt-0.5">
                {attempt.tps ? `${attempt.tps} tok/s` : "-"}
              </div>
            </div>
          </div>

          {/* Error Box if any */}
          {attempt.error ? (
            <div>
              <div className="text-rose-400 font-bold mb-1.5 flex items-center gap-1.5 font-sans">
                <Icon className="text-sm" name="warning" size={18} />
                <span>Error Message / Upstream Diagnostics:</span>
              </div>
              <pre className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-rose-300 whitespace-pre-wrap break-all text-[11px] leading-relaxed select-all">
                {attempt.error}
              </pre>
            </div>
          ) : null}

          {/* Request Payload */}
          <div>
            <div className="flex items-center justify-between mb-1.5 font-sans">
              <span className="text-text-muted font-bold text-xs">Request Payload (Prompt):</span>
              {attempt.request_body ? (
                <Button
                  size="xs"
                  variant="ghost"
                  icon={copied === "req_body" ? "check" : "content_copy"}
                  onClick={() => copy(attempt.request_body, "req_body")}
                >
                  {copied === "req_body" ? "Copied!" : "Copy Payload"}
                </Button>
              ) : null}
            </div>
            <pre className="rounded-lg border border-border bg-surface-3 p-3 text-text-main text-[11px] whitespace-pre-wrap break-all max-h-52 overflow-y-auto leading-relaxed select-all custom-scrollbar">
              {attempt.request_body || "No request body captured"}
            </pre>
          </div>

          {/* Model Response */}
          <div>
            <div className="flex items-center justify-between mb-1.5 font-sans">
              <span className="text-text-muted font-bold text-xs">Model Response Output:</span>
              {attempt.response_body || attempt.excerpt ? (
                <Button
                  size="xs"
                  variant="ghost"
                  icon={copied === "resp_body" ? "check" : "content_copy"}
                  onClick={() => copy(attempt.response_body || attempt.excerpt, "resp_body")}
                >
                  {copied === "resp_body" ? "Copied!" : "Copy Output"}
                </Button>
              ) : null}
            </div>
            <pre className="rounded-lg border border-border bg-surface-3 p-3 text-emerald-400 text-[11px] whitespace-pre-wrap break-all max-h-72 overflow-y-auto leading-relaxed select-all custom-scrollbar">
              {attempt.response_body || attempt.excerpt || "No response body captured"}
            </pre>
          </div>
        </div>
      </div>
    </Modal>
  );
}
