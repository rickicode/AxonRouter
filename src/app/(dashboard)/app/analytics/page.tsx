"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppIcon from "@/shared/components/AppIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import UsageChart from "@/app/(dashboard)/app/usage/components/UsageChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { translate } from "@/i18n/runtime";
import { fetchJson, queryKeys } from "@/shared/query";

const PERIODS = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
  { value: "all", label: "All" },
];

const fmt = (n: any) => new Intl.NumberFormat().format(Number(n || 0));
const fmtCost = (n: any) => `$${Number(n || 0).toFixed(2)}`;
const pct = (value: any, max: any) => {
  const safeValue = Number(value || 0);
  const safeMax = Number(max || 0);
  return safeMax > 0 ? Math.max(8, Math.round((safeValue / safeMax) * 100)) : 0;
};
const getProviderLabel = (providerId) => AI_PROVIDERS[providerId]?.name || providerId || "Unknown";

function SummaryCard({ label, value, sublabel = "", accent = "", icon }: any) {
  return (
    <Card className="relative overflow-hidden px-4 py-4 flex flex-col gap-2 bg-[linear-gradient(180deg,var(--color-bg)_0%,color-mix(in_srgb,var(--color-bg)_84%,var(--color-primary)_16%)_100%)] border-border/80">
      <div className="flex items-start justify-between gap-3">
        <span className="text-text-muted text-xs uppercase tracking-[0.18em] font-semibold">{translate(label)}</span>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-[4px] bg-bg/80 border border-border/70 text-primary"><AppIcon name={icon} size={18} /></span>
      </div>
      <span className={`text-3xl font-bold tracking-tight ${accent || ""}`}>{value}</span>
      {sublabel ? <span className="text-[11px] leading-5 text-text-muted max-w-[24ch]">{translate(sublabel)}</span> : null}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-[linear-gradient(90deg,var(--color-primary),transparent)] opacity-70" />
    </Card>
  );
}

function SimpleBreakdownTable({ title, rows, valueKey, labelKey, eyebrow, accent = "var(--color-primary)" }: any) {
  const maxTokens = rows.reduce((acc, row) => Math.max(acc, row[valueKey] || row.totalTokens || 0), 0);
  return <Card className="overflow-hidden border-border/80"><div className="p-4 border-b border-border bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-bg-subtle)_84%,var(--color-primary)_16%),var(--color-bg-subtle))]">{eyebrow ? <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted mb-1">{translate(eyebrow)}</div> : null}<h3 className="font-semibold text-lg">{translate(title)}</h3></div><Table><TableHeader className="bg-bg-subtle/30 text-text-muted uppercase text-[11px] tracking-[0.14em]"><TableRow><TableHead>{translate("Name")}</TableHead><TableHead className="text-right">{translate("Requests")}</TableHead><TableHead className="text-right">{translate("Tokens")}</TableHead><TableHead className="text-right">{translate("Cost")}</TableHead></TableRow></TableHeader><TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={4} className="py-10 text-center text-text-muted">{translate("No data yet.")}</TableCell></TableRow> : rows.map((row) => <TableRow key={`${title}-${row[labelKey]}`} className="hover:bg-bg-subtle/20 transition-colors"><TableCell><div className="flex flex-col gap-1"><span className="font-medium">{labelKey === "provider" ? getProviderLabel(row[labelKey]) : row[labelKey]}</span><div className="h-1.5 rounded-[4px] bg-bg-subtle overflow-hidden"><div className="h-full rounded-[4px]" style={{ width: `${pct(row[valueKey] || row.totalTokens || 0, maxTokens)}%`, backgroundColor: accent }} /></div></div></TableCell><TableCell className="text-right">{fmt(row.requests)}</TableCell><TableCell className="text-right">{fmt(row[valueKey] || row.totalTokens || 0)}</TableCell><TableCell className="text-right text-[var(--color-warning)] font-medium">{fmtCost(row.cost)}</TableCell></TableRow>)}</TableBody></Table></Card>;
}

function DailyTrendTable({ rows = [] }: any) {
  const recent = rows.slice(-10).reverse();
  return <Card className="overflow-hidden border-border/80"><div className="p-4 border-b border-border bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-bg-subtle)_88%,var(--color-success)_12%),var(--color-bg-subtle))]"><div className="text-[10px] uppercase tracking-[0.18em] text-text-muted mb-1">{translate("Recent cadence")}</div><h3 className="font-semibold text-lg">{translate("Daily Trend")}</h3></div><Table><TableHeader className="bg-bg-subtle/30 text-text-muted uppercase text-[11px] tracking-[0.14em]"><TableRow><TableHead>{translate("Date")}</TableHead><TableHead className="text-right">{translate("Requests")}</TableHead><TableHead className="text-right">{translate("Input")}</TableHead><TableHead className="text-right">{translate("Output")}</TableHead><TableHead className="text-right">{translate("Cost")}</TableHead></TableRow></TableHeader><TableBody>{recent.length === 0 ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-text-muted">{translate("No daily trend data yet.")}</TableCell></TableRow> : recent.map((row) => <TableRow key={row.date} className="hover:bg-bg-subtle/20 transition-colors"><TableCell className="font-medium">{row.date}</TableCell><TableCell className="text-right">{fmt(row.requests)}</TableCell><TableCell className="text-right text-primary">{fmt(row.promptTokens)}</TableCell><TableCell className="text-right text-[var(--color-success)]">{fmt(row.completionTokens)}</TableCell><TableCell className="text-right text-[var(--color-warning)] font-medium">{fmtCost(row.cost)}</TableCell></TableRow>)}</TableBody></Table></Card>;
}

function ActivityHeatmap({ activityMap = {} }: any) {
  const entries: [string, any][] = Object.entries(activityMap as any).sort((a, b) => a[0].localeCompare(b[0])).slice(-84) as [string, any][];
  const max = entries.reduce((acc: number, [, value]) => Math.max(acc, Number(value || 0)), 0);
  return <Card className="overflow-hidden border-border/80"><div className="p-4 border-b border-border bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-bg-subtle)_88%,var(--color-primary)_12%),var(--color-bg-subtle))] flex items-center justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[0.18em] text-text-muted mb-1">{translate("Long-range signal")}</div><h3 className="font-semibold text-lg">{translate("Activity Map")}</h3></div><div className="text-[11px] text-text-muted">{translate("Last")} {entries.length} {translate("active day slots")}</div></div><div className="p-4">{entries.length === 0 ? <Empty className="border-dashed bg-transparent py-8"><EmptyHeader><EmptyMedia><AppIcon name="analytics" /></EmptyMedia><EmptyTitle>{translate("No activity data yet")}</EmptyTitle><EmptyDescription>{translate("Activity intensity appears here after routed requests are recorded.")}</EmptyDescription></EmptyHeader></Empty> : <div className="grid grid-cols-7 md:grid-cols-14 xl:grid-cols-21 gap-2">{entries.map(([date, value]) => <div key={date} className="flex flex-col gap-1.5"><div title={`${date} — ${fmt(value)} tokens`} className="h-9 rounded-[4px] border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" style={{ background: `linear-gradient(180deg, rgba(59, 130, 246, ${Math.min(0.8, Math.max(0.12, value / max) + 0.08)}) 0%, rgba(59, 130, 246, ${Math.max(0.12, value / max)}) 100%)` }} /><span className="text-[10px] text-text-muted truncate">{date.slice(5)}</span></div>)}</div>}</div></Card>;
}

function WeeklyPatternCard({ weeklyPattern = [] }: any) {
  const max = (weeklyPattern as any[]).reduce((acc: number, item: any) => Math.max(acc, Number(item?.avgTokens || 0)), 0);
  return <Card className="overflow-hidden border-border/80"><div className="p-4 border-b border-border bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-bg-subtle)_86%,var(--color-warning)_14%),var(--color-bg-subtle))]"><div className="text-[10px] uppercase tracking-[0.18em] text-text-muted mb-1">{translate("Behavior rhythm")}</div><h3 className="font-semibold text-lg">{translate("Weekly Pattern")}</h3></div><div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 p-4">{weeklyPattern.map((item) => <div key={item.day} className="rounded-[4px] border border-border bg-bg-subtle/30 px-4 py-4"><div className="flex items-center justify-between gap-3"><div className="text-xs uppercase tracking-wide text-text-muted">{item.day}</div><div className="text-[10px] text-text-muted">{pct(item.avgTokens || 0, max)}%</div></div><div className="text-xl font-semibold mt-3">{fmt(item.avgTokens)}</div><div className="text-xs text-text-muted mt-1">{translate("avg tokens")}</div><div className="mt-3 h-2 rounded-[4px] bg-bg overflow-hidden"><div className="h-full rounded-[4px] bg-[var(--color-warning)]" style={{ width: `${pct(item.avgTokens || 0, max)}%` }} /></div></div>)}</div></Card>;
}

function AnalyticsLoadingState() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Card key={index} className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="size-9 rounded-[4px]" />
          </div>
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-3 w-36" />
        </Card>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("30d");
  const analyticsQuery = useQuery({
    queryKey: queryKeys.usageAnalytics(period),
    queryFn: ({ signal }) => fetchJson(`/api/usage/analytics?period=${period}`, { signal, cache: "no-store" }),
  });
  const analytics: any = analyticsQuery.data || null;
  const loading = analyticsQuery.isPending;
  const topProviders = useMemo(() => (analytics?.byProvider || []).slice(0, 8), [analytics]);
  const topModels = useMemo(() => (analytics?.byModel || []).slice(0, 8), [analytics]);
  const topAccounts = useMemo(() => (analytics?.byAccount || []).slice(0, 8), [analytics]);
  const weeklyPattern = analytics?.weeklyPattern || [];
  return <div className="flex flex-col gap-6"><Card className="relative overflow-hidden border-border/80 px-5 py-5 md:px-6 md:py-6"><div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div className="max-w-2xl"><div className="inline-flex items-center gap-2 rounded-[4px] border border-border/80 bg-bg/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-text-muted"><AppIcon name="data_object" size={14} className="text-primary" />{translate("Usage insights")}</div><h1 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">{translate("Analytics")}</h1><p className="text-sm md:text-base text-text-muted mt-3 max-w-[64ch] leading-7">{translate("Track request volume, provider share, token patterns, and backend-calculated spend across your routed traffic in one place.")}</p></div><ToggleGroup type="single" value={period} onValueChange={(next) => next && setPeriod(next)} variant="outline" size="sm" spacing={1} aria-label={translate("Analytics period")} className="max-w-full overflow-x-auto rounded-[4px] border border-border/80 bg-bg/70 p-1.5">{PERIODS.map((item) => <ToggleGroupItem key={item.value} value={item.value} aria-label={item.label} className="min-w-[68px] rounded-[4px] px-4 py-2.5 text-sm font-semibold data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{item.label}</ToggleGroupItem>)}</ToggleGroup></div></Card>{loading ? <AnalyticsLoadingState /> : analyticsQuery.isError || !analytics ? <Alert variant="destructive" className="border-0 rounded-[4px] text-[var(--color-danger)] !bg-[var(--color-danger)]/15"><AlertTitle>{translate("Failed to load analytics")}</AlertTitle><AlertDescription>{translate("Refresh the page or try a shorter reporting period.")}</AlertDescription></Alert> : <><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4"><SummaryCard label="Requests" value={fmt(analytics.summary?.totalRequests)} icon="chart_column" /><SummaryCard label="Input Tokens" value={fmt(analytics.summary?.promptTokens)} accent="text-[var(--color-primary)]" icon="arrow_upward" /><SummaryCard label="Output Tokens" value={fmt(analytics.summary?.completionTokens)} accent="text-[var(--color-success)]" icon="arrowdownward" /><SummaryCard label="Total Cost" value={fmtCost(analytics.summary?.totalCost)} accent="text-[var(--color-warning)]" sublabel="Calculated by the backend pricing engine from provider and model pricing" icon="data_usage" /><SummaryCard label="Streak" value={`${fmt(analytics.summary?.streak)}d`} sublabel="Consecutive active days detected in the activity map" icon="route" /></div>{period === "all" ? <Card className="overflow-hidden border-border/80"><div className="p-4 border-b border-border"><div className="text-[10px] uppercase tracking-[0.18em] text-text-muted mb-1">{translate("Long-range totals")}</div><h3 className="font-semibold text-lg">{translate("All-time overview")}</h3></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4"><div className="rounded-[4px] border border-border bg-bg-subtle/30 px-4 py-4"><div className="text-xs uppercase tracking-wide text-text-muted">{translate("Total requests")}</div><div className="text-2xl font-semibold mt-2">{fmt(analytics.summary?.totalRequests)}</div></div><div className="rounded-[4px] border border-border bg-bg-subtle/30 px-4 py-4"><div className="text-xs uppercase tracking-wide text-text-muted">{translate("Total tokens")}</div><div className="text-2xl font-semibold mt-2">{fmt(analytics.summary?.totalTokens)}</div></div><div className="rounded-[4px] border border-border bg-bg-subtle/30 px-4 py-4"><div className="text-xs uppercase tracking-wide text-text-muted">{translate("Estimated cost")}</div><div className="text-2xl font-semibold mt-2 text-[var(--color-warning)]">{fmtCost(analytics.summary?.totalCost)}</div></div></div></Card> : <UsageChart period={period} />}<div className="grid grid-cols-1 xl:grid-cols-2 gap-6"><SimpleBreakdownTable title="Top Providers" rows={topProviders} valueKey="totalTokens" labelKey="provider" eyebrow="Concentration" accent="var(--color-primary)" /><SimpleBreakdownTable title="Top Models" rows={topModels} valueKey="totalTokens" labelKey="model" eyebrow="Workload mix" accent="var(--color-success)" /></div><div className="grid grid-cols-1 xl:grid-cols-2 gap-6"><DailyTrendTable rows={analytics.dailyTrend || []} /><SimpleBreakdownTable title="Top Accounts" rows={topAccounts} valueKey="totalTokens" labelKey="account" eyebrow="Account share" accent="var(--color-warning)" /></div><ActivityHeatmap activityMap={analytics.activityMap || {}} /><WeeklyPatternCard weeklyPattern={weeklyPattern} /></>}</div>;
}
