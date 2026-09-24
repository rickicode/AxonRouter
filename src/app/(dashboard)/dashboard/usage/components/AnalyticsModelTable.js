"use client";

import { useState, useMemo } from "react";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";
import { fmtNumber, formatMetric, fmtTokens } from "./analyticsData";

export default function AnalyticsModelTable({
 data,
 handleSelectModel,
 onInspectFailures,
}) {
 const [sortKey, setSortKey] = useState("requests");
 const [sortAsc, setSortAsc] = useState(false);

 const handleSort = (key) => {
 if (sortKey === key) {
 setSortAsc(!sortAsc);
 } else {
 setSortKey(key);
 setSortAsc(false);
 }
 };

 const sortedModels = useMemo(() => {
 const list = [...(data?.models || [])];
 return list.sort((a, b) => {
 let valA = a[sortKey];
 let valB = b[sortKey];
 if (sortKey === "model") {
 valA = `${a.provider}/${a.model}`.toLowerCase();
 valB = `${b.provider}/${b.model}`.toLowerCase();
 return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
 }
 valA = Number(valA ?? -Infinity);
 valB = Number(valB ?? -Infinity);
 return sortAsc ? valA - valB : valB - valA;
 });
 }, [data?.models, sortKey, sortAsc]);

 const headers = [
 { key: "model", label: "Model & Provider" },
 { key: "requests", label: "Requests" },
 { key: "successes", label: "Success" },
 { key: "failures", label: "Failed" },
 { key: "successRate", label: "Success Rate" },
 { key: "latencyMs", label: "P50 Latency" },
 { key: "p95", label: "P95 Latency" },
 { key: "inputTokens", label: "Input Tokens" },
 { key: "outputTokens", label: "Output Tokens" },
 ];

 return (
 <Card
 title="Model Performance Breakdown"
 subtitle="Click any row to filter timeline and metrics. Click table headers to sort."
 icon="table_chart"
 padding="none"
 className="overflow-hidden"
 >
 <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
 <table className="data-table data-table-sticky-first w-full min-w-[900px] text-left text-sm" aria-label="Model Performance Breakdown">
 <thead className="text-text-muted text-xs font-medium">
 <tr>
 {headers.map(({ key, label }) => {
 const isCurrent = sortKey === key;
 return (
 <th
 scope="col"
 className="h-8 px-3 select-none cursor-pointer hover:text-text-main text-xs font-medium text-text-muted"
 key={key}
 onClick={() => handleSort(key)}
 >
 <div className="flex items-center gap-1">
 <span>{label}</span>
 {isCurrent && (
                    <Icon
                      name={sortAsc ? "arrow_upward" : "arrow_downward"}
                      size={18}
                      className="text-primary"
                    />
 )}
 </div>
 </th>
 );
 })}
 </tr>
 </thead>
 <tbody>
 {sortedModels.map((row) => (
 <tr
 key={`${row.provider}/${row.model}`}
 onClick={() =>
 handleSelectModel(row.provider, row.model)
 }
 onKeyDown={(e) => {
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault();
 handleSelectModel(row.provider, row.model);
 }
 }}
 tabIndex={0}
 role="button"
 aria-label={`Filter by ${row.model} on ${row.provider}`}
 className="hover:bg-surface-2/60 cursor-pointer group focus:outline-none focus:bg-surface-2/80"
 title="Click to zoom into this model"
 >
 <th scope="row" className="h-8 px-3 font-normal text-left text-xs font-medium text-text-muted">
 <div className="font-medium text-text-main group-hover:text-primary">
 {row.model}
 </div>
 <div className="text-xs text-text-muted font-mono">
 {row.provider}
 </div>
 {row.requests < data.minSamples && (
 <span className="text-[11px] text-text-muted italic">
 Insufficient samples
 </span>
 )}
 </th>
 <td className="h-8 px-3 font-mono text-sm">
 {fmtNumber(row.requests)}
 </td>
 <td className="h-8 px-3 font-mono text-success text-sm">
 {fmtNumber(row.successes)}
 </td>
 <td className="h-8 px-3 font-mono text-sm">
 {row.failures > 0 && onInspectFailures ? (
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation();
 onInspectFailures(row);
 }}
 className="inline-flex items-center gap-1 font-medium text-danger hover:underline cursor-pointer px-1.5 py-1 rounded-sm bg-danger/10 border border-danger/30"
 title="Inspect failure responses for this model"
 >
 <Icon name="bug_report" size={18} />
 {fmtNumber(row.failures)}
 </button>
 ) : (
 <span className={cn("font-semibold", row.failures > 0 ? "text-danger" : "text-text-muted")}>
 {fmtNumber(row.failures)}
 </span>
 )}
 </td>
 <td className="h-8 px-3 text-sm">
 <Badge
 variant={
 row.successRate >= 0.98
 ? "success"
 : row.successRate >= 0.9
 ? "warning"
 : "error"
 }
 size="sm"
 >
 {formatMetric(row.successRate, "successRate")}
 </Badge>
 </td>
 <td className="h-8 px-3 font-mono text-sm">
 {formatMetric(row.latencyMs, "latencyMs")}
 </td>
 <td className="h-8 px-3 font-mono text-text-muted text-sm">
 {formatMetric(row.p95, "latencyMs")}
 </td>
 <td className="h-8 px-3 font-mono text-text-muted text-sm">
 {row.inputTokens != null
 ? fmtTokens(row.inputTokens)
 : "—"}
 </td>
 <td className="h-8 px-3 font-mono text-text-muted text-sm">
 {row.outputTokens != null
 ? fmtTokens(row.outputTokens)
 : "—"}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </Card>
 );
}
