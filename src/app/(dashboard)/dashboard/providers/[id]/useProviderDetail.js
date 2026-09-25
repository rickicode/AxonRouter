"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "@/lib/ui/navigation.js";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, WEB_COOKIE_PROVIDERS, getProviderAlias, isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { getThinkingLevels } from "open-sse/providers/thinkingLevels.js";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useNotificationStore } from "@/store/notificationStore";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { translate } from "@/i18n/runtime";
import { fetchSuggestedModels } from "@/shared/utils/providerModelsFetcher";
import { isFreeModel, sortModelsByFree } from "@/shared/utils/modelHelpers";

const ONE_BY_ONE_DELAY_MS = 1000;
const CONNECTION_PAGE_SIZE = 50;

const AUTO_PING_SETTINGS_KEYS = {
 claude: "claudeAutoPing",
 codex: "codexAutoPing",
};

function sleep(ms) {
 return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useProviderDetail() {
 const params = useParams();
 const router = useRouter();
 const providerId = params.id;
 const { getCaps } = useModelCaps();
 const [connections, setConnections] = useState([]);
 const [connectionPage, setConnectionPage] = useState(1);
 const [connectionPagination, setConnectionPagination] = useState({ page: 1, pageSize: CONNECTION_PAGE_SIZE, total: 0, totalPages: 1 });
 const [connectionSearch, setConnectionSearch] = useState("");
 const [connectionStatusFilter, setConnectionStatusFilter] = useState("all");
 const [connectionStats, setConnectionStats] = useState({ total: 0, active: 0, exhausted: 0, unavailable: 0, disabled: 0 });
 const [loading, setLoading] = useState(true);
 const [providerNode, setProviderNode] = useState(null);
 const [proxyPools, setProxyPools] = useState([]);
 const [proxyGroups, setProxyGroups] = useState({ defaultGroups: [], customGroups: [] });
 const [showOAuthModal, setShowOAuthModal] = useState(false);
 const [showXiaomiMimoModal, setShowXiaomiMimoModal] = useState(false);
 const [showIFlowCookieModal, setShowIFlowCookieModal] = useState(false);
 const [showAddApiKeyModal, setShowAddApiKeyModal] = useState(false);
 const [addConnectionError, setAddConnectionError] = useState("");
 const [showBulkImportCodex, setShowBulkImportCodex] = useState(false);
 const [showBulkImportGrokCli, setShowBulkImportGrokCli] = useState(false);
 const [showBulkImportJwt, setShowBulkImportJwt] = useState(false);
 const [showEditModal, setShowEditModal] = useState(false);
 const [showEditNodeModal, setShowEditNodeModal] = useState(false);
 const [showBulkProxyModal, setShowBulkProxyModal] = useState(false);
 const [selectedConnection, setSelectedConnection] = useState(null);
 const [modelAliases, setModelAliases] = useState({});
 const [customModels, setCustomModels] = useState([]);
 const [headerImgError, setHeaderImgError] = useState(false);
  const [modelTestResults, setModelTestResults] = useState({});
  const [modelTestErrors, setModelTestErrors] = useState({});
  const [modelsTestError, setModelsTestError] = useState("");
  const [testingModelIds, setTestingModelIds] = useState(() => new Set());
 const [showAddCustomModel, setShowAddCustomModel] = useState(false);
 const [selectedConnectionIds, setSelectedConnectionIds] = useState([]);
 const [bulkProxyPoolId, setBulkProxyPoolId] = useState("__none__");
 const [bulkProxyRotationStrategy, setBulkProxyRotationStrategy] = useState("none");
 const [bulkUpdatingProxy, setBulkUpdatingProxy] = useState(false);
 const [providerStrategy, setProviderStrategy] = useState(null);
 const [providerStickyLimit, setProviderStickyLimit] = useState("");
 const [thinkingMode, setThinkingMode] = useState("auto");
 const [autoPing, setAutoPing] = useState({ enabled: false, connections: {} });
 const [suggestedModels, setSuggestedModels] = useState([]);
 const [liveModels, setLiveModels] = useState([]);
 const [kiloFreeModels, setKiloFreeModels] = useState([]);
 const [disabledModelIds, setDisabledModelIds] = useState([]);
 const [confirmState, setConfirmState] = useState(null);
 const [showAgRiskModal, setShowAgRiskModal] = useState(false);
 const [oneByOneRunning, setOneByOneRunning] = useState(false);
 const [oneByOneStopping, setOneByOneStopping] = useState(false);
 const [oneByOneCurrentConnectionId, setOneByOneCurrentConnectionId] = useState(null);
 const [oneByOneResults, setOneByOneResults] = useState({});
 const [oneByOneSummary, setOneByOneSummary] = useState(null);
 const notify = useNotificationStore();
 const stopOneByOneRef = useRef(false);
 const [importingQoderModels, setImportingQoderModels] = useState(false);
 const [importingClineModels, setImportingClineModels] = useState(false);
 const [importingLiveModels, setImportingLiveModels] = useState(false);
 const { copied, copy } = useCopyToClipboard();

 const AG_RISK_STORAGE_KEY = "ag_risk_confirmed";

 const openOAuthConnection = () => {
 setShowOAuthModal(true);
 };

 const triggerOAuthConnection = () => {
 if (providerId === "antigravity" && typeof window !== "undefined") {
 const confirmed = window.localStorage.getItem(AG_RISK_STORAGE_KEY) === "true";
 if (!confirmed) {
 setShowAgRiskModal(true);
 return;
 }
 }
 if (providerId === "xiaomi-mimo") {
 setShowXiaomiMimoModal(true);
 return;
 }
 if (isOAuth) {
 openOAuthConnection();
 return;
 }
 setAddConnectionError("");
 setShowAddApiKeyModal(true);
 };

 const triggerApiKeyConnection = () => {
 setAddConnectionError("");
 setShowAddApiKeyModal(true);
 };

 const triggerAddConnection = () => {
 if (isOAuth) {
 triggerOAuthConnection();
 return;
 }
 triggerApiKeyConnection();
 };

 const handleAgRiskConfirm = () => {
 if (typeof window !== "undefined") {
 window.localStorage.setItem(AG_RISK_STORAGE_KEY, "true");
 }
 setShowAgRiskModal(false);
 if (isOAuth) {
 openOAuthConnection();
 return;
 }
 triggerApiKeyConnection();
 };

 const providerInfo = providerNode
 ? {
 id: providerNode.id,
 name: providerNode.name || (providerNode.type === "anthropic-compatible" ? "Anthropic Compatible" : "OpenAI Compatible"),
 color: providerNode.type === "anthropic-compatible" ? "#D97757" : "#10A37F",
 textIcon: providerNode.type === "anthropic-compatible" ? "AC" : "OC",
 apiType: providerNode.apiType,
 baseUrl: providerNode.baseUrl,
 type: providerNode.type,
 }
 : (OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId] || FREE_PROVIDERS[providerId] || FREE_TIER_PROVIDERS[providerId] || WEB_COOKIE_PROVIDERS[providerId]);
 const authModes = providerInfo?.authModes || [];
 const isOAuth = !!OAUTH_PROVIDERS[providerId] || !!FREE_PROVIDERS[providerId] || authModes.includes("oauth");
 const supportsApiKeyAuth = !!APIKEY_PROVIDERS[providerId] || authModes.includes("apikey");
 const isFreeNoAuth = !!FREE_PROVIDERS[providerId]?.noAuth;
 const staticModels = getModelsByProviderId(providerId);
 const models = providerId === "cursor" && liveModels.length > 0
 ? liveModels
 : staticModels;
 const providerAlias = getProviderAlias(providerId);
 
 const isOpenAICompatible = isOpenAICompatibleProvider(providerId);
 const isAnthropicCompatible = isAnthropicCompatibleProvider(providerId);
 const isCompatible = isOpenAICompatible || isAnthropicCompatible;
 const hasDualAuthModes = !isCompatible && isOAuth && supportsApiKeyAuth;
 const oauthConnectionLabel =
 providerId === "xai" ? "Grok Build OAuth"
 : providerId === "grok-cli" ? "Grok CLI Device Login"
 : providerId === "kimi" ? "Kimi Coding OAuth"
 : "OAuth";
 const apiKeyConnectionLabel =
 providerId === "xai" ? "xAI API Key"
 : providerId === "kimi" ? "Kimi API Key"
 : providerId === "qoder" ? "PAT"
 : "API Key";
 const resolveThinkingSuffix = (modelId) => {
 if (!thinkingMode || thinkingMode === "auto") return null;
 const levels = getThinkingLevels(providerId, modelId);
 return levels && levels.includes(thinkingMode) ? thinkingMode : null;
 };
 const providerStorageAlias = isCompatible ? providerId : providerAlias;
 const providerThinkingLevels = (() => {
 const set = new Set();
 const seen = new Set();
 const addLevels = (modelId) => {
 if (!modelId || seen.has(modelId)) return;
 seen.add(modelId);
 const lv = getThinkingLevels(providerId, modelId);
 if (lv) lv.forEach((l) => { if (l !== "none") set.add(l); });
 };
 for (const m of models) addLevels(m.id);
 for (const m of kiloFreeModels) addLevels(m.id);
 for (const entry of customModels) {
 if (entry.providerAlias !== providerStorageAlias) continue;
 if ((entry.kind || entry.type || "llm") !== "llm") continue;
 addLevels(entry.id);
 }
 return set.size ? ["auto", ...[...set]] : null;
 })();
 const providerDisplayAlias = isCompatible
 ? (providerNode?.prefix || providerId)
 : providerAlias;

 const fetchDisabledModels = useCallback(async () => {
 try {
 const res = await fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}`, { cache: "no-store" });
 const data = await res.json();
 if (res.ok) setDisabledModelIds(data.ids || []);
 } catch (error) {
 }
 }, [providerStorageAlias]);

 const handleDisableModel = async (modelId) => {
 try {
 const res = await fetch("/api/models/disabled", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ providerAlias: providerStorageAlias, ids: [modelId] }),
 });
 if (res.ok) await fetchDisabledModels();
 } catch (error) {
 }
 };

 const handleEnableModel = async (modelId) => {
 try {
 const res = await fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}&id=${encodeURIComponent(modelId)}`, { method: "DELETE" });
 if (res.ok) await fetchDisabledModels();
 } catch (error) {
 }
 };

 const handleDisableAll = async (ids) => {
 if (!ids.length) return;
 setConfirmState({
 title: "Disable All Models",
 message: `Disable all ${ids.length} model(s)?`,
 onConfirm: async () => {
 setConfirmState(null);
 try {
 const res = await fetch("/api/models/disabled", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ providerAlias: providerStorageAlias, ids }),
 });
 if (res.ok) await fetchDisabledModels();
 } catch (error) {
 }
 }
 });
 };

 const handleEnableAll = async () => {
 try {
 const res = await fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}`, { method: "DELETE" });
 if (res.ok) await fetchDisabledModels();
 } catch (error) {
 }
 };

 const fetchAliases = useCallback(async () => {
 try {
 const res = await fetch("/api/models/alias");
 const data = await res.json();
 if (res.ok) {
 setModelAliases(data.aliases || {});
 }
 } catch (error) {
 }
 }, []);

 const fetchCustomModels = useCallback(async () => {
 try {
 const res = await fetch("/api/models/custom", { cache: "no-store" });
 const data = await res.json();
 if (res.ok) {
 setCustomModels(data.models || []);
 }
 } catch (error) {
 }
 }, []);

 useEffect(() => {
 if (providerId !== "kilocode") return;
 fetch("/api/providers/kilo/free-models")
 .then((res) => res.json())
 .then((data) => { if (data.models?.length) setKiloFreeModels(data.models); })
 .catch(() => {});
 }, [providerId]);

 const fetchConnectionStats = useCallback(async () => {
 try {
 const [allRes, activeRes, exhaustedRes, unavailableRes, disabledRes] = await Promise.all([
 fetch(`/api/providers?provider=${encodeURIComponent(providerId)}&pageSize=1`, { cache: "no-store" }),
 fetch(`/api/providers?provider=${encodeURIComponent(providerId)}&status=active&pageSize=1`, { cache: "no-store" }),
 fetch(`/api/providers?provider=${encodeURIComponent(providerId)}&status=exhausted&pageSize=1`, { cache: "no-store" }),
 fetch(`/api/providers?provider=${encodeURIComponent(providerId)}&status=unavailable&pageSize=1`, { cache: "no-store" }),
 fetch(`/api/providers?provider=${encodeURIComponent(providerId)}&status=disabled&pageSize=1`, { cache: "no-store" }),
 ]);
 const [allData, activeData, exhaustedData, unavailableData, disabledData] = await Promise.all([
 allRes.json(), activeRes.json(), exhaustedRes.json(), unavailableRes.json(), disabledRes.json(),
 ]);
 setConnectionStats({
 total: allData.pagination?.total || 0,
 active: activeData.pagination?.total || 0,
 exhausted: exhaustedData.pagination?.total || 0,
 unavailable: unavailableData.pagination?.total || 0,
 disabled: disabledData.pagination?.total || 0,
 });
 } catch (err) {
 }
 }, [providerId]);

 const fetchConnections = useCallback(async (targetPage = connectionPage, search = connectionSearch, status = connectionStatusFilter) => {
 try {
 const connectionParams = new URLSearchParams({
 provider: providerId,
 page: String(targetPage),
 pageSize: String(CONNECTION_PAGE_SIZE),
 });
 if (search && search.trim()) {
 connectionParams.set("search", search.trim());
 }
 if (status && status !== "all") {
 connectionParams.set("status", status);
 }
 const [connectionsRes, nodesRes, proxyPoolsRes, settingsRes, proxyGroupsRes] = await Promise.all([
 fetch(`/api/providers?${connectionParams.toString()}`, { cache: "no-store" }),
 fetch("/api/provider-nodes", { cache: "no-store" }),
 fetch("/api/proxy-pools?isActive=true", { cache: "no-store" }),
 fetch("/api/settings", { cache: "no-store" }),
 fetch("/api/proxy-groups", { cache: "no-store" }),
 ]);
 const connectionsData = await connectionsRes.json();
 const nodesData = await nodesRes.json();
 const proxyPoolsData = await proxyPoolsRes.json();
 const settingsData = settingsRes.ok ? await settingsRes.json() : {};
 const proxyGroupsData = proxyGroupsRes?.ok ? await proxyGroupsRes.json() : null;
 if (connectionsRes.ok) {
 setConnections(connectionsData.connections || []);
 if (connectionsData.pagination) {
 setConnectionPagination(connectionsData.pagination);
 setConnectionPage(connectionsData.pagination.page);
 }
 }
 if (proxyPoolsRes.ok) {
 setProxyPools(proxyPoolsData.proxyPools || []);
 }
 if (proxyGroupsData) {
 setProxyGroups(proxyGroupsData);
 }
 const override = (settingsData.providerStrategies || {})[providerId] || {};
 setProviderStrategy(override.fallbackStrategy || null);
 setProviderStickyLimit(override.stickyRoundRobinLimit != null ? String(override.stickyRoundRobinLimit) : "1");
 const thinkingCfg = (settingsData.providerThinking || {})[providerId] || {};
 setThinkingMode(thinkingCfg.mode || "auto");
 const autoPingSettingsKey = AUTO_PING_SETTINGS_KEYS[providerId];
 const apCfg = autoPingSettingsKey ? settingsData[autoPingSettingsKey] || {} : {};
 setAutoPing({ enabled: apCfg.enabled === true, connections: apCfg.connections || {} });
 if (nodesRes.ok) {
 let node = (nodesData.nodes || []).find((entry) => entry.id === providerId) || null;
 if (!node && isCompatible) {
 for (let attempt = 0; attempt < 3; attempt += 1) {
 await new Promise((resolve) => setTimeout(resolve, 150));
 const retryRes = await fetch("/api/provider-nodes", { cache: "no-store" });
 if (!retryRes.ok) continue;
 const retryData = await retryRes.json();
 node = (retryData.nodes || []).find((entry) => entry.id === providerId) || null;
 if (node) break;
 }
 }
 setProviderNode(node);
 }
 } catch (error) {
 } finally {
 setLoading(false);
 }
 }, [providerId, isCompatible, connectionPage, connectionSearch, connectionStatusFilter]);

 const handleUpdateNode = async (formData) => {
 try {
 const res = await fetch(`/api/provider-nodes/${providerId}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(formData),
 });
 const data = await res.json();
 if (res.ok) {
 setProviderNode(data.node);
 await fetchConnections();
 setShowEditNodeModal(false);
 }
 } catch (error) {
 }
 };

 const saveProviderStrategy = async (strategy, stickyLimit) => {
 try {
 const settingsRes = await fetch("/api/settings", { cache: "no-store" });
 const settingsData = settingsRes.ok ? await settingsRes.json() : {};
 const current = settingsData.providerStrategies || {};
 const override = { ...(current[providerId] || {}) };
 if (strategy) override.fallbackStrategy = strategy;
 else {
 delete override.fallbackStrategy;
 delete override.stickyRoundRobinLimit;
 }
 if (strategy === "round-robin" && stickyLimit !== "") {
 override.stickyRoundRobinLimit = Number(stickyLimit) || 3;
 }
 const updated = { ...current };
 if (Object.keys(override).length === 0) {
 delete updated[providerId];
 } else {
 updated[providerId] = override;
 }
 await fetch("/api/settings", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ providerStrategies: updated }),
 });
 } catch (error) {
 }
 };

 const handleUnlockModel = async (connectionId) => {
 try {
 const res = await fetch(`/api/providers/${connectionId}/unlock-model`, { method: "POST" });
 if (res.ok) {
 notify.success("Model lock released");
 await fetchConnections();
 } else {
 const d = await res.json().catch(() => ({}));
 notify.error(d?.error || "Failed to release model lock");
 }
 } catch (e) {
 notify.error("Failed to release model lock");
 }
 };

 const handleRoundRobinToggle = (enabled) => {
 const strategy = enabled ? "round-robin" : null;
 const sticky = enabled ? (providerStickyLimit || "1") : providerStickyLimit;
 if (enabled && !providerStickyLimit) setProviderStickyLimit("1");
 setProviderStrategy(strategy);
 saveProviderStrategy(strategy, sticky);
 };

 const handleStickyLimitChange = (value) => {
 setProviderStickyLimit(value);
 saveProviderStrategy("round-robin", value);
 };

 const saveThinkingConfig = async (mode) => {
 try {
 const settingsRes = await fetch("/api/settings", { cache: "no-store" });
 const settingsData = settingsRes.ok ? await settingsRes.json() : {};
 const current = settingsData.providerThinking || {};
 const updated = { ...current };
 if (!mode || mode === "auto") {
 delete updated[providerId];
 } else {
 updated[providerId] = { mode };
 }
 await fetch("/api/settings", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ providerThinking: updated }),
 });
 } catch (error) {
 }
 };

 const handleThinkingModeChange = (mode) => {
 setThinkingMode(mode);
 saveThinkingConfig(mode);
 };

 const saveAutoPing = async (next) => {
 const autoPingSettingsKey = AUTO_PING_SETTINGS_KEYS[providerId];
 if (!autoPingSettingsKey) return;
 setAutoPing(next);
 try {
 await fetch("/api/settings", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ [autoPingSettingsKey]: next }),
 });
 } catch (error) {
 }
 };

 const handleAutoPingConnection = (connectionId, on) => {
 saveAutoPing({ ...autoPing, connections: { ...autoPing.connections, [connectionId]: on } });
 };

 useEffect(() => {
 Promise.resolve().then(() => {
 fetchConnections();
 fetchConnectionStats();
 fetchAliases();
 fetchCustomModels();
 fetchDisabledModels();
 });
 }, [fetchConnections, fetchConnectionStats, fetchAliases, fetchCustomModels, fetchDisabledModels]);

 useEffect(() => {
 if (providerId !== "cursor") {
 queueMicrotask(() => setLiveModels([]));
 return;
 }
 const connection = connections.find((item) => item.isActive !== false);
 if (!connection?.id) {
 queueMicrotask(() => setLiveModels([]));
 return;
 }
 let cancelled = false;
 fetch(`/api/providers/${connection.id}/models`, { cache: "no-store" })
 .then(async (res) => ({ ok: res.ok, data: await res.json() }))
 .then(({ ok, data }) => {
 if (!cancelled && ok && Array.isArray(data.models) && data.models.length > 0) {
 setLiveModels(data.models);
 }
 })
 .catch(() => {});
 return () => { cancelled = true; };
 }, [providerId, connections]);

 useEffect(() => {
 const fetcher = (OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId] || FREE_PROVIDERS[providerId] || FREE_TIER_PROVIDERS[providerId])?.modelsFetcher;
 if (!fetcher) return;
 fetchSuggestedModels(fetcher).then(setSuggestedModels);
 }, [providerId]);

 const handleSetAlias = async (modelId, alias, providerAliasOverride = providerAlias) => {
 const fullModel = `${providerAliasOverride}/${modelId}`;
 try {
 const res = await fetch("/api/models/alias", {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ model: fullModel, alias }),
 });
 if (res.ok) {
 await fetchAliases();
 } else {
 const data = await res.json();
 notify.error(data.error || "Failed to set alias");
 }
 } catch (error) {
 }
 };

 const handleDeleteAlias = async (alias) => {
 try {
 const res = await fetch(`/api/models/alias?alias=${encodeURIComponent(alias)}`, { method: "DELETE" });
 if (res.ok) {
 await fetchAliases();
 }
 } catch (error) {
 }
 };

 const handleAddCustomModel = async (modelId, type = "llm", providerAliasOverride = providerStorageAlias, caps) => {
 try {
 const res = await fetch("/api/models/custom", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ providerAlias: providerAliasOverride, id: modelId, type, ...(caps ? { caps } : {}) }),
 });
 if (res.ok) {
 await fetchCustomModels();
 if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
 } else {
 const data = await res.json();
 notify.error(data.error || "Failed to add custom model");
 }
 } catch (error) {
 }
 };

 const handleDeleteCustomModel = async (modelId, type = "llm", providerAliasOverride = providerStorageAlias) => {
 try {
 const params = new URLSearchParams({ providerAlias: providerAliasOverride, id: modelId, type });
 const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
 if (res.ok) {
 await fetchCustomModels();
 if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
 }
 } catch (error) {
 }
 };

 const handleImportQoderModels = async () => {
 if (importingQoderModels) return;
 const activeConnection = connections.find((conn) => conn.isActive !== false);
 if (!activeConnection) {
 notify.warning(translate("Please add an active Qoder connection first"));
 return;
 }
 setImportingQoderModels(true);
 try {
 const res = await fetch(`/api/providers/${activeConnection.id}/models`);
 const data = await res.json();
 if (!res.ok) {
 notify.error(data.error || translate("Failed to fetch models"));
 return;
 }
 const models = data.models || [];
 if (models.length === 0) {
 notify.warning(translate("No models returned"));
 return;
 }
 let importedCount = 0;
 for (const model of models) {
 const modelId = model.id || model.name;
 if (!modelId) continue;
 const cleanModelId = modelId.replace(/^qoder\//, "");
 const alreadyExists = customModels.some(
 (entry) => entry.providerAlias === providerStorageAlias && entry.id === cleanModelId && (entry.kind || entry.type || "llm") === "llm"
 ) || Object.values(modelAliases).includes(`${providerStorageAlias}/${cleanModelId}`);
 if (alreadyExists) continue;
 await handleAddCustomModel(cleanModelId, "llm", providerStorageAlias);
 importedCount += 1;
 }
 if (importedCount === 0) {
 notify.warning(translate("All models already exist, no new models added"));
 } else {
 notify.success(translate("Successfully added") + ` ${importedCount} ` + translate("models"));
 }
 } catch (error) {
 notify.error(translate("Error fetching models") + ": " + error.message);
 } finally {
 setImportingQoderModels(false);
 }
 };

 const handleImportLiveModels = async () => {
 if (importingLiveModels) return;
 const activeConnection = connections.find((conn) => conn.isActive !== false);
 if (!activeConnection) {
 notify.warning(translate("Please add an active connection first"));
 return;
 }
 setImportingLiveModels(true);
 try {
 const res = await fetch(`/api/providers/${activeConnection.id}/models`);
 const data = await res.json();
 if (!res.ok) {
 notify.error(data.error || translate("Failed to fetch models"));
 return;
 }
 const models = data.models || [];
 if (models.length === 0) {
 notify.warning(translate("No models returned"));
 return;
 }
 let importedCount = 0;
 for (const model of models) {
 const modelId = model.id || model.name;
 if (!modelId) continue;
 const alreadyExists = customModels.some(
 (entry) => entry.providerAlias === providerStorageAlias && entry.id === modelId && (entry.kind || entry.type || "llm") === "llm"
 ) || Object.values(modelAliases).includes(`${providerStorageAlias}/${modelId}`) || models.some((m) => m.id === modelId);
 if (alreadyExists) continue;
 await handleAddCustomModel(modelId, "llm", providerStorageAlias);
 importedCount += 1;
 }
 if (importedCount === 0) {
 notify.warning(translate("All models already exist, no new models added"));
 } else {
 notify.success(translate("Successfully added") + ` ${importedCount} ` + translate("models"));
 }
 } catch (error) {
 notify.error(translate("Error fetching models") + ": " + error.message);
 } finally {
 setImportingLiveModels(false);
 }
 };

 const handleImportClineModels = async () => {
 if (importingClineModels) return;
 const activeConnection = connections.find((conn) => conn.isActive !== false);
 if (!activeConnection) {
 notify.warning(translate("Please add an active Cline connection first"));
 return;
 }
 setImportingClineModels(true);
 try {
 const res = await fetch(`/api/providers/${activeConnection.id}/models`);
 const data = await res.json();
 if (!res.ok) {
 notify.error(data.error || translate("Failed to fetch models"));
 return;
 }
 const models = data.models || [];
 if (models.length === 0) {
 notify.warning(translate("No models returned"));
 return;
 }
 let importedCount = 0;
 for (const model of models) {
 const modelId = model.id || model.name;
 if (!modelId) continue;
 const alreadyExists = customModels.some(
 (entry) => entry.providerAlias === providerStorageAlias && entry.id === modelId && (entry.kind || entry.type || "llm") === "llm"
 ) || Object.values(modelAliases).includes(`${providerStorageAlias}/${modelId}`);
 if (alreadyExists) continue;
 await handleAddCustomModel(modelId, "llm", providerStorageAlias);
 importedCount += 1;
 }
 if (importedCount === 0) {
 notify.warning(translate("All models already exist, no new models added"));
 } else {
 notify.success(translate("Successfully added") + ` ${importedCount} ` + translate("models"));
 }
 } catch (error) {
 notify.error(translate("Error fetching models") + ": " + error.message);
 } finally {
 setImportingClineModels(false);
 }
 };

 const handleRunOneByOneTest = async () => {
 if (oneByOneRunning || connections.length === 0) return;
 const queuedState = Object.fromEntries(
 connections.map((connection) => [connection.id, { state: "queued", error: null }]),
 );
 stopOneByOneRef.current = false;
 setOneByOneRunning(true);
 setOneByOneStopping(false);
 setOneByOneCurrentConnectionId(null);
 setOneByOneResults(queuedState);
 setOneByOneSummary({ total: connections.length, completed: 0, passed: 0, failed: 0, stopped: false });
 let passed = 0;
 let failed = 0;
 try {
 for (let index = 0; index < connections.length; index += 1) {
 if (stopOneByOneRef.current) {
 setOneByOneSummary({ total: connections.length, completed: index, passed, failed, stopped: true });
 break;
 }
 const connection = connections[index];
 setOneByOneCurrentConnectionId(connection.id);
 setOneByOneResults((prev) => ({ ...prev, [connection.id]: { state: "testing", error: null } }));
 try {
 const res = await fetch(`/api/providers/${connection.id}/test`, { method: "POST" });
 const data = await res.json();
 const valid = !!data.valid;
 if (valid) { passed += 1; } else { failed += 1; }
 setOneByOneResults((prev) => ({
 ...prev,
 [connection.id]: { state: valid ? "success" : "failed", error: valid ? null : (data.error || null) },
 }));
 } catch (error) {
 failed += 1;
 setOneByOneResults((prev) => ({
 ...prev,
 [connection.id]: { state: "failed", error: error.message || "Test failed" },
 }));
 }
 setOneByOneSummary({ total: connections.length, completed: index + 1, passed, failed, stopped: false });
 if (index < connections.length - 1) {
 await sleep(ONE_BY_ONE_DELAY_MS);
 }
 }
 } finally {
 setOneByOneCurrentConnectionId(null);
 setOneByOneRunning(false);
 setOneByOneStopping(false);
 stopOneByOneRef.current = false;
 }
 };

 const handleStopOneByOneTest = () => {
 if (!oneByOneRunning) return;
 stopOneByOneRef.current = true;
 setOneByOneStopping(true);
 };

 const handleResetConnectionStatus = async (connectionId) => {
 try {
 const res = await fetch(`/api/providers/${connectionId}/reset-status`, { method: "POST" });
 if (res.ok) {
      notify.success("Status and cooldown reset");
      await fetchConnections();
      fetchConnectionStats();
 } else {
 const d = await res.json().catch(() => ({}));
 notify.error(d.error || "Failed to reset status");
 }
 } catch (err) {
 notify.error("Failed to reset status");
 }
 };

 const handleBulkResetStatus = async () => {
 const isSelectedMode = selectedConnectionIds.length > 0;
 try {
 const res = await fetch("/api/providers/bulk-reset-status", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ provider: providerId, ids: isSelectedMode ? selectedConnectionIds : undefined }),
 });
 const data = await res.json().catch(() => ({}));
 if (res.ok) {
 notify.success(`Reset status and cooldown for ${data.count ?? (isSelectedMode ? selectedConnectionIds.length : (connectionPagination.total || connections.length))} connection(s)`);
 await fetchConnections();
 if (typeof fetchConnectionStats === "function") fetchConnectionStats();
 } else {
 notify.error(data.error || "Failed to reset status");
 }
 } catch {
 notify.error("Failed to reset status");
 }
 };

 const handleDelete = async (id) => {
 setConfirmState({
 title: "Delete Connection",
 message: "Delete this connection?",
 onConfirm: async () => {
 setConfirmState(null);
 try {
 const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setConnections(prev => prev.filter(c => c.id !== id));
        fetchConnectionStats();
      }
 } catch (error) {
 }
 }
 });
 };

 const handleBulkDelete = () => {
 const count = selectedConnectionIds.length;
 if (count === 0) return;
 setConfirmState({
 title: `Delete ${count} Connection${count > 1 ? "s" : ""}`,
 message: `Delete ${count} connection${count > 1 ? "s" : ""}? This cannot be undone.`,
 onConfirm: async () => {
 setConfirmState(null);
 const idsToDelete = [...selectedConnectionIds];
 try {
 const res = await fetch("/api/providers", {
 method: "DELETE",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ ids: idsToDelete }),
 });
      if (res.ok) {
        setConnections(prev => prev.filter(c => !idsToDelete.includes(c.id)));
        setSelectedConnectionIds([]);
        notify.success(`Deleted ${idsToDelete.length} connection(s)`);
        fetchConnectionStats();
 } else {
 notify.error("Failed to delete connections");
 }
 } catch (error) {
 notify.error("Failed to delete connections");
 }
 }
 });
 };

 const handleBulkToggleActive = async (isActive) => {
 const count = selectedConnectionIds.length;
 if (count === 0) return;
 const targetIds = [...selectedConnectionIds];
 try {
 const res = await fetch("/api/providers", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ ids: targetIds, isActive }),
 });
      if (res.ok) {
        setConnections(prev => prev.map(c => targetIds.includes(c.id) ? { ...c, isActive } : c));
        notify.success(`${isActive ? "Enabled" : "Disabled"} ${targetIds.length} connection(s)`);
        fetchConnectionStats();
 } else {
 notify.error(`Failed to ${isActive ? "enable" : "disable"} connections`);
 }
 } catch (err) {
 notify.error(`Failed to ${isActive ? "enable" : "disable"} connections`);
 }
 };

  const handleOAuthSuccess = () => {
    fetchConnections();
    fetchConnectionStats();
    setShowOAuthModal(false);
  };

  const handleIFlowCookieSuccess = () => {
    fetchConnections();
    fetchConnectionStats();
    setShowIFlowCookieModal(false);
  };

 const handleSaveApiKey = async (formData) => {
 setAddConnectionError("");
 try {
 const res = await fetch("/api/providers", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ provider: providerId, ...formData }),
 });
 let data = null;
 try { data = await res.json(); } catch { data = null; }
 if (res.ok) {
      await fetchConnections();
      fetchConnectionStats();
      setShowAddApiKeyModal(false);
      return;
 }
 setAddConnectionError(data?.error || "Failed to save connection");
 } catch (error) {
 setAddConnectionError("Failed to save connection");
 }
 };

 const handleUpdateConnection = async (formData) => {
 try {
 const res = await fetch(`/api/providers/${selectedConnection.id}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(formData),
 });
 if (res.ok) {
 await fetchConnections();
 setShowEditModal(false);
 }
 } catch (error) {
 }
 };

 const handleUpdateConnectionStatus = async (id, isActive) => {
 try {
 const res = await fetch(`/api/providers/${id}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ isActive }),
 });
      if (res.ok) {
        setConnections(prev => prev.map(c => c.id === id ? { ...c, isActive } : c));
        fetchConnectionStats();
      }
 } catch (error) {
 }
 };

 const handleSwapPriority = async (index1, index2) => {
 const newConnections = [...connections];
 [newConnections[index1], newConnections[index2]] = [newConnections[index2], newConnections[index1]];
 setConnections(newConnections);
 try {
 await Promise.all([
 fetch(`/api/providers/${newConnections[index1].id}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ priority: index1 }),
 }),
 fetch(`/api/providers/${newConnections[index2].id}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ priority: index2 }),
 }),
 ]);
 } catch (error) {
 await fetchConnections();
 }
 };

 const selectedConnections = connections.filter((conn) => selectedConnectionIds.includes(conn.id));
 const allSelected = connections.length > 0 && selectedConnectionIds.length === connections.length;

 const toggleSelectConnection = (connectionId) => {
 setSelectedConnectionIds((prev) =>
 prev.includes(connectionId) ? prev.filter((id) => id !== connectionId) : [...prev, connectionId]
 );
 };

 const toggleSelectAllConnections = () => {
 if (allSelected) {
 setSelectedConnectionIds([]);
 return;
 }
 setSelectedConnectionIds(connections.map((conn) => conn.id));
 };

 const clearSelection = () => {
 setSelectedConnectionIds([]);
 setBulkProxyPoolId("__none__");
 };

 useEffect(() => {
 queueMicrotask(() => {
 setSelectedConnectionIds((prev) => prev.filter((id) => connections.some((conn) => conn.id === id)));
 });
 }, [connections]);

 const openBulkProxyModal = () => {
 if (selectedConnections.length === 0) return;
 const uniquePoolIds = [...new Set(selectedConnections.map((conn) => conn.providerSpecificData?.proxyPoolId || "__none__"))];
 setBulkProxyPoolId(uniquePoolIds.length === 1 ? uniquePoolIds[0] : "__none__");
 setBulkProxyRotationStrategy("none");
 setShowBulkProxyModal(true);
 };

 const closeBulkProxyModal = () => {
 if (bulkUpdatingProxy) return;
 setShowBulkProxyModal(false);
 };

 const applyBulkProxy = async (payload) => {
 setBulkUpdatingProxy(true);
 const isSelectedMode = selectedConnectionIds.length > 0;
 try {
 const res = await fetch("/api/providers/bulk-proxy", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ provider: providerId, ids: isSelectedMode ? selectedConnectionIds : undefined, ...payload }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) {
 notify.error(data.error || "Failed to apply proxy");
 } else {
 notify.success(`Applied proxy for ${data.updatedCount ?? (isSelectedMode ? selectedConnectionIds.length : (connectionPagination.total || connections.length))} connection(s)`);
 await fetchConnections();
 setShowBulkProxyModal(false);
 }
 } catch (e) {
 notify.error("Failed to apply proxy");
 } finally {
 setBulkUpdatingProxy(false);
 }
 };

 const handleApplyGroup = (groupName) => {
 return applyBulkProxy({
 action: "group",
 proxyGroup: groupName,
 proxyRotationStrategy: bulkProxyRotationStrategy === "none" ? "round-robin" : bulkProxyRotationStrategy,
 });
 };

 const handleApplySinglePool = (proxyPoolId) => {
 if (proxyPoolId === null) {
 return applyBulkProxy({ action: "unbind" });
 }
 return applyBulkProxy({ action: "single", proxyPoolId });
 };

 const handleApplyOneToOne = () => {
 const activePools = proxyPools.filter((p) => p.isActive === true);
 if (activePools.length === 0) {
 notify.error("No active proxy pools available.");
 return;
 }
 return applyBulkProxy({ action: "one-to-one", activePoolIds: activePools.map((p) => p.id) });
 };

 const handleApplyRotationStrategy = () => {
 if (bulkProxyRotationStrategy === "none") {
 notify.error("Choose a rotation strategy first.");
 return;
 }
 const activePools = proxyPools.filter((p) => p.isActive === true);
 if (activePools.length === 0) {
 notify.error("No active proxy pools available.");
 return;
 }
 return applyBulkProxy({
 action: "strategy",
 proxyPoolIds: activePools.map((p) => p.id),
 proxyRotationStrategy: bulkProxyRotationStrategy,
 });
 };

 const handleConnectionProxyUpdate = async (connId, proxyConfig) => {
 try {
 const updatePayload = typeof proxyConfig === 'object' && proxyConfig !== null
 ? {
 proxyPoolIds: proxyConfig.proxyPoolIds || [],
 proxyRotationStrategy: proxyConfig.proxyRotationStrategy || "none",
 proxyGroup: proxyConfig.proxyGroup !== undefined ? proxyConfig.proxyGroup : undefined,
 }
 : {
 proxyPoolId: proxyConfig || null,
 proxyGroup: null,
 };
 const res = await fetch(`/api/providers/${connId}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(updatePayload),
 });
 if (res.ok) {
 setConnections(prev => prev.map(c =>
 c.id === connId
 ? {
 ...c,
 providerSpecificData: {
 ...c.providerSpecificData,
 ...(updatePayload.proxyPoolIds !== undefined ? {
 proxyPoolIds: updatePayload.proxyPoolIds,
 proxyRotationStrategy: updatePayload.proxyRotationStrategy,
 proxyGroup: updatePayload.proxyGroup,
 } : {
 proxyPoolId: updatePayload.proxyPoolId,
 proxyGroup: null,
 })
 }
 }
 : c
 ));
 }
 } catch (error) {
 }
 };

 const handleTestModel = async (modelId) => {
 if (testingModelIds.has(modelId)) return;
 setTestingModelIds((prev) => new Set(prev).add(modelId));
 try {
 const res = await fetch("/api/models/test", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ model: `${providerStorageAlias}/${modelId}` }),
 });
    const data = await res.json();
    setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
    setModelTestErrors((prev) => ({ ...prev, [modelId]: data.ok ? null : (data.error || "Model not reachable") }));
    setModelsTestError(data.ok ? "" : (data.error || "Model not reachable"));
  } catch (err) {
    setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
    setModelTestErrors((prev) => ({ ...prev, [modelId]: err?.message || "Network error" }));
    setModelsTestError("Network error");
  } finally {
 setTestingModelIds((prev) => { const n = new Set(prev); n.delete(modelId); return n; });
 }
 };

 const isSelected = (connectionId) => selectedConnectionIds.includes(connectionId);

 return {
 providerId, router, loading, providerNode, providerInfo, isOAuth, supportsApiKeyAuth, isFreeNoAuth,
 isOpenAICompatible, isAnthropicCompatible, isCompatible, hasDualAuthModes, providerAlias, providerStorageAlias,
 providerDisplayAlias, providerThinkingLevels, thinkingMode, providerStrategy, providerStickyLimit,
 autoPing, connections, connectionPage, setConnectionPage, connectionPagination, connectionSearch, setConnectionSearch,
 connectionStatusFilter, setConnectionStatusFilter, connectionStats, proxyPools, proxyGroups,
 showOAuthModal, setShowOAuthModal, showXiaomiMimoModal, setShowXiaomiMimoModal, showIFlowCookieModal,
 setShowIFlowCookieModal, showAddApiKeyModal, setShowAddApiKeyModal, addConnectionError, setAddConnectionError,
 showBulkImportCodex, setShowBulkImportCodex, showBulkImportGrokCli, setShowBulkImportGrokCli,
 showBulkImportJwt, setShowBulkImportJwt, showEditModal, setShowEditModal, showEditNodeModal,
 setShowEditNodeModal, showBulkProxyModal, setShowBulkProxyModal, selectedConnection, setSelectedConnection,
    modelAliases, customModels, headerImgError, setHeaderImgError, modelTestResults, modelTestErrors,
    modelsTestError, testingModelIds, showAddCustomModel, setShowAddCustomModel, selectedConnectionIds, setSelectedConnectionIds,
    bulkProxyPoolId, bulkProxyRotationStrategy, setBulkProxyRotationStrategy, bulkUpdatingProxy,
    suggestedModels, disabledModelIds, confirmState, setConfirmState, showAgRiskModal, setShowAgRiskModal,
    importingQoderModels, importingClineModels, importingLiveModels, models, kiloFreeModels, liveModels,
 oauthConnectionLabel, apiKeyConnectionLabel, getCaps, copied, copy, notify,
 openOAuthConnection, triggerOAuthConnection, triggerApiKeyConnection, triggerAddConnection,
 handleAgRiskConfirm, handleRoundRobinToggle, handleStickyLimitChange, handleThinkingModeChange,
 handleAutoPingConnection, handleUpdateNode, handleUnlockModel,
 handleDisableModel, handleEnableModel, handleDisableAll, handleEnableAll, allSelected,
 handleSetAlias, handleDeleteAlias, handleAddCustomModel, handleDeleteCustomModel,
 handleImportQoderModels, handleImportLiveModels, handleImportClineModels,
 handleRunOneByOneTest, handleStopOneByOneTest,
 handleResetConnectionStatus, handleBulkResetStatus,
 handleDelete, handleBulkDelete, handleBulkToggleActive,
 handleOAuthSuccess, handleIFlowCookieSuccess, handleSaveApiKey,
 handleUpdateConnection, handleUpdateConnectionStatus, handleSwapPriority,
 toggleSelectConnection, toggleSelectAllConnections, clearSelection,
 openBulkProxyModal, closeBulkProxyModal, handleApplyGroup,
 handleApplySinglePool, handleApplyOneToOne, handleApplyRotationStrategy, handleConnectionProxyUpdate,
 handleTestModel, isSelected,
 fetchConnections, fetchDisabledModels, fetchAliases, fetchCustomModels, fetchConnectionStats,
 resolveThinkingSuffix, setThinkingMode, AUTO_PING_SETTINGS_KEYS, CONNECTION_PAGE_SIZE,
 };
}
