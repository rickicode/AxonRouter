const WINDOW_MS = 30 * 60 * 1000;

type AutoRoutingTelemetryRecord = {
  timestamp: number;
  virtualModel: string | null;
  combo: string | null;
  provider: string | null;
  status: string;
  fallback: boolean;
};

const records: AutoRoutingTelemetryRecord[] = [];

function prune(now = Date.now()) {
  while (records.length > 0 && (now - records[0].timestamp) > WINDOW_MS) {
    records.shift();
  }
}

export function recordAutoRoutingSignal({ virtualModel = null, combo = null, provider = null, status = "ok", fallback = false } = {}) {
  const now = Date.now();
  records.push({
    timestamp: now,
    virtualModel: typeof virtualModel === "string" ? virtualModel : null,
    combo: typeof combo === "string" ? combo : null,
    provider: typeof provider === "string" ? provider : null,
    status,
    fallback: fallback === true,
  });
  prune(now);
}

function summarize(items: AutoRoutingTelemetryRecord[] = []) {
  const total = items.length;
  if (total === 0) {
    return {
      fallbackRate: 0,
      errorRate: 0,
      totalSamples: 0,
      windowMs: WINDOW_MS,
    };
  }

  const fallbackCount = items.filter((item) => item.fallback === true).length;
  const errorCount = items.filter((item) => item.status !== "ok" && item.status !== "success").length;

  return {
    fallbackRate: fallbackCount / total,
    errorRate: errorCount / total,
    totalSamples: total,
    windowMs: WINDOW_MS,
  };
}

export function getAutoRoutingTelemetrySummary(filter: any = {}) {
  const now = Date.now();
  prune(now);

  const filtered = records.filter((item) => {
    if (filter.virtualModel && item.virtualModel !== filter.virtualModel) return false;
    if (filter.combo && item.combo !== filter.combo) return false;
    if (filter.provider && item.provider !== filter.provider) return false;
    return true;
  });

  return summarize(filtered);
}

export function getAutoRoutingTelemetryBreakdown() {
  const now = Date.now();
  prune(now);

  const byVirtualModel: Record<string, AutoRoutingTelemetryRecord[]> = {};
  const byCombo: Record<string, AutoRoutingTelemetryRecord[]> = {};
  const byProvider: Record<string, AutoRoutingTelemetryRecord[]> = {};

  for (const item of records) {
    if (item.virtualModel) {
      byVirtualModel[item.virtualModel] = byVirtualModel[item.virtualModel] || [];
      byVirtualModel[item.virtualModel].push(item);
    }
    if (item.combo) {
      byCombo[item.combo] = byCombo[item.combo] || [];
      byCombo[item.combo].push(item);
    }
    if (item.provider) {
      byProvider[item.provider] = byProvider[item.provider] || [];
      byProvider[item.provider].push(item);
    }
  }

  return {
    byVirtualModel: Object.fromEntries(Object.entries(byVirtualModel).map(([key, items]) => [key, summarize(items)])),
    byCombo: Object.fromEntries(Object.entries(byCombo).map(([key, items]) => [key, summarize(items)])),
    byProvider: Object.fromEntries(Object.entries(byProvider).map(([key, items]) => [key, summarize(items)])),
  };
}
