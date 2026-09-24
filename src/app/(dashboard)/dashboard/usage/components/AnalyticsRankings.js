import Card from "@/shared/components/Card";
import { cn } from "@/shared/utils/cn";
import { rankModels, formatMetric } from "./analyticsData";
import Icon from "@/shared/components/Icon";

export default function AnalyticsRankings({ data, handleSelectModel }) {
 const modes = [
 [
 "fastest",
 "Fastest Models",
 "speed",
 `P50 latency (min. ${data.minSamples} samples)`,
 ],
 [
 "reliable",
 "Most Reliable",
 "verified",
 `Highest success rate (min. ${data.minSamples} samples)`,
 ],
 [
 "failed",
 "Most Failed",
 "error",
 "Highest failed requests count",
 ],
 [
 "used",
 "Most Used",
 "trending_up",
 "Highest total routed requests",
 ],
 ];

 return (
 <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
 {modes.map(([mode, title, icon, subtitle]) => {
 const ranked = rankModels(data.models, mode, data.minSamples);
 return (
 <Card
 key={mode}
 padding="sm"
 title={title}
 subtitle={subtitle}
 icon={icon}
 className="flex min-w-0 flex-col justify-between"
 >
 {!ranked.length ? (
 <div className="flex items-center gap-2 p-3 rounded-sm border border-dashed border-border text-xs text-text-muted my-2 h-8">
 <Icon name="info" size={14} className="text-sm" />
 <span>
 {mode === "failed" ? "Zero failed models" : `Insufficient samples (min. ${data.minSamples})`}
 </span>
 </div>
 ) : (
 <ol className="divide-y divide-border-subtle my-1">
 {ranked.slice(0, 5).map((row, idx) => (
 <li
 key={`${row.provider}/${row.model}`}
 onClick={() =>
 handleSelectModel(row.provider, row.model)
 }
 className="flex items-center justify-between h-8 gap-2 text-xs cursor-pointer hover:bg-surface-2/60 rounded-sm px-1 -mx-1"
 title="Click to zoom into this model"
 >
 <div className="flex items-center gap-2 min-w-0">
 <span className="size-5 rounded-sm bg-surface flex items-center justify-center font-mono font-medium text-[11px] text-text-muted shrink-0">
 {idx + 1}
 </span>
 <div className="min-w-0">
 <p className="font-medium text-text-main truncate hover:text-primary">
 {row.model}
 </p>
 <p className="text-[11px] text-text-muted truncate">
 {row.provider}
 </p>
 </div>
 </div>
 <span className={cn(
 "font-mono font-semibold shrink-0",
 mode === "failed" ? "text-danger" : "text-text-main",
 )}>
 {formatMetric(
 row[
 mode === "fastest"
 ? "latencyMs"
 : mode === "reliable"
 ? "successRate"
 : mode === "failed"
 ? "failures"
 : "requests"
 ],
 mode === "fastest"
 ? "latencyMs"
 : mode === "reliable"
 ? "successRate"
 : "count",
 )}
 </span>
 </li>
 ))}
 </ol>
 )}
 </Card>
 );
 })}
 </div>
 );
}
