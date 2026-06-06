"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ProviderIcon from "@/shared/components/ProviderIcon";
import QuotaTable from "./QuotaTable";
import Pagination from "@/shared/components/Pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Card as ShadcnCard, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";
import { useUrlQueryControls } from "@/shared/hooks";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import {
  getConnectionCentralizedStatus,
  getConnectionFilterStatus,
  getDisplayPlanType,
  normalizeConnectionFilterStatus,
} from "@/lib/connectionStatus";
import { cn } from "@/lib/utils";
import { getQuotaPresentation } from "./utils";
import VerifyAccountBadge from "./VerifyAccountBadge";

const DEFAULT_PAGE_SIZE = 24;

function formatRelativeTime(isoString: string | null) {
  if (!isoString) return null;
  const diff = new Date(isoString).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const minutes = Math.floor(absDiff / 60000);
  const seconds = Math.floor((absDiff % 60000) / 1000);
  if (minutes === 0) {
    const label = `${seconds}s`;
    return diff > 0 ? `in ${label}` : `${label} ago`;
  }
  const label = seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return diff > 0 ? `in ${label}` : `${label} ago`;
}

type WorkerStatus = {
  enabled: boolean;
  intervalMinutes: number;
  startedAt: string | null;
  nextRunAt: string | null;
  running: boolean;
  lastRun: {
    startedAt: string;
    completedAt: string;
    status: string;
    message: string;
    refreshedCount: number;
    errorCount: number;
    totalConnections: number;
  } | null;
};

function UsageWorkerStatusBar() {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/usage-worker/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data);
    } catch {
      // Silently ignore errors
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(fetchStatus, 0);
    intervalRef.current = setInterval(fetchStatus, 30000);
    tickRef.current = setInterval(() => setTick((t) => t + 1), 5000);
    return () => {
      clearTimeout(id);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [fetchStatus]);

  const handleRunNow = useCallback(async () => {
    setTriggering(true);
    try {
      const res = await fetch("/api/usage-worker/status", {
        method: "POST",
        cache: "no-store",
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch {
      // Silently ignore errors
    } finally {
      setTriggering(false);
    }
  }, [fetchStatus]);

  if (!status) return null;

  const runningLabel = status.running ? "running..." : "idle";
  const nextRunLabel = status.nextRunAt ? formatRelativeTime(status.nextRunAt) : null;
  const lastRunLabel = status.lastRun?.completedAt ? formatRelativeTime(status.lastRun.completedAt) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span className="font-medium">Worker:</span>
        {status.running && <Spinner className="size-3" />}
        <span>{runningLabel}</span>
      </span>
      {nextRunLabel && !status.running && (
        <span>Next run {nextRunLabel}</span>
      )}
      {lastRunLabel && status.lastRun && (
        <span>
          Last: {lastRunLabel} ({status.lastRun.refreshedCount} refreshed, {status.lastRun.errorCount} errors)
        </span>
      )}
      <ShadcnButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleRunNow}
        disabled={triggering || status.running}
        className="h-5 px-1.5 text-xs"
      >
        Run Now
      </ShadcnButton>
    </div>
  );
}

function getSupportedOAuthConnections(connections = []) {
  return connections.filter(
    (conn) => USAGE_SUPPORTED_PROVIDERS.includes(conn.provider) && conn.authType === "oauth",
  );
}

function getPlanTypeKey(connection) {
  return typeof connection?.providerSpecificData?.planType === "string"
    ? connection.providerSpecificData.planType.trim().toLowerCase()
    : "";
}

const PLAN_TYPE_RANKS = {
  enterprise: 100,
  business: 90,
  team: 80,
  pro: 70,
  plus: 60,
  go: 50,
  free: 10,
};

function getPlanTypeRank(connection) {
  const planType = getPlanTypeKey(connection);
  return PLAN_TYPE_RANKS[planType] ?? 30;
}

function getCodexAccountKindLabel(connection) {
  if (connection?.provider !== "codex") return null;
  return connection?.providerSpecificData?.isWorkspaceAccount === true ? "Workspace" : null;
}

function getStatusBadgeClass(status) {
  switch (status) {
    case "eligible":
      return "border-emerald-500/35 bg-emerald-500/12 text-emerald-300";
    case "exhausted":
      return "border-amber-500/40 bg-amber-500/12 text-amber-300";
    case "blocked":
      return "border-rose-500/40 bg-rose-500/12 text-rose-300";
    case "disabled":
      return "border-slate-500/35 bg-slate-500/10 text-slate-300";
    case "unknown":
    default:
      return "border-zinc-500/35 bg-zinc-500/10 text-zinc-300";
  }
}

const compactBadgeClass = "h-5 rounded-md border px-1.5 text-[9px] font-semibold uppercase leading-none tracking-[0.12em]";

function filterVisibleConnections(connections = [], searchQuery = "", statusFilter = "all") {
  const query = searchQuery.trim().toLowerCase();

  return connections.filter((conn) => {
    const status = getConnectionFilterStatus(conn);
    const matchesSearch = !query || [conn.provider, conn.name, conn.displayName, conn.email, conn.connectionName, conn.id, getPlanTypeKey(conn), getCodexAccountKindLabel(conn)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
    const matchesStatus = statusFilter === "all" ? true : status === statusFilter;

    return matchesSearch && matchesStatus;
  });
}

function sortConnectionsByProvider(connections = []) {
  return [...connections].sort((a, b) => {
    const orderA = USAGE_SUPPORTED_PROVIDERS.indexOf(a.provider);
    const orderB = USAGE_SUPPORTED_PROVIDERS.indexOf(b.provider);
    if (orderA !== orderB) return orderA - orderB;

    const planRankDiff = getPlanTypeRank(b) - getPlanTypeRank(a);
    if (planRankDiff !== 0) return planRankDiff;

    const planNameDiff = getPlanTypeKey(a).localeCompare(getPlanTypeKey(b));
    if (planNameDiff !== 0) return planNameDiff;

    return a.provider.localeCompare(b.provider);
  });
}

function getCanonicalStatusCounts(connections = []) {
  return connections.reduce((counts, connection) => {
    const status = getConnectionCentralizedStatus(connection);

    switch (status) {
      case "eligible":
      case "exhausted":
      case "blocked":
      case "unknown":
      case "disabled":
        counts[status] += 1;
        break;
      default:
        counts.unknown += 1;
        break;
    }

    return counts;
  }, {
    eligible: 0,
    exhausted: 0,
    blocked: 0,
    unknown: 0,
    disabled: 0,
  });
}

export default function ProviderLimits() {
  const inv = useInvalidate();
  const {
    getQueryValue,
    updateQueryParams,
  } = useUrlQueryControls({
    fallbackPath: "/app/quota",
    normalizers: {
      statusFilter: (value) => {
        const normalizedValue = normalizeConnectionFilterStatus(value || "all");
        return normalizedValue === "all" ? "" : normalizedValue;
      },
      accountTypeFilter: (value) => {
        const normalizedValue = String(value || "all").trim().toLowerCase();
        return normalizedValue === "all" ? "" : normalizedValue;
      },
    },
  });
  const [connections, setConnections] = useState([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);

  const [refreshingConnectionIds, setRefreshingConnectionIds] = useState({});
  const [connectionRefreshErrors, setConnectionRefreshErrors] = useState({});
  const [latestTestResults, setLatestTestResults] = useState({});
  const [togglingId, setTogglingId] = useState(null);
  const [activeCodexAccountId, setActiveCodexAccountId] = useState(null);
  const [activeCodexRotation, setActiveCodexRotation] = useState<{lastRotatedAt: string | null; lastRotatedFrom: string | null; lastRotatedTo: string | null} | null>(null);
  const [activeAntigravityAccountId, setActiveAntigravityAccountId] = useState(null);
  const [testingConnectionIds, setTestingConnectionIds] = useState({});
  const [testResults, setTestResults] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const searchQuery = getQueryValue("searchQuery", "");
  const statusFilter = getQueryValue("statusFilter", "all") || "all";
  const accountTypeFilter = getQueryValue("accountTypeFilter", "all") || "all";

  const fetchConnections = useCallback(async () => {
    const response = await fetch("/api/providers", { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to fetch connections");

    const data = await response.json();
    const connectionList = data.connections || [];
    setConnections(connectionList);
    return connectionList;
  }, []);

  const refreshSharedState = useCallback(async () => {
    try {
      await fetchConnections();
    } catch (error) {
      console.error("Error fetching connections:", error);
      setConnections([]);
    }
  }, [fetchConnections]);

  const fetchLiveTestResults = useCallback(async () => {
    try {
      const response = await fetch("/api/providers/test-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "oauth" }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch connection test results");
      }

      const resultMap = Object.fromEntries(
        (data.results || []).map((result) => [result.connectionId, result])
      );
      setLatestTestResults(resultMap);
      return resultMap;
    } catch (error) {
      console.error("Error fetching live test results:", error);
      return null;
    }
  }, []);

  // Fetch active Antigravity CLI account
  const fetchActiveAntigravityAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/providers/antigravity/auto-switch/active", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setActiveAntigravityAccountId(data?.connectionId || null);
      }
    } catch {
      // Non-critical
    }
  }, []);

  // Fetch active Codex auto-switch account + rotation info
  const fetchActiveCodexAccount = useCallback(async () => {
    try {
      const [activeRes, settingsRes] = await Promise.all([
        fetch("/api/providers/codex/auto-switch/active", { cache: "no-store" }),
        fetch("/api/providers/codex/auto-switch", { cache: "no-store" }),
      ]);
      if (activeRes.ok) {
        const data = await activeRes.json();
        setActiveCodexAccountId(data?.connectionId || null);
      }
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.lastRotatedAt) {
          setActiveCodexRotation({
            lastRotatedAt: settingsData.lastRotatedAt,
            lastRotatedFrom: settingsData.lastRotatedFrom || null,
            lastRotatedTo: settingsData.lastRotatedTo || null,
          });
        } else {
          setActiveCodexRotation(null);
        }
      }
    } catch {
      // Non-critical — just skip
    }
  }, []);

  useEffect(() => {
    const initializeData = async () => {
      setConnectionsLoading(true);
      await refreshSharedState();
      await fetchLiveTestResults();
      await fetchActiveCodexAccount();
      await fetchActiveAntigravityAccount();
      setConnectionsLoading(false);
    };

    initializeData();

    // Poll for Codex + Antigravity active account changes every 30s
    const pollInterval = setInterval(() => {
      fetchActiveCodexAccount();
      fetchActiveAntigravityAccount();
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [fetchLiveTestResults, refreshSharedState, fetchActiveCodexAccount, fetchActiveAntigravityAccount]);

  const testConnection = useCallback(async (connectionId: string) => {
    if (!connectionId) return;
    setTestingConnectionIds((prev) => ({ ...prev, [connectionId]: true }));
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[connectionId];
      return next;
    });

    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(connectionId)}/test`, {
        method: "POST",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setTestResults((prev) => ({
          ...prev,
          [connectionId]: {
            valid: false,
            error: data.error || "Test failed",
            testedAt: new Date().toISOString(),
          },
        }));
        return;
      }

      setTestResults((prev) => ({
        ...prev,
        [connectionId]: {
          valid: data.valid === true,
          error: data.error || null,
          testedAt: new Date().toISOString(),
        },
      }));

      // Auto-clear test result after 5 seconds
      setTimeout(() => {
        setTestResults((prev) => {
          const next = { ...prev };
          delete next[connectionId];
          return next;
        });
      }, 5000);
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [connectionId]: {
          valid: false,
          error: error?.message || "Test failed",
          testedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setTestingConnectionIds((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
    }
  }, []);

  const toggleActiveMutation = useMutation({
    retry: false,
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to update connection status");
      return { id, isActive };
    },
    onSuccess: (_data, { id, isActive }) => {
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isActive } : c)),
      );
      inv.providers();
    },
    onSettled: () => setTogglingId(null),
  });

  const setCodexActiveMutation = useMutation({
    retry: false,
    mutationFn: async (connectionId: string) => {
      const res = await fetch("/api/providers/codex/auto-switch/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (!res.ok) throw new Error("Failed to switch Codex account");
      return res.json();
    },
    onSuccess: (data, connectionId) => {
      setActiveCodexAccountId(connectionId);
      inv.providerAutoSwitch("codex");
    },
  });

  const setAntigravityActiveMutation = useMutation({
    retry: false,
    mutationFn: async (connectionId: string) => {
      const res = await fetch("/api/providers/antigravity/auto-switch/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (!res.ok) throw new Error("Failed to switch Antigravity account");
      return res.json();
    },
    onSuccess: (data, connectionId) => {
      setActiveAntigravityAccountId(connectionId);
      inv.providerAutoSwitch("antigravity");
    },
  });

  const handleToggleConnectionActive = useCallback((id: string, isActive: boolean) => {
    setTogglingId(id);
    toggleActiveMutation.mutate({ id, isActive });
  }, [toggleActiveMutation]);

  const refreshConnectionUsage = useCallback(async (connectionId, opts: { force?: boolean } = {}) => {
    if (!connectionId) return;
    const { force = false } = opts;

    setRefreshingConnectionIds((prev) => ({
      ...prev,
      [connectionId]: true,
    }));
    setConnectionRefreshErrors((prev) => {
      if (!prev[connectionId]) return prev;

      const next = { ...prev };
      delete next[connectionId];
      return next;
    });

    try {
      const qs = force ? "?force=1" : "?test=1";
      const response = await fetch(`/api/usage/${encodeURIComponent(connectionId)}${qs}`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = data.testResult?.error || data.error || "Failed to refresh usage";
        if (data.testResult) {
          setLatestTestResults((prev) => ({
            ...prev,
            [connectionId]: {
              connectionId,
              valid: data.testResult.valid === true,
              error: errorMessage,
              testedAt: data.testResult.testedAt || new Date().toISOString(),
            },
          }));
        }
        // Don't throw — store error in state so the UI shows a dismissible alert
        setConnectionRefreshErrors((prev) => ({
          ...prev,
          [connectionId]: errorMessage,
        }));
        return;
      }

      if (data.skipped && data.skipReason === "transient_connectivity_error") {
        return;
      }

      if (data.skipped && data.skipReason === "usage_quota_unavailable") {
        return;
      }

      const testResult = data.testResult || {
        connectionId,
        valid: true,
        error: null,
      };

      const refreshedAt = new Date().toISOString();
      setConnections((prev) => prev.map((connection) => (
        connection.id === connectionId
          ? {
              ...connection,
              ...(data.usage ? { usageSnapshot: data.usage } : {}),
              lastUsageRefresh: refreshedAt,
              lastCheckedAt: refreshedAt,
              reasonDetail: testResult.error || null,
            }
          : connection
      )));

      setLatestTestResults((prev) => ({
        ...prev,
        [connectionId]: {
          connectionId,
          valid: testResult.valid !== false,
          error: testResult.error || null,
          testedAt: testResult.testedAt || new Date().toISOString(),
        },
      }));

      // Clear stale test-button results for this connection after refresh
      setTestResults((prev) => {
        if (!prev[connectionId]) return prev;
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });

    } catch (error) {
      console.error(`Error refreshing usage for connection ${connectionId}:`, error);
      setConnectionRefreshErrors((prev) => ({
        ...prev,
        [connectionId]: error.message || "Failed to refresh usage",
      }));
    } finally {
      setRefreshingConnectionIds((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
    }
  }, []);



  const supportedConnections = useMemo(
    () => getSupportedOAuthConnections(connections),
    [connections],
  );

  const searchMatchedConnections = useMemo(
    () => filterVisibleConnections(supportedConnections, searchQuery, "all"),
    [searchQuery, supportedConnections],
  );

  const visibleConnections = useMemo(
    () => {
      const statusFiltered = filterVisibleConnections(searchMatchedConnections, "", statusFilter);
      if (accountTypeFilter === "all") return statusFiltered;
      return statusFiltered.filter((conn) => getPlanTypeKey(conn) === accountTypeFilter);
    },
    [searchMatchedConnections, statusFilter, accountTypeFilter],
  );

  const availableAccountTypeOptions = useMemo(() => {
    const optionMap = new Map();
    for (const conn of supportedConnections) {
      const raw = conn?.providerSpecificData?.planType;
      const normalized = getPlanTypeKey(conn);
      if (!normalized) continue;
      if (!optionMap.has(normalized)) {
        optionMap.set(normalized, { value: normalized, label: raw.trim() });
      }
    }
    return [{ value: "all", label: "All types" }, ...optionMap.values()];
  }, [supportedConnections]);

  const sortedConnections = useMemo(
    () => sortConnectionsByProvider(visibleConnections),
    [visibleConnections],
  );

  const totalPages = Math.max(1, Math.ceil(sortedConnections.length / DEFAULT_PAGE_SIZE));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const paginatedConnections = sortedConnections.slice(
    (currentPageSafe - 1) * DEFAULT_PAGE_SIZE,
    currentPageSafe * DEFAULT_PAGE_SIZE,
  );

  const quotaCards = useMemo(
    () => supportedConnections.map((conn) => ({
      connection: conn,
      quota: getQuotaPresentation(conn, latestTestResults[conn.id] || null),
    })),
    [latestTestResults, supportedConnections],
  );

  const visibleQuotaCards = useMemo(() => {
    const quotaCardsById = new Map(quotaCards.map((card) => [card.connection.id, card]));

    return visibleConnections
      .map((connection) => quotaCardsById.get(connection.id))
      .filter(Boolean);
  }, [quotaCards, visibleConnections]);

  const activeWithLimits = visibleQuotaCards.filter(
    ({ quota }) => quota.quotas.length > 0,
  ).length;

  const canonicalStatusCounts = useMemo(
    () => getCanonicalStatusCounts(supportedConnections),
    [supportedConnections],
  );



  if (!connectionsLoading && supportedConnections.length === 0) {
    return (
      <ShadcnCard>
        <CardContent className="py-10">
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <AppIcon name="cloud_off" />
              </EmptyMedia>
              <EmptyTitle>No providers connected</EmptyTitle>
              <EmptyDescription>Connect to providers with OAuth to observe backend-maintained API quota state.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </ShadcnCard>
    );
  }

  return (
    <div className="space-y-6">
      <ShadcnCard>
        <CardHeader>
          <div className="space-y-3">
            <div>
              <CardTitle>Provider Limits</CardTitle>
              <CardDescription className="mt-1">
                Read-only observer of backend-maintained shared quota state.
              </CardDescription>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <ShadcnBadge variant="secondary">
                  {sortedConnections.length} matching {sortedConnections.length === 1 ? "connection" : "connections"}
                </ShadcnBadge>
                <ShadcnBadge variant="outline">
                  {activeWithLimits} with quota data
                </ShadcnBadge>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <ShadcnBadge variant="outline">{canonicalStatusCounts.eligible} eligible</ShadcnBadge>
                <ShadcnBadge variant="outline">{canonicalStatusCounts.exhausted} exhausted</ShadcnBadge>
                <ShadcnBadge variant="destructive">{canonicalStatusCounts.blocked} blocked</ShadcnBadge>
                <ShadcnBadge variant="secondary">{canonicalStatusCounts.disabled} disabled</ShadcnBadge>
                <ShadcnBadge variant="secondary">{canonicalStatusCounts.unknown} unknown</ShadcnBadge>
              </div>

              <UsageWorkerStatusBar />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto] lg:items-end">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="quota-search">Search accounts</Label>
              <div className="relative">
                <AppIcon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <ShadcnInput
                  id="quota-search"
                  value={searchQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCurrentPage(1);
                    updateQueryParams({ searchQuery: value.trim() ? value : null });
                  }}
                  placeholder="Search by name, provider, email, or id"
                  className="pl-10"
                />
              </div>
            </div>

            <div className="grid min-w-0 gap-2">
              <Label>Status</Label>
              <ShadcnSelect
                value={statusFilter}
                onValueChange={(nextValue) => {
                  const normalizedValue = normalizeConnectionFilterStatus(nextValue);
                  setCurrentPage(1);
                  updateQueryParams({ statusFilter: normalizedValue === "all" ? null : normalizedValue });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="eligible">Eligible</SelectItem>
                  <SelectItem value="exhausted">Exhausted</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </ShadcnSelect>
            </div>

            {availableAccountTypeOptions.length > 1 && (
              <div className="grid min-w-0 gap-2">
                <Label>Account type</Label>
                <ShadcnSelect
                  value={accountTypeFilter}
                  onValueChange={(nextValue) => {
                    setCurrentPage(1);
                    updateQueryParams({ accountTypeFilter: nextValue === "all" ? null : nextValue });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAccountTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </ShadcnSelect>
              </div>
            )}


          </div>


        </CardContent>
      </ShadcnCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {paginatedConnections.map((conn) => {
          const quota = getQuotaPresentation(conn, latestTestResults[conn.id] || null);
          const isInactive = conn.isActive === false;
          const rowBusy = togglingId === conn.id;
          const isRefreshingConnection = Boolean(refreshingConnectionIds[conn.id]);
          const connectionRefreshError = connectionRefreshErrors[conn.id] || "";
          const codexAccountKind = getCodexAccountKindLabel(conn);
          const planLabel = getDisplayPlanType(conn);
          const connectionStatus = getConnectionCentralizedStatus(conn);
          const quotaToneClass = quota.quotas?.length > 0
            ? "border-[var(--color-success)]/40 bg-[var(--color-success-soft)] text-[var(--color-success)]"
            : quota.message
              ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
              : "border-border bg-muted/40 text-muted-foreground";

          const isActiveCodexAccount = conn.provider === "codex" && activeCodexAccountId === conn.id;
          const codexRotationTime = isActiveCodexAccount && activeCodexRotation?.lastRotatedAt
            ? formatRelativeTime(activeCodexRotation.lastRotatedAt)
            : null;
          const isActiveAntigravityAccount = conn.provider === "antigravity" && activeAntigravityAccountId === conn.id;

          return (
            <ShadcnCard
              key={conn.id}
              className={`min-w-0 gap-0 overflow-hidden ${isInactive ? "opacity-60" : ""} ${isActiveCodexAccount ? "ring-1 ring-emerald-500/30" : ""} ${isActiveAntigravityAccount ? "ring-1 ring-primary/30" : ""}`}
            >
              <CardHeader className="flex-col gap-2 border-b border-border px-3 py-3 sm:px-4">
                {/* Identity row: provider icon, title, account-type badge(s), and status badge */}
                <div className="flex items-start gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md">
                    <ProviderIcon
                      src={conn.provider}
                      alt={conn.provider}
                      size={32}
                      className="object-contain"
                      fallbackText={conn.provider?.slice(0, 2).toUpperCase() || "PR"}
                      fallbackColor="var(--color-primary)"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CardTitle className="truncate text-sm capitalize">
                        {conn.provider}
                      </CardTitle>
                      {planLabel && (
                        <ShadcnBadge variant="secondary" className={compactBadgeClass}>
                          {planLabel}
                        </ShadcnBadge>
                      )}
                      {codexAccountKind && (
                        <ShadcnBadge variant="default" className={compactBadgeClass}>
                          {codexAccountKind}
                        </ShadcnBadge>
                      )}
                      {isActiveCodexAccount && (
                        <ShadcnBadge variant="default" className={cn(compactBadgeClass, "border-emerald-500/40 bg-emerald-500/12 text-emerald-400")}>
                          Active
                        </ShadcnBadge>
                      )}
                      {isActiveAntigravityAccount && (
                        <ShadcnBadge variant="default" className={cn(compactBadgeClass, "border-primary/40 bg-primary/12 text-primary")}>
                          Active
                        </ShadcnBadge>
                      )}
                    </div>
                    {conn.name && (
                      <p className="truncate text-xs text-muted-foreground">
                        {conn.name}
                      </p>
                    )}
                  </div>
                  <ShadcnBadge
                    variant="outline"
                    title="Current provider account status"
                    className={cn(compactBadgeClass, getStatusBadgeClass(connectionStatus), "shrink-0")}
                  >
                    {connectionStatus}
                  </ShadcnBadge>
                  {conn.validationUrl && (
                    <VerifyAccountBadge
                      validationUrl={conn.validationUrl}
                      provider={conn.provider}
                      className="shrink-0"
                    />
                  )}
                </div>

                {/* Action row: kept on its own line so controls never overlap the badges on mobile */}
                <div className="flex items-center justify-end gap-0.5">
                  <ShadcnButton
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => refreshConnectionUsage(conn.id)}
                    disabled={rowBusy || isRefreshingConnection}
                    title="Refresh quota"
                    aria-label="Refresh quota"
                    className="size-8 text-muted-foreground"
                  >
                    {isRefreshingConnection ? <Spinner className="size-4" /> : <AppIcon name="refresh" data-icon="inline-start" />}
                  </ShadcnButton>
                  {(connectionStatus === "blocked" || connectionStatus === "exhausted" || connectionStatus === "unknown") && (
                    <ShadcnButton
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => refreshConnectionUsage(conn.id, { force: true })}
                      disabled={rowBusy || isRefreshingConnection}
                      title="Force re-check (reset backoff)"
                      aria-label="Force re-check"
                      className="size-8 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                    >
                      <AppIcon name="refresh" data-icon="inline-start" className="animate-pulse" />
                    </ShadcnButton>
                  )}
                  <ShadcnButton
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => testConnection(conn.id)}
                    disabled={rowBusy || Boolean(testingConnectionIds[conn.id])}
                    title="Test account"
                    aria-label="Test account"
                    className="size-8 text-muted-foreground"
                  >
                    {testingConnectionIds[conn.id] ? <Spinner className="size-4" /> : <AppIcon name="checkcircle" data-icon="inline-start" />}
                  </ShadcnButton>
                  {conn.provider === "codex" && !isActiveCodexAccount && (
                    <ShadcnButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCodexActiveMutation.mutate(conn.id)}
                      disabled={rowBusy || setCodexActiveMutation.isPending}
                      title="Set as active Codex account"
                      className="h-8 px-2 text-xs"
                    >
                      {setCodexActiveMutation.isPending && setCodexActiveMutation.variables === conn.id ? <Spinner className="size-3 mr-1" /> : <AppIcon name="stars" data-icon="inline-start" className="mr-1 text-emerald-500" />}
                      Set Active
                    </ShadcnButton>
                  )}
                  {conn.provider === "antigravity" && !isActiveAntigravityAccount && (
                    <ShadcnButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAntigravityActiveMutation.mutate(conn.id)}
                      disabled={rowBusy || setAntigravityActiveMutation.isPending}
                      title="Set as active Antigravity CLI account"
                      className="h-8 px-2 text-xs"
                    >
                      {setAntigravityActiveMutation.isPending && setAntigravityActiveMutation.variables === conn.id ? <Spinner className="size-3 mr-1" /> : <AppIcon name="stars" data-icon="inline-start" className="mr-1 text-primary" />}
                      Set Active
                    </ShadcnButton>
                  )}
                  <div
                    className="inline-flex h-8 items-center pl-1"
                    title={(conn.isActive ?? true) ? "Disable connection" : "Enable connection"}
                  >
                    <Switch
                      size="sm"
                      checked={conn.isActive ?? true}
                      disabled={rowBusy}
                      onToggle={(nextActive) => handleToggleConnectionActive(conn.id, nextActive)}
                      aria-label={(conn.isActive ?? true) ? "Disable connection" : "Enable connection"}
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-3 py-3">
                {connectionRefreshError && (
                  <Alert variant="destructive" className="mb-3">
                    <AlertDescription>{connectionRefreshError}</AlertDescription>
                  </Alert>
                )}
                {testResults[conn.id] && (
                  <Alert variant={testResults[conn.id].valid ? "default" : "destructive"} className="mb-3">
                    <AlertDescription>
                      {testResults[conn.id].valid
                        ? "Connection test passed."
                        : `Test failed: ${testResults[conn.id].error || "Unknown error"}`}
                    </AlertDescription>
                  </Alert>
                )}
                {isActiveCodexAccount && codexRotationTime && (
                  <p className="text-[11px] text-muted-foreground/70 mb-2">
                    Auto-switch rotation {codexRotationTime}
                  </p>
                )}
                {quota.quotas?.length > 0 ? (
                  <QuotaTable quotas={quota.quotas} compact provider={conn.provider} />
                ) : quota.message ? (
                  <Alert className="text-xs">
                    <AlertDescription>{quota.message}</AlertDescription>
                  </Alert>
                ) : (
                  <Alert className={cn("text-xs", quotaToneClass)}>
                    <AlertDescription>
                      No quota details available for this account yet.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </ShadcnCard>
          );
        })}
      </div>

      {sortedConnections.length > 0 && (
        <Pagination
          className="mt-2"
          currentPage={currentPageSafe}
          pageSize={DEFAULT_PAGE_SIZE}
          totalItems={sortedConnections.length}
          onPageChange={(page) => setCurrentPage(Math.max(1, Math.min(page, totalPages)))}
          onPageSizeChange={() => {}}
        />
      )}


    </div>
  );
}
