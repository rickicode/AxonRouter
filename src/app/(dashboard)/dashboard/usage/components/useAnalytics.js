"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
 fetchAnalyticsWithComparison,
 fmtNumber,
 validateProviderFilter,
 validateModelFilter,
 buildAnalyticsCsv,
 downloadBlobCsv,
} from "./analyticsData";

export function useAnalytics(period) {
 const [provider, setProvider] = useState("");
 const [model, setModel] = useState("");
 const [errorCategory, setErrorCategory] = useState("");
 const [autoRefreshInterval, setAutoRefreshInterval] = useState(0);
 const [timeBucket, setTimeBucket] = useState("");
 const [data, setData] = useState(null);
 const [error, setError] = useState("");
 const [loading, setLoading] = useState(true);
 const [refresh, setRefresh] = useState(0);

 const [knownProviders, setKnownProviders] = useState([]);
 const [knownModels, setKnownModels] = useState([]);
 const [loadingOptions, setLoadingOptions] = useState(true);

 // Load known providers & models for combobox suggestions
 useEffect(() => {
 let cancelled = false;
 Promise.all([
 fetch("/api/usage/providers")
 .then((r) => {
 if (!r.ok) throw new Error(`Providers HTTP ${r.status}`);
 return r.json();
 })
 .catch(() => {
 return { providers: [] };
 }),
 fetch("/api/models")
 .then((r) => {
 if (!r.ok) throw new Error(`Models HTTP ${r.status}`);
 return r.json();
 })
 .catch(() => {
 return { models: [] };
 }),
 ])
 .then(([provData, modelData]) => {
 if (cancelled) return;
 if (Array.isArray(provData?.providers)) {
 setKnownProviders(provData.providers);
 }
 if (Array.isArray(modelData?.models)) {
 setKnownModels(modelData.models);
 }
 })
 .finally(() => {
 if (!cancelled) setLoadingOptions(false);
 });
 return () => {
 cancelled = true;
 };
 }, []);

 // Filter validation
 const providerValidation = useMemo(
 () => validateProviderFilter(provider),
 [provider],
 );
 const modelValidation = useMemo(
 () => validateModelFilter(model),
 [model],
 );
 const hasFilterError = !providerValidation.valid || !modelValidation.valid;

 // Provider Combobox options
 const providerOptions = useMemo(() => {
 const map = new Map();

 for (const p of knownProviders) {
 if (!p?.id) continue;
 map.set(p.id, {
 value: p.id,
 label: p.name && p.name !== p.id ? `${p.name} (${p.id})` : p.id,
 rawName: p.name || p.id,
 count: null,
 });
 }

 if (Array.isArray(data?.byProvider)) {
 for (const p of data.byProvider) {
 if (!p?.provider) continue;
 const existing = map.get(p.provider);
 const reqCount = Number(p.count || p.requests || 0);
 map.set(p.provider, {
 value: p.provider,
 label:
 existing?.rawName && existing.rawName !== p.provider
 ? `${existing.rawName} (${p.provider})`
 : p.provider,
 rawName: existing?.rawName || p.provider,
 count: reqCount,
 badge: reqCount > 0 ? `${fmtNumber(reqCount)} reqs` : undefined,
 });
 }
 }

 return Array.from(map.values()).sort((a, b) => {
 if ((b.count || 0) !== (a.count || 0)) {
 return (b.count || 0) - (a.count || 0);
 }
 return a.value.localeCompare(b.value);
 });
 }, [knownProviders, data]);

 // Model Combobox options
 const modelOptions = useMemo(() => {
 const map = new Map();

 for (const m of knownModels) {
 if (!m?.model) continue;
 if (provider && m.provider && m.provider !== provider) continue;

 map.set(m.model, {
 value: m.model,
 label:
 m.alias && m.alias !== m.model ? `${m.alias} (${m.model})` : m.model,
 subtitle: m.provider,
 provider: m.provider,
 count: null,
 });
 }

 if (Array.isArray(data?.models)) {
 for (const m of data.models) {
 if (!m?.model) continue;
 if (provider && m.provider && m.provider !== provider) continue;

 const existing = map.get(m.model);
 const reqCount = Number(m.requests || m.count || 0);
 map.set(m.model, {
 value: m.model,
 label: existing?.label || m.model,
 subtitle: m.provider || existing?.subtitle,
 provider: m.provider || existing?.provider,
 count: reqCount,
 badge: reqCount > 0 ? `${fmtNumber(reqCount)} reqs` : undefined,
 });
 }
 }

 return Array.from(map.values()).sort((a, b) => {
 if ((b.count || 0) !== (a.count || 0)) {
 return (b.count || 0) - (a.count || 0);
 }
 return a.value.localeCompare(b.value);
 });
 }, [knownModels, data, provider]);

 // Filter handlers with smart sync
 const handleProviderChange = useCallback(
 (newProvider) => {
 setProvider(newProvider);
 if (newProvider && model) {
 const belongs =
 knownModels.some(
 (m) => m.provider === newProvider && m.model === model,
 ) ||
 data?.models?.some(
 (m) => m.provider === newProvider && m.model === model,
 );
 if (!belongs) {
 setModel("");
 }
 }
 },
 [model, knownModels, data?.models],
 );

 const handleModelChange = useCallback(
 (newModel) => {
 setModel(newModel);
 if (newModel && !provider) {
 const match =
 knownModels.find((m) => m.model === newModel) ||
 data?.models?.find((m) => m.model === newModel);
 if (match?.provider) {
 setProvider(match.provider);
 }
 }
 },
 [provider, knownModels, data?.models],
 );

 // Query signature: any change starts a new fetch cycle.
 // Reset happens as a render-phase update (prev-render pattern), so the
 // fetch effect below never calls setState synchronously.
 const querySignature = JSON.stringify([
 period,
 provider,
 model,
 errorCategory,
 timeBucket,
 refresh,
 hasFilterError,
 providerValidation.error,
 modelValidation.error,
 ]);
 const [lastSignature, setLastSignature] = useState(querySignature);
 if (lastSignature !== querySignature) {
 setLastSignature(querySignature);
 setData(null);
 setError("");
 setLoading(!hasFilterError);
 }

 // Validation error derived during render — no effect setState needed.
 const filterError = hasFilterError
 ? providerValidation.error || modelValidation.error || "Invalid filter"
 : "";

 // Periodic auto-refresh
 useEffect(() => {
 if (!autoRefreshInterval || autoRefreshInterval <= 0) return;
 const timer = setInterval(() => {
 setRefresh((x) => x + 1);
 }, autoRefreshInterval * 1000);
 return () => clearInterval(timer);
 }, [autoRefreshInterval]);

 // Main data fetching (setState only in async callbacks)
 useEffect(() => {
 if (hasFilterError) return;
 const controller = new AbortController();
 fetchAnalyticsWithComparison(
 { period, provider, model, errorCategory, timeBucket },
 controller.signal,
 )
 .then((value) => {
 if (!controller.signal.aborted) {
 setData(value);
 setError("");
 setLoading(false);
 }
 })
 .catch((err) => {
 if (!controller.signal.aborted) {
 setError(err.message);
 setLoading(false);
 }
 });
 return () => controller.abort();
 }, [
 period,
 provider,
 model,
 errorCategory,
 timeBucket,
 refresh,
 hasFilterError,
 providerValidation.error,
 modelValidation.error,
 ]);

 // Model selection shortcut
 const handleSelectModel = useCallback((p, m) => {
 setProvider(p);
 setModel(m);
 window.scrollTo({ top: 120, behavior: "smooth" });
 }, []);

 // CSV export
 const handleExportCsv = () => {
 if (!data?.models?.length) return;
 const csvContent = buildAnalyticsCsv(data.models);
 const filename = `axonrouter-analytics-${period || "7d"}-${new Date().toISOString().slice(0, 10)}.csv`;
 downloadBlobCsv(csvContent, filename);
 };

 const hasActiveFilters = Boolean(provider || model || errorCategory);

 return {
 provider, setProvider,
 model, setModel,
 errorCategory, setErrorCategory,
 autoRefreshInterval, setAutoRefreshInterval,
 timeBucket, setTimeBucket,
 data, error: filterError || error, loading: hasFilterError ? false : loading, loadingOptions,
 providerValidation, modelValidation,
 providerOptions, modelOptions,
 hasActiveFilters,
 handleProviderChange, handleModelChange,
 handleSelectModel, handleExportCsv,
 setRefresh,
 };
}
