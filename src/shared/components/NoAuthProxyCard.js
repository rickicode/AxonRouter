"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import PropTypes from "prop-types";
import Card from "./Card";
import Select from "./Select";
import Badge from "./Badge";
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
 { value: "round-robin", label: "Round-robin (sequential)" },
 { value: "random", label: "Random" },
 { value: "smart", label: "Smart (skip unfit IPs)" },
];

export default function NoAuthProxyCard({ providerId }) {
 const [proxyPools, setProxyPools] = useState([]);
 const [proxyGroups, setProxyGroups] = useState({ defaultGroups: [], customGroups: [] });
 const [proxyPoolId, setProxyPoolId] = useState(NONE_PROXY_POOL_VALUE);
 const [rotateStrategy, setRotateStrategy] = useState("round-robin");
 const [routingMode, setRoutingMode] = useState("direct"); // "direct" | "single" | "group" | "all"
 const [selectedGroup, setSelectedGroup] = useState("");
 const [saving, setSaving] = useState(false);
 const [savedFlash, setSavedFlash] = useState(false);
 const [trialKey, setTrialKey] = useState("");
 const [trialKeySaving, setTrialKeySaving] = useState(false);
 const [trialKeySaved, setTrialKeySaved] = useState(false);

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
 setRotateStrategy(override.rotateStrategy || "round-robin");
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
 return () => { cancelled = true; };
 }, [providerId]);

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
 override.rotateStrategy = strategy || "round-robin";
 } else if (mode === "all") {
 override.rotateStrategy = strategy || "round-robin";
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
 setTimeout(() => setSavedFlash(false), 1500);
 } catch (e) {
 console.log("Save proxy config error:", e);
 } finally {
 setSaving(false);
 }
 }, [providerId]);

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
 const strat = (rotateStrategy && rotateStrategy !== "none") ? rotateStrategy : "round-robin";
 setSelectedGroup(gVal);
 setRotateStrategy(strat);
 save("group", null, gVal, strat);
 } else if (newMode === "all") {
 const strat = (rotateStrategy && rotateStrategy !== "none") ? rotateStrategy : "round-robin";
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

 return (
 <Card>
 <div className="flex items-center gap-3 mb-3">
 <div className="inline-flex items-center justify-center w-10 h-8 rounded-sm bg-success/10 text-success">
 <Icon name="lock_open" size={18} />
 </div>
 <div className="flex-1">
 <p className="text-sm font-medium">No authentication required</p>
 <p className="text-xs text-text-muted">
 This provider requires no API key. Route requests directly or through proxy pools/groups to bypass rate limits.
 </p>
 </div>
 {savedFlash && <Badge variant="success" size="sm">Saved</Badge>}
 </div>

      {hasTrialKey && (
      <div className="flex flex-col gap-2 mb-5 rounded-sm border border-border bg-surface-2 p-3">
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
        <p className="text-xs text-text-muted">
          Leave empty to use the shared trial key hardcoded in the registry. Requests use this key when set.
        </p>
      </div>
      )}
 {/* Segmented Mode Selector */}
 <div className="flex flex-col gap-2 mb-3">
 <label className="text-xs text-text-muted font-medium">
 Routing Mode
 </label>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {ROUTING_MODES.map((mode) => {
 const isSelected = routingMode === mode.value;
 return (
 <button
 key={mode.value}
 onClick={() => handleModeChange(mode.value)}
 disabled={saving}
 className={`flex flex-col items-center gap-2 p-3 rounded-sm border text-left ${
 isSelected
 ? "bg-primary/10 text-primary border-primary/30 "
 : "bg-surface text-text-main border-border hover:border-primary/30 hover:bg-surface-2"
 } disabled:opacity-50`}
 >
                  <div className="flex items-center gap-1.5 w-full justify-center">
                    <Icon name={mode.icon} size={18} />
                    <span className="text-xs font-medium">{mode.label}</span>
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
 <span>Requests will connect directly to the provider endpoint without using any proxy.</span>
 </div>
 )}

 {routingMode === "single" && (
 <div className="flex flex-col gap-3">
 <Select
 label="Proxy Pool"
 value={proxyPoolId}
 onChange={(e) => handlePoolChange(e.target.value)}
 disabled={saving}
 options={[
 { value: NONE_PROXY_POOL_VALUE, label: "— Select a pool —" },
 ...proxyPools.map((pool) => ({
 value: pool.id,
 label: `${pool.name} (${pool.type || "http"})`,
 })),
 ]}
 hint="All requests for this provider will route through this single proxy pool."
 />
 {proxyPoolId === NONE_PROXY_POOL_VALUE && (
 <p className="text-xs text-warning">Please select a proxy pool above.</p>
 )}
 </div>
 )}

 {routingMode === "group" && (
 <div className="flex flex-col gap-3">
 <Select
 label="Proxy Group"
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
 hint="Requests will rotate through all active proxy pools belonging to this group."
 />

 <div className="flex flex-col gap-1.5">
 <label className="text-xs font-medium text-text-muted">Rotation Strategy</label>
 <select
 value={rotateStrategy}
 onChange={(e) => handleStrategyChange(e.target.value)}
 disabled={saving}
 className="h-8 px-3 text-sm text-text-main bg-surface border border-border rounded-sm focus:border-primary/30 focus:outline-none disabled:opacity-50"
 >
 {STRATEGIES.map((s) => (
 <option key={s.value} value={s.value}>
 {s.label}
 </option>
 ))}
 </select>
 <p className="text-xs text-text-muted">
 {rotateStrategy === "round-robin" && "Cycles sequentially through each pool in the group."}
 {rotateStrategy === "random" && "Selects a random pool from the group for each request."}
 {rotateStrategy === "smart" && "Skips pools whose egress IP is currently limited/blocked for this provider."}
 </p>
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
 className="h-8 px-3 text-sm text-text-main bg-surface border border-border rounded-sm focus:border-primary/30 focus:outline-none disabled:opacity-50"
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
};
