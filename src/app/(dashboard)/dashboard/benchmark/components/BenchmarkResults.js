"use client";

import { useMemo, useState } from "react";
import { Card, SegmentedControl } from "@/shared/components";
import Icon from "@/shared/components/Icon";

const STATUS_CONFIG = {
  passed: { label: "Passed", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  failed: { label: "Failed", color: "bg-rose-500/10 text-rose-400 border-rose-500/30" },
  rate_limited: { label: "Rate Limited (429)", color: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  skipped: { label: "Skipped", color: "bg-slate-500/10 text-slate-400 border-slate-500/30" },
  cancelled: { label: "Cancelled", color: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "rate_limited", label: "429 Rate Limit" },
  { value: "skipped", label: "Skipped" },
];

export default function BenchmarkResults({ attempts, isJobRunning, onInspect }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTableQuery, setSearchTableQuery] = useState("");
  const [sortField, setSortField] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("asc");

  const displayedAttempts = useMemo(() => {
    return attempts
      .filter((row) => {
        if (statusFilter !== "all" && row.status !== statusFilter) return false;
        if (searchTableQuery) {
          const q = searchTableQuery.toLowerCase();
          return (
            row.model?.toLowerCase().includes(q) ||
            row.account_name?.toLowerCase().includes(q) ||
            row.provider?.toLowerCase().includes(q) ||
            row.suite?.toLowerCase().includes(q) ||
            String(row.http_status || "").includes(q) ||
            String(row.error || "").toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (sortField === "score") {
          valA = a.score ?? -1;
          valB = b.score ?? -1;
        } else if (sortField === "ttft") {
          valA = a.ttft_ms ?? 999999;
          valB = b.ttft_ms ?? 999999;
        } else if (sortField === "total") {
          valA = a.total_ms ?? 999999;
          valB = b.total_ms ?? 999999;
        } else if (sortField === "tps") {
          valA = a.tps ?? 0;
          valB = b.tps ?? 0;
        } else if (sortField === "status") {
          valA = a.http_status ?? 0;
          valB = b.http_status ?? 0;
        }
        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [attempts, statusFilter, searchTableQuery, sortField, sortOrder]);

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(field === "score" || field === "tps" ? "desc" : "asc");
    }
  }

  return (
    <Card
      title="Recent Benchmark Results"
      subtitle="HTTP status codes and performance metrics per attempt. Click any row to inspect full request & response payloads."
      icon="table_chart"
      action={
        <div className="text-xs text-text-muted">
          {displayedAttempts.length} of {attempts.length} attempts shown
        </div>
      }
    >
      <div className="space-y-3">
        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border">
          <SegmentedControl
            options={FILTERS}
            value={statusFilter}
            onChange={setStatusFilter}
            size="touch"
            snap
            aria-label="Filter benchmark attempts by status"
          />

          <div className="w-full sm:w-64 min-w-0">
            <input
              type="text"
              placeholder="Filter results..."
              value={searchTableQuery}
              onChange={(e) => setSearchTableQuery(e.target.value)}
              className="w-full rounded-sm border border-border bg-surface px-3 min-h-10 sm:min-h-8 sm:h-8 text-xs text-text-main focus:border-primary focus:outline-none placeholder:text-text-muted"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto max-h-[560px] custom-scrollbar">
          <table className="data-table w-full text-left text-sm" aria-label="Benchmark execution attempts">
            <thead className="sticky top-0 z-10 text-xs text-text-muted select-none">
              <tr>
                <th scope="col" className="py-2.5 px-3">Account</th>
                <th
                  scope="col"
                  className="py-2.5 px-3 cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("model")}
                >
                  <div className="flex items-center gap-1">
                    <span>Model</span>
                    {sortField === "model" ? (
                      <Icon name={sortOrder === "asc" ? "arrow_upward" : "arrow_downward"} size={12} />
                    ) : null}
                  </div>
                </th>
                <th scope="col" className="py-2.5 px-2">Suite</th>
                <th
                  scope="col"
                  className="py-2.5 px-2 cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center gap-1">
                    <span>Status / Code</span>
                    {sortField === "status" ? (
                      <Icon name={sortOrder === "asc" ? "arrow_upward" : "arrow_downward"} size={12} />
                    ) : null}
                  </div>
                </th>
                <th scope="col" className="py-2.5 px-3 max-w-[220px]">Response / Error Diagnostic</th>
                <th
                  scope="col"
                  className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("score")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Quality</span>
                    {sortField === "score" ? (
                      <Icon name={sortOrder === "asc" ? "arrow_upward" : "arrow_downward"} size={12} />
                    ) : null}
                  </div>
                </th>
                <th
                  scope="col"
                  className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("ttft")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>TTFT</span>
                    {sortField === "ttft" ? (
                      <Icon name={sortOrder === "asc" ? "arrow_upward" : "arrow_downward"} size={12} />
                    ) : null}
                  </div>
                </th>
                <th
                  scope="col"
                  className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("total")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Latency</span>
                    {sortField === "total" ? (
                      <Icon name={sortOrder === "asc" ? "arrow_upward" : "arrow_downward"} size={12} />
                    ) : null}
                  </div>
                </th>
                <th
                  scope="col"
                  className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("tps")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Speed</span>
                    {sortField === "tps" ? (
                      <Icon name={sortOrder === "asc" ? "arrow_upward" : "arrow_downward"} size={12} />
                    ) : null}
                  </div>
                </th>
                <th scope="col" className="py-2.5 px-3 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="text-xs font-mono">
              {displayedAttempts.map((row) => {
                const conf = STATUS_CONFIG[row.status] || {
                  label: row.status || "Unknown",
                  color: "bg-surface-3 text-text-muted border-border",
                };
                return (
                  <tr
                    key={row.id}
                    onClick={() => onInspect(row)}
                    className="cursor-pointer group"
                  >
                    {/* Account */}
                    <td className="py-2.5 px-3 text-text-muted truncate max-w-[120px]">
                      {row.account_name || row.connection_id || "-"}
                    </td>

                    {/* Model */}
                    <td className="py-2.5 px-3 font-medium text-text-main">
                      <div className="truncate max-w-[180px]" title={row.model}>
                        {row.model}
                      </div>
                      <div className="text-[10px] text-text-muted">{row.provider}</div>
                    </td>

                    {/* Suite */}
                    <td className="py-2.5 px-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-surface-3 text-text-muted">
                        {row.suite}
                      </span>
                    </td>

                    {/* Status & HTTP Code */}
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${conf.color}`}
                        >
                          {conf.label}
                        </span>
                        {row.http_status ? (
                          <span className="text-[10px] text-text-muted">
                            ({row.http_status})
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Response/Error Diagnostic Excerpt */}
                    <td className="py-2.5 px-3 max-w-[240px] truncate text-text-muted font-sans text-xs">
                      {row.error ? (
                        <span className="text-rose-400 font-mono text-[11px] truncate block" title={row.error}>
                          {row.error}
                        </span>
                      ) : row.excerpt ? (
                        <span className="text-text-muted truncate block" title={row.excerpt}>
                          {row.excerpt}
                        </span>
                      ) : (
                        <span className="text-text-muted/40 italic">-</span>
                      )}
                    </td>

                    {/* Quality Score */}
                    <td className="py-2.5 px-2 text-right">
                      {row.score !== null && row.score !== undefined ? (
                        <span
                          className={`font-semibold ${
                            row.score >= 80
                              ? "text-emerald-400"
                              : row.score >= 50
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          {row.score}
                        </span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>

                    {/* TTFT */}
                    <td className="py-2.5 px-2 text-right text-text-muted">
                      {row.ttft_ms ? `${row.ttft_ms}ms` : "-"}
                    </td>

                    {/* Total Latency */}
                    <td className="py-2.5 px-2 text-right text-text-muted">
                      {row.total_ms ? `${row.total_ms}ms` : "-"}
                    </td>

                    {/* TPS */}
                    <td className="py-2.5 px-2 text-right">
                      {row.tps ? (
                        <span className="text-text-main font-medium">{row.tps}</span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>

                    {/* Inspect Button */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspect(row);
                        }}
                        className="inline-flex size-10 sm:size-8 items-center justify-center rounded-sm text-text-muted hover:text-primary hover:bg-surface-3 transition-colors"
                        title="Inspect attempt details"
                        aria-label="Inspect attempt details"
                      >
                        <Icon className="text-base" name="visibility" size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {displayedAttempts.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-12 text-center text-text-muted font-sans">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Icon className="text-3xl opacity-30" name="inbox" size={18} />
                      <span>
                        {attempts.length === 0
                          ? isJobRunning
                            ? "Waiting for test results... benchmark is currently running."
                            : "No benchmark execution attempts recorded yet."
                          : "No attempts match the selected filter query."}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
