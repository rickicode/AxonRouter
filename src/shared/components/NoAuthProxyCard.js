"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import PropTypes from "prop-types";
import Card from "./Card";
import Select from "./Select";
import Badge from "./Badge";
import Button from "./Button";
import { FREE_PROVIDERS } from "@/shared/constants/providers";
import Icon from "@/shared/components/Icon";

const NONE_PROXY_POOL_VALUE = "__none__";

const ROUTING_MODES = [
  { value: "direct", label: "Direct", icon: "public_off", desc: "No proxy" },
  { value: "single", label: "Single Pool", icon: "dns", desc: "One pool" },
  { value: "group", label: "Proxy Group", icon: "auto_awesome", desc: "Pool group" },
  { value: "all", label: "Rotate All", icon: "sync", desc: "All pools" },
];

const STRATEGIES = [
  { value: "smart", label: "Smart (skip unfit/blocked IPs)" },
  { value: "round-robin", label: "Round-robin (sequential)" },
  { value: "random", label: "Random" },
];

export default function NoAuthProxyCard({ providerId, isFreeNoAuth = null }) {
  const [proxyPools, setProxyPools] = useState([]);
  const [proxyGroups, setProxyGroups] = useState({ defaultGroups: [], customGroups: [] });
  const [proxyPoolId, setProxyPoolId] = useState(NONE_PROXY_POOL_VALUE);
  const [rotateStrategy, setRotateStrategy] = useState("smart");
  const [routingMode, setRoutingMode] = useState("direct"); // "direct" | "single" | "group" | "all"
  const [selectedGroup, setSelectedGroup] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [trialKey, setTrialKey] = useState("");
  const [trialKeySaving, setTrialKeySaving] = useState(false);
  const [trialKeySaved, setTrialKeySaved] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [poolFilter, setPoolFilter] = useState("");

  const isActuallyFreeNoAuth = isFreeNoAuth !== null ? isFreeNoAuth : !!FREE_PROVIDERS[providerId]?.noAuth;

  const fetchStats = useCallback(async () => {
    if (!providerId) return;
    try {
      setStatsLoading(true);
      const res = await fetch(`/api/providers/${providerId}/proxy-stats`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.warn("Failed to load proxy stats:", e);
    } finally {
      setStatsLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/proxy-pools?isActive=true", { cache: "no-store" }).then((r) => r.ok ? r.json() : { proxyPools: [] }),
      fetch("/api/settings", { cache: "no-store" }).then((r) => r.ok ? r.json() : {}),
      fetch("/api/proxy-groups", { cache: "no-store" }).then((r) => r.ok ? r.json() : { defaultGroups: [], customGroups: [] }),
    ]).then(([poolData, settingsData, groupsData]) => {
      if (cancelled) return;
      const pools = poolData.proxyPools || [];
      setProxyPools(pools);
      setProxyGroups(groupsData || { defaultGroups: [], customGroups: [] });

      const override = (settingsData.providerStrategies || {})[providerId] || {};
      if (override.proxyGroup) {
        setRoutingMode("group");
        setSelectedGroup(override.proxyGroup);
        setRotateStrategy(override.rotateStrategy || "smart");
      } else if (override.rotateStrategy && override.rotateStrategy !== "none") {
        setRoutingMode("all");
        setRotateStrategy(override.rotateStrategy);
      } else if (override.proxyPoolId && override.proxyPoolId !== NONE_PROXY_POOL_VALUE) {
        setRoutingMode("single");
        setProxyPoolId(override.proxyPoolId);
      } else {
        setRoutingMode("direct");
        setProxyPoolId(NONE_PROXY_POOL_VALUE);
      }
      if (override.trialKey) setTrialKey(override.trialKey);
    }).catch(() => {});

    fetchStats();

    return () => { cancelled = true; };
  }, [providerId, fetchStats]);

  const allGroups = useMemo(() => {
    const defaults = (proxyGroups.defaultGroups || []).map((g) => {
      const cnt = typeof g.activeCount === "number" ? g.activeCount : (proxyPools || []).filter((p) => p.type === g.type && p.isActive).length;
      return {
        value: g.key || g.name?.toLowerCase() || g.id,
        label: `${g.name || g.key} (${cnt} active)`,
        isDefault: true,
        count: cnt,
      };
    });
    const custom = (proxyGroups.customGroups || []).map((g) => {
      const cnt = typeof g.activeCount === "number" ? g.activeCount : (proxyPools || []).filter((p) => (p.group === g.name || (Array.isArray(g.poolIds) && g.poolIds.includes(p.id))) && p.isActive).length;
      return {
        value: g.name,
        label: `${g.name} (${cnt} active)`,
        isDefault: false,
        count: cnt,
      };
    });
    return [...defaults, ...custom];
  }, [proxyGroups, proxyPools]);

  const filteredPools = useMemo(() => {
    if (!poolFilter.trim()) return proxyPools.slice(0, 100);
    const q = poolFilter.toLowerCase().trim();
    return proxyPools.filter((p) => String(p.name || "").toLowerCase().includes(q) || String(p.type || "").toLowerCase().includes(q)).slice(0, 100);
  }, [proxyPools, poolFilter]);

  const save = useCallback(async (mode, poolId, group, strategy) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = res.ok ? await res.json() : {};
      const current = data.providerStrategies || {};
      const override = { ...(current[providerId] || {}) };

      delete override.proxyPoolId;
      delete override.proxyGroup;
      delete override.rotateStrategy;

      if (mode === "single" && poolId && poolId !== NONE_PROXY_POOL_VALUE) {
        override.proxyPoolId = poolId;
      } else if (mode === "group" && group) {
        override.proxyGroup = group;
        override.rotateStrategy = strategy || "smart";
      } else if (mode === "all") {
        override.rotateStrategy = strategy || "smart";
      }

      const updated = { ...current };
      if (Object.keys(override).length === 0) delete updated[providerId];
      else updated[providerId] = override;

      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerStrategies: updated }),
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      fetchStats();
    } catch (e) {
      console.log("Save proxy config error:", e);
    } finally {
      setSaving(false);
    }
  }, [providerId, fetchStats]);

  const handleSyncToAllExisting = async () => {
    if (!providerId) return;
    setSyncingAll(true);
    try {
      let body = { provider: providerId };
      if (routingMode === "group" && selectedGroup) {
        body.action = "group";
        body.proxyGroup = selectedGroup;
        body.proxyRotationStrategy = rotateStrategy;
      } else if (routingMode === "single" && proxyPoolId && proxyPoolId !== NONE_PROXY_POOL_VALUE) {
        body.action = "single";
        body.proxyPoolId = proxyPoolId;
      } else if (routingMode === "direct") {
        body.action = "unbind";
      } else if (routingMode === "all") {
        const poolIds = proxyPools.map((p) => p.id);
        body.action = "strategy";
        body.proxyPoolIds = poolIds;
        body.proxyRotationStrategy = rotateStrategy;
      }

      const res = await fetch("/api/providers/bulk-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSyncSuccess(true);
        setTimeout(() => setSyncSuccess(false), 3000);
        fetchStats();
      }
    } catch (e) {
      console.warn("Sync proxy error:", e);
    } finally {
      setSyncingAll(false);
    }
  };

  const saveTrialKey = useCallback(async (key) => {
    setTrialKeySaving(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = res.ok ? await res.json() : {};
      const current = data.providerStrategies || {};
      const override = { ...(current[providerId] || {}) };
      if (key && key.trim()) override.trialKey = key.trim();
      else delete override.trialKey;
      const updated = { ...current };
      if (Object.keys(override).length === 0) delete updated[providerId];
      else updated[providerId] = override;
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerStrategies: updated }),
      });
      setTrialKeySaved(true);
      setTimeout(() => setTrialKeySaved(false), 1500);
    } catch (e) {
      console.log("Save trial key error:", e);
    } finally {
      setTrialKeySaving(false);
    }
  }, [providerId]);

  const handleModeChange = (newMode) => {
    setRoutingMode(newMode);
    if (newMode === "direct") {
      save("direct", null, null, null);
    } else if (newMode === "single") {
      const pId = (proxyPoolId && proxyPoolId !== NONE_PROXY_POOL_VALUE) ? proxyPoolId : (proxyPools[0]?.id || NONE_PROXY_POOL_VALUE);
      setProxyPoolId(pId);
      save("single", pId, null, null);
    } else if (newMode === "group") {
      const gVal = selectedGroup || allGroups[0]?.value || "";
      const strat = (rotateStrategy && rotateStrategy !== "none") ? rotateStrategy : "smart";
      setSelectedGroup(gVal);
      setRotateStrategy(strat);
      if (gVal) {
        save("group", null, gVal, strat);
      }
    } else if (newMode === "all") {
      const strat = (rotateStrategy && rotateStrategy !== "none") ? rotateStrategy : "smart";
      setRotateStrategy(strat);
      save("all", null, null, strat);
    }
  };

  const handlePoolChange = (newPoolId) => {
    setProxyPoolId(newPoolId);
    save("single", newPoolId, null, null);
  };

  const handleGroupChange = (newGroup) => {
    setSelectedGroup(newGroup);
    save("group", null, newGroup, rotateStrategy);
  };

  const handleStrategyChange = (newStrategy) => {
    setRotateStrategy(newStrategy);
    if (routingMode === "group") {
      save("group", null, selectedGroup, newStrategy);
    } else if (routingMode === "all") {
      save("all", null, null, newStrategy);
    }
  };

  const activePoolCount = proxyPools.length;
  const hasTrialKey = !!FREE_PROVIDERS[providerId]?.trialKey;

  const successRate24h = stats?.stats24h?.successRate ?? null;
  const totalReq24h = stats?.stats24h?.total ?? 0;
  const successReq24h = stats?.stats24h?.success ?? 0;
  const failReq24h = stats?.stats24h?.failure ?? 0;
  const cancelledReq24h = stats?.stats24h?.cancelled ?? 0;
  const totalAccounts = stats?.connectionCount ?? 0;
  const groupHealth = stats?.groupHealth ?? null;

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className={`inline-flex items-center justify-center w-10 h-10 rounded-sm ${
            routingMode === "direct" ? "bg-secondary/10 text-secondary" : "bg-primary/10 text-primary"
          }`}>
            <Icon name={routingMode === "direct" ? "public_off" : "hub"} size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-text-main">
                {isActuallyFreeNoAuth ? "Provider Egress & Proxy Strategy" : "Provider Default Proxy Strategy"}
              </h3>
              <Badge variant="outline" size="sm" className="text-[11px] text-primary border-primary/30 bg-primary/5">
                Auto-inherits to new keys
              </Badge>
            </div>
            <p className="text-xs text-text-muted">
              {isActuallyFreeNoAuth
                ? "Bypass Cloudflare/upstream rate limits by routing requests through a dedicated proxy group or pool."
                : "Configure outbound proxy for this provider. All newly added accounts/keys automatically inherit this setting."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {savedFlash && <Badge variant="success" size="sm">Saved & Auto-Applied</Badge>}
          {syncSuccess && <Badge variant="success" size="sm">Applied to All {totalAccounts} Accounts</Badge>}
          <Button
            size="xs"
            variant="ghost"
            icon="refresh"
            onClick={fetchStats}
            disabled={statsLoading}
            title="Refresh Success Rate & Health Stats"
          />
        </div>
      </div>

      {/* Success Rate & Health Info Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 p-3 rounded-sm bg-surface-2 border border-border">
        {/* Success Rate 24h */}
        <div className="flex flex-col justify-between p-2.5 rounded-sm bg-surface border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Success Rate (24h)</span>
            <Icon
              name={successRate24h >= 90 ? "verified" : successRate24h >= 60 ? "info" : "warning"}
              size={16}
              className={successRate24h >= 90 ? "text-success" : successRate24h >= 60 ? "text-warning" : "text-danger"}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-text-main">
              {totalReq24h > 0 ? `${successRate24h}%` : "100%"}
            </span>
            <span className="text-xs text-text-muted">
              ({successReq24h.toLocaleString()} / {Math.max(1, successReq24h + failReq24h).toLocaleString()} completed)
            </span>
          </div>
          <div className="w-full bg-border rounded-full h-1.5 mt-2 overflow-hidden flex">
            <div
              className={`h-full ${successRate24h >= 80 ? "bg-success" : successRate24h >= 50 ? "bg-warning" : "bg-danger"}`}
              style={{ width: `${Math.max(5, Math.min(100, successRate24h || 100))}%` }}
            />
          </div>
          {cancelledReq24h > 0 && (
            <span className="text-[10px] text-text-muted mt-1 truncate" title="Internal speculative hedging race aborts (not user failures)">
              +{cancelledReq24h.toLocaleString()} internal race aborted
            </span>
          )}
        </div>

        {/* Group / Proxy Pool Health */}
        <div className="flex flex-col justify-between p-2.5 rounded-sm bg-surface border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Proxy Pool Health</span>
            <Icon name="dns" size={16} className="text-primary" />
          </div>
          <div>
            {routingMode === "group" && groupHealth ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-text-main">
                    {groupHealth.activePools} / {groupHealth.totalPools}
                  </span>
                  <span className="text-xs text-text-muted">Healthy Pools</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                  <span className="text-success font-medium">{groupHealth.healthRate}% ready</span>
                  {groupHealth.unhealthyPools > 0 && (
                    <span className="text-danger">({groupHealth.unhealthyPools} disabled/dead)</span>
                  )}
                  {groupHealth.degradedPools > 0 && (
                    <span className="text-warning">({groupHealth.degradedPools} degraded)</span>
                  )}
                </div>
              </>
            ) : routingMode === "single" && stats?.singlePoolHealth ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold truncate text-text-main">{stats.singlePoolHealth.name}</span>
                  <Badge variant={stats.singlePoolHealth.isActive ? "success" : "danger"} size="xs">
                    {stats.singlePoolHealth.testStatus || "active"}
                  </Badge>
                </div>
                <span className="text-[11px] text-text-muted mt-1">
                  Failures: {stats.singlePoolHealth.consecutiveFailures || 0} / 3
                </span>
              </>
            ) : (
              <>
                <div className="text-sm font-medium text-text-muted">
                  {routingMode === "direct" ? "Direct Egress (No Proxy)" : "Rotating All Active Pools"}
                </div>
                <span className="text-[11px] text-text-muted mt-1">
                  {routingMode === "direct" ? "Requests use raspi egress IP directly" : `${activePoolCount} pools available`}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Coverage & Sync Action */}
        <div className="flex flex-col justify-between p-2.5 rounded-sm bg-surface border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Account Inheritance</span>
            <Icon name="check_circle" size={16} className="text-success" />
          </div>
          <div>
            <div className="text-sm font-medium text-text-main">
              {totalAccounts > 0 ? `${totalAccounts} Accounts Bound` : "Ready for New Keys"}
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              New accounts auto-inherit. Existing accounts can be updated with 1-click.
            </p>
          </div>
          {totalAccounts > 0 && (
            <div className="mt-2">
              <Button
                size="xs"
                variant="secondary"
                icon="sync"
                onClick={handleSyncToAllExisting}
                disabled={syncingAll || saving}
                className="w-full text-xs"
              >
                {syncingAll ? "Syncing..." : `Apply to All ${totalAccounts} Accounts`}
              </Button>
            </div>
          )}
        </div>
      </div>

      {hasTrialKey && (
        <div className="flex flex-col gap-2 mb-4 rounded-sm border border-border bg-surface-2 p-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Trial Key <span className="normal-case font-normal text-text-muted">(optional — overrides the built-in key)</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={trialKey}
              onChange={(e) => setTrialKey(e.target.value)}
              placeholder="lt-trial-…"
              disabled={trialKeySaving}
              className="flex-1 px-3 py-2 text-sm rounded-sm border border-border bg-surface text-text-main focus:ring-1 focus:ring-primary/30 focus:border-primary/50 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => saveTrialKey(trialKey)}
              disabled={trialKeySaving}
              className="px-4 py-2 text-sm font-medium rounded-sm bg-primary text-white disabled:opacity-50 shrink-0"
            >
              {trialKeySaving ? "Saving…" : "Save Key"}
            </button>
            {trialKey && (
              <button
                type="button"
                onClick={() => { setTrialKey(""); saveTrialKey(""); }}
                disabled={trialKeySaving}
                className="px-4 py-2 text-sm font-medium rounded-sm border border-border text-text-main hover:bg-surface-2 disabled:opacity-50 shrink-0"
              >
                Reset
              </button>
            )}
          </div>
          {trialKeySaved && <Badge variant="success" size="sm">Key saved</Badge>}
        </div>
      )}

      {/* Segmented Mode Selector */}
      <div className="flex flex-col gap-2 mb-3">
        <label className="text-xs text-text-muted font-medium">
          Provider Proxy Routing Mode
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROUTING_MODES.map((mode) => {
            const isSelected = routingMode === mode.value;
            return (
              <button
                key={mode.value}
                onClick={() => handleModeChange(mode.value)}
                disabled={saving}
                className={`flex flex-col items-center gap-2 p-3 rounded-sm border text-left transition-colors ${
                  isSelected
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-surface text-text-main border-border hover:border-primary/30 hover:bg-surface-2"
                } disabled:opacity-50`}
              >
                <div className="flex items-center gap-1.5 w-full justify-center">
                  <Icon name={mode.icon} size={18} />
                  <span className="text-xs font-semibold">{mode.label}</span>
                </div>
                <span className="text-[11px] text-text-muted">{mode.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode Details Section */}
      <div className="rounded-sm border border-border bg-surface p-3">
        {routingMode === "direct" && (
          <div className="flex items-center gap-3 text-sm text-text-muted">
            <Icon className="text-success" name="check_circle" size={18} />
            <span>Requests will connect directly from server egress without using any proxy pool.</span>
          </div>
        )}

        {routingMode === "single" && (
          <div className="flex flex-col gap-3">
            {proxyPools.length > 30 && (
              <div className="relative">
                <input
                  type="text"
                  value={poolFilter}
                  onChange={(e) => setPoolFilter(e.target.value)}
                  placeholder={`Search ${proxyPools.length.toLocaleString()} pools by name or type...`}
                  className="w-full px-3 py-1.5 text-xs rounded-sm border border-border bg-surface text-text-main placeholder:text-text-muted focus:border-primary/50 focus:outline-none"
                />
                {poolFilter && (
                  <button
                    type="button"
                    onClick={() => setPoolFilter("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-text-main"
                  >
                    ×
                  </button>
                )}
              </div>
            )}
            <Select
              label="Select Proxy Pool"
              value={proxyPoolId}
              onChange={(e) => handlePoolChange(e.target.value)}
              disabled={saving}
              options={[
                { value: NONE_PROXY_POOL_VALUE, label: "— Select a pool —" },
                ...filteredPools.map((pool) => ({
                  value: pool.id,
                  label: `${pool.name} (${pool.type || "http"})`,
                })),
              ]}
              hint={proxyPools.length > 100 && !poolFilter ? "Showing first 100 pools. Use search above to filter." : "All new and default requests for this provider will route through this single proxy pool."}
            />
            {proxyPoolId === NONE_PROXY_POOL_VALUE && (
              <p className="text-xs text-warning">Please select a proxy pool above.</p>
            )}
          </div>
        )}

        {routingMode === "group" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Select Proxy Group"
                value={selectedGroup}
                onChange={(e) => handleGroupChange(e.target.value)}
                disabled={saving}
                options={[
                  { value: "", label: "— Select a group —" },
                  ...allGroups.map((g) => ({
                    value: g.value,
                    label: g.label,
                  })),
                ]}
                hint="Requests rotate through all active proxy pools belonging to this group."
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-muted">Rotation Strategy</label>
                <select
                  value={rotateStrategy}
                  onChange={(e) => handleStrategyChange(e.target.value)}
                  disabled={saving}
                  className="h-9 px-3 text-sm text-text-main bg-surface border border-border rounded-sm focus:border-primary/30 focus:outline-none disabled:opacity-50"
                >
                  {STRATEGIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-muted">
                  {rotateStrategy === "round-robin" && "Cycles sequentially through each healthy pool in the group."}
                  {rotateStrategy === "random" && "Selects a random healthy pool from the group for each request."}
                  {rotateStrategy === "smart" && "Intelligently skips pools whose egress IP is rate-limited or blocked."}
                </p>
              </div>
            </div>
          </div>
        )}

        {routingMode === "all" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">
                Active Proxy Pools: <strong className="text-text-main">{activePoolCount}</strong>
              </span>
              {activePoolCount < 2 && (
                <Badge variant="warning" size="sm">Need ≥ 2 pools for rotation</Badge>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-muted">Rotation Strategy</label>
              <select
                value={rotateStrategy}
                onChange={(e) => handleStrategyChange(e.target.value)}
                disabled={saving}
                className="h-9 px-3 text-sm text-text-main bg-surface border border-border rounded-sm focus:border-primary/30 focus:outline-none disabled:opacity-50"
              >
                {STRATEGIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-text-muted">
                {rotateStrategy === "round-robin" && `Rotating across all ${activePoolCount} active pools sequentially.`}
                {rotateStrategy === "random" && `Picking randomly across all ${activePoolCount} active pools.`}
                {rotateStrategy === "smart" && `Routing through all active pools, automatically skipping limited/blocked IPs.`}
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

NoAuthProxyCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  isFreeNoAuth: PropTypes.bool,
};
