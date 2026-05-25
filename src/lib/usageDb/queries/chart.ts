import { prepareUsageStatement } from "../core";

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getChartDataFromDb(period = "7d") {
  const now = Date.now();

  if (period === "24h") {
    const bucketCount = 24;
    const bucketMs = 60 * 60 * 1000;
    const startTime = now - bucketCount * bucketMs;
    const rows = prepareUsageStatement(`
      SELECT timestamp, tokens_input, tokens_output, total_tokens, cost_total
      FROM usage_events
      WHERE source IN ('general', 'morph') AND timestamp >= ?
      ORDER BY timestamp ASC
    `).all(new Date(startTime).toISOString());

    const labelFn = (ts: number) => new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const ts = startTime + i * bucketMs;
      return { label: labelFn(ts), tokens: 0, cost: 0 };
    });

    for (const row of rows as any[]) {
      const rowTime = new Date(row.timestamp).getTime();
      if (rowTime < startTime || rowTime > now) continue;
      const idx = Math.min(Math.floor((rowTime - startTime) / bucketMs), bucketCount - 1);
      buckets[idx].tokens += Number(row.total_tokens ?? (Number(row.tokens_input || 0) + Number(row.tokens_output || 0)));
      buckets[idx].cost += Number(row.cost_total || 0);
    }

    return buckets;
  }

  const bucketCount = period === "7d" ? 7 : period === "30d" ? 30 : 60;
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (bucketCount - 1));

  const rows = prepareUsageStatement(`
    SELECT date, SUM(total_tokens) AS tokens, SUM(cost_total) AS cost
    FROM usage_daily_summary
    WHERE source IN ('general', 'morph') AND date >= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(getDateKey(startDate));

  const bucketMap = new Map((rows as any[]).map((row: any) => [row.date, { tokens: Number(row.tokens || 0), cost: Number(row.cost || 0) }]));
  const labelFn = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return Array.from({ length: bucketCount }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (bucketCount - 1 - i));
    const dateKey = getDateKey(d);
    const bucket = bucketMap.get(dateKey);
    return {
      label: labelFn(d),
      tokens: bucket?.tokens || 0,
      cost: bucket?.cost || 0,
    };
  });
}
