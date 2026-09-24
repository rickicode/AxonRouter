"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Modal } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Icon from "@/shared/components/Icon";

export default function BenchmarkLogs({ open, onClose, attempts, isJobRunning, active, onRefresh, onInspect }) {
  const [logSearch, setLogSearch] = useState("");
  const [logSuiteFilter, setLogSuiteFilter] = useState("all");
  const [logAutoScroll, setLogAutoScroll] = useState(true);
  const [logExpandedId, setLogExpandedId] = useState(null);
  const logScrollRef = useRef(null);
  const { copied, copy } = useCopyToClipboard();

  const logEntries = useMemo(() => {
    const q = logSearch.toLowerCase().trim();
    return [...attempts]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .filter((row) => {
        if (logSuiteFilter !== "all" && row.suite !== logSuiteFilter) return false;
        if (!q) return true;
        return (
          row.model?.toLowerCase().includes(q) ||
          row.account_name?.toLowerCase().includes(q) ||
          row.provider?.toLowerCase().includes(q) ||
          (row.request_body || "").toLowerCase().includes(q) ||
          (row.response_body || row.excerpt || "").toLowerCase().includes(q) ||
          (row.error || "").toLowerCase().includes(q)
        );
      });
  }, [attempts, logSearch, logSuiteFilter]);

  function prettyJSON(str) {
    try {
      return JSON.stringify(JSON.parse(str || "null"), null, 2);
    } catch {
      return str || "-";
    }
  }

  useEffect(() => {
    if (open && logAutoScroll && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logEntries.length, open, logAutoScroll]);


  const scrollToBottom = () => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Live Benchmark Execution Logs"
      size="full"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs text-text-muted">
            Total recorded: {attempts.length} attempts
          </span>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Live meta */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          {isJobRunning ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold animate-pulse">
              <span className="inline-block size-1.5 rounded-full bg-emerald-400 animate-ping" />
              LIVE
            </span>
          ) : null}
          <span>
            {logEntries.length} of {attempts.length} logs · {active?.progress?.phase || active?.status || "Idle"}
          </span>
        </div>

        {/* Filter bar: search + suite + auto-scroll */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border pb-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search in log payloads, models, errors..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-text-muted mr-1 font-medium hidden sm:inline">Suite:</span>
            {["all", "pong", "coding", "logic", "tool"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setLogSuiteFilter(st)}
                className={`px-2.5 py-1 text-xs rounded font-medium uppercase transition-colors min-h-10 sm:min-h-0 sm:py-1 ${
                  logSuiteFilter === st
                    ? "bg-primary text-white font-semibold"
                    : "bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text-main"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={logAutoScroll}
                onChange={(e) => setLogAutoScroll(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span>Auto-scroll</span>
            </label>

            {!logAutoScroll && (
              <Button size="xs" variant="ghost" icon="arrow_downward" onClick={scrollToBottom}>
                To Latest
              </Button>
            )}

            <Button size="xs" variant="secondary" icon="refresh" onClick={onRefresh} title="Force refresh logs">
              Refresh
            </Button>
          </div>
        </div>

        {/* Log Viewer Container */}
        <div
          ref={logScrollRef}
          className="max-h-[60vh] overflow-y-auto p-3 space-y-2 font-mono text-xs bg-bg/95 custom-scrollbar rounded-sm border border-border"
        >
          {logEntries.map((row) => {
            const isPassed = row.status === "passed";
            const isExpanded = logExpandedId === row.id;

            return (
              <div
                key={row.id}
                className={`rounded-lg border transition-colors p-3 ${
                  isPassed
                    ? "border-emerald-500/20 bg-emerald-500/[0.02]"
                    : "border-rose-500/25 bg-rose-500/[0.04]"
                }`}
              >
                {/* Log Item Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-text-muted">
                      {row.created_at ? new Date(row.created_at).toLocaleTimeString() : "-"}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                        isPassed ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                      }`}
                    >
                      {row.status}
                    </span>
                    {row.http_status ? (
                      <span className="text-[10px] font-bold text-text-muted">
                        HTTP {row.http_status}
                      </span>
                    ) : null}
                    <span className="px-1.5 py-0.2 rounded bg-surface-3 text-text-muted text-[10px] font-bold uppercase">
                      {row.suite}
                    </span>
                    <span className="font-bold text-text-main text-xs">{row.model}</span>
                    <span className="text-text-muted text-[11px]">({row.provider})</span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    {row.ttft_ms ? <span>TTFT: {row.ttft_ms}ms</span> : null}
                    {row.total_ms ? <span>Total: {row.total_ms}ms</span> : null}
                    {row.tps ? <span className="font-bold text-text-main">{row.tps} tps</span> : null}
                    {row.score !== null && row.score !== undefined ? (
                      <span className="px-1.5 py-0.5 rounded bg-surface-3 text-text-main font-bold">
                        Score: {row.score}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Log Snippet / Error */}
                {row.error ? (
                  <div className="mt-2 text-rose-400 text-[11px] bg-rose-500/10 p-2 rounded border border-rose-500/20 whitespace-pre-wrap break-all">
                    {row.error}
                  </div>
                ) : row.excerpt ? (
                  <div className="mt-1.5 text-text-muted text-[11px] line-clamp-2">
                    <span className="text-emerald-400 font-bold mr-1">RESP:</span>
                    {row.excerpt}
                  </div>
                ) : null}

                {/* Actions & Expand */}
                <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLogExpandedId(isExpanded ? null : row.id)}
                      className="text-text-muted hover:text-text-main flex items-center gap-0.5"
                    >
                      <Icon name={isExpanded ? "expand_less" : "expand_more"} size={14} />
                      <span>{isExpanded ? "Hide Full Payload" : "View Full Payload"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onInspect(row)}
                      className="text-text-muted hover:text-primary flex items-center gap-0.5 ml-2"
                    >
                      <Icon className="text-sm" name="open_in_new" size={18} />
                      <span>Inspector</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {row.request_body && (
                      <button
                        type="button"
                        onClick={() => copy(row.request_body, `req-${row.id}`)}
                        className="text-text-muted hover:text-text-main px-1.5 py-0.5 rounded hover:bg-surface-3"
                      >
                        {copied === `req-${row.id}` ? "Copied Prompt!" : "Copy Prompt"}
                      </button>
                    )}
                    {(row.response_body || row.excerpt) && (
                      <button
                        type="button"
                        onClick={() => copy(row.response_body || row.excerpt, `resp-${row.id}`)}
                        className="text-text-muted hover:text-text-main px-1.5 py-0.5 rounded hover:bg-surface-3"
                      >
                        {copied === `resp-${row.id}` ? "Copied Output!" : "Copy Output"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Full JSON / Text payload */}
                {isExpanded ? (
                  <div className="mt-3 pt-2 border-t border-border/60 space-y-2 text-[11px]">
                    <div>
                      <div className="text-text-muted font-bold mb-1">Request Payload:</div>
                      <pre className="bg-surface-2 p-2.5 rounded border border-border overflow-x-auto text-text-main whitespace-pre-wrap max-h-60">
                        {prettyJSON(row.request_body)}
                      </pre>
                    </div>
                    {row.response_body ? (
                      <div>
                        <div className="text-emerald-400 font-bold mb-1">Full Response Body:</div>
                        <pre className="bg-surface-2 p-2.5 rounded border border-border overflow-x-auto text-emerald-300 whitespace-pre-wrap max-h-72">
                          {row.response_body}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          {logEntries.length === 0 ? (
            <div className="py-16 text-center text-text-muted">
              <Icon className="text-3xl opacity-30 mb-1 block" name="terminal" size={18} />
              {attempts.length === 0
                ? "Waiting for benchmark requests... logs will appear in real time."
                : "No logs match the current query."}
            </div>
          ) : null}
        </div>

      </div>
    </Modal>
  );
}
