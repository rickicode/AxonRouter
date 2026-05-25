import { prepareUsageStatement } from "../core";

type AnalyticsRow = Record<string, any>;

type AnalyticsSummaryRow = {
  totalRequests?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  totalCost?: number;
  uniqueModels?: number;
  uniqueAccounts?: number;
  uniqueApiKeys?: number;
};

function getAllRows(statement: { all: (...args: any[]) => unknown }, ...params: any[]): AnalyticsRow[] {
  const rows = statement.all(...params);
  return Array.isArray(rows) ? (rows as AnalyticsRow[]) : [];
}

function emptyPluginSummary() {
  return { requests: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
}

function toLocalDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addPluginEntry(summary, entry) {
  const tokens = entry?.tokens || {};
  summary.requests += 1;
  summary.promptTokens += Number(tokens.prompt_tokens ?? tokens.input_tokens ?? 0);
  summary.completionTokens += Number(tokens.completion_tokens ?? tokens.output_tokens ?? 0);
  summary.cost += Number(entry?.cost || 0);
}

function addDailyBucket(summary, bucket) {
  summary.requests += Number(bucket?.requests || 0);
  summary.promptTokens += Number(bucket?.promptTokens || 0);
  summary.completionTokens += Number(bucket?.completionTokens || 0);
  summary.cost += Number(bucket?.cost || 0);
}

export function getPluginUsageSummary({ period = "today", history = [], dailySummary = {}, now = new Date() } = {}) {
  const summary = emptyPluginSummary();
  if (period === "last24h") {
    const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
    for (const entry of Array.isArray(history) ? history : []) {
      const time = new Date(entry?.timestamp).getTime();
      if (!Number.isFinite(time) || time < cutoff || time > now.getTime()) continue;
      addPluginEntry(summary, entry);
    }
    return summary;
  }

  if (period === "7d") {
    for (let index = 6; index >= 0; index -= 1) {
      const day = new Date(now);
      day.setDate(day.getDate() - index);
      addDailyBucket(summary, dailySummary?.[toLocalDateKey(day)]);
    }
    return summary;
  }

  addDailyBucket(summary, dailySummary?.[toLocalDateKey(now)]);
  return summary;
}

function getDateRange(range, startDate, endDate) {
  const end = new Date();
  let start;

  switch (range) {
    case "custom":
      start = startDate ? new Date(startDate) : new Date(0);
      return { start, end: endDate ? new Date(endDate) : end };
    case "24h":
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      start = new Date(end);
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start = new Date(end);
      start.setDate(start.getDate() - 30);
      break;
    case "60d":
      start = new Date(end);
      start.setDate(start.getDate() - 60);
      break;
    case "all":
    default:
      start = new Date(0);
      break;
  }

  return { start, end };
}

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shortModelName(model: any) {
  if (!model) return "unknown";
  const parts = String(model).split("/");
  return parts[parts.length - 1] || model;
}

function buildWhereClause(options: any = {}) {
  const range = options.range || options.period || "30d";
  const { start, end } = getDateRange(range, options.startDate, options.endDate);
  const clauses = ["source IN ('general', 'morph')", "timestamp >= ?", "timestamp <= ?"];
  const params = [start.toISOString(), end.toISOString()];

  if (options.provider) {
    clauses.push("provider = ?");
    params.push(options.provider);
  }
  if (options.model) {
    clauses.push("model = ?");
    params.push(options.model);
  }
  if (options.account) {
    clauses.push("account_name_cache = ?");
    params.push(options.account);
  }
  if (options.apiKey) {
    clauses.push("(api_key_name_cache = ? OR api_key_id = ?)");
    params.push(options.apiKey, options.apiKey);
  }

  return {
    whereClause: clauses.join(" AND "),
    params,
    start,
    end,
    range,
  };
}

function getTotalTokensSql() {
  return "COALESCE(total_tokens, tokens_input + tokens_output + tokens_cache_read + tokens_cache_creation + tokens_reasoning)";
}

function getActivityRows(whereClause: string, params: any[]): AnalyticsRow[] {
  const activityStart = new Date();
  activityStart.setDate(activityStart.getDate() - 364);
  return getAllRows(prepareUsageStatement(`
    SELECT substr(timestamp, 1, 10) AS date,
           SUM(${getTotalTokensSql()}) AS total_tokens
    FROM usage_events
    WHERE ${whereClause} AND timestamp >= ?
    GROUP BY substr(timestamp, 1, 10)
    ORDER BY date ASC
  `), ...params, activityStart.toISOString());
}

export function getUsageAnalyticsFromDb(options: any = {}) {
  const { whereClause, params, range } = buildWhereClause(options);

  const summaryRow = prepareUsageStatement(`
    SELECT
      COUNT(*) AS totalRequests,
      COALESCE(SUM(tokens_input), 0) AS promptTokens,
      COALESCE(SUM(tokens_output), 0) AS completionTokens,
      COALESCE(SUM(${getTotalTokensSql()}), 0) AS totalTokens,
      COALESCE(SUM(cost_total), 0) AS totalCost,
      COUNT(DISTINCT model) AS uniqueModels,
      COUNT(DISTINCT account_name_cache) AS uniqueAccounts,
      COUNT(DISTINCT api_key_id) AS uniqueApiKeys
    FROM usage_events
    WHERE ${whereClause}
  `).get(...params) as AnalyticsSummaryRow | undefined;

  const dailyTrend = getAllRows(prepareUsageStatement(`
    SELECT
      substr(timestamp, 1, 10) AS date,
      COUNT(*) AS requests,
      COALESCE(SUM(tokens_input), 0) AS promptTokens,
      COALESCE(SUM(tokens_output), 0) AS completionTokens,
      COALESCE(SUM(${getTotalTokensSql()}), 0) AS totalTokens,
      COALESCE(SUM(cost_total), 0) AS cost
    FROM usage_events
    WHERE ${whereClause}
    GROUP BY substr(timestamp, 1, 10)
    ORDER BY date ASC
  `), ...params).map((row) => ({
    date: row.date,
    requests: Number(row.requests || 0),
    promptTokens: Number(row.promptTokens || 0),
    completionTokens: Number(row.completionTokens || 0),
    totalTokens: Number(row.totalTokens || 0),
    cost: Number(row.cost || 0),
  }));

  const dailyByModelRows = getAllRows(prepareUsageStatement(`
    SELECT
      substr(timestamp, 1, 10) AS date,
      model,
      SUM(${getTotalTokensSql()}) AS totalTokens
    FROM usage_events
    WHERE ${whereClause}
    GROUP BY substr(timestamp, 1, 10), model
    ORDER BY date ASC
  `), ...params);

  const dailyByModelMap: Record<string, Record<string, number>> = {};
  const allModels = new Set<string>();
  for (const row of dailyByModelRows) {
    const modelShort = shortModelName(row.model || "unknown");
    allModels.add(modelShort);
    if (!dailyByModelMap[row.date]) dailyByModelMap[row.date] = {};
    dailyByModelMap[row.date][modelShort] = Number(row.totalTokens || 0);
  }

  const dailyByModel = dailyTrend.map((day) => {
    const shaped: Record<string, any> = { date: day.date };
    for (const model of allModels) {
      shaped[model] = dailyByModelMap[day.date]?.[model] || 0;
    }
    return shaped;
  });

  const byProvider = getAllRows(prepareUsageStatement(`
    SELECT provider, COUNT(*) AS requests, SUM(tokens_input) AS promptTokens, SUM(tokens_output) AS completionTokens,
           SUM(${getTotalTokensSql()}) AS totalTokens, SUM(cost_total) AS cost
    FROM usage_events
    WHERE ${whereClause}
    GROUP BY provider
    ORDER BY totalTokens DESC
  `), ...params).map((row) => ({
    provider: row.provider || "unknown",
    requests: Number(row.requests || 0),
    promptTokens: Number(row.promptTokens || 0),
    completionTokens: Number(row.completionTokens || 0),
    totalTokens: Number(row.totalTokens || 0),
    cost: Number(row.cost || 0),
  }));

  const byModel = getAllRows(prepareUsageStatement(`
    SELECT model, provider, COUNT(*) AS requests, SUM(tokens_input) AS promptTokens, SUM(tokens_output) AS completionTokens,
           SUM(${getTotalTokensSql()}) AS totalTokens, SUM(cost_total) AS cost
    FROM usage_events
    WHERE ${whereClause}
    GROUP BY model, provider
    ORDER BY totalTokens DESC
  `), ...params).map((row) => ({
    model: shortModelName(row.model || "unknown"),
    provider: row.provider || "unknown",
    requests: Number(row.requests || 0),
    promptTokens: Number(row.promptTokens || 0),
    completionTokens: Number(row.completionTokens || 0),
    totalTokens: Number(row.totalTokens || 0),
    cost: Number(row.cost || 0),
  }));

  const byAccount = getAllRows(prepareUsageStatement(`
    SELECT account_name_cache AS account, COUNT(*) AS requests,
           SUM(${getTotalTokensSql()}) AS totalTokens, SUM(cost_total) AS cost
    FROM usage_events
    WHERE ${whereClause} AND account_name_cache IS NOT NULL AND account_name_cache != ''
    GROUP BY account_name_cache
    ORDER BY totalTokens DESC
  `), ...params).map((row) => ({
    account: row.account || "unknown",
    requests: Number(row.requests || 0),
    totalTokens: Number(row.totalTokens || 0),
    cost: Number(row.cost || 0),
  }));

  const byApiKey = getAllRows(prepareUsageStatement(`
    SELECT api_key_id, api_key_name_cache, COUNT(*) AS requests,
           SUM(tokens_input) AS promptTokens, SUM(tokens_output) AS completionTokens,
           SUM(${getTotalTokensSql()}) AS totalTokens, SUM(cost_total) AS cost
    FROM usage_events
    WHERE ${whereClause} AND (api_key_id IS NOT NULL OR api_key_name_cache IS NOT NULL)
    GROUP BY api_key_id, api_key_name_cache
    ORDER BY totalTokens DESC
  `), ...params).map((row) => {
    const keyName = row.api_key_name_cache || row.api_key_id || "unknown";
    return {
      apiKey: row.api_key_id ? `${keyName} (${row.api_key_id})` : keyName,
      apiKeyId: row.api_key_id || null,
      apiKeyName: keyName,
      requests: Number(row.requests || 0),
      promptTokens: Number(row.promptTokens || 0),
      completionTokens: Number(row.completionTokens || 0),
      totalTokens: Number(row.totalTokens || 0),
      cost: Number(row.cost || 0),
    };
  });

  const weeklyPattern = getAllRows(prepareUsageStatement(`
    SELECT strftime('%w', timestamp) AS weekday, AVG(${getTotalTokensSql()}) AS avgTokens,
           SUM(${getTotalTokensSql()}) AS totalTokens
    FROM usage_events
    WHERE ${whereClause}
    GROUP BY weekday
  `), ...params);

  const dayMap = new Map(weeklyPattern.map((row) => [String(row.weekday), row] as const));
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const normalizedWeeklyPattern = weekDays.map((day, index) => {
    const row = dayMap.get(String(index));
    return {
      day,
      avgTokens: row ? Math.round(Number(row.avgTokens || 0)) : 0,
      totalTokens: row ? Number(row.totalTokens || 0) : 0,
    };
  });

  const activityRows = getActivityRows(whereClause, params);
  const activityMap: Record<string, number> = Object.fromEntries(activityRows.map((row) => [row.date, Number(row.total_tokens || 0)]));

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = toDateKey(d);
    if ((activityMap[key] || 0) > 0) {
      streak += 1;
    } else if (i > 0) {
      break;
    }
  }

  const totalTokens = Number(summaryRow?.totalTokens || 0);
  const normalizedByModel = byModel.map((item) => ({
    ...item,
    pct: totalTokens > 0 ? ((item.totalTokens / totalTokens) * 100).toFixed(1) : "0",
  }));

  return {
    summary: {
      totalTokens,
      promptTokens: Number(summaryRow?.promptTokens || 0),
      completionTokens: Number(summaryRow?.completionTokens || 0),
      totalCost: Number(summaryRow?.totalCost || 0),
      totalRequests: Number(summaryRow?.totalRequests || 0),
      uniqueModels: Number(summaryRow?.uniqueModels || 0),
      uniqueAccounts: Number(summaryRow?.uniqueAccounts || 0),
      uniqueApiKeys: Number(summaryRow?.uniqueApiKeys || 0),
      streak,
    },
    dailyTrend,
    dailyByModel,
    modelNames: [...allModels],
    byModel: normalizedByModel,
    byAccount,
    byProvider,
    byApiKey,
    activityMap,
    weeklyPattern: normalizedWeeklyPattern,
    range,
  };
}
