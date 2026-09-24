import { cn } from "@/shared/utils/cn";
import { fmtNumber, formatMetric, fmtTokens } from "./analyticsData";
import DeltaBadge from "./DeltaBadge";
import Icon from "@/shared/components/Icon";

function SummaryCard({
  label,
  icon,
  iconTone,
  value,
  valueColor,
  subtext,
  comparison,
  comparisonType,
  invertComparison,
  baselineLabel,
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
        <span className={cn("flex size-7 items-center justify-center rounded-md border", iconTone)}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <span className={cn("truncate text-2xl font-semibold tabular-nums", valueColor)}>{value}</span>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="truncate text-[11px] text-text-muted">{subtext}</span>
        {comparison && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-text-muted">
              Prior <span className="font-medium tabular-nums text-text-main">{comparison.yesterdayFormatted}</span>
            </span>
            <DeltaBadge
              diff={comparison.diff}
              pct={comparison.pct}
              unit={comparisonType === "latency" ? "ms" : comparisonType === "rate" ? "%" : ""}
              invert={invertComparison}
              label={baselineLabel}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsSummaryCards({ data }) {
  const { summary, comparison, models } = data;
  const baselineLabel = comparison?.baselineLabel || "vs yesterday";

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <SummaryCard
        label="Attempts"
        icon="swap_horiz"
        iconTone="text-text-main bg-surface-3 border-border"
        value={fmtNumber(summary.totalEvents)}
        valueColor="text-text-main"
        subtext={`${models.length} models tracked`}
        comparison={comparison?.totalEvents}
        baselineLabel={baselineLabel}
      />
      <SummaryCard
        label="Success Rate"
        icon="verified"
        iconTone="text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
        value={`${summary.successRate}%`}
        valueColor="text-emerald-400"
        subtext={`${fmtNumber(summary.successCount)} succeeded`}
        comparison={comparison?.successRate}
        comparisonType="rate"
        baselineLabel={baselineLabel}
      />
      <SummaryCard
        label="Failed Attempts"
        icon="error"
        iconTone="text-danger bg-danger/10 border-danger/20"
        value={fmtNumber(summary.failureCount)}
        valueColor={summary.failureCount > 0 ? "text-danger" : "text-text-muted"}
        subtext={
          summary.totalEvents
            ? `${((summary.failureCount / summary.totalEvents) * 100).toFixed(1)}% of attempts`
            : "No attempts"
        }
        comparison={comparison?.failureCount}
        invertComparison
        baselineLabel={baselineLabel}
      />
      <SummaryCard
        label="Median Latency"
        icon="speed"
        iconTone="text-amber-400 bg-amber-500/10 border-amber-500/20"
        value={formatMetric(summary.p50LatencyMs, "latencyMs")}
        valueColor="text-amber-400"
        subtext={`P95 ${formatMetric(summary.p95LatencyMs, "latencyMs")}`}
        comparison={comparison?.p50LatencyMs}
        comparisonType="latency"
        invertComparison
        baselineLabel={baselineLabel}
      />
      <SummaryCard
        label="Tokens"
        icon="data_usage"
        iconTone="text-cyan-400 bg-cyan-500/10 border-cyan-500/20"
        value={fmtTokens(summary.totalInputTokens + summary.totalOutputTokens)}
        valueColor="text-cyan-400"
        subtext={`In ${fmtTokens(summary.totalInputTokens)} · Out ${fmtTokens(summary.totalOutputTokens)}`}
        comparison={comparison?.totalTokens}
        baselineLabel={baselineLabel}
      />
    </div>
  );
}

