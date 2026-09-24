"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, CardSkeleton, Input, ConfirmModal, Toggle } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useNotificationStore } from "@/store/notificationStore";

function fmtTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleTimeString();
}

// "freebuff::openai/gpt-5.6-luna" -> { provider: "freebuff", model: "openai/gpt-5.6-luna" }
// "freebuff::*" -> { provider: "freebuff", model: null }
function parseScope(scope) {
  const sep = String(scope || "").indexOf("::");
  if (sep < 0) return { provider: String(scope || ""), model: null };
  const provider = scope.slice(0, sep);
  const model = scope.slice(sep + 2);
  return { provider, model: model === "*" || model === "" ? null : model };
}

function maskProxyUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname || "";
    const port = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.protocol}//${host}${port}`;
  } catch {
    return String(url || "");
  }
}

// Flatten fitness snapshot into one record per (pool, scope); drops expired marks.
function buildRecords(fitness, pools, now = Date.now()) {
  const poolById = new Map((pools || []).map((p) => [p.id, p]));
  const records = [];
  for (const [poolId, byScope] of Object.entries(fitness || {})) {
    const pool = poolById.get(poolId);
    for (const [scope, info] of Object.entries(byScope || {})) {
      const until = info?.until ? new Date(info.until).getTime() : 0;
      if (!until || until <= now) continue;
      const { provider, model } = parseScope(scope);
      records.push({
        poolId,
        scope,
        provider,
        model,
        until,
        reason: info?.reason || "blocked",
        poolName: pool?.name || poolId.slice(0, 8),
        proxyUrl: pool?.proxyUrl || "",
        egress: pool?.egress || null,
      });
    }
  }
  return records;
}

export default function ProxyFitnessTab() {
  const [pools, setPools] = useState([]);
  const [fitness, setFitness] = useState({});
  const [loading, setLoading] = useState(true);
  const [providerFilter, setProviderFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [providerMenuDropUp, setProviderMenuDropUp] = useState(false);
  const [clearingScope, setClearingScope] = useState(null); // poolId::scope while clearing
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [geoEnabled, setGeoEnabled] = useState(true);
  const [geoUpdating, setGeoUpdating] = useState(false);
  const providerMenuRef = useRef(null);
  const notify = useNotificationStore();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target)) {
        setProviderMenuOpen(false);
      }
    };
    if (providerMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [providerMenuOpen]);

  const fetchAll = useCallback(async () => {
    try {
      const [poolRes, fitRes] = await Promise.all([
        fetch("/api/proxy-pools?includeUsage=true", { cache: "no-store" }),
        fetch("/api/proxy-pools/fitness", { cache: "no-store" }),
      ]);
      const poolData = await poolRes.json().catch(() => ({ proxyPools: [] }));
      setPools(poolData.proxyPools || []);
      if (fitRes.ok) {
        const fitData = await fitRes.json().catch(() => ({}));
        setFitness(fitData.pools || fitData.fitness || {});
      } else {
        setFitness({});
      }
    } catch (error) {
      console.log("Error fetching proxy fitness:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) fetchAll();
    });
    return () => { cancelled = true; };
  }, [fetchAll]);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((s) => {
        if (typeof s.poolGeoProbeEnabled === "boolean") setGeoEnabled(s.poolGeoProbeEnabled);
      })
      .catch(() => {});
  }, []);

  const handleGeoToggle = async (next) => {
    setGeoUpdating(true);
    setGeoEnabled(next);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolGeoProbeEnabled: next }),
      });
      if (!res.ok) {
        setGeoEnabled(!next);
        throw new Error(`HTTP ${res.status}`);
      }
      notify.success(next ? "Geo probe enabled" : "Geo probe disabled");
    } catch (err) {
      notify.error(`Update failed: ${err.message}`);
    } finally {
      setGeoUpdating(false);
    }
  };

  const records = useMemo(() => buildRecords(fitness, pools), [fitness, pools]);

  // Providers present in the fitness data (filter options)
  const providerOptions = useMemo(() => {
    const set = new Set();
    for (const rec of records) {
      if (rec.provider) set.add(rec.provider);
    }
    return Array.from(set).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((rec) => {
      if (providerFilter !== "all" && rec.provider !== providerFilter) return false;
      if (q) {
        const hay = [rec.proxyUrl, rec.egress?.ip, rec.egress?.country, rec.egress?.region, rec.poolName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, providerFilter, search]);

  const handleClear = async (rec) => {
    setClearingScope(rec.scope);
    try {
      const res = await fetch(`/api/proxy-pools/${rec.poolId}/fitness/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: rec.scope }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      notify.success(`Cleared ${rec.scope}`);
      fetchAll();
    } catch (err) {
      notify.error(`Clear failed: ${err.message}`);
    } finally {
      setClearingScope(null);
    }
  };

  const handleClearAll = async () => {
    setClearingAll(true);
    try {
      const res = await fetch("/api/proxy-pools/fitness/clear-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(providerFilter !== "all" ? { provider: providerFilter } : {}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      notify.success(providerFilter !== "all" ? `Cleared all ${providerFilter} blocks` : "Cleared all blocks");
      setConfirmClearAll(false);
      fetchAll();
    } catch (err) {
      notify.error(`Clear all failed: ${err.message}`);
    } finally {
      setClearingAll(false);
    }
  };

  const selectedProviderLabel = providerFilter === "all" ? "All providers" : providerFilter;

  const toggleProviderMenu = () => {
    if (providerMenuOpen) {
      setProviderMenuOpen(false);
      return;
    }
    const el = providerMenuRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setProviderMenuDropUp(window.innerHeight - rect.bottom < 300);
    }
    setProviderMenuOpen(true);
  };

  return (
    <div className="flex w-full flex-col gap-3">
      {loading ? (
        <CardSkeleton />
      ) : (
        <>
          {/* Action Toolbar */}
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Icon className="text-primary" name="block" size={18} />
              <span className="text-sm font-semibold text-text-main">Egress Blocks</span>
              <Badge variant={records.length > 0 ? "error" : "default"} size="sm">
                {records.length} active block{records.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {records.length > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  icon="delete_sweep"
                  onClick={() => setConfirmClearAll(true)}
                  disabled={clearingAll}
                >
                  Clear All{providerFilter !== "all" ? ` (${providerFilter})` : ""}
                </Button>
              )}
              <Toggle
                size="sm"
                checked={geoEnabled}
                onChange={handleGeoToggle}
                disabled={geoUpdating}
                label="Geo probe"
                description="Probe egress IP/country every ~30m"
              />
              <Button variant="secondary" size="sm" icon="refresh" onClick={fetchAll}>
                Refresh
              </Button>
            </div>
          </Card>
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
            <div className="relative flex w-64 max-w-full flex-col" ref={providerMenuRef}>
              <label className="mb-1 text-xs font-medium text-text-muted">Provider</label>
              <button
                type="button"
                onClick={toggleProviderMenu}
                className="flex min-h-11 sm:min-h-9 w-full items-center justify-between gap-1 rounded-sm border border-border bg-surface px-2.5 text-xs text-text-main hover:bg-surface-2"
                aria-haspopup="menu"
                aria-expanded={providerMenuOpen}
                title="Filter by provider"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {providerFilter === "all" ? (
                    <Icon className="text-text-muted" name="apps" size={18} />
                  ) : (
                    <ProviderIcon providerId={providerFilter} size={18} className="size-[18px] rounded-sm object-contain" fallbackText={providerFilter.slice(0, 2).toUpperCase()} />
                  )}
                  <span className="truncate capitalize">{selectedProviderLabel}</span>
                </span>
                <Icon className="text-text-muted" name="expand_more" size={18} />
              </button>

              {providerMenuOpen && (
                <div className={`absolute left-0 z-20 w-full max-h-72 overflow-y-auto rounded-sm border border-border bg-surface shadow-md ${providerMenuDropUp ? "bottom-full mb-1" : "top-full mt-1"}`}>
                  <button
                    type="button"
                    onClick={() => { setProviderFilter("all"); setProviderMenuOpen(false); }}
                    className={`flex w-full min-h-11 sm:min-h-9 items-center gap-3 rounded-sm px-3 text-left text-sm ${providerFilter === "all" ? "bg-primary/10 text-primary font-medium" : "text-text-main hover:bg-surface-2"}`}
                  >
                    <Icon name="apps" size={18} />
                    <span className="font-medium">All providers</span>
                    {providerFilter === "all" && <Icon className="ml-auto" name="check" size={18} />}
                  </button>
                  <div className="my-1 h-px bg-border" />
                  {providerOptions.map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => { setProviderFilter(provider); setProviderMenuOpen(false); }}
                      className={`flex w-full min-h-11 sm:min-h-9 items-center gap-3 rounded-sm px-3 text-left text-sm ${providerFilter === provider ? "bg-primary/10 text-primary font-medium" : "text-text-main hover:bg-surface-2"}`}
                    >
                      <ProviderIcon providerId={provider} size={24} className="size-6 rounded-sm object-contain" fallbackText={provider.slice(0, 2).toUpperCase()} />
                      <span className="font-medium capitalize">{provider}</span>
                      {providerFilter === provider && <Icon className="ml-auto" name="check" size={18} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex min-w-48 flex-1 flex-col">
              <label className="mb-1 text-xs font-medium text-text-muted">IP / Proxy / Pool</label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. 104.28, vercel-relay…"
                icon="search"
                inputClassName="min-h-11 sm:min-h-9"
              />
            </div>
          </div>

          {/* Records table */}
          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table w-full min-w-[700px] text-left text-sm" aria-label="Proxy fitness blocks">
                <thead>
                  <tr className="border-b border-border text-xs text-text-muted">
                    <th scope="col" className="px-3 h-8 whitespace-nowrap text-xs font-medium text-text-muted">Provider</th>
                    <th scope="col" className="px-3 h-8 whitespace-nowrap text-xs font-medium text-text-muted">Model</th>
                    <th scope="col" className="px-3 h-8 whitespace-nowrap text-xs font-medium text-text-muted">IP / Proxy</th>
                    <th scope="col" className="px-3 h-8 whitespace-nowrap text-xs font-medium text-text-muted">Pool</th>
                    <th scope="col" className="px-3 h-8 whitespace-nowrap text-xs font-medium text-text-muted">Reason</th>
                    <th scope="col" className="px-3 h-8 whitespace-nowrap text-xs font-medium text-text-muted">Until</th>
                    <th scope="col" className="px-3 h-8 text-right whitespace-nowrap text-xs font-medium text-text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-3 text-center text-text-muted h-8 px-3 text-sm">
                        {records.length === 0
                          ? "No active blocks. Blocks appear here when a provider region-gates a proxy IP."
                          : "No blocks match the current filters."}
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((rec) => (
                      <tr key={`${rec.poolId}::${rec.scope}`} className="border-b border-border last:border-0 align-top hover:bg-surface-2/40">
                        <td className="h-8 px-3 text-sm">
                          <span className="inline-flex items-center gap-2 rounded-sm bg-danger/10 px-2 py-1 text-xs font-medium text-danger">
                            <Icon name="block" size={18} />
                            <span className="capitalize">{rec.provider}</span>
                          </span>
                        </td>
                        <td className="max-w-56 h-8 px-3 text-sm">
                          <span className="truncate text-text-main">{rec.model || <em className="text-text-muted">all models</em>}</span>
                        </td>
                        <td className="h-8 px-3 text-sm">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <code className="truncate font-mono text-xs text-text-main">{maskProxyUrl(rec.proxyUrl)}</code>
                            {rec.egress?.ip && (
                              <span className="flex items-center gap-1 text-[11px] text-text-muted">
                                <span className="truncate">egress {rec.egress.ip}{rec.egress.country ? ` · ${rec.egress.country}` : ""}</span>
                                {rec.egress.isUnstable && (
                                  <span
                                    className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-warning/10 px-1 py-1 text-[11px] font-medium text-warning"
                                    title={rec.egress.ipCount >= 2 ? `Egress IP changed ${rec.egress.ipCount}× — relay egress is not stable` : "Egress is unstable"}
                                  >
                                    unstable
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="h-8 px-3 text-text-muted text-sm">{rec.poolName}</td>
                        <td className="h-8 px-3 text-text-muted text-sm">{rec.reason}</td>
                        <td className="h-8 px-3 text-text-muted text-sm">{fmtTime(rec.until)}</td>
                        <td className="h-8 px-3 text-sm">
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              icon="close"
                              onClick={() => handleClear(rec)}
                              disabled={clearingScope === rec.scope}
                              title="Clear this block"
                            >
                              {clearingScope === rec.scope ? "Clearing..." : "Clear"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <ConfirmModal
        isOpen={confirmClearAll}
        onClose={() => setConfirmClearAll(false)}
        onConfirm={handleClearAll}
        title="Clear all blocks"
        message={providerFilter !== "all"
          ? `Clear all active blocks for provider "${providerFilter}"? This lets those pools be selected again immediately.`
          : "Clear all active proxy blocks? This lets all pools be selected again immediately."}
        confirmText={clearingAll ? "Clearing..." : "Clear All"}
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
