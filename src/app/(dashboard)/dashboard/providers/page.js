"use client";
import { useMemo, useState, useEffect } from "react";
import { CardSkeleton } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { FREE_PROVIDERS, FREE_TIER_PROVIDERS } from "@/shared/constants/providers";
import { getRelativeTime } from "@/shared/utils";
import { useNotificationStore } from "@/store/notificationStore";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { matchesStatusFilter, SEARCH_DEBOUNCE_MS, matchesSearchQuery } from "./utils";
import ProvidersHeader from "./components/ProvidersHeader";
import ProvidersGrid from "./components/ProvidersGrid";
import ProvidersModals from "./components/ProvidersModals";

export default function ProvidersPage() {
 const [providerStats, setProviderStats] = useState({});
 const [providerNodes, setProviderNodes] = useState([]);
 const [loading, setLoading] = useState(true);
 const [showAllApikey, setShowAllApikey] = useState(false);
 const [showAddCompatibleModal, setShowAddCompatibleModal] = useState(false);
 const [showAddAnthropicCompatibleModal, setShowAddAnthropicCompatibleModal] = useState(false);
 const [testingMode, setTestingMode] = useState(null);
 const [testResults, setTestResults] = useState(null);
 const [statusFilter, setStatusFilter] = useState("all");
 const [togglePendingId, setTogglePendingId] = useState(null);
 const [confirmToggle, setConfirmToggle] = useState(null);
 const notify = useNotificationStore();
 const rawSearchQuery = useHeaderSearchStore((s) => s.query);
 const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
 const registerSearch = useHeaderSearchStore((s) => s.register);
 const unregisterSearch = useHeaderSearchStore((s) => s.unregister);

 useEffect(() => { registerSearch("Search providers..."); return () => unregisterSearch(); }, [registerSearch, unregisterSearch]);
 useEffect(() => { const t = setTimeout(() => setDebouncedSearchQuery(rawSearchQuery), SEARCH_DEBOUNCE_MS); return () => clearTimeout(t); }, [rawSearchQuery]);

 const searchQuery = debouncedSearchQuery;
 const matchSearch = (name) => matchesSearchQuery(name, searchQuery);

 // Pre-compute stats lookup map
 const statsMap = useMemo(() => {
 const map = {};
 for (const [providerId, statObj] of Object.entries(providerStats)) {
 for (const [authType, raw] of Object.entries(statObj || {})) {
 if (!raw) continue;
 const key = `${providerId}:${authType}`;
 map[key] = {
 connected: raw.connected || 0,
 error: raw.error || 0,
 total: raw.total || 0,
 allDisabled: raw.allDisabled !== false,
 latestErrorAt: raw.lastErrorAt || null,
 };
 }
 }
 return map;
 }, [providerStats]);

 // Dual-auth providers (oauth + apikey). kiro accepts both.
 const dualAuthTypes = (info, key) => {
 if (key === "kiro") return ["oauth", "apikey", "api_key"];
 const modes = info?.authModes;
 if (!Array.isArray(modes))
 return key in FREE_TIER_PROVIDERS || key in APIKEY_PROVIDERS ? ["oauth", "apikey", "api_key"] : "oauth";
 if (!modes.includes("apikey")) return "oauth";
 return ["oauth", "apikey", "api_key"];
 };

 const getProviderStats = (providerId, authType) => {
 const authTypes = Array.isArray(authType) ? authType : [authType];
 let connected = 0, error = 0, total = 0, latestErrorAt = null, allDisabled = true;
 for (const type of authTypes) {
 const stat = statsMap[`${providerId}:${type}`];
 if (stat) {
 total += stat.total; connected += stat.connected; error += stat.error;
 if (!stat.allDisabled) allDisabled = false;
 const rawStat = providerStats[providerId]?.[type];
 if (rawStat?.lastErrorAt && (!latestErrorAt || new Date(rawStat.lastErrorAt) > new Date(latestErrorAt)))
 latestErrorAt = rawStat.lastErrorAt;
 }
 }
 if (total === 0) allDisabled = false;
 return { connected, error, total, errorCode: error > 0 ? "ERR" : null, errorTime: latestErrorAt ? getRelativeTime(latestErrorAt) : null, allDisabled };
 };

 const matchStatus = (stats, isNoAuth) => matchesStatusFilter(statusFilter, stats, isNoAuth);

 const executeToggleProvider = async (providerId, authType, newActive) => {
 if (togglePendingId) return;
 const authTypes = Array.isArray(authType) ? authType : [authType];
 setTogglePendingId(providerId);
 setProviderStats((prev) => {
 const next = { ...prev }, currentP = { ...(next[providerId] || {}) };
 for (const type of authTypes) {
 const s = currentP[type];
 if (s) currentP[type] = { ...s, allDisabled: !newActive, connected: newActive ? (s.total - s.error) : 0 };
 }
 next[providerId] = currentP; return next;
 });
 try {
 const res = await fetch("/api/providers", {
 method: "PATCH", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ provider: providerId, authType: authTypes, isActive: newActive }),
 });
 if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
 notify.success(newActive ? "Provider enabled" : "Provider disabled");
 } catch (error) {
 setProviderStats((prev) => {
 const next = { ...prev }, currentP = { ...(next[providerId] || {}) };
 for (const type of authTypes) {
 const s = currentP[type];
 if (s) currentP[type] = { ...s, allDisabled: newActive, connected: newActive ? 0 : (s.total - s.error) };
 }
 next[providerId] = currentP; return next;
 });
 notify.error("Failed to update provider status");
 } finally { setTogglePendingId(null); }
 };

 const handleToggleProvider = (providerId, authType, newActive, providerName) => {
 if (togglePendingId) return;
 if (!newActive) { setConfirmToggle({ providerId, authType, providerName }); return; }
 executeToggleProvider(providerId, authType, newActive);
 };

 const handleBatchTest = async (mode, providerId = null) => {
 if (testingMode) return;
 setTestingMode(mode === "provider" ? providerId : mode); setTestResults(null);
 try {
 const res = await fetch("/api/providers/test-batch", {
 method: "POST", headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ mode, providerId }),
 });
 const data = await res.json(); setTestResults(data);
 if (data.summary) {
 const { passed, failed, total } = data.summary;
 if (failed === 0) notify.success(`All ${total} tests passed`);
 else notify.warning(`${passed}/${total} passed, ${failed} failed`);
 }
 } catch { setTestResults({ error: "Test request failed" }); notify.error("Provider test failed"); }
 finally { setTestingMode(null); }
 };

 const compatibleProviders = providerNodes.filter((n) => n.type === "openai-compatible")
 .map((n) => ({ id: n.id, name: n.name || "OpenAI Compatible", color: "#10A37F", textIcon: "OC", apiType: n.apiType }))
 .filter((p) => matchSearch(p.name) && matchStatus(getProviderStats(p.id, "apikey")));

 const anthropicCompatibleProviders = providerNodes.filter((n) => n.type === "anthropic-compatible")
 .map((n) => ({ id: n.id, name: n.name || "Anthropic Compatible", color: "#D97757", textIcon: "AC" }))
 .filter((p) => matchSearch(p.name) && matchStatus(getProviderStats(p.id, "apikey")));

 const sortByPriority = (entries, authType) => [...entries].sort(([ka, a], [kb, b]) => {
 const pa = a.priority ?? 999, pb = b.priority ?? 999;
 if (pa !== pb) return pa - pb;
 const ca = getProviderStats(ka, authType).connected > 0 ? 1 : 0, cb = getProviderStats(kb, authType).connected > 0 ? 1 : 0;
 if (ca !== cb) return cb - ca;
 return (a.name || "").localeCompare(b.name || "");
 });

 useEffect(() => {
 (async () => {
 try {
 const [statsRes, nodesRes] = await Promise.all([fetch("/api/providers/stats"), fetch("/api/provider-nodes")]);
 const [statsData, nodesData] = await Promise.all([statsRes.json(), nodesRes.json()]);
 if (statsRes.ok) setProviderStats(statsData.stats || {});
 if (nodesRes.ok) setProviderNodes(nodesData.nodes || []);
 } catch (e) { console.error("Providers fetch error:", e); } finally { setLoading(false); }
 })();
 }, []);

 const oauthEntries = sortByPriority(Object.entries(OAUTH_PROVIDERS)
 .filter(([k, i]) => !i.hidden && matchSearch(i.name) && matchStatus(getProviderStats(k, dualAuthTypes(i, k)), i.noAuth)), "oauth");
 const freeEntries = Object.entries(FREE_PROVIDERS)
 .filter(([k, i]) => !i.hidden && matchSearch(i.name) && matchStatus(getProviderStats(k, dualAuthTypes(i, k)), i.noAuth))
 .sort(([, a], [, b]) => (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0));
 const freeTierEntries = Object.entries(FREE_TIER_PROVIDERS)
 .filter(([k, i]) => !i.hidden && matchSearch(i.name) && (i.serviceKinds ?? ["llm"]).includes("llm") && matchStatus(getProviderStats(k, dualAuthTypes(i, k)), i.noAuth))
 .sort(([ka, a], [kb, b]) => {
 const pa = a.priority ?? 999, pb = b.priority ?? 999;
 if (pa !== pb) return pa - pb;
 const nd = (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0); if (nd !== 0) return nd;
 const ca = getProviderStats(ka, dualAuthTypes(a, ka)).connected > 0 ? 0 : 1;
 const cb = getProviderStats(kb, dualAuthTypes(b, kb)).connected > 0 ? 0 : 1;
 return ca !== cb ? ca - cb : (a.name || "").localeCompare(b.name || "");
 });
 const apikeyEntries = Object.entries(APIKEY_PROVIDERS)
 .filter(([k, i]) => !i.hidden && (i.serviceKinds ?? ["llm"]).includes("llm") && matchSearch(i.name) && matchStatus(getProviderStats(k, "apikey"), i.noAuth))
 .sort(([ka, a], [kb, b]) => {
 const ca = getProviderStats(ka, "apikey").total > 0 ? 0 : 1, cb = getProviderStats(kb, "apikey").total > 0 ? 0 : 1;
 return ca !== cb ? ca - cb : (a.name || "").localeCompare(b.name || "");
 });
 const isFiltering = !!searchQuery.trim() || statusFilter !== "all";

 if (loading) return <div className="flex flex-col gap-3"><CardSkeleton /><CardSkeleton /></div>;

 const hasAnyResult = oauthEntries.length > 0 || freeEntries.length > 0 || freeTierEntries.length > 0 ||
 apikeyEntries.length > 0 || compatibleProviders.length > 0 || anthropicCompatibleProviders.length > 0;

 const globalSummary = (() => {
 let total = 0, connected = 0, error = 0, disabled = 0;
 for (const p of Object.values(providerStats)) for (const s of Object.values(p)) {
 if (!s) continue; total += s.total || 0; connected += s.connected || 0; error += s.error || 0;
 if (s.allDisabled && s.total) disabled += s.total;
 }
 return { total, connected, error, disabled };
 })();

 return (
 <div className="flex min-w-0 flex-col gap-3">
 <ProvidersHeader globalSummary={globalSummary} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />
 {!hasAnyResult && (
 <div className="text-center py-3 border border-dashed border-border rounded-sm">
 <Icon className="text-text-muted mb-2" name="search_off" size={18} />
 <p className="text-text-muted text-sm">No providers match your search or filters</p>
 </div>
 )}
 <ProvidersGrid oauthEntries={oauthEntries} freeEntries={freeEntries} freeTierEntries={freeTierEntries}
 apikeyEntries={apikeyEntries} showAllApikey={showAllApikey} onShowAllApikey={() => setShowAllApikey(true)}
 isFiltering={isFiltering} getProviderStats={getProviderStats} dualAuthTypes={dualAuthTypes}
 testingMode={testingMode} onBatchTest={handleBatchTest} onToggleProvider={handleToggleProvider}
 togglePendingId={togglePendingId} compatibleProviders={compatibleProviders}
 anthropicCompatibleProviders={anthropicCompatibleProviders}
 onAddOpenAI={() => setShowAddCompatibleModal(true)} onAddAnthropic={() => setShowAddAnthropicCompatibleModal(true)} />
 <ProvidersModals showAddCompatibleModal={showAddCompatibleModal}
 showAddAnthropicCompatibleModal={showAddAnthropicCompatibleModal}
 onCloseAddCompatible={() => setShowAddCompatibleModal(false)}
 onCloseAddAnthropic={() => setShowAddAnthropicCompatibleModal(false)}
 onNodeCreated={(node, close) => { setProviderNodes((p) => [...p, node]); close(); }}
 confirmToggle={confirmToggle} onCloseConfirmToggle={() => setConfirmToggle(null)}
 onConfirmDisable={() => { const t = confirmToggle; setConfirmToggle(null); if (t) executeToggleProvider(t.providerId, t.authType, false); }}
 togglePending={togglePendingId} testResults={testResults} onCloseTestResults={() => setTestResults(null)} />
 </div>
 );
}
