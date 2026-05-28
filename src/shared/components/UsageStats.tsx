"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { translate } from "@/i18n/runtime";
import { AI_PROVIDERS, FREE_PROVIDERS, MORPH_MANAGED_PROVIDER_ID } from "@/shared/constants/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataState, DataToolbar } from "@/shared/components/data";
import OverviewCards from "@/app/(dashboard)/app/usage/components/OverviewCards";
import UsageTable, { fmt, fmtTime } from "@/app/(dashboard)/app/usage/components/UsageTable";
import ProviderTopology from "@/app/(dashboard)/app/usage/components/ProviderTopology";
import UsageChart from "@/app/(dashboard)/app/usage/components/UsageChart";
import { useUrlQueryControls } from "@/shared/hooks";
import { fetchJson, queryKeys } from "@/shared/query";

function timeAgo(timestamp: any) {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Auto-update time display every second without re-rendering parent
function TimeAgo({ timestamp }: any) {
  const [, setTick] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  
  return <>{timeAgo(timestamp)}</>;
}

function getProviderLabel(providerId: any) {
  return (AI_PROVIDERS as any)[providerId]?.name || providerId || "Unknown";
}

function RecentRequests({ requests = [] }: any) {
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is required for recent-request row virtualization.
  const rowVirtualizer = useVirtualizer({
    count: requests.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 48,
    overscan: 8,
  });

  return (
    <Card className="flex flex-col overflow-hidden" style={{ height: 480 }}>
      <CardContent className="flex h-full flex-col p-4">
      <DataToolbar className="shrink-0 border-b border-[var(--color-border)] px-1 py-2" title={translate("Recent Requests")} meta={`${requests.length} ${translate("rows")}`} />

      {!requests.length ? (
        <DataState className="h-full border-0 bg-transparent" title={translate("No requests yet.")} description={translate("Recent routed requests will appear here once traffic is recorded.")} icon="search" />
      ) : (
        <div ref={scrollParentRef} className="flex-1 overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--color-bg)] z-10">
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-1.5 text-left font-semibold text-[var(--color-text-muted)] w-2"></th>
                <th className="py-1.5 text-left font-semibold text-[var(--color-text-muted)]">{translate("Model")}</th>
                <th className="py-1.5 text-right font-semibold text-[var(--color-text-muted)] whitespace-nowrap">{translate("In / Out")}</th>
                <th className="py-1.5 text-right font-semibold text-[var(--color-text-muted)]">{translate("When")}</th>
              </tr>
            </thead>
            <tbody className="relative divide-y divide-border/50" style={{ height: rowVirtualizer.getTotalSize() }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const r = requests[virtualRow.index];
                const ok = !r.status || r.status === "ok" || r.status === "success";
                return (
                  <tr key={`${r.timestamp}-${virtualRow.index}`} className="absolute left-0 right-0 grid grid-cols-[12px_minmax(0,1fr)_96px_72px] hover:bg-[var(--color-bg)]-subtle transition-colors" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                    <td className="py-1.5">
                      <span className={`block w-1.5 h-1.5 rounded-full ${ok ? "bg-success" : "bg-error"}`} />
                    </td>
                    <td className="py-1.5 max-w-[120px]" title={`${r.model} (${getProviderLabel(r.provider)})`}>
                      <div className="font-mono truncate">{r.model}</div>
                      <div className="text-[10px] text-[var(--color-text-muted)] truncate">{getProviderLabel(r.provider)}</div>
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <span className="text-[var(--color-primary)]">{fmt(r.promptTokens)}↑</span>
                      {" "}
                      <span className="text-success">{fmt(r.completionTokens)}↓</span>
                    </td>
                    <td className="py-1.5 text-right text-[var(--color-text-muted)] whitespace-nowrap"><TimeAgo timestamp={r.timestamp} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </CardContent>
    </Card>
  );
}

function sortData(dataMap: any, pendingMap: any = {}, sortBy: any, sortOrder: any) {
  return Object.entries(dataMap || {})
    .map(([key, data]: [string, any]) => {
      const totalTokens = (data?.promptTokens || 0) + (data?.completionTokens || 0);
      const totalCost = data?.cost || 0;
      return { ...(data || {}), key, totalTokens, totalCost, pending: pendingMap[key] || 0 };
    })
    .sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
}

function getGroupKey(item: any, keyField: any) {
  switch (keyField) {
    case "rawModel": return item.rawModel || "Unknown Model";
    case "accountName": return item.accountName || `Account ${item.connectionId?.slice(0, 8)}...` || "Unknown Account";
    case "keyName": return item.keyName || "Unknown Key";
    case "endpoint": return item.endpoint || "Unknown Endpoint";
    default: return item[keyField] || "Unknown";
  }
}

function groupDataByKey(data: any, keyField: any) {
  if (!Array.isArray(data)) return [];
  const groups: Record<string, any> = {};
  data.forEach((item) => {
    const gk = getGroupKey(item, keyField);
    if (!groups[gk]) {
      groups[gk] = {
        groupKey: gk,
        summary: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, totalCost: 0, lastUsed: null, pending: 0 },
        items: [],
      };
    }
    const s = groups[gk].summary;
    s.requests += item.requests || 0;
    s.promptTokens += item.promptTokens || 0;
    s.completionTokens += item.completionTokens || 0;
    s.totalTokens += item.totalTokens || 0;
    s.cost += item.cost || 0;
    s.totalCost += item.totalCost || item.cost || 0;
    s.pending += item.pending || 0;
    if (item.lastUsed && (!s.lastUsed || new Date(item.lastUsed) > new Date(s.lastUsed))) {
      s.lastUsed = item.lastUsed;
    }
    groups[gk].items.push(item);
  });
  return Object.values(groups);
}

const MODEL_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ACCOUNT_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "accountName", label: "Account" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const API_KEY_COLUMNS = [
  { field: "keyName", label: "API Key Name" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ENDPOINT_COLUMNS = [
  { field: "endpoint", label: "Endpoint" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const TABLE_OPTIONS = [
  { value: "model", label: "Usage by Model" },
  { value: "account", label: "Usage by Account" },
  { value: "apiKey", label: "Usage by API Key" },
  { value: "endpoint", label: "Usage by Endpoint" },
];

const PERIODS = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

export default function UsageStats() {
  const { getQueryValue, updateQueryParams } = useUrlQueryControls({
    fallbackPath: "/app/usage",
  });
  const sortBy = getQueryValue("sortBy", "rawModel") || "rawModel";
  const sortOrder = getQueryValue("sortOrder", "asc") || "asc";

  const [liveStats, setLiveStats] = useState(null);
  const [tableView, setTableView] = useState("model");
  const [viewMode, setViewMode] = useState("costs");
  const [period, setPeriod] = useState("7d");
  const providersQuery = useQuery({
    queryKey: queryKeys.providers(),
    queryFn: ({ signal }) => fetchJson<{ connections?: any[] }>("/api/providers", { signal }),
  });
  const statsQuery = useQuery({
    queryKey: queryKeys.usageStats(period),
    queryFn: ({ signal }) => fetchJson(`/api/usage/stats?period=${period}`, { signal }),
  });
  const providers = useMemo(() => {
    const seen = new Set();
    const unique = (providersQuery.data?.connections || []).filter((c) => {
      if (seen.has(c.provider)) return false;
      seen.add(c.provider);
      return true;
    });
    const noAuthProviders = Object.values(FREE_PROVIDERS as any)
      .filter((p: any) => p?.noAuth && !seen.has(p.id))
      .map((p: any) => ({ provider: p.id, name: p.name }));
    return [...unique, ...noAuthProviders];
  }, [providersQuery.data]);
  const stats = useMemo(() => ({ ...((statsQuery.data || {}) as any), ...((liveStats || {}) as any) }), [liveStats, statsQuery.data]);
  const loading = statsQuery.isPending;
  const fetching = statsQuery.isFetching && !statsQuery.isPending;

  // SSE connection - real-time updates for activeRequests + recentRequests only
  useEffect(() => {
    let es: EventSource | null = null;

    function connect() {
      if (es) { es.close(); es = null; }
      if (document.hidden) return;
      es = new EventSource("/api/usage/stream");
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setLiveStats((prev) => ({
            ...(prev || {}),
            activeRequests: data.activeRequests,
            recentRequests: data.recentRequests,
            errorProvider: data.errorProvider,
            pending: data.pending,
          }));
        } catch (err) {
          console.error("[SSE CLIENT] parse error:", err);
        }
      };
      es.onerror = () => undefined;
    }

    function handleVisibility() {
      if (document.hidden) {
        if (es) { es.close(); es = null; }
      } else {
        connect();
      }
    }

    connect();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (es) es.close();
    };
  }, []);

  const toggleSort = useCallback((tableType, field) => {
    if (sortBy === field) {
      updateQueryParams({ sortOrder: sortOrder === "asc" ? "desc" : "asc" });
    } else {
      updateQueryParams({ sortBy: field, sortOrder: "asc" });
    }
  }, [sortBy, sortOrder, updateQueryParams]);

  const topologyProviders = useMemo(() => {
    const merged = new Map();

    for (const provider of providers) {
      const providerId = provider?.provider || provider?.id;
      if (!providerId || merged.has(providerId)) continue;
      merged.set(providerId, provider);
    }

    for (const providerId of Object.keys(stats?.byProvider || {})) {
      if (merged.has(providerId)) continue;
      if (providerId === MORPH_MANAGED_PROVIDER_ID) {
        merged.set(providerId, { provider: providerId, name: "Morph Fast Models" });
        continue;
      }
      merged.set(providerId, { provider: providerId, name: providerId });
    }

    return Array.from(merged.values());
  }, [providers, stats]);

  // Compute active table data
  const activeTableConfig = useMemo(() => {
    if (!stats) return null;
    switch (tableView) {
      case "model": {
        const pendingMap = stats.pending?.byModel || {};
        return {
          columns: MODEL_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byModel, pendingMap, sortBy, sortOrder), "rawModel"),
          storageKey: "usage-stats:expanded-models",
          emptyMessage: "No usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-[var(--color-text-muted)]">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-[var(--color-text-muted)] whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-[var(--color-primary)]" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "default" : "secondary"}>{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-[var(--color-text-muted)] whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "account": {
        const pendingMap: Record<string, number> = {};
        if (stats?.pending?.byAccount) {
          Object.entries(stats.byAccount || {}).forEach(([accountKey, data]: [string, any]) => {
            const connPending = stats.pending.byAccount[data?.connectionId];
            if (connPending) {
              const modelKey = data?.provider ? `${data?.rawModel} (${data?.provider})` : data?.rawModel;
              pendingMap[accountKey] = connPending[modelKey] || 0;
            }
          });
        }
        return {
          columns: ACCOUNT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byAccount, pendingMap, sortBy, sortOrder), "accountName"),
          storageKey: "usage-stats:expanded-accounts",
          emptyMessage: "No account-specific usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-[var(--color-text-muted)]">—</td>
              <td className="px-6 py-3 text-[var(--color-text-muted)]">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-[var(--color-text-muted)] whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-[var(--color-primary)]" : ""}`}>{item.accountName || `Account ${item.connectionId?.slice(0, 8)}...`}</td>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-[var(--color-primary)]" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "default" : "secondary"}>{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-[var(--color-text-muted)] whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "apiKey": {
        return {
          columns: API_KEY_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byApiKey, {}, sortBy, sortOrder), "keyName"),
          storageKey: "usage-stats:expanded-apikeys",
          emptyMessage: "No API key usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-[var(--color-text-muted)]">—</td>
              <td className="px-6 py-3 text-[var(--color-text-muted)]">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-[var(--color-text-muted)] whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium">{item.keyName}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="secondary">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-[var(--color-text-muted)] whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "endpoint":
      default: {
        return {
          columns: ENDPOINT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byEndpoint, {}, sortBy, sortOrder), "endpoint"),
          storageKey: "usage-stats:expanded-endpoints",
          emptyMessage: "No endpoint usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-[var(--color-text-muted)]">—</td>
              <td className="px-6 py-3 text-[var(--color-text-muted)]">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-[var(--color-text-muted)] whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium font-mono text-sm">{item.endpoint}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="secondary">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-[var(--color-text-muted)] whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
    }
  }, [stats, tableView, sortBy, sortOrder]);

  if (statsQuery.isError && !statsQuery.data) {
    return <DataState variant="error" title={translate("Failed to load usage statistics.")} description={translate("Refresh the page and try again.")} />;
  }

  const spinner = (
    <div className="flex items-center justify-center py-12 text-[var(--color-text-muted)]">
      <AppIcon name="progress_activity" size={32} className="animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Period selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">Live telemetry</p>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
            Monitor provider topology, recent activity, and grouped request patterns over your selected time window.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-strong)]/80 p-1 shadow-[var(--shadow-soft)]">
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                disabled={fetching}
                variant={period === p.value ? "default" : "ghost"}
                size="sm"
                className="rounded-[4px]"
              >
                {p.label}
              </Button>
            ))}
          </div>
          {fetching && (
            <AppIcon name="progress_activity" size={16} className="animate-spin text-[var(--color-text-muted)]" />
          )}
        </div>
      </div>

      {/* Overview cards */}
      {loading ? spinner : <OverviewCards stats={stats} />}

      {/* Provider topology + Recent Requests */}
      {loading ? spinner : (
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[2fr_1fr]">
          <ProviderTopology
            providers={topologyProviders}
            activeRequests={stats.activeRequests || []}
            lastProvider={stats.recentRequests?.[0]?.provider || ""}
            errorProvider={stats.errorProvider || ""}
          />
          <RecentRequests requests={stats.recentRequests || []} />
        </div>
      )}

      {/* Token / Cost chart - sync period */}
      {loading ? spinner : <UsageChart period={period} />}

      {/* Table with dropdown selector */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">Breakdown explorer</p>
            <h3 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--color-text-main)]">Grouped request analytics</h3>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={tableView} onValueChange={setTableView}>
              <SelectTrigger className="min-w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TABLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-strong)]/80 p-1 shadow-[var(--shadow-soft)]">
              <Button
                onClick={() => setViewMode("costs")}
                variant={viewMode === "costs" ? "default" : "ghost"}
                size="sm"
                className="rounded-[4px]"
              >
                Costs
              </Button>
              <Button
                onClick={() => setViewMode("tokens")}
                variant={viewMode === "tokens" ? "default" : "ghost"}
                size="sm"
                className="rounded-[4px]"
              >
                Tokens
              </Button>
            </div>
          </div>
        </div>
        {loading ? spinner : activeTableConfig && (
          <UsageTable
            title=""
            columns={activeTableConfig.columns}
            groupedData={activeTableConfig.groupedData}
            tableType={tableView}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onToggleSort={toggleSort}
            viewMode={viewMode}
            storageKey={activeTableConfig.storageKey}
            renderSummaryCells={activeTableConfig.renderSummaryCells}
            renderDetailCells={activeTableConfig.renderDetailCells}
            emptyMessage={activeTableConfig.emptyMessage}
          />
        )}
      </div>
    </div>
  );
}
