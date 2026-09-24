export {
  validateProviderFilter,
  validateModelFilter,
  validateFilterDimension,
} from "../../../../../lib/analyticsFilters.js";

import { formatTokens, formatTokensExact } from "@/shared/utils/formatTokens";

export { formatTokensExact };

export const MIN_SAMPLES = 30;
const metric = (v) =>
 v === null || v === undefined || !Number.isFinite(Number(v))
 ? null
 : Number(v);
export function normalizeAnalytics(payload) {
 if (
 !payload ||
 !Array.isArray(payload.byModel) ||
 !Array.isArray(payload.timeline)
 )
 throw new Error("Invalid analytics response");
 const normalize = (row) => ({
 ...row,
 requests: Number(row.count),
 successes: Number(row.success_count),
 failures: Number(row.failure_count),
 successRate: Number(row.count)
 ? Number(row.success_count) / Number(row.count)
 : null,
 latencyMs: metric(row.p50_latency_ms),
 latencySamples: Number(row.latency_samples ?? 0),
 p95: metric(row.p95_latency_ms),
 inputTokens: metric(row.total_input_tokens),
 outputTokens: metric(row.total_output_tokens),
 timestamp: row.bucket ? new Date(row.bucket).toLocaleString("en-US") : undefined,
 bucketMs: row.bucket ? new Date(row.bucket).getTime() : null,
 });
 return {
 summary: payload.summary,
 minSamples: payload.meta?.minSampleThreshold ?? MIN_SAMPLES,
 models: payload.byModel.map(normalize),
 series: payload.timeline.map(normalize),
 errors: payload.errorDistribution || [],
 byProvider: payload.byProvider || [],
 };
}
export function rankModels(models, mode, minSamples = MIN_SAMPLES) {
 const key =
 mode === "fastest"
 ? "latencyMs"
 : mode === "reliable"
 ? "successRate"
 : mode === "failed"
 ? "failures"
 : "requests";
 return models
 .filter(
 (r) =>
 (mode === "used" || mode === "failed" || r.requests >= minSamples) &&
 r[key] != null &&
 (mode !== "fastest" || r.latencySamples >= minSamples) &&
 (mode !== "failed" || r.failures > 0),
 )
 .slice()
 .sort(
 (a, b) =>
 (mode === "fastest" ? a[key] - b[key] : b[key] - a[key]) ||
 `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`),
 );
}
export const TIME_BUCKETS = [
 { value: "1 minute", label: "1 min", span: 60000 },
 { value: "5 minutes", label: "5 min", span: 300000 },
 { value: "1 hour", label: "1 hour", span: 3600000 },
 { value: "1 day", label: "1 day", span: 86400000 },
];

export function defaultTimeBucket(period, now = new Date()) {
 const end = new Date(now);
 let start = new Date(end);
 if (period === "today") start.setHours(0, 0, 0, 0);
 else
 start = new Date(
 end.getTime() -
 ({ "24h": 1, "7d": 7, "30d": 30, "60d": 60 }[period] ?? 7) * 86400000,
 );
 const span = end - start;
 // Prefer the finest bucket that keeps the bucket count within the API's
 // 2200-bucket validation ceiling (analyticsFilters.js).
 for (const bucket of TIME_BUCKETS)
 if (Math.ceil(span / bucket.span) <= 2200) return bucket.value;
 return "1 day";
}

export function analyticsUrl(
 {
 period,
 provider = "",
 model = "",
 errorCategory = "",
 timeBucket = "",
 timeFrom,
 timeTo,
 },
 now = new Date(),
) {
 let fromIso = timeFrom;
 let toIso = timeTo;
 let bucket = timeBucket;

 if (!fromIso || !toIso) {
 const end = new Date(now);
 let start = new Date(end);
 if (period === "today") start.setHours(0, 0, 0, 0);
 else
 start = new Date(
 end.getTime() -
 ({ "24h": 1, "7d": 7, "30d": 30, "60d": 60 }[period] ?? 7) *
 86400000,
 );
 fromIso = start.toISOString();
 toIso = end.toISOString();
 if (!bucket) bucket = defaultTimeBucket(period, now);
 }

 const params = new URLSearchParams({
 timeFrom: fromIso,
 timeTo: toIso,
 timeBucket: bucket || "1 hour",
 });
 if (provider && provider.trim()) params.set("provider", provider.trim());
 if (model && model.trim()) params.set("model", model.trim());
 if (errorCategory && errorCategory.trim())
 params.set("errorCategory", errorCategory.trim());
 return `/api/usage/analytics?${params}`;
}
export async function fetchAnalytics(filters, signal, fetcher = fetch) {
 const response = await fetcher(analyticsUrl(filters), {
 signal,
 cache: "no-store",
 });
 if (!response.ok) {
 let message = `Analytics request failed (${response.status})`;
 try {
 const errData = await response.json();
 if (errData?.error) message = errData.error;
 } catch {}
 throw new Error(message);
 }
 return normalizeAnalytics(await response.json());
}

export function getYesterdayFilters(filters, now = new Date()) {
 let curEnd = new Date(now);
 let curStart = new Date(curEnd);
 const period = filters.period || "today";

 if (filters.timeFrom && filters.timeTo) {
 curStart = new Date(filters.timeFrom);
 curEnd = new Date(filters.timeTo);
 } else if (period === "today") {
 curStart.setHours(0, 0, 0, 0);
 } else {
 const days = { "24h": 1, "7d": 7, "30d": 30, "60d": 60 }[period] ?? 7;
 curStart = new Date(curEnd.getTime() - days * 86400000);
 }

 // 24 hours back (1 day shift)
 const shiftMs = 86400000;
 const yesterdayStart = new Date(curStart.getTime() - shiftMs);
 const yesterdayEnd = new Date(curEnd.getTime() - shiftMs);

 return {
 timeFrom: yesterdayStart.toISOString(),
 timeTo: yesterdayEnd.toISOString(),
 timeBucket: filters.timeBucket || defaultTimeBucket(period, now),
 provider: filters.provider,
 model: filters.model,
 errorCategory: filters.errorCategory,
 };
}

export function getYesterdayFullDayFilters(filters, now = new Date()) {
 const todayStart = new Date(now);
 todayStart.setHours(0, 0, 0, 0);
 const yStart = new Date(todayStart.getTime() - 86400000);
 const yEnd = new Date(todayStart.getTime() - 1);

 return {
 timeFrom: yStart.toISOString(),
 timeTo: yEnd.toISOString(),
 timeBucket: "1 hour",
 provider: filters.provider,
 model: filters.model,
 errorCategory: filters.errorCategory,
 };
}

export function calculateComparison(
 currentSummary,
 yesterdaySummary,
 baselineLabel = "vs yesterday",
) {
 if (!currentSummary || !yesterdaySummary) return null;

 const curTotal = Number(currentSummary.totalEvents ?? 0);
 const prevTotal = Number(yesterdaySummary.totalEvents ?? 0);
 const totalDiff = curTotal - prevTotal;
 const totalPct = prevTotal > 0 ? (totalDiff / prevTotal) * 100 : null;

 const curSuccessRate = Number(currentSummary.successRate ?? 0);
 const prevSuccessRate = Number(yesterdaySummary.successRate ?? 0);
 const successRateDiff = curSuccessRate - prevSuccessRate;

 const curFail = Number(currentSummary.failureCount ?? 0);
 const prevFail = Number(yesterdaySummary.failureCount ?? 0);
 const failDiff = curFail - prevFail;
 const failPct = prevFail > 0 ? (failDiff / prevFail) * 100 : null;

 const curLatency =
 currentSummary.p50LatencyMs != null
 ? Number(currentSummary.p50LatencyMs)
 : null;
 const prevLatency =
 yesterdaySummary.p50LatencyMs != null
 ? Number(yesterdaySummary.p50LatencyMs)
 : null;
 const latencyDiff =
 curLatency != null && prevLatency != null ? curLatency - prevLatency : null;

 const curTokens =
 Number(currentSummary.totalInputTokens ?? 0) +
 Number(currentSummary.totalOutputTokens ?? 0);
 const prevTokens =
 Number(yesterdaySummary.totalInputTokens ?? 0) +
 Number(yesterdaySummary.totalOutputTokens ?? 0);
 const tokensDiff = curTokens - prevTokens;
 const tokensPct = prevTokens > 0 ? (tokensDiff / prevTokens) * 100 : null;

 return {
 baselineLabel,
 totalEvents: {
 diff: totalDiff,
 pct: totalPct,
 prev: prevTotal,
 yesterdayFormatted: fmtNumber(prevTotal),
 },
 successRate: {
 diff: successRateDiff,
 prev: prevSuccessRate,
 yesterdayFormatted: `${prevSuccessRate.toFixed(1)}%`,
 },
 failureCount: {
 diff: failDiff,
 pct: failPct,
 prev: prevFail,
 yesterdayFormatted: fmtNumber(prevFail),
 },
 p50LatencyMs: {
 diff: latencyDiff,
 prev: prevLatency,
 yesterdayFormatted:
 prevLatency != null ? `${Math.round(prevLatency)} ms` : "—",
 },
 totalTokens: {
 diff: tokensDiff,
 pct: tokensPct,
 prev: prevTokens,
 yesterdayFormatted: fmtTokens(prevTokens),
 },
 };
}

export function mergeYesterdayTimeline(
 currentSeries,
 yesterdaySeries,
 shiftMs = 86400000,
) {
 if (!Array.isArray(currentSeries) || currentSeries.length === 0) return [];
 if (!Array.isArray(yesterdaySeries) || yesterdaySeries.length === 0) {
 return currentSeries.map((item) => ({
 ...item,
 yesterdayRequests: 0,
 yesterdaySuccesses: 0,
 yesterdayFailures: 0,
 yesterdaySuccessRate: null,
 yesterdayLatencyMs: null,
 yesterdayTokens: 0,
 }));
 }

 const yMap = new Map();
 for (const yItem of yesterdaySeries) {
 if (!yItem.bucketMs) continue;
 yMap.set(yItem.bucketMs + shiftMs, yItem);
 }

 return currentSeries.map((item) => {
 if (!item.bucketMs) {
 return {
 ...item,
 yesterdayRequests: 0,
 yesterdaySuccesses: 0,
 yesterdayFailures: 0,
 yesterdaySuccessRate: null,
 yesterdayLatencyMs: null,
 yesterdayTokens: 0,
 };
 }

 let match = yMap.get(item.bucketMs);
 if (!match) {
 let closestDiff = Infinity;
 for (const [yAlignedMs, yVal] of yMap.entries()) {
 const diff = Math.abs(yAlignedMs - item.bucketMs);
 if (diff < closestDiff && diff <= 180000) {
 closestDiff = diff;
 match = yVal;
 }
 }
 }

 return {
 ...item,
 yesterdayRequests: match ? match.requests : 0,
 yesterdaySuccesses: match ? match.successes : 0,
 yesterdayFailures: match ? match.failures : 0,
 yesterdaySuccessRate: match ? match.successRate : null,
 yesterdayLatencyMs: match ? match.latencyMs : null,
 yesterdayTokens: match
 ? (match.inputTokens || 0) + (match.outputTokens || 0)
 : 0,
 };
 });
}

export async function fetchAnalyticsWithComparison(
 filters,
 signal,
 fetcher = fetch,
) {
 const currentPromise = fetchAnalytics(filters, signal, fetcher);
 const yesterdayFilters = getYesterdayFilters(filters);
 const yesterdayPromise = fetchAnalytics(yesterdayFilters, signal, fetcher).catch(
 () => null,
 );
 const yesterdayFullDayFilters = getYesterdayFullDayFilters(filters);
 const yesterdayFullDayPromise = fetchAnalytics(
 yesterdayFullDayFilters,
 signal,
 fetcher,
 ).catch(() => null);

 const [current, yesterday, yesterdayFullDay] = await Promise.all([
 currentPromise,
 yesterdayPromise,
 yesterdayFullDayPromise,
 ]);

 // If same-time yesterday window had 0 events but yesterday full day has recorded events:
 // use full day for meaningful baseline comparison!
 const useFullDay =
 (!yesterday || Number(yesterday.summary?.totalEvents || 0) === 0) &&
 Boolean(yesterdayFullDay && Number(yesterdayFullDay.summary?.totalEvents || 0) > 0);

 const chosenYesterday = useFullDay ? yesterdayFullDay : yesterday;
 const baselineLabel = useFullDay
 ? "vs yesterday (full day)"
 : "vs yesterday";

 const seriesWithYesterday = yesterday?.series?.length
 ? mergeYesterdayTimeline(current.series, yesterday.series)
 : yesterdayFullDay?.series?.length
 ? mergeYesterdayTimeline(current.series, yesterdayFullDay.series)
 : current.series;

 const comparison = chosenYesterday
 ? calculateComparison(
 current.summary,
 chosenYesterday.summary,
 baselineLabel,
 )
 : null;

 return {
 ...current,
 series: seriesWithYesterday,
 yesterdaySummary: chosenYesterday?.summary || null,
 comparison,
 };
}
export function formatMetric(value, kind) {
 if (value == null) return "No data";
 if (kind === "successRate") return `${(value * 100).toFixed(1)}%`;
 if (kind === "latencyMs") return `${Number(value).toFixed(0)} ms`;
 return Number(value).toLocaleString("en-US");
}

export const fmtNumber = (n) => new Intl.NumberFormat("en-US").format(Number(n) || 0);

export const fmtTokens = formatTokens;

export function buildAnalyticsCsv(models = []) {
 const list = Array.isArray(models) ? models : [];
 const headers = [
 "Provider",
 "Model",
 "Requests",
 "Success",
 "Failed",
 "SuccessRate",
 "P50_ms",
 "P95_ms",
 "InputTokens",
 "OutputTokens",
 ];
 const escapeCell = (val) => {
 if (val === null || val === undefined) return '""';
 const str = String(val);
 if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
 return `"${str.replace(/"/g, '""')}"`;
 }
 return `"${str}"`;
 };
 const rows = list.map((m) => [
 escapeCell(m?.provider),
 escapeCell(m?.model),
 Number(m?.requests || 0),
 Number(m?.successes || 0),
 Number(m?.failures || 0),
 m?.successRate != null ? `"${(m.successRate * 100).toFixed(2)}%"` : '""',
 m?.latencyMs ?? "",
 m?.p95 ?? "",
 m?.inputTokens ?? "",
 m?.outputTokens ?? "",
 ]);
 return "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\r\n");
}

export function downloadBlobCsv(csvText, filename) {
 const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const link = document.createElement("a");
 link.setAttribute("href", url);
 link.setAttribute("download", filename);
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);
}
