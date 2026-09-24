"use client";

import { useState, useMemo, useEffect } from "react";
import PropTypes from "prop-types";
import Modal from "./Modal";
import ProviderIcon from "./ProviderIcon";
import CapacityBadges from "./CapacityBadges";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { isFreeModel, sortModelsByFree } from "@/shared/utils/modelHelpers";
import { canonicalModelId } from "@/shared/constants/canonicalModels";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, AI_PROVIDERS, isOpenAICompatibleProvider, isAnthropicCompatibleProvider, getProviderAlias } from "@/shared/constants/providers";
import { getComboBadge } from "@/shared/utils/comboBadge";
import Icon from "@/shared/components/Icon";

// Provider order: OAuth first, then Free Tier, then API Key (matches dashboard/providers)
const PROVIDER_ORDER = [
 ...Object.keys(OAUTH_PROVIDERS),
 ...Object.keys(FREE_PROVIDERS),
 ...Object.keys(FREE_TIER_PROVIDERS),
 ...Object.keys(APIKEY_PROVIDERS),
];

// Providers that need no auth — always show in model selector
const NO_AUTH_PROVIDER_IDS = Object.keys(FREE_PROVIDERS).filter(id => FREE_PROVIDERS[id].noAuth);

// Providers with per-account live catalogs via /api/providers/[id]/models.
// Static registry stays as fallback when live fetch fails or is empty.
const LIVE_CATALOG_PROVIDERS = ["cursor", "cline", "clinepass"];

// Fetch a provider's account-scoped catalog for every active connection and merge
// the results. Entries collapse by model id on purpose: two connections of the
// same provider produce the same picker value (`alias/id`), so keeping the first
// avoids duplicate rows. There is no per-connection metadata to preserve beyond
// {id,name}. Empty array means "nothing live" so callers keep the static fallback.
function useLiveProviderModels(isOpen, connectionIds, label) {
 const [models, setModels] = useState([]);
 const idsKey = (connectionIds ?? []).join("|");

 useEffect(() => {
  const ids = idsKey ? idsKey.split("|") : [];
  if (!isOpen || ids.length === 0) {
  queueMicrotask(() => setModels([]));
  return undefined;
  }

  let cancelled = false;
 Promise.all(ids.map(async (connectionId) => {
 const response = await fetch(`/api/providers/${connectionId}/models`, { cache: "no-store" });
 if (!response.ok) return [];
 const data = await response.json();
 return Array.isArray(data.models) ? data.models : [];
 }))
 .then((modelLists) => {
 if (cancelled) return;
 const seen = new Set();
 setModels(modelLists.flat().filter((model) => {
 if (!model?.id || seen.has(model.id)) return false;
 seen.add(model.id);
 return true;
 }));
 })
 .catch((error) => {
 // Do not hide the static fallback when the account catalog is unavailable.
 console.warn(`Unable to load ${label} models for selector:`, error);
 if (!cancelled) setModels([]);
 });

 return () => { cancelled = true; };
 }, [isOpen, idsKey, label]);

 return models;
}

export default function ModelSelectModal({
 isOpen,
 onClose,
 onSelect,
 onDeselect,
 selectedModel,
 activeProviders = [],
 title = "Select Model",
 modelAliases = {},
 kindFilter = null,
 capFilter = null,
 addedModelValues = [],
 closeOnSelect = true,
}) {
 // Filter activeProviders by serviceKinds when kindFilter set (e.g. "webSearch", "webFetch")
 const filteredActiveProviders = useMemo(() => {
 if (!kindFilter) return activeProviders;
 return activeProviders.filter((p) => {
 const info = AI_PROVIDERS[p.provider];
 const kinds = info?.serviceKinds || ["llm"];
 return kinds.includes(kindFilter);
 });
 }, [activeProviders, kindFilter]);
 const { getCaps } = useModelCaps();
 const [searchQuery, setSearchQuery] = useState("");
 const [providerFilter, setProviderFilter] = useState("all");
 const [dedupeView, setDedupeView] = useState(false);
 const [combos, setCombos] = useState([]);
 const [providerNodes, setProviderNodes] = useState([]);
 const [customModels, setCustomModels] = useState([]);
 const [disabledModels, setDisabledModels] = useState({});
 // Cursor and Cline expose the usable catalog per account, so the static catalog is
 // kept only as a fallback: it goes stale quickly and entitlements differ per account.
 // Single map driven by LIVE_CATALOG_PROVIDERS so the constant cannot drift
 // from the memos below; per-provider arrays stay referentially stable unless
 // activeProviders itself changes.
 const liveConnectionIdsByProvider = useMemo(() => {
 const map = Object.fromEntries(LIVE_CATALOG_PROVIDERS.map((id) => [id, []]));
 for (const p of activeProviders) {
 if (p?.id && Object.prototype.hasOwnProperty.call(map, p.provider)) map[p.provider].push(p.id);
 }
 return map;
 }, [activeProviders]);
 const cursorConnectionIds = liveConnectionIdsByProvider.cursor;
 const clineConnectionIds = liveConnectionIdsByProvider.cline;
 const clinepassConnectionIds = liveConnectionIdsByProvider.clinepass;

 const cursorModels = useLiveProviderModels(isOpen, cursorConnectionIds, "Cursor");
 const clineModels = useLiveProviderModels(isOpen, clineConnectionIds, "Cline");
 const clinepassModels = useLiveProviderModels(isOpen, clinepassConnectionIds, "ClinePass");

 const fetchCombos = async () => {
 try {
 const res = await fetch("/api/combos");
 if (!res.ok) throw new Error(`Failed to fetch combos: ${res.status}`);
 const data = await res.json();
 setCombos(data.combos || []);
 } catch (error) {
 console.error("Error fetching combos:", error);
 setCombos([]);
 }
 };

 const fetchProviderNodes = async () => {
 try {
 const res = await fetch("/api/provider-nodes");
 if (!res.ok) throw new Error(`Failed to fetch provider nodes: ${res.status}`);
 const data = await res.json();
 setProviderNodes(data.nodes || []);
 } catch (error) {
 console.error("Error fetching provider nodes:", error);
 setProviderNodes([]);
 }
 };

 const fetchCustomModels = async () => {
 try {
 const res = await fetch("/api/models/custom");
 if (!res.ok) throw new Error(`Failed to fetch custom models: ${res.status}`);
 const data = await res.json();
 setCustomModels(data.models || []);
 } catch (error) {
 console.error("Error fetching custom models:", error);
 setCustomModels([]);
 }
 };

 const fetchDisabledModels = async () => {
 try {
 const res = await fetch("/api/models/disabled");
 if (!res.ok) throw new Error(`Failed to fetch disabled models: ${res.status}`);
 const data = await res.json();
 setDisabledModels(data.disabled || {});
 } catch (error) {
 console.error("Error fetching disabled models:", error);
 setDisabledModels({});
 }
 };

 const allProviders = useMemo(() => ({ ...OAUTH_PROVIDERS, ...FREE_PROVIDERS, ...FREE_TIER_PROVIDERS, ...APIKEY_PROVIDERS }), []);

  useEffect(() => {
  if (!isOpen) return;
  queueMicrotask(() => {
  fetchCombos();
  fetchProviderNodes();
  fetchCustomModels();
  fetchDisabledModels();
  });
  }, [isOpen]);

 // Group models by provider with priority order
 const groupedModels = useMemo(() => {
 const groups = {};

 // Kinds where the provider IS the model (no per-model selection needed)
 const PROVIDER_AS_MODEL_KINDS = new Set(["webSearch", "webFetch"]);
 // Kinds that map directly to model.type field
 const TYPED_KINDS = new Set(["image", "tts", "stt", "embedding", "imageToText"]);
 // For these kinds, providers without hardcoded models can still be picked (provider-as-model fallback)
 const ALLOW_PROVIDER_FALLBACK_KINDS = new Set(["tts", "image", "webFetch"]);

 // Filter a models[] array by kindFilter (keep only matching kind)
 const filterByKind = (models) => {
 // No kindFilter means the LLM selector. Keep custom models visible because
 // user-added models may have typed capabilities (for example imageToText)
 // while still being valid chat/combo targets.
 if (!kindFilter) return models.filter((m) => m.isPlaceholder || m.isCustom || !getModelKind(m) || getModelKind(m) === "llm");
 if (!TYPED_KINDS.has(kindFilter)) return models;
 return models.filter((m) => m.isPlaceholder || getModelKind(m) === kindFilter);
 };

 // Get all active provider IDs from connections (filtered by kindFilter if set)
 const activeConnectionIds = filteredActiveProviders.map(p => p.provider);

 // No-auth providers: filter by kindFilter as well
 const noAuthIds = kindFilter
 ? NO_AUTH_PROVIDER_IDS.filter((id) => (AI_PROVIDERS[id]?.serviceKinds || ["llm"]).includes(kindFilter))
 : NO_AUTH_PROVIDER_IDS;

 // Only show connected providers (including both standard and custom)
 const providerIdsToShow = new Set([
 ...activeConnectionIds, // Only connected providers
 ...noAuthIds, // No-auth providers (kind-filtered)
 ]);

 // Sort by PROVIDER_ORDER
 const sortedProviderIds = [...providerIdsToShow].sort((a, b) => {
 const indexA = PROVIDER_ORDER.indexOf(a);
 const indexB = PROVIDER_ORDER.indexOf(b);
 return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
 });

 sortedProviderIds.forEach((providerId) => {
 const alias = getProviderAlias(providerId);
 const providerInfo = allProviders[providerId] || { name: providerId, color: "#666" };
 const isCustomProvider = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

 // For provider-as-model kinds (webSearch/webFetch): emit a single entry where value === providerId
 if (kindFilter && PROVIDER_AS_MODEL_KINDS.has(kindFilter)) {
 groups[providerId] = {
 name: providerInfo.name,
 alias,
 color: providerInfo.color,
 models: [{ id: providerId, name: providerInfo.name, value: providerId }],
 };
 return;
 }

 if (providerInfo.passthroughModels) {
 const aliasModels = Object.entries(modelAliases)
 .filter(([, fullModel]) => fullModel.startsWith(`${alias}/`))
 .map(([aliasName, fullModel]) => ({
 id: fullModel.replace(`${alias}/`, ""),
 name: aliasName,
 value: fullModel,
 }));
 const customRegisteredModels = customModels
 .filter((m) => m.providerAlias === alias)
 .map((m) => ({
 id: m.id,
 name: m.name || m.id,
 value: `${alias}/${m.id}`,
 kind: getModelKind(m),
 isCustom: true,
 }));

 // For typed kinds, only include hardcoded typed models (aliases are typically LLM-only and lack type info)
 let combined = aliasModels;
 if (kindFilter && TYPED_KINDS.has(kindFilter)) {
 const registeredTyped = customRegisteredModels.filter((m) => getModelKind(m) === kindFilter);
 combined = [
 ...registeredTyped,
 ...getModelsByProviderId(providerId)
 .filter((m) => getModelKind(m) === kindFilter)
 .map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, kind: getModelKind(m) }))
 .filter((m) => !registeredTyped.some((registered) => registered.value === m.value)),
 ];
 // Fallback: provider-as-model when no hardcoded models match (tts/image/webFetch only)
 if (combined.length === 0 && ALLOW_PROVIDER_FALLBACK_KINDS.has(kindFilter)) {
 const supports = (providerInfo.serviceKinds || ["llm"]).includes(kindFilter);
 if (supports) combined = [{ id: providerId, name: providerInfo.name, value: alias }];
 }
 } else {
 // LLM/null kind: merge hardcoded models with user-added models
 const registeredLlms = customRegisteredModels.filter((m) => !getModelKind(m) || getModelKind(m) === "llm");
 const seen = new Set([...aliasModels, ...registeredLlms].map((m) => m.value));
 const hardcoded = getModelsByProviderId(providerId)
 .filter((m) => !getModelKind(m) || getModelKind(m) === "llm")
 .map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, kind: getModelKind(m) }))
 .filter((m) => !seen.has(m.value));
 combined = [...registeredLlms, ...aliasModels.filter((m) => !registeredLlms.some((registered) => registered.value === m.value)), ...hardcoded];
 }

 if (combined.length > 0) {
 // Check for custom name from providerNodes (for compatible providers)
 const matchedNode = providerNodes.find(node => node.id === providerId);
 const displayName = matchedNode?.name || providerInfo.name;

 groups[providerId] = {
 name: displayName,
 alias: alias,
 color: providerInfo.color,
 models: combined,
 };
 }
 } else if (isCustomProvider) {
 // Custom (openai/anthropic-compatible) providers are LLM-only — skip for typed media kinds
 if (kindFilter && TYPED_KINDS.has(kindFilter)) return;
 // Find connection object to get prefix synchronously without waiting for providerNodes fetch
 const connection = activeProviders.find(p => p.provider === providerId);
 const matchedNode = providerNodes.find(node => node.id === providerId);
 const displayName = matchedNode?.name || connection?.name || providerInfo.name;
 const nodePrefix = connection?.providerSpecificData?.prefix || matchedNode?.prefix || providerId;

 // Aliases are stored using the raw providerId as key (e.g. "openai-compatible-chat-<uuid>/glm-4.7"),
 // so we must filter by providerId, not by the display prefix.
 const nodeModels = Object.entries(modelAliases)
 .filter(([, fullModel]) => fullModel.startsWith(`${providerId}/`))
 .map(([aliasName, fullModel]) => ({
 id: fullModel.replace(`${providerId}/`, ""),
 name: aliasName,
 value: `${nodePrefix}/${fullModel.replace(`${providerId}/`, "")}`,
 }));

 // Merge custom models registered via /api/models/custom for this provider
 // providerAlias in DB uses the raw providerId, not the display prefix
 const registeredCustom = customModels
 .filter((m) => m.providerAlias === providerId)
 .map((m) => ({
 id: m.id,
 name: m.name || m.id,
 value: `${nodePrefix}/${m.id}`,
 isCustom: true,
 }));
 const seen = new Set(nodeModels.map((m) => m.value));
 const mergedModels = [...nodeModels, ...registeredCustom.filter((m) => !seen.has(m.value))];

 // Always show compatible providers that are connected, even with no aliases.
 // When no aliases exist, show a placeholder so users know it's available.
 const modelsToShow = mergedModels.length > 0 ? mergedModels : [{
 id: `__placeholder__${providerId}`,
 name: `${nodePrefix}/model-id`,
 value: `${nodePrefix}/model-id`,
 isPlaceholder: true,
 }];

 groups[providerId] = {
 name: displayName,
 alias: nodePrefix,
 color: providerInfo.color,
 models: modelsToShow,
 isCustom: true,
 hasModels: mergedModels.length > 0,
 };
 } else {
 const liveModels = providerId === "cursor" ? cursorModels : providerId === "cline" ? clineModels : providerId === "clinepass" ? clinepassModels : [];
 const hardcodedModels = liveModels.length > 0
 ? liveModels
 : getModelsByProviderId(providerId);
 const hardcodedIds = new Set(hardcodedModels.map((m) => m.id));

 // Custom models: if no hardcoded models (e.g. openrouter), show all aliases for this provider
 // Otherwise only show aliases where aliasName === modelId ("Add Model" button pattern)
 const hasHardcoded = hardcodedModels.length > 0;
 const customAliasModels = Object.entries(modelAliases)
 .filter(([aliasName, fullModel]) =>
 fullModel.startsWith(`${alias}/`) &&
 (hasHardcoded ? aliasName === fullModel.replace(`${alias}/`, "") : true) &&
 !hardcodedIds.has(fullModel.replace(`${alias}/`, ""))
 )
 .map(([aliasName, fullModel]) => {
 const modelId = fullModel.replace(`${alias}/`, "");
 return { id: modelId, name: aliasName, value: fullModel, isCustom: true };
 });

 // Custom models registered via /api/models/custom (provider "Add Model" button)
 const customAliasIds = new Set(customAliasModels.map((m) => m.id));
 const customRegisteredModels = customModels
 .filter((m) => m.providerAlias === alias && !hardcodedIds.has(m.id) && !customAliasIds.has(m.id))
 .map((m) => ({ id: m.id, name: m.name || m.id, value: `${alias}/${m.id}`, isCustom: true }));

 const merged = [
 ...hardcodedModels.map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, kind: getModelKind(m) })),
 ...customAliasModels,
 ...customRegisteredModels,
 ];
 // Dedupe by value (alias may equal hardcoded id, causing React key collision)
 const seen = new Set();
 let allModels = filterByKind(merged.filter((m) => {
 if (seen.has(m.value)) return false;
 seen.add(m.value);
 return true;
 }));

 // Provider-as-model fallback: providers that support the kind but have no hardcoded models
 // can still be picked (value = providerAlias). Skips embedding (always needs model).
 if (allModels.length === 0 && kindFilter && ALLOW_PROVIDER_FALLBACK_KINDS.has(kindFilter)) {
 const supports = (providerInfo.serviceKinds || ["llm"]).includes(kindFilter);
 if (supports) {
 allModels = [{ id: providerId, name: providerInfo.name, value: alias }];
 }
 }

 if (allModels.length > 0) {
 groups[providerId] = {
 name: providerInfo.name,
 alias: alias,
 color: providerInfo.color,
 models: allModels,
 };
 }
 }
 });

 // Filter out disabled models per provider (disabled keyed by storage alias OR providerId)
 Object.entries(groups).forEach(([providerId, group]) => {
 const aliasKey = getProviderAlias(providerId);
 const disabledIds = new Set([
 ...(disabledModels[aliasKey] || []),
 ...(disabledModels[providerId] || []),
 ]);
 if (disabledIds.size === 0) return;
 group.models = group.models.filter((m) => !disabledIds.has(m.id));
 if (group.models.length === 0) delete groups[providerId];
 });

 return groups;
 }, [filteredActiveProviders, modelAliases, allProviders, providerNodes, customModels, disabledModels, kindFilter, activeProviders, cursorModels, clineModels, clinepassModels]);
 // Filter combos by search query. Hide combos when kindFilter is set (combos are LLM-only by design),
 // EXCEPT when capFilter=vision — combos that have at least one vision-capable member belong in the vision pool.
 const filteredCombos = useMemo(() => {
 // Any typed kind (image, tts, embedding, ...) has no LLM combos.
 if (kindFilter) return [];
 // Generic capFilter (e.g. audio): combos without typed kind don't belong there either.
 if (capFilter && capFilter !== "vision") return [];
 let list = combos;
 if (capFilter === "vision") {
 list = combos.filter((c) => {
 const models = Array.isArray(c.models) ? c.models : [];
 if (models.length === 0) return false;
 // Vision-capable if any member has vision=true (via live caps or provider caps fallback).
 return models.some((m) => {
 const key = typeof m === "string" ? m : (m?.model || m?.id || "");
 if (!key) return false;
 const caps = getCaps?.(key);
 return caps?.vision === true;
 });
 });
 }
 if (!searchQuery.trim()) return list;
 const query = searchQuery.toLowerCase();
 return list.filter(c => c.name.toLowerCase().includes(query));
 }, [combos, searchQuery, kindFilter, capFilter, getCaps]);
 const sortModels = (models) => sortModelsByFree(models, addedModelValues);

 // Available provider options for filter
 const providerOptions = useMemo(() => {
 return Object.entries(groupedModels)
 .map(([id, g]) => ({ id, name: g.name, count: g.models.length }))
 .sort((a, b) => a.name.localeCompare(b.name));
 }, [groupedModels]);

 // Filter models by provider + search query
 const filteredGroups = useMemo(() => {
 const query = searchQuery.trim().toLowerCase();

 const filtered = {};
 Object.entries(groupedModels).forEach(([providerId, group]) => {
 if (providerFilter !== "all" && providerId !== providerFilter) return;
 let models = group.models;
 // cline-free: only free models (paid models coexist in catalog but require other providers)
 if (providerId === "cline-free") {
 models = models.filter((m) => isFreeModel(m, providerId));
 if (models.length === 0) return;
 }
 // Filter by input-modality capability (vision/pdf/audioInput/videoInput).
 if (capFilter) {
 models = models.filter((m) => getCaps(m.value)?.[capFilter] === true);
 if (models.length === 0) return;
 }
 if (query) {
 const alias = (group.alias || "").toLowerCase();
 const providerNameMatches = group.name.toLowerCase().includes(query) || alias.includes(query) || providerId.toLowerCase().includes(query);
 models = models.filter(
 (m) =>
 m.name.toLowerCase().includes(query) ||
 m.id.toLowerCase().includes(query) ||
 m.value.toLowerCase().includes(query)
 );
 if (models.length === 0 && !providerNameMatches) return;
 }
 filtered[providerId] = {
 ...group,
 models: sortModels(models),
 };
 });

 return filtered;
 }, [groupedModels, searchQuery, providerFilter, addedModelValues, capFilter]);

 // Dedupe/canonical view: collapse identical model families served by many
 // providers into one entry. Each canonical model keeps its provider variants
 // (the actual binding a client must pick) plus the provider display name.
 const canonicalGroups = useMemo(() => {
 const byCanonical = new Map();
 for (const [providerId, group] of Object.entries(filteredGroups)) {
 for (const m of group.models) {
 const cid = canonicalModelId(m.value || m.id || m.name);
 if (!cid) continue;
 if (!byCanonical.has(cid)) byCanonical.set(cid, { id: cid, providers: new Map() });
 const entry = byCanonical.get(cid);
 const name = typeof m.name === "string" ? m.name : m.id;
 entry.displayName = entry.displayName || name.replace(/[:^]free$/i, "").trim();
 if (!entry.providers.has(providerId)) entry.providers.set(providerId, []);
 entry.providers.get(providerId).push({ ...m, name });
 }
 }
 return [...byCanonical.values()]
 .map((c) => ({
 id: c.id,
 displayName: c.displayName || c.id,
 variantCount: [...c.providers.values()].reduce((sum, arr) => sum + arr.length, 0),
 providers: [...c.providers.entries()].map(([providerId, models]) => ({
 providerId,
 providerName: filteredGroups[providerId]?.name || providerId,
 alias: filteredGroups[providerId]?.alias || null,
 color: filteredGroups[providerId]?.color || "#666",
 models,
 })),
 }))
 .sort((a, b) => a.displayName.localeCompare(b.displayName));
 }, [filteredGroups]);

 const handleSelect = (model) => {
 const value = model?.value || model?.name || model;
 const isAdded = addedModelValues.includes(value);

 if (isAdded && onDeselect) {
 onDeselect(model);
 } else {
 onSelect(model);
 }

 if (closeOnSelect) {
 onClose();
 setSearchQuery("");
 }
 };

 return (
 <Modal
 isOpen={isOpen}
 onClose={() => {
 onClose();
 setSearchQuery("");
 setProviderFilter("all");
 }}
 title={title}
 size="xl"
 className="p-3! sm:max-w-[760px]"
 footer={null}
 >
 {/* Info bar */}
 <div className="flex items-center gap-2 mb-3 px-2.5 h-8 bg-primary/8 border border-primary/30 rounded-sm text-xs text-text-muted">
 <Icon className="text-primary shrink-0" name="info" size={18} />
 <span>Click to add, click again to remove. Changes are saved automatically.</span>
 </div>

 {/* Search + provider filter */}
 <div className="mb-3 flex flex-col gap-2">
 <div className="relative">
 <Icon name="search" size={18} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
 <input
 type="text"
 placeholder="Search models or providers (e.g. gpt, ocz, openrouter)..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
className="w-full pl-8 pr-3 h-8 bg-surface border border-border rounded-sm text-sm focus:outline-none"
 />
 </div>
 {/* Dedupe toggle: collapse identical models across providers into core entries */}
<div className="flex items-center gap-2">
 <button
 type="button"
 onClick={() => setDedupeView((v) => !v)}
 aria-pressed={dedupeView}
 className={`flex h-8 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium ${
 dedupeView
 ? "bg-primary text-white border-primary"
 : "bg-surface border-border text-text-muted hover:border-primary/30"
 }`}
 title="Group identical models served by many providers under one core entry"
 >
 <Icon name="deployed_code" size={18} />
 {dedupeView ? "Hide duplicates" : "Show all models"}
 </button>
 </div>
 <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
 <span className="text-[11px] text-text-muted shrink-0">Provider:</span>
 <button
 onClick={() => setProviderFilter("all")}
 className={`flex h-8 shrink-0 items-center rounded-sm border px-2 text-xs font-medium ${providerFilter === "all" ? "bg-primary text-white border-primary" : "bg-surface border-border text-text-muted hover:border-primary/30"}`}
 >
 All ({Object.keys(groupedModels).length})
 </button>
 {providerOptions.map((p) => (
 <button
 key={p.id}
 onClick={() => setProviderFilter(p.id)}
 title={p.name}
 className={`flex h-8 shrink-0 items-center gap-1 rounded-sm border px-2 text-xs font-medium ${providerFilter === p.id ? "bg-primary text-white border-primary" : "bg-surface border-border text-text-main hover:border-primary/30"}`}
 >
 <span>{p.name}</span>
                <span className={`text-[11px] px-1 rounded-sm ${providerFilter === p.id ? "bg-surface text-primary" : "bg-surface-2"}`}>{p.count}</span>
 </button>
 ))}
 </div>
 </div>

 {/* Models grouped by provider - compact */}
 <div className="max-h-[60vh] sm:max-h-[520px] overflow-y-auto space-y-3 pr-1">
 {/* Combos section - always first */}
 {filteredCombos.length > 0 && (
 <div>
 <div className="flex items-center gap-1.5 mb-1.5 sticky top-0 bg-surface py-1">
 <Icon className="text-primary" name="layers" size={18} />
 <span className="text-xs font-medium text-primary">Combos</span>
 <span className="text-[11px] text-text-muted">({filteredCombos.length})</span>
 </div>
 <div className="flex flex-wrap gap-1.5">
 {filteredCombos.map((combo) => {
 const isSelected = selectedModel === combo.name;
 const badge = getComboBadge(combo);
 return (
 <button
 key={combo.id}
 onClick={() => handleSelect({ id: combo.name, name: combo.name, value: combo.name })}
 className={`
 px-2 py-1 rounded-sm text-xs font-medium border hover:cursor-pointer flex items-center gap-1.5
 ${isSelected
 ? "bg-primary text-white border-primary"
 : addedModelValues.includes(combo.name)
 ? "bg-primary border-primary text-white hover:bg-primary-hover"
 : "bg-surface border-border text-text-main hover:border-primary/30 hover:bg-primary/10"
 }
 `}
 >
 {addedModelValues.includes(combo.name) ? (
 <Icon name="check" size={18} />
 ) : (
                      <Icon
                        name={badge.icon}
                        size={13}
                        className={isSelected ? "text-white" : badge.text}
                        title={badge.title}
                      />
 )}
 {combo.name}
 </button>
 );
 })}
 </div>
 </div>
 )}

 {/* Dedupe/canonical view: one entry per core model, provider variants inside */}
 {dedupeView && (
 <div>
 {canonicalGroups.map((c) => {
 const isSelected = c.providers.some((p) => p.models.some((m) => selectedModel === m.value));
 const allAdded = c.providers.every((p) => p.models.every((m) => addedModelValues.includes(m.value)));
 const anyAdded = c.providers.some((p) => p.models.some((m) => addedModelValues.includes(m.value)));
 return (
 <div key={c.id}>
 {/* Canonical header */}
 <div className="flex items-center gap-1.5 mb-1.5 sticky top-0 bg-surface py-1">
 <span className="text-xs font-medium text-primary truncate">{c.displayName}</span>
 <span className="text-[11px] text-text-muted">({c.variantCount} via {c.providers.length} providers)</span>
 </div>
 <div className="flex flex-wrap gap-1.5">
 {c.providers.map((p) => (
 <div key={p.providerId} className="flex items-center gap-1">
 {p.models.map((model) => {
 const modelSelected = selectedModel === model.value;
 return (
 <button
 key={model.value}
 onClick={() => handleSelect(model)}
 title={`${model.name} · ${p.providerName}`}
 className={`
 px-2 py-1 rounded-sm text-xs font-medium border hover:cursor-pointer
 ${modelSelected
 ? "bg-primary text-white border-primary"
 : addedModelValues.includes(model.value)
 ? "bg-primary border-primary text-white hover:bg-primary-hover"
 : "bg-surface border-border text-text-muted hover:border-primary/30 hover:bg-primary/10"
 }
 `}
 >
 <span className="flex items-center gap-1">
 {addedModelValues.includes(model.value) && (
 <Icon name="check" size={18} />
 )}
 <span className="text-[11px] opacity-70 font-normal">{p.alias || p.providerId}</span>
 <span className="text-[11px]">{model.name}</span>
 {isFreeModel(model, p.providerId) && (
 <span className="text-[11px] font-medium px-1 py-0.5 rounded-sm bg-success/10 text-success border border-success/30">
 FREE
 </span>
 )}
 </span>
 </button>
 );
 })}
 </div>
 ))}
 </div>
 </div>
 );
 })}
 </div>
 )}

 {/* Provider models */}
 {!dedupeView && Object.entries(filteredGroups).map(([providerId, group]) => (
 <div key={providerId}>
 {/* Provider header */}
 <div className="flex items-center gap-1.5 mb-1.5 sticky top-0 bg-surface py-1">
 <ProviderIcon
 src={`/providers/${providerId}.png`}
 alt={group.name}
 size={14}
 fallbackText={(group.name || providerId).slice(0, 2).toUpperCase()}
 fallbackColor={group.color}
 />
 <span className="text-xs font-medium text-primary">
 {group.name}
 </span>
 <span className="text-[11px] text-text-muted">
 ({group.models.length})
 </span>
 </div>

 <div className="flex flex-wrap gap-1.5">
 {group.models.map((model) => {
 const isSelected = selectedModel === model.value;
 const isPlaceholder = model.isPlaceholder;
 return (
 <button
 key={model.value}
 onClick={() => handleSelect(model)}
 title={isPlaceholder ? "Select to pre-fill, then edit model ID in the input" : undefined}
 className={`
 px-2 py-1 rounded-sm text-xs font-medium border hover:cursor-pointer
 ${isPlaceholder
 ? "border-dashed border-border text-text-muted hover:border-primary/30 hover:text-primary bg-surface italic"
 : isSelected
 ? "bg-primary text-white border-primary"
 : addedModelValues.includes(model.value)
 ? "bg-primary border-primary text-white hover:bg-primary-hover"
 : "bg-surface border-border text-text-main hover:border-primary/30 hover:bg-primary/10"
 }
 `}
 >
 <span className="flex items-center gap-1">
 {addedModelValues.includes(model.value) && !isPlaceholder && (
 <Icon name="check" size={18} />
 )}
 {isPlaceholder ? (
 <>
 <Icon name="edit" size={18} />
 {model.name}
 </>
 ) : model.isCustom ? (
 <>
 {model.name}
 <span className="text-[11px] opacity-60 font-normal">custom</span>
 <CapacityBadges caps={getCaps(model.value)} />
 </>
 ) : (
 <>
 {model.name}
 {isFreeModel(model) && (
 <span className="text-[11px] font-medium px-1 py-0.5 rounded-sm bg-success/10 text-success border border-success/30">
 FREE
 </span>
 )}
 <CapacityBadges caps={getCaps(model.value)} />
 </>
 )}
 </span>
 </button>
 );
 })}
 </div>
 </div>
 ))}

 {Object.keys(filteredGroups).length === 0 && filteredCombos.length === 0 && (
 <div className="text-center py-3 text-text-muted">
 <Icon name="search_off" size={18} className="mb-1 block" />
 <p className="text-xs">No models found</p>
 </div>
 )}
 </div>
 </Modal>
 );
}

ModelSelectModal.propTypes = {
 isOpen: PropTypes.bool.isRequired,
 onClose: PropTypes.func.isRequired,
 onSelect: PropTypes.func.isRequired,
 onDeselect: PropTypes.func,
 selectedModel: PropTypes.string,
 activeProviders: PropTypes.arrayOf(
 PropTypes.shape({
 provider: PropTypes.string.isRequired,
 })
 ),
 title: PropTypes.string,
 modelAliases: PropTypes.object,
 kindFilter: PropTypes.string,
 addedModelValues: PropTypes.arrayOf(PropTypes.string),
 closeOnSelect: PropTypes.bool,
};
