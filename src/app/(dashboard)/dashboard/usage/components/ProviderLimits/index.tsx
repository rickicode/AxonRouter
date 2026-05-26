"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
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
import { EditConnectionModal } from "@/shared/components";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";
import { useUrlQueryControls } from "@/shared/hooks";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import {
  getConnectionCentralizedStatus,
  getConnectionFilterStatus,
  normalizeConnectionFilterStatus,
} from "@/lib/connectionStatus";
import { cn } from "@/lib/utils";
import { getQuotaPresentation } from "./utils";

const DEFAULT_PAGE_SIZE = 24;

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
  const router = useRouter();
  const inv = useInvalidate();
  const {
    getQueryValue,
    updateQueryParams,
  } = useUrlQueryControls({
    fallbackPath: "/dashboard/quota",
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
  const [refreshActionError, setRefreshActionError] = useState("");
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingConnectionIds, setRefreshingConnectionIds] = useState({});
  const [connectionRefreshErrors, setConnectionRefreshErrors] = useState({});
  const [latestTestResults, setLatestTestResults] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [proxyPools, setProxyPools] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const searchQuery = getQueryValue("searchQuery", "");
  const statusFilter = getQueryValue("statusFilter", "eligible") || "eligible";
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

  useEffect(() => {
    const initializeData = async () => {
      setConnectionsLoading(true);
      await refreshSharedState();
      await fetchLiveTestResults();
      setConnectionsLoading(false);
    };

    initializeData();
  }, [fetchLiveTestResults, refreshSharedState]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/proxy-pools?isActive=true", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.proxyPools) {
          setProxyPools(data.proxyPools);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const deleteConnectionMutation = useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete connection");
    },
    onSuccess: (_data, id) => {
      setConnections((prev) => prev.filter((c) => c.id !== id));
      inv.providers();
    },
    onSettled: () => setDeletingId(null),
  });

  const handleDeleteConnection = useCallback((id: string) => {
    if (!confirm("Delete this connection?")) return;
    setDeletingId(id);
    deleteConnectionMutation.mutate(id);
  }, [deleteConnectionMutation]);

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

  const handleToggleConnectionActive = useCallback((id: string, isActive: boolean) => {
    setTogglingId(id);
    toggleActiveMutation.mutate({ id, isActive });
  }, [toggleActiveMutation]);

  const updateConnectionMutation = useMutation({
    retry: false,
    mutationFn: async ({ connectionId, formData }: { connectionId: string; formData: any }) => {
      const res = await fetch(`/api/providers/${connectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to save connection");
    },
    onSuccess: async () => {
      await fetchConnections();
      setShowEditModal(false);
      setSelectedConnection(null);
      inv.providers();
    },
  });

  const handleUpdateConnection = useCallback(
    (formData: any) => {
      if (!selectedConnection?.id) return;
      updateConnectionMutation.mutate({ connectionId: selectedConnection.id, formData });
    },
    [selectedConnection, updateConnectionMutation],
  );

  const refreshConnectionUsage = useCallback(async (connectionId) => {
    if (!connectionId) return;

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
      const response = await fetch(`/api/usage/${encodeURIComponent(connectionId)}?test=1`, {
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

      await refreshSharedState();
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
  }, [refreshSharedState]);

  const refreshAll = useCallback(async () => {
    setRefreshingAll(true);
    setRefreshActionError("");

    try {
      const eligible = getSupportedOAuthConnections(connections);
      if (eligible.length === 0) return;

      await Promise.allSettled(
        eligible.map((conn) => refreshConnectionUsage(conn.id)),
      );

      await refreshSharedState();
    } catch (error) {
      console.error("Error refreshing all connections:", error);
      setRefreshActionError(error.message || "Failed to refresh all connections");
    } finally {
      setRefreshingAll(false);
    }
  }, [connections, refreshConnectionUsage, refreshSharedState]);

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

  const refreshButtonLabel = "Refresh All";

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

            <ShadcnButton
              type="button"
              size="sm"
              variant="secondary"
              onClick={refreshAll}
              disabled={refreshingAll}
              className="w-full lg:w-auto"
              title="Refresh usage for all connections"
            >
              <AppIcon name="refresh" data-icon="inline-start" className={refreshingAll ? "animate-spin" : undefined} />
              {refreshButtonLabel}
            </ShadcnButton>
          </div>

          {refreshActionError && (
            <Alert variant="destructive" className="flex items-center gap-2">
              <AlertDescription>{refreshActionError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </ShadcnCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {paginatedConnections.map((conn) => {
          const quota = getQuotaPresentation(conn, latestTestResults[conn.id] || null);
          const isInactive = conn.isActive === false;
          const rowBusy = deletingId === conn.id || togglingId === conn.id;
          const isRefreshingConnection = Boolean(refreshingConnectionIds[conn.id]);
          const connectionRefreshError = connectionRefreshErrors[conn.id] || "";
          const codexPlanType = conn.providerSpecificData?.planType || null;
          const codexAccountKind = getCodexAccountKindLabel(conn);
          const connectionStatus = getConnectionCentralizedStatus(conn);
          const quotaToneClass = quota.quotas?.length > 0
            ? "border-[var(--color-success)]/40 bg-[var(--color-success-soft)] text-[var(--color-success)]"
            : quota.message
              ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
              : "border-border bg-muted/40 text-muted-foreground";

          return (
            <ShadcnCard
              key={conn.id}
              className={`min-w-0 gap-0 overflow-hidden ${isInactive ? "opacity-60" : ""}`}
            >
              <CardHeader className="relative border-b border-border px-4 py-3 pr-36">
                <div className="flex min-w-0 items-center gap-2">
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
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="truncate text-sm capitalize">
                          {conn.provider}
                        </CardTitle>
                        {codexPlanType && (
                          <ShadcnBadge
                            variant="secondary"
                            className={compactBadgeClass}
                          >
                            {codexPlanType}
                          </ShadcnBadge>
                        )}
                        {codexAccountKind && (
                          <ShadcnBadge
                            variant="default"
                            className={compactBadgeClass}
                          >
                            {codexAccountKind}
                          </ShadcnBadge>
                        )}
                      </div>
                      {conn.name && (
                        <p className="truncate text-xs text-muted-foreground">
                          {conn.name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="absolute right-3 top-3 flex items-center gap-1">
                    <ShadcnBadge
                      variant="outline"
                      title="Current provider account status"
                      className={cn(compactBadgeClass, getStatusBadgeClass(connectionStatus))}
                    >
                      {connectionStatus}
                    </ShadcnBadge>
                    <div className="flex items-center gap-0.5">
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
                      <ShadcnButton
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedConnection(conn);
                          setShowEditModal(true);
                        }}
                        disabled={rowBusy}
                        title="Edit connection"
                        aria-label="Edit connection"
                        className="size-8 text-muted-foreground"
                      >
                        <AppIcon name="edit" data-icon="inline-start" />
                      </ShadcnButton>
                      <ShadcnButton
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteConnection(conn.id)}
                        disabled={rowBusy}
                        title="Delete connection"
                        aria-label="Delete connection"
                        className="size-8 text-destructive hover:bg-destructive/10"
                      >
                        {deletingId === conn.id ? <Spinner className="size-4" /> : <AppIcon name="delete" data-icon="inline-start" />}
                      </ShadcnButton>
                    </div>
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

      <EditConnectionModal
        isOpen={showEditModal}
        connection={selectedConnection}
        connections={connections}
        proxyPools={proxyPools}
        onSave={handleUpdateConnection}
        onClose={() => {
          setShowEditModal(false);
          setSelectedConnection(null);
        }}
      />
    </div>
  );
}
