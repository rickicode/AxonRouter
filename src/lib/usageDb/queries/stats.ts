import { prepareUsageStatement } from "../core";
import { getRecentUsageRowsFromDb } from "./recent";

const PERIOD_TO_DAYS = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "60d": 60,
} as const;

type UsageBucket = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
};

type SummaryRow = {
  totalRequests?: number;
  totalPromptTokens?: number;
  totalCompletionTokens?: number;
  totalTokens?: number;
  totalCost?: number;
};

type MinuteRow = {
  timestamp?: string;
  tokens_input?: number;
  tokens_output?: number;
  cost_total?: number;
};

type GroupedRow = {
  provider?: string;
  rawModel?: string;
  accountName?: string;
  connectionId?: string;
  apiKeyId?: string;
  keyName?: string;
  endpoint?: string;
  requests?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  lastUsed?: string;
};

type GroupedItem = {
  provider: string;
  rawModel: string;
  accountName: string | null;
  connectionId: string | null;
  keyName: string;
  apiKeyId: string | null;
  endpoint: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  lastUsed: string | null;
};

type GroupedCollection = Record<string, GroupedItem | (UsageBucket & { lastUsed: string | null } & Record<string, unknown>)>;

type PeriodFilter = {
  table: "usage_events" | "usage_daily_summary";
  whereClause: string;
  params: string[];
};

function getRows<T>(sql: string, ...params: any[]): T[] {
  return (prepareUsageStatement(sql).all(...params) as T[]) || [];
}

function getRow<T>(sql: string, ...params: any[]): T | undefined {
  return prepareUsageStatement(sql).get(...params) as T | undefined;
}

function initBucket(): UsageBucket {
  return { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
}

function addUsage(target: UsageBucket, values: Partial<UsageBucket>) {
  target.requests += values.requests || 0;
  target.promptTokens += values.promptTokens || 0;
  target.completionTokens += values.completionTokens || 0;
  target.totalTokens += values.totalTokens || 0;
  target.cost += values.cost || 0;
}

function getDateKeys(days: number) {
  const today = new Date(Date.now());
  return Array.from({ length: days }, (_, index) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - index));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}

function getLast10MinuteBucketsFromDb(): UsageBucket[] {
  const now = new Date();
  const currentMinuteStart = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const startIso = new Date(currentMinuteStart.getTime() - 9 * 60 * 1000).toISOString();
  const rows = getRows<MinuteRow>(`
    SELECT timestamp, tokens_input, tokens_output, cost_total
    FROM usage_events
    WHERE source IN ('general', 'morph') AND timestamp >= ?
    ORDER BY timestamp ASC
  `, startIso);

  const bucketMap: Record<number, UsageBucket> = {};
  const buckets: UsageBucket[] = [];
  for (let i = 0; i < 10; i += 1) {
    const bucketKey = currentMinuteStart.getTime() - (9 - i) * 60 * 1000;
    bucketMap[bucketKey] = initBucket();
    buckets.push(bucketMap[bucketKey]);
  }

  for (const row of rows) {
    const rowTime = new Date(row.timestamp || 0);
    if (rowTime > now) continue;
    const entryMinuteStart = Math.floor(rowTime.getTime() / 60000) * 60000;
    if (!bucketMap[entryMinuteStart]) continue;
    addUsage(bucketMap[entryMinuteStart], {
      requests: 1,
      promptTokens: Number(row.tokens_input || 0),
      completionTokens: Number(row.tokens_output || 0),
      totalTokens: Number(row.tokens_input || 0) + Number(row.tokens_output || 0),
      cost: Number(row.cost_total || 0),
    });
  }

  return buckets;
}

function buildSummaryStats(period: string) {
  const periodFilter = getPeriodFilter(period);
  const eventTotalTokensExpr = "COALESCE(total_tokens, tokens_input + tokens_output + tokens_cache_read + tokens_cache_creation + tokens_reasoning)";

  if (period === "24h" || period === "all") {
    const row = getRow<SummaryRow>(`
      SELECT
        COUNT(*) AS totalRequests,
        COALESCE(SUM(tokens_input), 0) AS totalPromptTokens,
        COALESCE(SUM(tokens_output), 0) AS totalCompletionTokens,
        COALESCE(SUM(${eventTotalTokensExpr}), 0) AS totalTokens,
        COALESCE(SUM(cost_total), 0) AS totalCost
      FROM usage_events
      WHERE ${periodFilter.whereClause}
    `, ...periodFilter.params);
    return {
      totalRequests: Number(row?.totalRequests || 0),
      totalPromptTokens: Number(row?.totalPromptTokens || 0),
      totalCompletionTokens: Number(row?.totalCompletionTokens || 0),
      totalTokens: Number(row?.totalTokens || 0),
      totalCost: Number(row?.totalCost || 0),
    };
  }

  const row = getRow<SummaryRow>(`
    SELECT
      COALESCE(SUM(requests), 0) AS totalRequests,
      COALESCE(SUM(prompt_tokens), 0) AS totalPromptTokens,
      COALESCE(SUM(completion_tokens), 0) AS totalCompletionTokens,
      COALESCE(SUM(total_tokens), 0) AS totalTokens,
      COALESCE(SUM(cost_total), 0) AS totalCost
    FROM usage_daily_summary
    WHERE ${periodFilter.whereClause}
  `, ...periodFilter.params);

  return {
    totalRequests: Number(row?.totalRequests || 0),
    totalPromptTokens: Number(row?.totalPromptTokens || 0),
    totalCompletionTokens: Number(row?.totalCompletionTokens || 0),
    totalTokens: Number(row?.totalTokens || 0),
    totalCost: Number(row?.totalCost || 0),
  };
}

function getPeriodFilter(period = "all"): PeriodFilter {
  if (period === "all") {
    return { table: "usage_events", whereClause: "source IN ('general', 'morph') AND timestamp <= ?", params: [new Date(Date.now()).toISOString()] };
  }

  if (period === "24h") {
    return {
      table: "usage_events",
      whereClause: "source IN ('general', 'morph') AND timestamp >= ? AND timestamp <= ?",
      params: [new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), new Date(Date.now()).toISOString()],
    };
  }

  const days = PERIOD_TO_DAYS[period as keyof typeof PERIOD_TO_DAYS] || 7;
  const dateKeys = getDateKeys(days);
  const placeholders = dateKeys.map(() => "?").join(", ");
  return {
    table: "usage_daily_summary",
    whereClause: `source IN ('general', 'morph') AND date IN (${placeholders})`,
    params: dateKeys,
  };
}

function mergeGroup(target: GroupedCollection, key: string, item: GroupedItem, extra: Record<string, unknown> = {}) {
  const existing = target[key] || {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
    lastUsed: null,
    ...extra,
  };

  existing.requests += item.requests;
  existing.promptTokens += item.promptTokens;
  existing.completionTokens += item.completionTokens;
  existing.totalTokens += item.totalTokens;
  existing.cost += item.cost;
  if (!existing.lastUsed || (item.lastUsed && new Date(item.lastUsed) > new Date(existing.lastUsed))) {
    existing.lastUsed = item.lastUsed;
  }

  target[key] = existing;
}

function buildGroupedStats(period: string) {
  const periodFilter = getPeriodFilter(period);
  const isEvents = periodFilter.table === "usage_events";
  const eventTotalTokensExpr = "COALESCE(total_tokens, tokens_input + tokens_output + tokens_cache_read + tokens_cache_creation + tokens_reasoning)";
  const requestsExpr = isEvents ? "COUNT(*)" : "SUM(requests)";
  const promptExpr = isEvents ? "SUM(tokens_input)" : "SUM(prompt_tokens)";
  const completionExpr = isEvents ? "SUM(tokens_output)" : "SUM(completion_tokens)";
  const totalExpr = isEvents
    ? `SUM(${eventTotalTokensExpr})`
    : "SUM(total_tokens)";
  const lastUsedExpr = isEvents ? "MAX(timestamp)" : "MAX(date)";

  const rows = getRows<GroupedRow>(`
    SELECT
      provider,
      model AS rawModel,
      account_name_cache AS accountName,
      connection_id AS connectionId,
      api_key_id AS apiKeyId,
      api_key_name_cache AS keyName,
      endpoint,
      ${requestsExpr} AS requests,
      COALESCE(${promptExpr}, 0) AS promptTokens,
      COALESCE(${completionExpr}, 0) AS completionTokens,
      COALESCE(${totalExpr}, 0) AS totalTokens,
      COALESCE(SUM(cost_total), 0) AS cost,
      ${lastUsedExpr} AS lastUsed
    FROM ${periodFilter.table}
    WHERE ${periodFilter.whereClause}
    GROUP BY provider, rawModel, accountName, connectionId, apiKeyId, keyName, endpoint
  `, ...periodFilter.params);

  const byProvider: GroupedCollection = {};
  const byModel: GroupedCollection = {};
  const byAccount: GroupedCollection = {};
  const byApiKey: GroupedCollection = {};
  const byEndpoint: GroupedCollection = {};

  for (const row of rows) {
    const item: GroupedItem = {
      provider: row.provider || "unknown",
      rawModel: row.rawModel || "unknown",
      accountName: row.accountName || null,
      connectionId: row.connectionId || null,
      keyName: row.keyName || row.apiKeyId || "Unknown Key",
      apiKeyId: row.apiKeyId || null,
      endpoint: row.endpoint || "Unknown",
      requests: Number(row.requests || 0),
      promptTokens: Number(row.promptTokens || 0),
      completionTokens: Number(row.completionTokens || 0),
      totalTokens: Number(row.totalTokens || 0),
      cost: Number(row.cost || 0),
      lastUsed: row.lastUsed || null,
    };

    mergeGroup(byProvider, item.provider, item, { provider: item.provider });
    mergeGroup(byModel, `${item.rawModel}|${item.provider}`, item, { rawModel: item.rawModel, provider: item.provider });

    if (item.connectionId || item.accountName) {
      mergeGroup(byAccount, `${item.connectionId || item.accountName}|${item.rawModel}|${item.provider}`, item, { accountName: item.accountName, connectionId: item.connectionId, rawModel: item.rawModel, provider: item.provider });
    }

    if (item.apiKeyId || item.keyName) {
      mergeGroup(byApiKey, `${item.apiKeyId || item.keyName}|${item.rawModel}|${item.provider}`, item, { keyName: item.keyName, apiKeyId: item.apiKeyId, rawModel: item.rawModel, provider: item.provider });
    }

    mergeGroup(byEndpoint, `${item.endpoint}|${item.rawModel}|${item.provider}`, item, { endpoint: item.endpoint, rawModel: item.rawModel, provider: item.provider });
  }

  return { byProvider, byModel, byAccount, byApiKey, byEndpoint };
}

export function getUsageStatsFromDb(period = "all", liveActivity: any = null) {
  const summary = buildSummaryStats(period);
  const grouped = buildGroupedStats(period);
  return {
    totalRequests: summary.totalRequests,
    totalPromptTokens: summary.totalPromptTokens,
    totalCompletionTokens: summary.totalCompletionTokens,
    totalTokens: summary.totalTokens,
    totalCost: summary.totalCost,
    byProvider: grouped.byProvider,
    byModel: grouped.byModel,
    byAccount: grouped.byAccount,
    byApiKey: grouped.byApiKey,
    byEndpoint: grouped.byEndpoint,
    last10Minutes: getLast10MinuteBucketsFromDb(),
    pending: liveActivity?.pending || { byModel: {}, byAccount: {} },
    activeRequests: liveActivity?.activeRequests || [],
    recentRequests: getRecentUsageRowsFromDb(20),
    errorProvider: liveActivity?.errorProvider || "",
  };
}
