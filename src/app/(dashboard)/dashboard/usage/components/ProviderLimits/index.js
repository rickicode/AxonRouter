"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import ProviderIcon from "@/shared/components/ProviderIcon";
import QuotaTable from "./QuotaTable";
import Toggle from "@/shared/components/Toggle";
import Tooltip from "@/shared/components/Tooltip";
import {
 parseQuotaData,
 calculatePercentage,
 filterQuotasByVisibility,
 formatFreebucksHeader,
 getHiddenQuotaRows,
 getQuotaVisibilityKey,
 getConnectionLabel,
 getConnectionQuotaRemaining,
 sortVisibleConnections,
 buildLoadingState,
 filterQuotaStateByConnections,
 getConnectionsEmptyMessage,
 getPageSizeLabel,
 getConnectionsPaginationSummary,
 getSafePagination,
 getSafeTotals,
 shouldResetPage,
 getPaginationPageValue,
 getProviderOptions,
 reconcileConnectionsPage,
 getQuotaCache,
 setQuotaCache,
 getEffectiveConnectionStatus,
 QUOTA_CACHE_KEY,
 REFRESH_INTERVAL_MS,
 CLAUDE_REFRESH_INTERVAL_MS,
 DEPLETED_QUOTA_THRESHOLD,
 AUTO_REFRESH_STORAGE_KEY,
 CONNECTIONS_PAGE_SIZE,
 ACCOUNT_PAGE_SIZE_OPTIONS,
 ACCOUNT_PAGE_SIZE_MAX,
 ACCOUNT_FILTER_OPTIONS,
 QUOTA_SORT_OPTIONS,
} from "./utils";
import Card from "@/shared/components/Card";
import { ConfirmModal, EditConnectionModal, Badge, CardSkeleton, Button } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import { getStatusVariant } from "@/shared/utils/connectionStatus";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import Icon from "@/shared/components/Icon";
// Maps the stored providerSpecificData.authMethod to a human label for Kiro.
// Values come from the Kiro connect flows: builder-id/idc (device code),
// google/github (social), imported (refresh-token paste), api_key (headless).
const KIRO_METHOD_LABELS = {
 "builder-id": "AWS Builder ID",
 idc: "IAM Identity Center",
 google: "Google",
 github: "GitHub",
 imported: "Imported Token",
 api_key: "API Key",
};

const AUTO_PING_SETTINGS_KEYS = {
 claude: "claudeAutoPing",
 codex: "codexAutoPing",
};

const AUTO_PING_TOOLTIPS = {
 claude: "When your 5h quota runs out, auto-sends a request the moment it resets so a new window starts right away.",
 codex: "Auto-starts the next 5h Codex window after reset by sending a tiny gpt-5.5 request. Consumes a small amount of quota.",
};

function kiroMethodLabel(conn) {
 const m = conn.providerSpecificData?.authMethod;
 if (m && KIRO_METHOD_LABELS[m]) return KIRO_METHOD_LABELS[m];
 return conn.authType === "api_key" ? "API Key" : "OAuth";
}

function getConnectionSecondaryLabel(connection) {
 if (connection.name?.trim() && connection.email?.trim() && connection.name.trim() !== connection.email.trim()) {
 return connection.email.trim();
 }

 if (connection.name?.trim() && connection.displayName?.trim() && connection.name.trim() !== connection.displayName.trim()) {
 return connection.displayName.trim();
 }

 return null;
}

// Region is stored for builder-id/idc/api_key flows; social and imported flows
// omit it, so fall back to the region segment of the profileArn
// (arn:aws:codewhisperer:<region>:...).
function kiroRegion(conn) {
 const r = conn.providerSpecificData?.region;
 if (r) return r;
 const arn = conn.providerSpecificData?.profileArn;
 const seg = typeof arn === "string" ? arn.split(":")[3] : "";
 return seg || "";
}

function getCodexResetCreditCount(quota) {
 const value = quota?.raw?.resetCredits?.availableCount;
 const count = typeof value === "number" ? value : Number(value);
 return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function formatCreditDate(value) {
 if (!value) return "N/A";
 const date = new Date(value);
 if (!Number.isFinite(date.getTime())) return "N/A";
 return date.toLocaleString(undefined, {
 month: "short",
 day: "numeric",
 year: "numeric",
 hour: "numeric",
 minute: "2-digit",
 });
}

function formatTimeRemaining(value) {
 if (!value) return "N/A";
 const diffMs = new Date(value).getTime() - Date.now();
 if (!Number.isFinite(diffMs)) return "N/A";
 if (diffMs <= 0) return "Expired";
 const totalHours = Math.ceil(diffMs / (60 * 60 * 1000));
 const days = Math.floor(totalHours / 24);
 const hours = totalHours % 24;
 return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

export default function ProviderLimits() {
 const { copied, copy } = useCopyToClipboard();
 const searchParams = useSearchParams();
 const router = useRouter();
 const pathname = usePathname();

 // Reflect filter state into the URL so the view is shareable/bookmarkable and
 // survives reloads. Read once on mount; the setters below also push updates.
 const [connections, setConnections] = useState([]);
 const [quotaData, setQuotaData] = useState({});
 const [loading, setLoading] = useState({});
 const [errors, setErrors] = useState({});
 const [autoRefresh, setAutoRefresh] = useState(true);
 const [autoPingMaps, setAutoPingMaps] = useState({ claude: {}, codex: {} });
 const [lastUpdated, setLastUpdated] = useState(null);
 const [hasHydratedAutoRefresh, setHasHydratedAutoRefresh] = useState(false);
 const [refreshingAll, setRefreshingAll] = useState(false);
 const [countdown, setCountdown] = useState(60);
 const [connectionsLoading, setConnectionsLoading] = useState(true);
 const [deletingId, setDeletingId] = useState(null);
 const [togglingId, setTogglingId] = useState(null);
 const [resettingLimitId, setResettingLimitId] = useState(null);
 const [resetConfirmState, setResetConfirmState] = useState(null);
 const [resetCreditsState, setResetCreditsState] = useState(null);
 const [showEditModal, setShowEditModal] = useState(false);
 const [selectedConnection, setSelectedConnection] = useState(null);
 const [proxyPools, setProxyPools] = useState([]);
 const [providerFilter, setProviderFilter] = useState(
 () => searchParams.get("provider") || "all",
 );
 const [providerOptions, setProviderOptions] = useState([]);
 const [accountFilter, setAccountFilter] = useState(
 () => searchParams.get("account") || "all",
 );
 const [quotaSortMode, setQuotaSortMode] = useState(
 () => searchParams.get("sort") || "default",
 );
 const [quotaVisibility, setQuotaVisibility] = useState({});
 const [expiringFirst, setExpiringFirst] = useState(false);
 const [providerMenuOpen, setProviderMenuOpen] = useState(false);
 const [bulkToggling, setBulkToggling] = useState(false);
 const [openMenuConnectionId, setOpenMenuConnectionId] = useState(null);
 const [searchQuery, setSearchQuery] = useState("");
 const [debouncedSearch, setDebouncedSearch] = useState("");
 const headerSearchQuery = useHeaderSearchStore((s) => s.query);
 const registerSearch = useHeaderSearchStore((s) => s.register);
 const unregisterSearch = useHeaderSearchStore((s) => s.unregister);
 const setHeaderSearchQuery = useHeaderSearchStore((s) => s.setQuery);
 const notify = useNotificationStore();

 useEffect(() => {
 registerSearch("Search accounts...");
 return () => unregisterSearch();
 }, [registerSearch, unregisterSearch]);

 useEffect(() => {
 if (headerSearchQuery !== searchQuery) {
 setSearchQuery(headerSearchQuery);
 }
 }, [headerSearchQuery, searchQuery]);

 useEffect(() => {
 const timer = setTimeout(() => {
 const trimmed = searchQuery.trim();
 setDebouncedSearch((prev) => {
 if (prev !== trimmed) {
 setPage(1);
 }
 return trimmed;
 });
 }, 300);
 return () => clearTimeout(timer);
 }, [searchQuery]);
 const [page, setPage] = useState(1);
 const [pageSize, setPageSize] = useState(CONNECTIONS_PAGE_SIZE);
 const [customPageSizeInput, setCustomPageSizeInput] = useState(
 String(CONNECTIONS_PAGE_SIZE),
 );
 const [pagination, setPagination] = useState({
 page: 1,
 pageSize: CONNECTIONS_PAGE_SIZE,
 total: 0,
 totalPages: 1,
 });
 const [totals, setTotals] = useState({
 eligibleConnections: 0,
 providerFilteredConnections: 0,
 });
 const [statusCounts, setStatusCounts] = useState({
 total: 0,
 active: 0,
 exhausted: 0,
 unavailable: 0,
 disabled: 0,
 });

 const intervalRef = useRef(null);
 const countdownRef = useRef(null);
 const tickCountRef = useRef(0);

 const fetchConnections = useCallback(
 async (targetPage = page) => {
 try {
 const params = new URLSearchParams({
 page: String(targetPage),
 pageSize: String(pageSize),
 accountStatus: accountFilter,
 sort: "priority",
 });
 if (providerFilter !== "all") {
 params.set("provider", providerFilter);
 }

 if (debouncedSearch) {
 params.set("search", debouncedSearch);
 }

 params.set("_t", String(Date.now()));
 const response = await fetch(
 `/api/providers/client?${params.toString()}`,
 { cache: "no-store" },
 );
 if (!response.ok) throw new Error("Failed to fetch connections");

 const data = await response.json();
 const connectionList = data.connections || [];
 const nextPagination = getSafePagination(data.pagination, pageSize);
 const nextTotals = getSafeTotals(data.totals, connectionList.length);

 setConnections(connectionList);
 setProviderOptions(getProviderOptions(data.providerOptions));
 setPagination(nextPagination);
 setTotals(nextTotals);
 setPage(getPaginationPageValue(data.pagination, targetPage));
 if (data.statusCounts) {
 setStatusCounts(data.statusCounts);
 }
 return connectionList;
 } catch (error) {
 console.error("Error fetching connections:", error);
 setConnections([]);
 setProviderOptions([]);
 setPagination({ page: 1, pageSize, total: 0, totalPages: 1 });
 setTotals({ eligibleConnections: 0, providerFilteredConnections: 0 });
 setStatusCounts({
 total: 0,
 active: 0,
 exhausted: 0,
 unavailable: 0,
 disabled: 0,
 });
 return [];
 }
 },
 [accountFilter, page, pageSize, providerFilter, debouncedSearch],
 );

 // Fetch quota for a specific connection
 const fetchQuota = useCallback(async (connectionId, provider, { force = false } = {}) => {
 setLoading((prev) => ({ ...prev, [connectionId]: true }));
 setErrors((prev) => ({ ...prev, [connectionId]: null }));

 try {
 const url = `/api/usage/${connectionId}${force ? "?force=1" : ""}`;
 const response = await fetch(url);

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 const errorMsg = errorData.error || response.statusText;

 // Handle different error types gracefully
 if (response.status === 404) {
 // Connection not found - skip silently
 return;
 }

 if (response.status === 401) {
 // Auth error - show message instead of throwing
 const quotaEntry = {
 quotas: [],
 message: errorMsg,
 };
 setQuotaData((prev) => ({
 ...prev,
 [connectionId]: quotaEntry,
 }));
 setQuotaCache(connectionId, quotaEntry);
 return;
 }

 throw new Error(`HTTP ${response.status}: ${errorMsg}`);
 }

 const data = await response.json();

 // Parse quota data using provider-specific parser
 const parsedQuotas = parseQuotaData(provider, data);

 const quotaEntry = {
 quotas: parsedQuotas,
 plan: data.plan || null,
 message: data.message || null,
 raw: data,
 };

 setQuotaData((prev) => ({
 ...prev,
 [connectionId]: quotaEntry,
 }));
 setQuotaCache(connectionId, quotaEntry);
 } catch (error) {
 console.error(
 `[ProviderLimits] Error fetching quota for ${provider} (${connectionId}):`,
 error,
 );
 setErrors((prev) => ({
 ...prev,
 [connectionId]: error.message || "Failed to fetch quota",
 }));
 } finally {
 setLoading((prev) => ({ ...prev, [connectionId]: false }));
 }
 }, []);

 // Batch quota fetch for antigravity: single round-trip through the
 // 20s-TTL server snapshot cache (GET /api/usage/quotas?provider=antigravity)
 // instead of N per-connection upstream hits to Google. Read-only — does not
 // upsert snapshots, so it never thrashes the routing cache. Connections
 // without a snapshot yet fall back to per-connection fetch.
 const fetchBatchAntigravityQuotas = useCallback(
 async (connectionList) => {
 const targets = (connectionList || []).filter(
 (conn) => conn?.provider === "antigravity",
 );
 if (targets.length === 0) return false;
 setLoading((prev) => ({
 ...prev,
 ...Object.fromEntries(targets.map((conn) => [conn.id, true])),
 }));
 try {
 const response = await fetch(
 `/api/usage/quotas?provider=antigravity&_t=${Date.now()}`,
 { cache: "no-store" },
 );
 if (!response.ok) throw new Error("Batch quota fetch failed");
 const data = await response.json();
 const byId = new Map(
 (data.quotas || []).map((item) => [item.connectionId, item]),
 );
 const missing = [];
 setQuotaData((prev) => {
 const next = { ...prev };
 for (const conn of targets) {
 const item = byId.get(conn.id);
 if (!item) {
 missing.push(conn);
 continue;
 }
 const parsedQuotas = parseQuotaData(conn.provider, {
 quotas: item.quotas || {},
 });
 const quotaEntry = {
 quotas: parsedQuotas,
 plan: item.plan || null,
 message: null,
 raw: { quotas: item.quotas || {}, plan: item.plan || null },
 };
 next[conn.id] = quotaEntry;
 setQuotaCache(conn.id, quotaEntry);
 }
 return next;
 });
 setErrors((prev) => {
 const next = { ...prev };
 for (const conn of targets) {
 if (byId.has(conn.id)) next[conn.id] = null;
 }
 return next;
 });
 if (missing.length > 0) {
 await Promise.all(
 missing.map((conn) => fetchQuota(conn.id, conn.provider)),
 );
 }
 return true;
 } catch (error) {
 console.error("[ProviderLimits] Batch antigravity quota failed, falling back:", error);
 await Promise.all(
 targets.map((conn) => fetchQuota(conn.id, conn.provider)),
 );
 return false;
 } finally {
 setLoading((prev) => {
 const next = { ...prev };
 for (const conn of targets) next[conn.id] = false;
 return next;
 });
 }
 },
 [fetchQuota],
 );

 // Refresh quota for a specific provider
 const refreshProvider = useCallback(
 async (connectionId, provider) => {
 await fetchQuota(connectionId, provider, { force: true });
 setLastUpdated(new Date());
 },
 [fetchQuota],
 );

 const [resettingStatusId, setResettingStatusId] = useState(null);

 const handleResetConnectionStatus = useCallback(async (connectionId, provider) => {
 setResettingStatusId(connectionId);
 try {
 const res = await fetch(`/api/providers/${connectionId}/reset-status`, { method: "POST" });
 if (res.ok) {
 notify.success("Status and cooldown reset");
 await fetchQuota(connectionId, provider);
 await fetchConnections(pagination.page);
 } else {
 const d = await res.json().catch(() => ({}));
 notify.error(d.error || "Failed to reset status");
 }
 } catch {
 notify.error("Failed to reset status");
 } finally {
 setResettingStatusId(null);
 }
 }, [notify, fetchQuota, fetchConnections, pagination.page]);

 const handleResetCodexLimit = useCallback(
 async (connectionId, provider) => {
 if (provider !== "codex" || resettingLimitId) return;

 setResettingLimitId(connectionId);
 setErrors((prev) => ({ ...prev, [connectionId]: null }));

 try {
 const response = await fetch(`/api/usage/${connectionId}/codex-reset-credits`, { method: "POST" });
 const result = await response.json().catch(() => ({}));

 if (!response.ok) {
 throw new Error(result.message || result.error || result.code || "Failed to reset Codex limit");
 }

 await fetchQuota(connectionId, provider);
 setLastUpdated(new Date());
 } catch (error) {
 setErrors((prev) => ({ ...prev, [connectionId]: error.message || "Failed to reset Codex limit" }));
 } finally {
 setResettingLimitId(null);
 }
 },
 [fetchQuota, resettingLimitId],
 );

 const handleViewCodexResetCredits = useCallback(async (connection) => {
 setResetCreditsState({ connection, loading: true, error: null, data: null });
 try {
 const response = await fetch(`/api/usage/${connection.id}/codex-reset-credits`, { cache: "no-store" });
 const result = await response.json().catch(() => ({}));
 if (!response.ok) {
 throw new Error(result.error || result.message || "Failed to load Codex reset credits");
 }
 const credits = Array.isArray(result.credits) ? [...result.credits] : [];
 credits.sort((a, b) => {
 const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
 const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
 return aTime - bTime;
 });
 setResetCreditsState({ connection, loading: false, error: null, data: { ...result, credits } });
 } catch (error) {
 setResetCreditsState({ connection, loading: false, error: error.message || "Failed to load Codex reset credits", data: null });
 }
 }, []);

 const [deleteConfirmId, setDeleteConfirmId] = useState(null);

 const handleDeleteConnection = useCallback(
 async (id) => {
 setDeleteConfirmId(id);
 }, []);

 const confirmDeleteConnection = useCallback(async () => {
 const id = deleteConfirmId;
 if (!id) return;
 setDeleteConfirmId(null);
 setDeletingId(id);
 try {
 const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
 if (res.ok) {
 setQuotaData((prev) => {
 const next = { ...prev };
 delete next[id];
 return next;
 });
 setLoading((prev) => {
 const next = { ...prev };
 delete next[id];
 return next;
 });
 setErrors((prev) => {
 const next = { ...prev };
 delete next[id];
 return next;
 });

 if (typeof window !== "undefined") {
 try {
 const cache = getQuotaCache();
 if (cache[id]) {
 delete cache[id];
 window.localStorage.setItem(
 QUOTA_CACHE_KEY,
 JSON.stringify(cache),
 );
 }
 } catch (e) {
 /* noop */
 }
 }

 await reconcileConnectionsPage(fetchConnections, page);
 }
 } catch (error) {
 notify.error("Failed to delete connection");
 } finally {
 setDeletingId(null);
 }
 },
 [notify, deleteConfirmId, fetchConnections, page],
 );

 const handleToggleConnectionActive = useCallback(
 async (id, isActive) => {
 setTogglingId(id);
 try {
 const res = await fetch(`/api/providers/${id}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ isActive }),
 });
 if (res.ok) {
 setQuotaData((prev) => {
 const next = { ...prev };
 return next;
 });
 await reconcileConnectionsPage(fetchConnections, page);
 }
 } catch (error) {
 console.error("Error updating connection status:", error);
 } finally {
 setTogglingId(null);
 }
 },
 [fetchConnections, page],
 );

 const handleUpdateConnection = useCallback(
 async (formData) => {
 if (!selectedConnection?.id) return;
 const connectionId = selectedConnection.id;
 const provider = selectedConnection.provider;
 try {
 const res = await fetch(`/api/providers/${connectionId}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(formData),
 });
 if (res.ok) {
 await fetchConnections();
 setShowEditModal(false);
 setSelectedConnection(null);
 if (USAGE_SUPPORTED_PROVIDERS.includes(provider)) {
 await fetchQuota(connectionId, provider);
 }
 }
 } catch (error) {
 console.error("Error saving connection:", error);
 }
 },
 [selectedConnection, fetchConnections, fetchQuota],
 );

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

 const refreshAll = useCallback(async (force = false) => {
 if (refreshingAll) return;

 setRefreshingAll(true);
 setCountdown(60);

 // Throttle Claude: poll its quota every Nth auto-tick (manual force bypasses)
 const tick = (tickCountRef.current += 1);
 const claudeEvery = Math.round(CLAUDE_REFRESH_INTERVAL_MS / REFRESH_INTERVAL_MS);
 const shouldFetch = (conn) =>
 force || conn.provider !== "claude" || tick % claudeEvery === 0;

 try {
 const visibleConnections = await fetchConnections(page);

 setLoading(buildLoadingState(visibleConnections));
 setErrors((prev) =>
 filterQuotaStateByConnections(prev, visibleConnections),
 );
 setQuotaData((prev) =>
 filterQuotaStateByConnections(prev, visibleConnections),
 );

 const fetchable = visibleConnections.filter(shouldFetch);
 const allAntigravity =
 fetchable.length > 0 &&
 fetchable.every((conn) => conn.provider === "antigravity");
 if (allAntigravity && !force) {
 // Bulk path: 1 cached snapshot read, no upstream fan-out, no cache thrash.
 await fetchBatchAntigravityQuotas(fetchable);
 } else {
 await Promise.all(
 fetchable.map((conn) => fetchQuota(conn.id, conn.provider)),
 );
 }

 setLastUpdated(new Date());
 } catch (error) {
 console.error("Error refreshing all providers:", error);
 } finally {
 setRefreshingAll(false);
 }
 }, [refreshingAll, fetchConnections, fetchQuota, fetchBatchAntigravityQuotas, page]);

 useEffect(() => {
 const initializeData = async () => {
 setConnectionsLoading(true);
 const visibleConnections = await fetchConnections(page);
 setConnectionsLoading(false);

 // Always fetch fresh quota on mount, no cache display
 setLoading(buildLoadingState(visibleConnections));
 setErrors((prev) =>
 filterQuotaStateByConnections(prev, visibleConnections),
 );
 setQuotaData((prev) =>
 filterQuotaStateByConnections(prev, visibleConnections),
 );

 const allAntigravity =
 visibleConnections.length > 0 &&
 visibleConnections.every((conn) => conn.provider === "antigravity");
 if (allAntigravity) {
 await fetchBatchAntigravityQuotas(visibleConnections);
 } else {
 await Promise.all(
 visibleConnections.map((conn) => fetchQuota(conn.id, conn.provider)),
 );
 }
 setLastUpdated(new Date());
 };

 initializeData();
 }, [fetchConnections, fetchQuota, fetchBatchAntigravityQuotas, page]);

 useEffect(() => {
 if (typeof window === "undefined") return;
 const stored = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
 setAutoRefresh(stored === null ? true : stored === "true");
 setHasHydratedAutoRefresh(true);
 }, []);

 // Persist auto-refresh preference
 useEffect(() => {
 if (typeof window === "undefined" || !hasHydratedAutoRefresh) return;
 window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefresh));
 }, [autoRefresh, hasHydratedAutoRefresh]);

 // Reflect filter state into the URL (shareable / bookmarkable / reload-safe).
 // Wrapped in startTransition so rapid filter clicks don't block the UI.
 const syncFiltersToUrl = useCallback(() => {
 if (typeof window === "undefined") return;
 const params = new URLSearchParams(searchParams.toString());
 const setOrDelete = (key, value, fallback) => {
 if (value && value !== fallback) params.set(key, value);
 else params.delete(key);
 };
 setOrDelete("provider", providerFilter, "all");
 setOrDelete("account", accountFilter, "all");
 setOrDelete("sort", quotaSortMode, "default");
 if (debouncedSearch) params.set("q", debouncedSearch);
 else params.delete("q");
 const next = `${pathname}?${params.toString()}`;
 if (next !== `${pathname}?${searchParams.toString()}`) {
 window.history.replaceState(null, "", next);
 }
 }, [searchParams, pathname, providerFilter, accountFilter, quotaSortMode, debouncedSearch]);

 useEffect(() => {
 syncFiltersToUrl();
 }, [syncFiltersToUrl]);

 // Load auto-ping per-connection maps
 useEffect(() => {
 fetch("/api/settings", { cache: "no-store" })
 .then((r) => (r.ok ? r.json() : {}))
 .then((s) => {
 setAutoPingMaps({
 claude: s?.claudeAutoPing?.connections || {},
 codex: s?.codexAutoPing?.connections || {},
 });
 setQuotaVisibility(s?.quotaVisibility || {});
 })
 .catch(() => {});
 }, []);

 const toggleAutoPing = useCallback(async (connectionId, provider, on) => {
 const settingsKey = AUTO_PING_SETTINGS_KEYS[provider];
 if (!settingsKey) return;

 const previous = autoPingMaps;
 const nextProviderMap = { ...(autoPingMaps[provider] || {}), [connectionId]: on };
 const nextMaps = { ...autoPingMaps, [provider]: nextProviderMap };
 setAutoPingMaps(nextMaps);
 try {
 const r = await fetch("/api/settings", { cache: "no-store" });
 const s = r.ok ? await r.json() : {};
 const cfg = { ...(s[settingsKey] || {}), connections: nextProviderMap };
 await fetch("/api/settings", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ [settingsKey]: cfg }),
 });
 } catch {
 setAutoPingMaps(previous);
 }
 }, [autoPingMaps]);

 const updateQuotaVisibility = useCallback(async (nextVisibility, previousVisibility) => {
 setQuotaVisibility(nextVisibility);
 try {
 const response = await fetch("/api/settings", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ quotaVisibility: nextVisibility }),
 });
 if (!response.ok) throw new Error("Failed to update quota visibility");
 } catch (error) {
 console.error("Error updating quota visibility:", error);
 setQuotaVisibility(previousVisibility);
 }
 }, []);

 const handleHideQuota = useCallback((provider, quota) => {
 const key = getQuotaVisibilityKey(quota);
 if (!provider || !key) return;

 const previous = quotaVisibility;
 const providerVisibility = previous[provider] || {};
 const hidden = new Set(providerVisibility.hidden || []);
 hidden.add(key);
 if (provider === "antigravity") {
 if (key === "gemini") {
 for (const k of hidden) {
 if (k.startsWith("gemini-") && !k.includes("image")) hidden.delete(k);
 }
 } else if (key === "claude") {
 for (const k of hidden) {
 if (k.startsWith("claude-")) hidden.delete(k);
 }
 }
 }
 const next = {
 ...previous,
 [provider]: {
 ...providerVisibility,
 hidden: [...hidden],
 },
 };
 updateQuotaVisibility(next, previous);
 }, [quotaVisibility, updateQuotaVisibility]);

 const handleShowQuota = useCallback((provider, quota) => {
 const key = getQuotaVisibilityKey(quota);
 if (!provider || !key) return;

 const previous = quotaVisibility;
 const providerVisibility = previous[provider] || {};
 const hidden = new Set(providerVisibility.hidden || []);
 hidden.delete(key);
 if (provider === "antigravity") {
 if (key === "gemini") {
 for (const k of hidden) {
 if (k.startsWith("gemini-") && !k.includes("image")) hidden.delete(k);
 }
 } else if (key === "claude") {
 for (const k of hidden) {
 if (k.startsWith("claude-")) hidden.delete(k);
 }
 }
 }
 const next = {
 ...previous,
 [provider]: {
 ...providerVisibility,
 hidden: [...hidden],
 },
 };
 updateQuotaVisibility(next, previous);
 }, [quotaVisibility, updateQuotaVisibility]);

 // Auto-refresh interval
 useEffect(() => {
 if (!hasHydratedAutoRefresh || !autoRefresh) {
 if (intervalRef.current) {
 clearInterval(intervalRef.current);
 intervalRef.current = null;
 }
 if (countdownRef.current) {
 clearInterval(countdownRef.current);
 countdownRef.current = null;
 }
 return;
 }

 // Main refresh interval
 intervalRef.current = setInterval(() => {
 refreshAll();
 }, REFRESH_INTERVAL_MS);

 // Countdown interval
 countdownRef.current = setInterval(() => {
 setCountdown((prev) => {
 if (prev <= 1) return 60;
 return prev - 1;
 });
 }, 1000);

 return () => {
 if (intervalRef.current) clearInterval(intervalRef.current);
 if (countdownRef.current) clearInterval(countdownRef.current);
 };
 }, [autoRefresh, refreshAll, hasHydratedAutoRefresh]);

 // Pause auto-refresh when tab is hidden (Page Visibility API)
 useEffect(() => {
 const handleVisibilityChange = () => {
 if (document.hidden) {
 if (intervalRef.current) {
 clearInterval(intervalRef.current);
 intervalRef.current = null;
 }
 if (countdownRef.current) {
 clearInterval(countdownRef.current);
 countdownRef.current = null;
 }
 } else if (autoRefresh && hasHydratedAutoRefresh) {
 // Resume auto-refresh when tab becomes visible
 intervalRef.current = setInterval(() => refreshAll(), REFRESH_INTERVAL_MS);
 countdownRef.current = setInterval(() => {
 setCountdown((prev) => (prev <= 1 ? 60 : prev - 1));
 }, 1000);
 }
 };

 document.addEventListener("visibilitychange", handleVisibilityChange);
 return () => {
 document.removeEventListener("visibilitychange", handleVisibilityChange);
 };
 }, [autoRefresh, refreshAll, hasHydratedAutoRefresh]);

 const sortedConnections = useMemo(
 () =>
 sortVisibleConnections(
 accountFilter === "disabled"
 ? connections
 : connections.filter((c) => c.isActive !== false),
 quotaData,
 expiringFirst,
 providerFilter,
 quotaSortMode,
 ),
 [connections, quotaData, expiringFirst, providerFilter, quotaSortMode, accountFilter],
 );

 // Connection is depleted when any quota entry hit the threshold
 const isConnectionDepleted = (conn) => {
 const quotas = quotaData[conn.id]?.quotas;
 if (!quotas?.length) return false;
 return quotas.some((q) => {
 if (!q.total || q.total <= 0) return false;
 return calculatePercentage(q.used, q.total) <= DEPLETED_QUOTA_THRESHOLD;
 });
 };

 const bulkSetActive = useCallback(
 async (targetIds, isActive) => {
 if (!targetIds.length || bulkToggling) return;
 setBulkToggling(true);
 try {
 await fetch("/api/providers", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ ids: targetIds, isActive }),
 });
 await reconcileConnectionsPage(fetchConnections, page);
 } catch (error) {
 console.error("Error bulk toggling connections:", error);
 } finally {
 setBulkToggling(false);
 }
 },
 [bulkToggling, fetchConnections, page],
 );

 const handleDisableDepleted = () => {
 const ids = sortedConnections
 .filter((c) => (c.isActive ?? true) && isConnectionDepleted(c))
 .map((c) => c.id);
 bulkSetActive(ids, false);
 };

 const handleEnableAvailable = () => {
 const ids = sortedConnections
 .filter((c) => !(c.isActive ?? true) && !isConnectionDepleted(c))
 .map((c) => c.id);
 bulkSetActive(ids, true);
 };

 const selectedProviderLabel =
 providerFilter === "all" ? "All providers" : providerFilter;
 const hasEligibleConnections = totals.eligibleConnections > 0;
 const hasVisibleConnections = sortedConnections.length > 0;
 const emptyState = getConnectionsEmptyMessage(
 totals,
 providerFilter,
 accountFilter,
 debouncedSearch,
 );
 const connectionsPageSummary = getConnectionsPaginationSummary(pagination);
 const isCustomPageSize = !ACCOUNT_PAGE_SIZE_OPTIONS.includes(pageSize);
 const pageSizeLabel = getPageSizeLabel(pageSize, isCustomPageSize);

	if (!connectionsLoading && !hasEligibleConnections) {
		return (
			<Card padding="none" className="border-border bg-surface overflow-hidden">
				<div className="flex flex-col items-center justify-center text-center px-4 py-12 sm:py-16 max-w-lg mx-auto">
					{/* Icon Badge */}
					<div className="relative mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
						<Icon name="data_usage" size={28} />
						<span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-surface border border-border text-text-muted">
							<Icon name="cloud_off" size={12} />
						</span>
					</div>

					{/* Title & Description */}
					<h3 className="text-base sm:text-lg font-semibold text-text-main tracking-tight">
						No Providers Connected
					</h3>
					<p className="mt-2 text-xs sm:text-sm text-text-muted max-w-md leading-relaxed">
						Connect your provider accounts via OAuth or API key to monitor real-time quota limits, 5-hour rolling reset windows, and credit balances.
					</p>

					{/* Action Buttons */}
					<div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
						<Link href="/dashboard/providers">
							<Button variant="primary" size="sm" icon="dns" className="font-medium shadow-xs">
								Connect Providers
							</Button>
						</Link>
						<Button
							variant="outline"
							size="sm"
							icon="refresh"
							onClick={() => fetchConnections(1)}
							disabled={connectionsLoading}
						>
							Check Again
						</Button>
					</div>

					{/* Supported Quota Providers Showcase */}
					<div className="mt-8 pt-6 border-t border-border/50 w-full">
						<span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-3">
							Supported Quota Tracking Providers
						</span>
						<div className="flex flex-wrap items-center justify-center gap-2">
							{[
								{ id: "codex", name: "Codex", note: "5h window & credits" },
								{ id: "claude", name: "Claude", note: "5h rate limit" },
								{ id: "kiro", name: "Kiro", note: "Daily & monthly" },
								{ id: "antigravity", name: "Antigravity", note: "Per-model locks" },
								{ id: "grok-cli", name: "Grok CLI", note: "Live rate limits" },
								{ id: "github", name: "Copilot", note: "Premium quotas" },
							].map((p) => (
								<div
									key={p.id}
									className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-surface-2 border border-border/60 text-xs"
								>
									<ProviderIcon providerId={p.id} size={15} />
									<span className="font-medium text-text-main text-[11px]">{p.name}</span>
									<span className="text-[10px] text-text-muted">· {p.note}</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</Card>
		);
	}


 return (
 <div className="space-y-3">
 {/* Header & Filter Controls */}
 <div className="space-y-3">
 {/* Top Bar: Status Tabs + Search */}
 <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
 {/* Status Filter Tabs */}
 <div
 role="tablist"
 aria-orientation="horizontal"
 aria-label="Account status filters"
 className="tab-scroll-fade inline-flex max-w-full items-center gap-1 overflow-x-auto no-scrollbar rounded-sm border border-border bg-surface p-1"
 onKeyDown={(e) => {
 const statusKeys = ["all", "active", "exhausted", "unavailable", "disabled"];
 const currentIndex = statusKeys.indexOf(accountFilter);
 let nextIndex = -1;
 if (e.key === "ArrowRight" || e.key === "ArrowDown") {
 e.preventDefault();
 nextIndex = (currentIndex + 1) % statusKeys.length;
 } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
 e.preventDefault();
 nextIndex = (currentIndex - 1 + statusKeys.length) % statusKeys.length;
 } else if (e.key === "Home") {
 e.preventDefault();
 nextIndex = 0;
 } else if (e.key === "End") {
 e.preventDefault();
 nextIndex = statusKeys.length - 1;
 }
 if (nextIndex >= 0 && nextIndex !== currentIndex) {
 setPage(1);
 setAccountFilter(statusKeys[nextIndex]);
 const nextBtn = e.currentTarget.querySelectorAll('[role="tab"]')[nextIndex];
 nextBtn?.focus();
 }
 }}
 >
 {[
 { key: "all", label: "All", count: statusCounts.total, dot: null },
 { key: "active", label: "Active", count: statusCounts.active, dot: "bg-success" },
 { key: "exhausted", label: "Exhausted", count: statusCounts.exhausted, dot: "bg-danger" },
 { key: "unavailable", label: "Unavailable", count: statusCounts.unavailable, dot: "bg-warning" },
 { key: "disabled", label: "Turned off", count: statusCounts.disabled, dot: "bg-text-muted" },
 ].map((tab) => {
 const isSelected = accountFilter === tab.key;
 return (
 <button
 key={tab.key}
 type="button"
 role="tab"
 aria-selected={isSelected}
 tabIndex={isSelected ? 0 : -1}
 onClick={() => {
 if (accountFilter !== tab.key) {
 setPage(1);
 }
 setAccountFilter(tab.key);
 }}
                className={`scroll-snap-align-start inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-2 text-xs font-medium transition-colors sm:min-h-9 sm:px-2.5 ${
                  isSelected
                    ? "bg-primary text-white"
                    : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                }`}
 >
 {tab.dot && (
 <span
 className={`size-1.5 rounded-full shrink-0 ${isSelected ? "bg-surface" : tab.dot}`}
 />
 )}
 <span>{tab.label}</span>
            <span
              className={`rounded-sm px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                isSelected
                  ? "bg-surface text-primary"
                  : "bg-surface-2 text-text-muted"
              }`}
            >
 {tab.count ?? 0}
 </span>
 </button>
 );
 })}
 </div>

 {/* Account Search Input */}
 <div className="relative w-full sm:w-72 lg:w-80">
 <Icon name="search" size={18} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => {
 const val = e.target.value;
 setSearchQuery(val);
 setHeaderSearchQuery(val);
 }}
 onKeyDown={(e) => {
 if (e.key === "Enter") {
 const trimmed = searchQuery.trim();
 if (trimmed !== debouncedSearch) {
 setPage(1);
 setDebouncedSearch(trimmed);
 }
 }
 }}
 placeholder="Search accounts..."
 aria-label="Search accounts"
              className="w-full min-h-11 rounded-sm border border-border bg-surface pl-8.5 pr-8 py-2.5 text-xs text-text-main placeholder:text-text-muted outline-none focus:border-primary transition-colors sm:min-h-9 sm:py-2"
 />
 {searchQuery && (
 <button
 type="button"
 onClick={() => {
 setSearchQuery("");
 setHeaderSearchQuery("");
 if (debouncedSearch !== "") {
 setPage(1);
 setDebouncedSearch("");
 }
 }}
 className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-text-muted hover:text-text-main"
 title="Clear search"
 aria-label="Clear search"
 >
 <Icon name="close" size={18} />
 </button>
 )}
 </div>
 </div>

 {/* Secondary Toolbar: Filters & Sorting (Left) + Actions & Utilities (Right) */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-sm border border-border bg-surface px-3 py-2">
 {/* Left: Provider & Sorting Controls */}
 <div className="flex flex-wrap items-center gap-1.5">
 {/* Provider Filter Dropdown */}
 <div className="relative">
 <button
 type="button"
 onClick={() => setProviderMenuOpen((prev) => !prev)}
              className={`flex items-center justify-between gap-1.5 rounded-sm border px-3 py-2.5 text-xs font-medium transition-colors min-h-11 sm:min-h-9 sm:px-2.5 ${
                providerFilter !== "all"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-surface text-text-main hover:bg-surface-2"
              }`}
 aria-haspopup="menu"
 aria-expanded={providerMenuOpen}
 title="Filter quota providers"
 >
 <span className="flex min-w-0 items-center gap-1.5">
 {providerFilter === "all" ? (
<Icon name="apps" size={18} className="text-text-muted" />
 ) : (
 <ProviderIcon
 src={`/providers/${providerFilter}.png`}
 alt={providerFilter}
 size={16}
 className="size-4 rounded-sm object-contain"
 fallbackText={providerFilter.slice(0, 2).toUpperCase()}
 />
 )}
 <span className="truncate capitalize">
 {selectedProviderLabel}
 </span>
 </span>
 <Icon name="expand_more" size={18} className="text-text-muted" />
 </button>

 {providerMenuOpen && (
 <>
 <button
 type="button"
 className="fixed inset-0 z-30 bg-transparent"
 aria-label="Close provider filter"
 onClick={() => setProviderMenuOpen(false)}
 />
 <div className="absolute left-0 z-40 mt-1.5 w-64 overflow-hidden rounded-sm border border-border bg-surface/95 p-1.5 sm:w-72">
 <button
 type="button"
 onClick={() => {
 if (shouldResetPage(providerFilter, "all")) {
 setPage(1);
 }
 setProviderFilter("all");
 setProviderMenuOpen(false);
 }}
                className={`flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-xs font-medium transition-colors ${
                  providerFilter === "all"
                    ? "bg-primary/10 text-primary"
                    : "text-text-main hover:bg-surface-2"
 }`}
 >
 <Icon name="apps" size={18} />
 <span>All providers</span>
 {providerFilter === "all" && (
 <Icon name="check" size={18} className="ml-auto" />
 )}
 </button>
 <div className="my-1 h-px bg-black/10" />
 <div className="max-h-72 overflow-y-auto pr-1">
 {providerOptions.map((provider) => (
 <button
 key={provider}
 type="button"
 onClick={() => {
 if (shouldResetPage(providerFilter, provider)) {
 setPage(1);
 }
 setProviderFilter(provider);
 setProviderMenuOpen(false);
 }}
                className={`flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-xs font-medium transition-colors ${
                  providerFilter === provider
                    ? "bg-primary/10 text-primary"
                    : "text-text-main hover:bg-surface-2"
 }`}
 >
 <ProviderIcon
 src={`/providers/${provider}.png`}
 alt={provider}
 size={20}
 className="size-5 rounded-sm object-contain"
 fallbackText={provider.slice(0, 2).toUpperCase()}
 />
 <span className="capitalize">{provider}</span>
 {providerFilter === provider && (
 <Icon name="check" size={18} className="ml-auto" />
 )}
 </button>
 ))}
 </div>
 </div>
 </>
 )}
 </div>

 {/* Codex Quota Sort */}
 {providerFilter === "codex" && (
 <select
 value={quotaSortMode}
 onChange={(event) => setQuotaSortMode(event.target.value)}
              className="rounded-sm border border-border bg-surface px-3 py-2.5 text-xs min-h-11 sm:min-h-9 sm:px-2.5 text-xs font-medium text-text-main outline-none hover:bg-surface-2 transition-colors"
 aria-label="Sort Codex quotas by remaining"
 >
 {QUOTA_SORT_OPTIONS.map((option) => (
 <option key={option.value} value={option.value}>
 {option.label}
 </option>
 ))}
 </select>
 )}

 {/* Expiring First Toggle */}
 <button
 type="button"
 onClick={() => setExpiringFirst((prev) => !prev)}
 aria-pressed={expiringFirst}
              className={`flex shrink-0 items-center gap-1.5 rounded-sm border px-3 py-2.5 text-xs font-medium transition-colors min-h-11 sm:min-h-9 sm:px-2.5 ${
                expiringFirst
                  ? "border-warning/30 bg-warning/10 text-warning font-medium"
                  : "border-border bg-surface text-text-main hover:bg-surface-2"
 }`}
 title="Sort accounts by earliest quota reset time"
 >
 <Icon name="hourglass_top" size={18} />
 <span>Expiring first</span>
 </button>

 {/* Reset active filters */}
 {(debouncedSearch || providerFilter !== "all" || accountFilter !== "all" || expiringFirst) && (
 <button
 type="button"
 onClick={() => {
 setSearchQuery("");
 setDebouncedSearch("");
 setHeaderSearchQuery("");
 setAccountFilter("all");
 setProviderFilter("all");
 setExpiringFirst(false);
 setPage(1);
 }}
              className="flex items-center gap-1 rounded-sm px-3 py-2.5 text-xs min-h-11 sm:min-h-9 sm:px-2.5 text-xs font-medium text-text-muted hover:text-text-main transition-colors"
 title="Reset all filters"
 >
 <Icon name="restart_alt" size={18} />
 <span>Reset</span>
 </button>
 )}
 </div>

 {/* Right: Actions & Utilities */}
 <div className="flex flex-wrap items-center gap-1.5">
 {/* Bulk: Disable depleted */}
 <button
 type="button"
 onClick={handleDisableDepleted}
 disabled={bulkToggling}
              className="flex shrink-0 items-center gap-1.5 rounded-sm border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs min-h-11 sm:min-h-9 sm:px-2.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50 transition-colors"
 title="Disable connections with depleted quota on the current page"
 >
 <Icon name="block" size={18} />
 <span>Turn off Empty</span>
 </button>

 {/* Bulk: Enable available */}
 <button
 type="button"
 onClick={handleEnableAvailable}
 disabled={bulkToggling}
              className="flex shrink-0 items-center gap-1.5 rounded-sm border border-success/30 bg-success/10 px-3 py-2.5 text-xs min-h-11 sm:min-h-9 sm:px-2.5 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-50 transition-colors"
 title="Enable connections that still have quota on the current page"
 >
 <Icon name="check_circle" size={18} />
 <span>Turn on Available</span>
 </button>

 <div className="hidden h-4 w-px bg-black/10 sm:block mx-0.5" />

 {/* Auto-refresh toggle */}
 <button
 type="button"
 onClick={() => setAutoRefresh((prev) => !prev)}
              className="flex shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-2.5 text-xs font-medium min-h-11 sm:min-h-9 sm:px-2.5 text-text-main hover:bg-surface-2 transition-colors"
 title={autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh"}
 >
<Icon
name={autoRefresh ? "toggle_on" : "toggle_off"}
size={18}
className={autoRefresh ? "text-primary" : "text-text-muted"}
/>
 <span>Auto-refresh</span>
 {autoRefresh && (
 <span className="text-[11px] text-text-muted tabular-nums">
 ({countdown}s)
 </span>
 )}
 </button>

 {/* Refresh all button */}
 <button
 type="button"
 onClick={() => refreshAll(true)}
 disabled={refreshingAll}
              className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-border bg-surface py-2 text-xs text-text-main hover:bg-surface-2 disabled:opacity-50 transition-colors sm:min-h-9 sm:w-9"
 title="Refresh all quotas"
 >
 <Icon name="refresh" size={18} className={`${refreshingAll ? "animate-spin" : ""}`} />
 </button>
 </div>
 </div>
 </div>

 {/* Provider cards: 2 columns, compact */}
 {expiringFirst && (
        <div className="rounded-sm border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
 Expiring-first currently reorders accounts inside the current page.
 Cross-page ordering still follows backend pagination.
 </div>
 )}

 {/* Main Content: Loading Skeleton, Empty State, or Card Grid */}
 {connectionsLoading && !hasVisibleConnections ? (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 <CardSkeleton />
 <CardSkeleton />
 </div>
 ) : !hasVisibleConnections ? (
					<Card padding="none" className="border-border bg-surface overflow-hidden">
						<div className="flex flex-col items-center justify-center text-center py-10 px-4 max-w-md mx-auto">
							<div className="flex size-12 items-center justify-center rounded-xl bg-surface-2 border border-border text-text-muted mb-3 shadow-xs">
								<Icon name={emptyState.icon || "filter_alt_off"} size={22} />
							</div>
							<h3 className="text-sm font-semibold text-text-main">
								{emptyState.title}
							</h3>
							<p className="mt-1.5 text-xs text-text-muted leading-relaxed">
								{emptyState.description}
							</p>
							{(debouncedSearch ||
								accountFilter !== "all" ||
								providerFilter !== "all" ||
								expiringFirst) && (
								<div className="mt-4">
									<Button
										variant="outline"
										size="sm"
										icon="restart_alt"
										onClick={() => {
											setSearchQuery("");
											setDebouncedSearch("");
											setHeaderSearchQuery("");
											setAccountFilter("all");
											setProviderFilter("all");
											setExpiringFirst(false);
											setPage(1);
										}}
									>
										Reset all filters
									</Button>
								</div>
							)}
						</div>
					</Card>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {sortedConnections.map((conn) => {
 const quota = quotaData[conn.id];
 const isLoading = loading[conn.id];
 const error = errors[conn.id];

 // Use table layout for all providers
 const isInactive = conn.isActive === false;
 const isCodex = conn.provider === "codex";
 const resetCreditCount = getCodexResetCreditCount(quota);
 const isResettingLimit = resettingLimitId === conn.id;
 const rowBusy = deletingId === conn.id || togglingId === conn.id || isResettingLimit;
 const rawQuotas = quota?.quotas || [];
 const visibleQuotas = filterQuotasByVisibility(conn.provider, rawQuotas, quotaVisibility);
 const hiddenQuotaRows = getHiddenQuotaRows(conn.provider, rawQuotas, quotaVisibility);

 return (
 <Card
 key={conn.id}
 padding="none"
 className={`min-w-0 ${isInactive ? "opacity-60" : ""} ${openMenuConnectionId === conn.id ? "relative z-20" : ""}`}
 >
 <div className="px-4 py-3 border-b border-border">
 {/* Top row: Provider icon + info + actions */}
 <div className="flex items-start justify-between gap-3 mb-3">
 <div className="flex items-center gap-3 min-w-0 flex-1">
 <div className="w-10 h-10 shrink-0 rounded-sm flex items-center justify-center overflow-hidden bg-surface-2">
 <ProviderIcon
 src={`/providers/${conn.provider}.png`}
 size={40}
 className="object-contain"
 fallbackText={
 conn.provider?.slice(0, 2).toUpperCase() || "PR"
 }
 />
 </div>
 <div className="min-w-0 flex-1">
 <h3 className="text-sm font-semibold text-text-main capitalize truncate">
 {conn.provider}
 </h3>
 {getConnectionLabel(conn) ? (
 <p className="text-xs text-text-muted truncate">
 {getConnectionLabel(conn)}
 </p>
 ) : null}
 {getConnectionSecondaryLabel(conn) ? (
 <p className="text-[11px] text-text-muted/80 truncate">
 {getConnectionSecondaryLabel(conn)}
 </p>
 ) : null}
 </div>
 </div>
 <div className="flex items-center gap-1 shrink-0">
 {isCodex && resetCreditCount > 0 && (
 <Tooltip
 text={`Use one Codex reset credit. Available: ${resetCreditCount}`}
 >
 <button
 type="button"
 onClick={() => setResetConfirmState({ connection: conn, resetCreditCount })}
 disabled={isLoading || rowBusy}
 aria-label={`Use one Codex reset credit. ${resetCreditCount} available.`}
                  className="flex min-w-9 items-center justify-center gap-1 rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-1.5 text-[11px] font-medium tabular-nums text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
 >
<Icon
name={isResettingLimit ? "progress_activity" : "restart_alt"}
size={18}
className={isResettingLimit ? "animate-spin" : undefined}
/>
 <span>{resetCreditCount}</span>
 </button>
 </Tooltip>
 )}
 <Tooltip text="Refresh quota">
 <button
 type="button"
 onClick={() => refreshProvider(conn.id, conn.provider)}
 disabled={isLoading || rowBusy}
 aria-label="Refresh quota"
                  className="flex size-11 items-center justify-center rounded-sm text-text-muted sm:size-9 hover:bg-surface-2 hover:text-text-main disabled:opacity-50 transition-colors"
 >
 <Icon name="refresh" size={18} className={`${isLoading ? "animate-spin" : ""}`} />
 </button>
 </Tooltip>

 <div
 className="inline-flex items-center px-0.5"
 title={
 (conn.isActive ?? true)
 ? "Disable connection"
 : "Enable connection"
 }
 >
 <Toggle
 size="sm"
 checked={conn.isActive ?? true}
 disabled={rowBusy}
 onChange={(nextActive) =>
 handleToggleConnectionActive(conn.id, nextActive)
 }
 />
 </div>

 {/* More actions menu */}
 <div className="relative">
 <button
 type="button"
 onClick={() => setOpenMenuConnectionId((prev) => (prev === conn.id ? null : conn.id))}
 aria-label="More actions"
                  className="flex size-11 items-center justify-center rounded-sm text-text-muted sm:size-9 hover:bg-surface-2 hover:text-text-main transition-colors"
 >
 <Icon name="more_vert" size={18} />
 </button>

 {openMenuConnectionId === conn.id && (
 <>
 <button
 type="button"
 className="fixed inset-0 z-30 bg-transparent"
 aria-label="Close menu"
 onClick={() => setOpenMenuConnectionId(null)}
 />
 <div className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-sm border border-border bg-surface/95">
 <button
 type="button"
 onClick={() => {
 setOpenMenuConnectionId(null);
 setSelectedConnection(conn);
 setShowEditModal(true);
 }}
 disabled={rowBusy}
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs font-medium text-text-main hover:bg-surface-2 disabled:opacity-50 transition-colors"
 >
 <Icon className="text-text-muted" name="edit" size={18} />
 <span>Edit connection</span>
 </button>

 <button
 type="button"
 onClick={() => {
 setOpenMenuConnectionId(null);
 handleResetConnectionStatus(conn.id, conn.provider);
 }}
 disabled={isLoading || rowBusy || resettingStatusId === conn.id}
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs font-medium text-text-main hover:bg-surface-2 disabled:opacity-50 transition-colors"
 >
 <Icon name="restart_alt" size={18} className={`text-warning ${resettingStatusId === conn.id ? "animate-spin" : ""}`} />
 <span>Reset status</span>
 </button>

 {isCodex && (
 <button
 type="button"
 onClick={() => {
 setOpenMenuConnectionId(null);
 handleViewCodexResetCredits(conn);
 }}
 disabled={isLoading || rowBusy}
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs font-medium text-text-main hover:bg-surface-2 disabled:opacity-50 transition-colors"
 >
 <Icon className="text-text-muted" name="schedule" size={18} />
 <span>Credit expiry</span>
 </button>
 )}

 {AUTO_PING_SETTINGS_KEYS[conn.provider] && conn.authType === "oauth" && (
 <button
 type="button"
 onClick={() => {
 setOpenMenuConnectionId(null);
 toggleAutoPing(conn.id, conn.provider, !(autoPingMaps[conn.provider]?.[conn.id] === true));
 }}
                  className="flex w-full items-center justify-between rounded-sm px-2.5 py-2 text-xs font-medium text-text-main hover:bg-surface-2 transition-colors"
 >
 <div className="flex items-center gap-2">
 <Icon name="bolt" size={18} className={`${autoPingMaps[conn.provider]?.[conn.id] === true ? "text-primary" : "text-text-muted"}`} />
 <span>Auto-ping</span>
 </div>
 <span className="text-[11px] text-text-muted font-medium">
 {autoPingMaps[conn.provider]?.[conn.id] === true ? "ON" : "OFF"}
 </span>
 </button>
 )}

 <div className="my-1 h-px bg-black/10" />

 <button
 type="button"
 onClick={() => {
 setOpenMenuConnectionId(null);
 handleDeleteConnection(conn.id);
 }}
 disabled={rowBusy}
 className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
 >
 <Icon name="delete" size={18} className={`${deletingId === conn.id ? "animate-pulse" : ""}`} />
 <span>Delete connection</span>
 </button>
 </div>
 </>
 )}
 </div>
 </div>
 </div>

 {/* Bottom row: Status badges and metadata */}
 <div className="flex flex-wrap items-center gap-2">
 {conn.provider === "kiro" && (
 <>
 <span className="rounded-sm bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
 {kiroMethodLabel(conn)}
 </span>
 {kiroRegion(conn) && (
 <span className="rounded-sm bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
 {kiroRegion(conn)}
 </span>
 )}
 </>
 )}
 <Badge
 variant={getStatusVariant(conn.isActive, getEffectiveConnectionStatus(conn, Date.now(), quota?.quotas))}
 size="sm"
 dot
 title={conn.isActive === false && conn.previousStatus && conn.previousStatus !== "disabled" ? `Status before disabled: ${conn.previousStatus}${conn.disabledAt ? ` at ${new Date(conn.disabledAt).toLocaleString("en-US")}` : ""}` : undefined}
 >
 {conn.isActive === false
 ? (conn.previousStatus && conn.previousStatus !== "disabled" ? `disabled (was: ${conn.previousStatus})` : "disabled")
 : getEffectiveConnectionStatus(conn, Date.now(), quota?.quotas)}
 </Badge>
 {conn.isActive === false && (conn.disabledReason || conn.lastError) && (
 <span
 className="max-w-full truncate text-xs text-warning"
 title={`Reason: ${conn.disabledReason || conn.lastError}${conn.disabledAt ? ` (${new Date(conn.disabledAt).toLocaleString("en-US")})` : ""}`}
 >
 {conn.disabledReason || conn.lastError}
 </span>
 )}
 {conn.providerSpecificData?.validationUrl && (
 <div className="inline-flex flex-wrap items-center gap-1 rounded-sm bg-warning/10 px-2 py-1 text-[11px] text-warning">
 <span className="font-medium">⚠️ Verify:</span>
 <a
 href={conn.providerSpecificData.validationUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="font-medium underline hover:text-warning"
 >
 Action Required ↗
 </a>
 <button
 type="button"
 onClick={() => copy(conn.providerSpecificData.validationUrl, `val-${conn.id}`)}
 className="inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[11px] text-warning hover:bg-warning/20"
 title="Copy validation URL"
 >
<Icon name={copied === `val-${conn.id}` ? "check" : "content_copy"} size={16} />
 <span>{copied === `val-${conn.id}` ? "Copied" : "Copy"}</span>
 </button>
 </div>
 )}
 {conn.provider === "kiro" && conn.providerSpecificData?.profileArn && (
 <button
 type="button"
 onClick={() => copy(conn.providerSpecificData.profileArn, conn.id)}
 title={conn.providerSpecificData.profileArn}
 className="inline-flex max-w-full items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] text-text-muted hover:text-primary hover:border-primary/30"
 >
<Icon name={copied === conn.id ? "check" : "content_copy"} size={16} />
 <code className="truncate font-mono">
 {conn.providerSpecificData.profileArn}
 </code>
 </button>
 )}
 </div>
 </div>

 <div className="px-4 py-3">
 {quota?.raw?.freebucks && !error && !isLoading && (
 <div className="mb-2 rounded-sm bg-surface-2 px-3 py-2 text-[11px] text-text-muted">
 {formatFreebucksHeader(quota.raw.freebucks)}
 </div>
 )}
 {isLoading ? (
 <div className="text-center py-3 text-text-muted">
 <Icon name="progress_activity" size={18} className="animate-spin" />
 </div>
 ) : error ? (
 <div className="text-center py-3">
 <Icon name="error" size={18} className="text-danger" />
 <p className="mt-1.5 text-xs text-text-muted">{error}</p>
 </div>
 ) : quota?.message ? (
 <div className="text-center py-3">
 <p className="text-xs text-text-muted">{quota.message}</p>
 </div>
 ) : (
 <QuotaTable
 quotas={visibleQuotas}
 compact
 sortMode="default"
 showSortLabel={
 conn.provider === "codex" && quotaSortMode !== "default"
 }
 onHideQuota={(quotaRow) => handleHideQuota(conn.provider, quotaRow)}
 />
 )}
 {quota?.message && !error && !isLoading && (
 <p className="mt-2 px-1 text-[11px] text-text-muted">
 {quota.message}
 </p>
 )}
 {hiddenQuotaRows.length > 0 && (
 <div className="mt-3 flex min-w-0 items-center gap-2 border-t border-border pt-3 text-[11px] text-text-muted">
 <Icon name="visibility_off" size={18} className="shrink-0" />
 <span className="shrink-0">Hidden:</span>
 <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
 {hiddenQuotaRows.map((quotaRow) => (
 <button
 key={getQuotaVisibilityKey(quotaRow)}
 type="button"
 onClick={() => handleShowQuota(conn.provider, quotaRow)}
 className="shrink-0 rounded-sm border border-border px-2 py-1 hover:bg-surface-2 hover:text-text-main transition-colors"
 title="Show this quota row"
 >
 {quotaRow.name}
 </button>
 ))}
 </div>
 </div>
 )}
 </div>
 </Card>
 );
 })}
 </div>
 )}

{hasVisibleConnections && (
      <div className="rounded-sm border border-border bg-surface px-3 py-2">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <span className="text-xs text-text-muted">{connectionsPageSummary}</span>
 <div className="flex flex-wrap items-center gap-2">
 <select
 value={isCustomPageSize ? "custom" : String(pageSize)}
 onChange={(event) => {
 const nextValue = event.target.value;
 if (nextValue === "custom") return;
 const nextPageSize = Number.parseInt(nextValue, 10);
 if (Number.isFinite(nextPageSize)) {
 setPage(1);
 setPageSize(nextPageSize);
 setCustomPageSizeInput(String(nextPageSize));
 }
 }}
                className="rounded-sm border border-border bg-surface px-3 py-2.5 text-xs min-h-11 text-text-main outline-none hover:bg-surface-2 transition-colors"
 aria-label="Accounts per page"
 >
 {ACCOUNT_PAGE_SIZE_OPTIONS.map((option) => (
 <option key={option} value={String(option)}>
 {option} / page
 </option>
 ))}
 <option value="custom">Custom</option>
 </select>
 <input
 type="number"
 min="1"
 max={String(ACCOUNT_PAGE_SIZE_MAX)}
 inputMode="numeric"
 value={customPageSizeInput}
 onChange={(event) => setCustomPageSizeInput(event.target.value)}
 onBlur={() => {
 const parsedValue = Number.parseInt(customPageSizeInput, 10);
 if (!Number.isFinite(parsedValue)) {
 setCustomPageSizeInput(String(pageSize));
 return;
 }
 const nextPageSize = Math.min(ACCOUNT_PAGE_SIZE_MAX, Math.max(1, parsedValue));
 setPage(1);
 setPageSize(nextPageSize);
 setCustomPageSizeInput(String(nextPageSize));
 }}
 onKeyDown={(event) => {
 if (event.key !== "Enter") return;
 const parsedValue = Number.parseInt(customPageSizeInput, 10);
 if (!Number.isFinite(parsedValue)) {
 setCustomPageSizeInput(String(pageSize));
 return;
 }
 const nextPageSize = Math.min(ACCOUNT_PAGE_SIZE_MAX, Math.max(1, parsedValue));
 setPage(1);
 setPageSize(nextPageSize);
 setCustomPageSizeInput(String(nextPageSize));
 }}
                className="w-20 rounded-sm border border-border bg-surface px-3 py-2.5 text-xs min-h-11 text-text-main outline-none hover:bg-surface-2 transition-colors"
 aria-label="Custom accounts per page"
 placeholder="Custom"
 />
 <span className="text-xs text-text-muted">Page {pagination.page} / {pagination.totalPages}</span>
 </div>
 <div className="flex items-center gap-1.5">
 <button
 type="button"
 onClick={() => setPage(1)}
 disabled={
 pagination.page <= 1 || connectionsLoading || refreshingAll
 }
              className="flex min-h-11 items-center rounded-sm border border-border px-3 py-2 text-xs text-text-main hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 transition-colors sm:min-h-9"
 >
 First Page
 </button>
 <button
 type="button"
 onClick={() =>
 setPage((currentPage) => Math.max(1, currentPage - 1))
 }
 disabled={
 pagination.page <= 1 || connectionsLoading || refreshingAll
 }
              className="flex min-h-11 w-11 items-center justify-center rounded-sm border border-border py-2 text-text-main hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 transition-colors sm:min-h-9 sm:w-9"
 aria-label="Previous accounts page"
 >
 <Icon name="chevron_left" size={18} />
 </button>
 <button
 type="button"
 onClick={() =>
 setPage((currentPage) =>
 Math.min(pagination.totalPages, currentPage + 1),
 )
 }
 disabled={
 pagination.page >= pagination.totalPages ||
 connectionsLoading ||
 refreshingAll
 }
              className="flex min-h-11 w-11 items-center justify-center rounded-sm border border-border py-2 text-text-main hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 transition-colors sm:min-h-9 sm:w-9"
 aria-label="Next accounts page"
 >
 <Icon name="chevron_right" size={18} />
 </button>
 <button
 type="button"
 onClick={() => setPage(pagination.totalPages)}
 disabled={
 pagination.page >= pagination.totalPages ||
 connectionsLoading ||
 refreshingAll
 }
              className="flex min-h-11 items-center rounded-sm border border-border px-3 py-2 text-xs text-text-main hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 transition-colors sm:min-h-9"
 >
 Last Page
 </button>
 </div>
 </div>
 </div>
)}

 <ConfirmModal
 isOpen={Boolean(resetConfirmState)}
 onClose={() => {
 if (!resettingLimitId) setResetConfirmState(null);
 }}
 onConfirm={async () => {
 const connection = resetConfirmState?.connection;
 if (!connection) return;
 await handleResetCodexLimit(connection.id, connection.provider);
 setResetConfirmState(null);
 }}
 title="Reset Codex limit?"
 message={`Use 1 Codex reset credit for ${getConnectionLabel(resetConfirmState?.connection || {}) || "this account"}. This cannot be undone. Remaining credits: ${resetConfirmState?.resetCreditCount ?? 0}.`}
 confirmText="Reset limit"
 cancelText="Cancel"
 variant="danger"
 loading={Boolean(resettingLimitId)}
 />

 {resetCreditsState && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-3">
 <div className="w-full max-w-2xl overflow-hidden rounded-sm border border-border bg-surface">
          <div className="flex items-start justify-between gap-3 border-b border-border bg-surface-2 px-3 py-2.5">
 <div className="min-w-0">
 <h3 className="text-sm font-semibold text-text-main">Codex Reset Credit Expiry</h3>
 <p className="mt-0.5 truncate text-xs text-text-muted">
 {getConnectionLabel(resetCreditsState.connection) || "Codex account"}
 </p>
 </div>
 <button
 type="button"
 onClick={() => setResetCreditsState(null)}
              className="flex size-11 items-center justify-center rounded-sm text-text-muted sm:size-9 hover:bg-surface-2 hover:text-text-main transition-colors"
 aria-label="Close reset credit expiry modal"
 >
 <Icon name="close" size={18} />
 </button>
 </div>

 <div className="max-h-[70vh] overflow-auto bg-surface p-3">
 {resetCreditsState.loading ? (
 <div className="flex items-center justify-center gap-2 py-3 text-sm text-text-muted">
 <Icon className="animate-spin" name="progress_activity" size={18} />
 Loading reset credits...
 </div>
 ) : resetCreditsState.error ? (
          <div className="rounded-sm border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger dark:text-danger">
 {resetCreditsState.error}
 </div>
 ) : resetCreditsState.data?.credits?.length ? (
 <div className="space-y-3">
          <div className="flex items-center justify-between rounded-sm border border-border bg-surface px-3 py-2 text-xs text-text-muted">
 <span>{resetCreditsState.data.credits.length} reset credit{resetCreditsState.data.credits.length === 1 ? "" : "s"}</span>
 <span>{resetCreditsState.data.availableCount ?? 0} available</span>
 </div>
 <div className="overflow-x-auto rounded-sm border border-border">
 <table className="w-full min-w-[560px] text-left text-sm" aria-label="Codex reset credit expiry">
 <thead className="bg-surface-2 text-xs text-text-muted">
 <tr>
              <th scope="col" className="px-3 py-2 font-medium text-xs text-text-muted">Status</th>
              <th scope="col" className="px-3 py-2 font-medium text-xs text-text-muted">Granted At</th>
              <th scope="col" className="px-3 py-2 font-medium text-xs text-text-muted">Expires At</th>
              <th scope="col" className="px-3 py-2 font-medium text-xs text-text-muted">Remaining</th>
 </tr>
 </thead>
 <tbody>
 {resetCreditsState.data.credits.map((credit, index) => (
 <tr key={`${credit.status}-${credit.expiresAt || index}`} className="border-t border-border">
              <td className="px-3 py-2.5 text-sm">
 <span className="rounded-sm bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
 {credit.status || "unknown"}
 </span>
 </td>
              <td className="px-3 py-2.5 text-text-muted text-sm">{formatCreditDate(credit.grantedAt)}</td>
              <td className="px-3 py-2.5 text-text-main text-sm">{formatCreditDate(credit.expiresAt)}</td>
              <td className="px-3 py-2.5 font-medium text-text-main text-sm">{formatTimeRemaining(credit.expiresAt)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 ) : (
 <div className="rounded-sm border border-border bg-surface px-3 py-3 text-center text-sm text-text-muted">
 No reset credit details returned for this account.
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 <ConfirmModal isOpen={Boolean(deleteConfirmId)} onClose={() => setDeleteConfirmId(null)} onConfirm={confirmDeleteConnection} title="Delete Connection" message="Delete this connection?" variant="danger" />

 <EditConnectionModal
 isOpen={showEditModal}
 connection={selectedConnection}
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
