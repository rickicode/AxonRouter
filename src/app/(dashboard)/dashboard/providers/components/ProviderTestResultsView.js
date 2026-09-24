"use client";

import PropTypes from "prop-types";
import Icon from "@/shared/components/Icon";

function ProviderTestResultsView({ results }) {
 if (results.error && !results.results) {
 return (
 <div className="text-center py-3">
 <Icon name="error" size={18} className="text-danger mb-2 block" />
 <p className="text-sm text-danger">{results.error}</p>
 </div>
 );
 }

 const { summary, mode } = results;
 const items = results.results || [];
 const modeLabel =
 { oauth: "OAuth", free: "Free", apikey: "API Key", provider: "Provider", all: "All" }[mode] || mode;

 return (
 <div className="flex min-w-0 flex-col gap-3">
 {summary && (
 <div className="flex flex-wrap items-center gap-2 text-xs mb-1 sm:gap-3">
 <span className="text-text-muted">{modeLabel} Test</span>
 <span className="px-2 py-1 rounded-sm bg-success/10 text-success font-medium">
 {summary.passed} passed
 </span>
 {summary.failed > 0 && (
 <span className="px-2 py-1 rounded-sm bg-danger/10 text-danger font-medium">
 {summary.failed} failed
 </span>
 )}
 <span className="text-text-muted sm:ml-auto">{summary.total} tested</span>
 </div>
 )}
 {items.map((r, i) => (
 <div
 key={r.connectionId || i}
 className="flex min-w-0 flex-wrap items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 text-xs sm:flex-nowrap"
 >
 <Icon name={r.valid ? "check_circle" : "error"} size={18} className={r.valid ? "text-success" : "text-danger"} />
 <div className="min-w-0 flex-[1_1_160px]">
 <span className="block truncate font-medium sm:inline">{r.connectionName}</span>
 <span className="block truncate text-text-muted sm:ml-1.5 sm:inline">({r.provider})</span>
 </div>
 {r.latencyMs !== undefined && (
 <span className="shrink-0 text-text-muted font-mono tabular-nums">{r.latencyMs}ms</span>
 )}
 <span className={`shrink-0 text-[11px] font-medium px-1.5 py-1 rounded-sm ${r.valid ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
 {r.valid ? "OK" : r.diagnosis?.type || "ERROR"}
 </span>
 </div>
 ))}
 {items.length === 0 && (
 <div className="text-center py-3 text-text-muted text-sm">
 No active connections found for this group.
 </div>
 )}
 </div>
 );
}

ProviderTestResultsView.propTypes = {
 results: PropTypes.shape({
 mode: PropTypes.string,
 results: PropTypes.array,
 summary: PropTypes.shape({ total: PropTypes.number, passed: PropTypes.number, failed: PropTypes.number }),
 error: PropTypes.string,
 }).isRequired,
};

export default ProviderTestResultsView;
