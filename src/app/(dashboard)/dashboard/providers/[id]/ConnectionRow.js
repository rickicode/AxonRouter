"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { getStatusVariant as getConnectionStatusVariant } from "@/shared/utils/connectionStatus";
import PropTypes from "prop-types";
import { Badge, Toggle, Tooltip } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import CooldownTimer from "./CooldownTimer";
import Icon from "@/shared/components/Icon";

export default function ConnectionRow({ connection, proxyPools, proxyGroups = null, isOAuth, isFirst, isLast, onMoveUp, onMoveDown, onToggleActive, onUpdateProxy, onEdit, onDelete, onResetStatus = null, onUnlockModel = null, oneByOneStatus = null, autoPing = null }) {
 const [showProxyDropdown, setShowProxyDropdown] = useState(false);
 const [updatingProxy, setUpdatingProxy] = useState(false);
 const [resettingStatus, setResettingStatus] = useState(false);
 const [selectedProxyIds, setSelectedProxyIds] = useState([]);
 const [rotationStrategy, setRotationStrategy] = useState("none");
 const [selectedGroup, setSelectedGroup] = useState("");
 const [fetchedProxyGroups, setFetchedProxyGroups] = useState(null);
 const { copied, copy } = useCopyToClipboard();
 const proxyDropdownRef = useRef(null);

 const localProxyGroups = proxyGroups || fetchedProxyGroups;

 useEffect(() => {
 if (proxyGroups) return;
 let ignore = false;
 fetch("/api/proxy-groups", { cache: "no-store" })
 .then((r) => r.ok ? r.json() : null)
 .then((data) => {
 if (!ignore && data) setFetchedProxyGroups(data);
 })
 .catch(() => {});
 return () => { ignore = true; };
 }, [proxyGroups]);

 // Initialize proxy state from connection
 useEffect(() => {
 let proxyPoolIds = connection.providerSpecificData?.proxyPoolIds;
 if (typeof proxyPoolIds === "string") {
 try {
 proxyPoolIds = JSON.parse(proxyPoolIds);
 } catch {
 proxyPoolIds = [];
 }
 }
 if (!Array.isArray(proxyPoolIds)) {
 proxyPoolIds = [];
 }
 const legacyProxyPoolId = connection.providerSpecificData?.proxyPoolId;
 
 // Migrate legacy single proxy to array format
 queueMicrotask(() => {
 if (legacyProxyPoolId && proxyPoolIds.length === 0) {
 setSelectedProxyIds([legacyProxyPoolId]);
 } else {
 setSelectedProxyIds(proxyPoolIds);
 }
 setRotationStrategy(connection.providerSpecificData?.proxyRotationStrategy || "none");
 setSelectedGroup(connection.providerSpecificData?.proxyGroup || "");
 });
 }, [connection]);

 const defaultGroupsList = useMemo(() => {
 return localProxyGroups?.defaultGroups || [
 { id: "default-cloudflare", key: "cloudflare", name: "Cloudflare Relay", type: "cloudflare" },
 { id: "default-http", key: "http", name: "HTTP", type: "http" },
 { id: "default-vercel", key: "vercel", name: "Vercel", type: "vercel" },
 { id: "default-deno", key: "deno", name: "Deno", type: "deno" },
 ];
 }, [localProxyGroups]);

 const customGroupsList = useMemo(() => {
 return localProxyGroups?.customGroups || [];
 }, [localProxyGroups]);

 const proxyPoolMap = new Map((proxyPools || []).map((pool) => [pool.id, pool]));
 const availableGroups = useMemo(() => {
 const s = new Set();
 (proxyPools || []).forEach(p => {
 if (p.group && typeof p.group === "string" && p.group.trim()) s.add(p.group.trim());
 });
 return [...s].sort();
 }, [proxyPools]);

 const safeSelectedProxyIds = Array.isArray(selectedProxyIds) ? selectedProxyIds : [];

 // Display logic - support both new (multi-proxy) and legacy (single proxy) formats
 const hasLegacyProxy = connection.providerSpecificData?.connectionProxyEnabled === true && !!connection.providerSpecificData?.connectionProxyUrl;
 const hasAnyProxy = safeSelectedProxyIds.length > 0 || hasLegacyProxy || !!selectedGroup;

 const getProxyDisplayText = () => {
 if (safeSelectedProxyIds.length === 0 && !hasLegacyProxy && !selectedGroup) return "";

 if (selectedGroup) {
 const def = defaultGroupsList.find((g) => g.key === selectedGroup || g.name.toLowerCase() === selectedGroup.toLowerCase() || g.id === selectedGroup);
 if (def) {
 const poolCount = (proxyPools || []).filter((p) => p.type === def.type && p.isActive).length;
 return `Group: ${def.name} (${poolCount} pools, Round Robin)`;
 }

 const custom = customGroupsList.find((g) => g.name.toLowerCase() === selectedGroup.toLowerCase() || g.id === selectedGroup);
 if (custom) {
 const poolCount = (custom.poolIds || []).length;
 const stickyText = custom.isSticky ? `Sticky ${custom.stickyLimit || 3}x` : "Round Robin";
 return `Group: ${custom.name} (${poolCount} pools, ${stickyText})`;
 }

 const grpPools = (proxyPools || []).filter(p => p.group && p.group.toLowerCase() === selectedGroup.toLowerCase());
 const strategyLabel = rotationStrategy === "random" ? "Random" : rotationStrategy === "failover" ? "Failover" : rotationStrategy === "smart" ? "Smart" : "Round Robin";
 return `Group: ${selectedGroup} (${grpPools.length} pools, ${strategyLabel})`;
 }

 if (safeSelectedProxyIds.length === 1) {
 const pool = proxyPoolMap.get(safeSelectedProxyIds[0]);
 return pool ? `Pool: ${pool.name}` : `Pool: ${safeSelectedProxyIds[0]} (inactive/missing)`;
 }

 if (safeSelectedProxyIds.length > 1) {
 const strategyLabel = rotationStrategy === "random" ? "Random" : rotationStrategy === "round-robin" ? "Round Robin" : rotationStrategy === "failover" ? "Failover" : rotationStrategy === "smart" ? "Smart" : "Multiple";
 return `${safeSelectedProxyIds.length} pools (${strategyLabel})`;
 }

 if (hasLegacyProxy) {
 return `Legacy: ${connection.providerSpecificData?.connectionProxyUrl}`;
 }

 return "";
 };
 
 const proxyDisplayText = getProxyDisplayText();
 const autoPingTooltip = autoPing?.provider === "codex"
 ? "Auto-starts the next 5h Codex window after reset by sending a tiny gpt-5.5 request. Consumes a small amount of quota."
 : "When your 5h quota runs out, auto-sends a request the moment it resets so a new window starts right away.";

 let maskedProxyUrl = "";
 if (safeSelectedProxyIds.length > 0) {
 const selectedPools = safeSelectedProxyIds.map(id => proxyPoolMap.get(id)).filter(Boolean);
 if (selectedPools.length > 0) {
 try {
 const parsed = new URL(selectedPools[0].proxyUrl);
 maskedProxyUrl = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
 if (selectedPools.length > 1) {
 maskedProxyUrl += ` (+${selectedPools.length - 1} more)`;
 }
 } catch {
 maskedProxyUrl = selectedPools[0].proxyUrl;
 }
 }
 } else if (connection.providerSpecificData?.connectionProxyUrl) {
 const rawProxyUrl = connection.providerSpecificData?.connectionProxyUrl;
 try {
 const parsed = new URL(rawProxyUrl);
 maskedProxyUrl = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
 } catch {
 maskedProxyUrl = rawProxyUrl;
 }
 }

 const noProxyText = safeSelectedProxyIds.length > 0 
 ? proxyPoolMap.get(safeSelectedProxyIds[0])?.noProxy || ""
 : connection.providerSpecificData?.connectionNoProxy || "";

 let proxyBadgeVariant = "default";
 if (selectedGroup) {
 proxyBadgeVariant = "success";
 } else if (safeSelectedProxyIds.length > 0) {
 const allActive = safeSelectedProxyIds.every(id => proxyPoolMap.get(id)?.isActive === true);
 proxyBadgeVariant = allActive ? "success" : "error";
 } else if (hasLegacyProxy) {
 proxyBadgeVariant = "error";
 }

 // Close dropdown when clicking outside
 useEffect(() => {
 if (!showProxyDropdown) return;
 const handler = (e) => {
 if (proxyDropdownRef.current && !proxyDropdownRef.current.contains(e.target)) {
 setShowProxyDropdown(false);
 }
 };
 document.addEventListener("mousedown", handler);
 return () => document.removeEventListener("mousedown", handler);
 }, [showProxyDropdown]);

 const handleToggleProxySelection = (poolId) => {
 setSelectedGroup("");
 setSelectedProxyIds(prev => {
 if (prev.includes(poolId)) {
 return prev.filter(id => id !== poolId);
 } else {
 return [...prev, poolId];
 }
 });
 };

 const handleStrategyChange = (strategy) => {
 setRotationStrategy(strategy);
 
 // Auto-select all active proxy pools when switching to rotation strategies
 if (strategy !== "none" && selectedProxyIds.length === 0) {
 const activePoolIds = (proxyPools || [])
 .filter(pool => pool.isActive === true)
 .map(pool => pool.id);
 setSelectedProxyIds(activePoolIds);
 }
 
 // Reset to single proxy when switching to "none"
 if (strategy === "none" && selectedProxyIds.length > 1) {
 setSelectedProxyIds(selectedProxyIds.slice(0, 1));
 }
 };

 const handleApplyProxyChanges = async () => {
 setUpdatingProxy(true);
 try {
 await onUpdateProxy({
 proxyPoolIds: selectedGroup ? [] : selectedProxyIds,
 proxyRotationStrategy: rotationStrategy,
 proxyGroup: selectedGroup || null,
 });
 setShowProxyDropdown(false);
 } finally {
 setUpdatingProxy(false);
 }
 };

 const handleSelectProxy = async (poolId) => {
 // Legacy single-proxy mode (backwards compatibility)
 setUpdatingProxy(true);
 try {
 setSelectedGroup("");
 setSelectedProxyIds(poolId === "__none__" ? [] : [poolId]);
 setRotationStrategy("none");
 await onUpdateProxy({
 proxyPoolIds: poolId === "__none__" ? [] : [poolId],
 proxyRotationStrategy: "none",
 proxyGroup: null,
 });
 } finally {
 setUpdatingProxy(false);
 setShowProxyDropdown(false);
 }
 };

 const rowAuthType = connection.authType || (isOAuth ? "oauth" : "apikey");
 const isOAuthConnection = rowAuthType === "oauth";
 const isCookieConnection = rowAuthType === "cookie";
 const authIcon = isCookieConnection ? "cookie" : isOAuthConnection ? "lock" : "key";
 const authLabel = isOAuthConnection ? "OAuth" : isCookieConnection ? "Cookie" : "API Key";
 const displayName = connection.name?.trim()
 || connection.email?.trim()
 || connection.displayName?.trim()
 || (isOAuthConnection ? "OAuth Account" : isCookieConnection ? "Cookie Account" : "API Key");
 const secondaryDisplayName = connection.name?.trim() && connection.email?.trim() && connection.name.trim() !== connection.email.trim()
 ? connection.email.trim()
 : connection.name?.trim() && connection.displayName?.trim() && connection.name.trim() !== connection.displayName.trim()
 ? connection.displayName.trim()
 : null;

 // Use useState + useEffect for impure Date.now() to avoid calling during render
 const [isCooldown, setIsCooldown] = useState(false);
 const [activeLocks, setActiveLocks] = useState([]);

 const hasAnyModelLockKey = Object.keys(connection).some((k) => k.startsWith("modelLock_"));

 useEffect(() => {
  const checkCooldown = () => {
    const now = Date.now();
    const flatLocks = Object.entries(connection)
      .filter(([k]) => k.startsWith("modelLock_"))
      .filter(([, v]) => v && new Date(v).getTime() > now)
      .map(([k, v]) => ({
        model: k.slice("modelLock_".length) || "__all",
        until: v,
      }));

    // Account-wide locks (rate-limit / rolling-window cooldowns, e.g. grok-cli
    // rolling 24h cap) previously showed no countdown — only a status badge.
    const accountUntil = connection.lockedAllUntil || connection.rateLimitedUntil;
    if (accountUntil && new Date(accountUntil).getTime() > now) {
      flatLocks.push({ model: "__all", until: accountUntil });
    }
 const dictLocks = Object.entries(connection.modelLocks || {})
 .filter(([, v]) => v && new Date(v).getTime() > now)
 .map(([k, v]) => ({
 model: k || "__all",
 until: v,
 }));

 const merged = new Map();
 [...flatLocks, ...dictLocks].forEach(item => merged.set(item.model, item));
 const locks = [...merged.values()].sort((a, b) => new Date(b.until) - new Date(a.until));

 setActiveLocks(locks);
 setIsCooldown(locks.length > 0);
 };

 checkCooldown();
 const interval = setInterval(checkCooldown, 1000);
 return () => {
 if (interval) clearInterval(interval);
 };
 }, [connection]);

 // Determine effective status (override unavailable if cooldown expired)
 const hasFatalError = Boolean(
 connection.providerSpecificData?.refreshBlocked ||
 (connection.lastError && /\b(banned|account has been banned|account has been deleted|suspended|revoked|invalid_grant|invalid token|invalid api key|unauthorized|forbidden)\b/i.test(connection.lastError))
 );
 const accountLockUntil = connection.lockedAllUntil
 || connection.rateLimitedUntil
 || connection.modelLocks?.__all
 || connection.modelLock___all;
 const [currentTime, setCurrentTime] = useState(() => Date.now());

 useEffect(() => {
 if (!accountLockUntil && !connection.lockedToModelUntil) return;
 const updateTime = () => setCurrentTime(Date.now());
 updateTime();
 const interval = setInterval(updateTime, 1000);
 return () => clearInterval(interval);
 }, [accountLockUntil, connection.lockedToModelUntil]);

 const now = currentTime;
 const hasAccountLock = Boolean(
 accountLockUntil && new Date(accountLockUntil).getTime() > now
 );
 const hasModelLock = activeLocks.some((lock) => lock.model !== "__all");

 const isFreebuff = connection.provider === "freebuff";
 const hasModelAffinityLock = Boolean(
 isFreebuff &&
 connection.lockedToModel &&
 connection.lockedToModelUntil &&
 new Date(connection.lockedToModelUntil).getTime() > now
 );
 const affinityMinutesRemaining = hasModelAffinityLock
 ? Math.max(1, Math.ceil((new Date(connection.lockedToModelUntil).getTime() - now) / 60000))
 : null;

 // exhausted = final state (credits/quota gone). A timed account lock is a
 // transient cooldown handled by effectiveStatus below.
 const isExhausted = connection.testStatus === "exhausted";

 const effectiveStatus = connection.isActive === false
 ? "disabled"
 : (hasFatalError || ["unavailable", "error", "expired", "invalid"].includes(connection.testStatus))
 ? "unavailable"
 : isExhausted
 ? "exhausted"
 : hasAccountLock
 ? "unavailable"
 : hasModelLock
 ? "active"
 : (connection.testStatus || "active");

 const getStatusVariant = () => getConnectionStatusVariant(connection.isActive, effectiveStatus);

 const getOneByOneVariant = () => {
 if (!oneByOneStatus) return "default";
 if (oneByOneStatus.state === "success") return "success";
 if (oneByOneStatus.state === "failed") return "error";
 if (oneByOneStatus.state === "testing") return "primary";
 return "default";
 };

 const getOneByOneLabel = () => {
 if (!oneByOneStatus) return null;
 if (oneByOneStatus.state === "queued") return "queued";
 if (oneByOneStatus.state === "testing") return "testing";
 if (oneByOneStatus.state === "success") return "success";
 if (oneByOneStatus.state === "failed") return oneByOneStatus.error ? `failed: ${oneByOneStatus.error}` : "failed";
 return null;
 };

 return (
 <div className={`group flex min-w-0 flex-col gap-3 rounded-sm p-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between ${connection.isActive === false ? "opacity-60" : ""} ${showProxyDropdown ? "relative z-30" : ""}`}>
 <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
 {/* Priority arrows */}
 <div className="flex shrink-0 flex-col">
 <button
 onClick={onMoveUp}
 disabled={isFirst}
 className={`size-11 rounded-sm sm:size-8 ${isFirst ? "text-text-muted/30 cursor-not-allowed" : "hover:bg-surface-2 text-text-muted hover:text-primary"}`}
 >
 <Icon className="text-sm" name="keyboard_arrow_up" size={18} />
 </button>
 <button
 onClick={onMoveDown}
 disabled={isLast}
 className={`size-11 rounded-sm sm:size-8 ${isLast ? "text-text-muted/30 cursor-not-allowed" : "hover:bg-surface-2 text-text-muted hover:text-primary"}`}
 >
 <Icon className="text-sm" name="keyboard_arrow_down" size={18} />
 </button>
 </div>
 <Icon name={authIcon} size={14} className="shrink-0 text-text-muted" />
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium truncate">{displayName}</p>
 {secondaryDisplayName && (
 <p className="text-xs text-text-muted truncate">{secondaryDisplayName}</p>
 )}
 <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
 <Badge
 variant={getStatusVariant()}
 size="sm"
 dot
 title={connection.isActive === false && connection.previousStatus && connection.previousStatus !== "disabled" ? `Status before disabled: ${connection.previousStatus}${connection.disabledAt ? ` at ${new Date(connection.disabledAt).toLocaleString()}` : ""}` : undefined}
 >
 {connection.isActive === false
 ? (connection.previousStatus && connection.previousStatus !== "disabled" ? `disabled (was: ${connection.previousStatus})` : "disabled")
 : (effectiveStatus || "Unknown")}
 </Badge>
 <Badge variant="default" size="sm">
 {authLabel}
 </Badge>
 {hasAnyProxy && (
 <Badge variant={proxyBadgeVariant} size="sm">
 Proxy
 </Badge>
 )}
 {isFreebuff && connection.isActive !== false && (
 hasModelAffinityLock ? (
 <span className="inline-flex items-center gap-1.5 rounded-sm bg-warning/10 px-2 py-1 text-xs text-warning border border-warning/30">
 <Icon name="lock" size={18} />
 <span className="font-medium">Locked: {connection.lockedToModel}</span>
 {affinityMinutesRemaining !== null && (
 <span className="opacity-75 font-mono text-[11px]">({affinityMinutesRemaining}m)</span>
 )}
 {typeof onUnlockModel === "function" && (
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation();
 onUnlockModel();
 }}
 className="ml-0.5 inline-flex min-h-11 min-w-11 items-center justify-center hover:text-warning sm:min-h-0 sm:min-w-0"
 title="Release model lock"
 >
 <Icon name="lock_open" size={18} />
 </button>
 )}
 </span>
 ) : effectiveStatus === "active" ? (
 <Badge variant="success" size="sm">
 Unlocked
 </Badge>
 ) : null
 )}
 {isCooldown && connection.isActive !== false && (
 <div className="flex flex-wrap items-center gap-1.5">
 {activeLocks.map((lock) => (
 <span key={lock.model} className="inline-flex items-center gap-1 rounded-sm bg-warning/10 px-1.5 py-1 text-xs text-warning">
 <span className="font-medium">{lock.model === "__all" ? "all models" : lock.model}</span>
 <CooldownTimer until={lock.until} />
 </span>
 ))}
 </div>
 )}
 {connection.lastError && connection.isActive !== false && (
 <span className="max-w-full truncate text-xs text-danger sm:max-w-[300px]" title={connection.lastError}>
 {connection.lastError}
 </span>
 )}
 {connection.isActive === false && (connection.disabledReason || connection.lastError) && (
 <span
 className="max-w-full truncate text-xs text-warning sm:max-w-[340px]"
 title={`Reason: ${connection.disabledReason || connection.lastError}${connection.disabledAt ? ` (${new Date(connection.disabledAt).toLocaleString()})` : ""}`}
 >
 Reason: {connection.disabledReason || connection.lastError}
 </span>
 )}
 <span className="text-xs text-text-muted">#{connection.priority}</span>
 {connection.globalPriority && (
 <span className="text-xs text-text-muted">Auto: {connection.globalPriority}</span>
 )}
 {getOneByOneLabel() && (
 <Badge variant={getOneByOneVariant()} size="sm">
 {getOneByOneLabel()}
 </Badge>
 )}
 </div>
 {hasAnyProxy && (
 <div className="mt-1 flex items-center gap-2 flex-wrap">
 <span className="max-w-full truncate text-[11px] text-text-muted sm:max-w-[420px]" title={proxyDisplayText}>
 {proxyDisplayText}
 </span>
 {maskedProxyUrl && (
 <code className="max-w-full truncate rounded-sm bg-surface-2 px-1 py-1 font-mono text-[11px] text-text-muted sm:max-w-[260px]">
 {maskedProxyUrl}
 </code>
 )}
 {noProxyText && (
 <span className="max-w-full truncate text-[11px] text-text-muted sm:max-w-[320px]" title={noProxyText}>
 no_proxy: {noProxyText}
 </span>
 )}
 </div>
 )}
 {connection.providerSpecificData?.validationUrl && (
 <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-sm border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs text-warning">
 <span className="font-medium">⚠️ Action Required:</span>
 <span className="max-w-[300px] truncate" title={connection.providerSpecificData.validationMessage || "Verification required by Google"}>
 {connection.providerSpecificData.validationMessage || "Verification required by Google"}
 </span>
 <div className="inline-flex items-center gap-2">
 <a
 href={connection.providerSpecificData.validationUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex min-h-11 items-center gap-1 font-medium underline hover:text-warning sm:min-h-0"
 >
 Verify ↗
 </a>
 <button
 type="button"
 onClick={() => copy(connection.providerSpecificData.validationUrl, `val-${connection.id}`)}
 className="inline-flex min-h-11 items-center gap-0.5 rounded-sm px-1.5 text-[11px] font-medium text-warning hover:bg-warning/10 sm:min-h-0"
 title="Copy validation URL"
 >
 <Icon name={copied === `val-${connection.id}` ? "check" : "content_copy"} size={18} />
 <span>{copied === `val-${connection.id}` ? "Copied" : "Copy Link"}</span>
 </button>
 </div>
 </div>
 )}
 </div>
 </div>
 <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
 <div className="grid flex-1 grid-cols-3 gap-1 sm:flex sm:flex-none">
 {/* Proxy button with inline dropdown */}
 {(proxyPools || []).length > 0 && (
 <div className={`relative ${showProxyDropdown ? "z-50" : ""}`} ref={proxyDropdownRef}>
 <button
 onClick={() => setShowProxyDropdown((v) => !v)}
className={`flex min-h-11 w-full flex-col items-center rounded-sm px-2 hover:bg-surface-2 sm:min-h-0 sm:py-1 ${hasAnyProxy ? "text-primary" : "text-text-muted hover:text-primary"}`}
 disabled={updatingProxy}
 >
 <Icon name={updatingProxy ? "progress_activity" : "lan"} size={18} />
 <span className="text-[11px]">Proxy</span>
 </button>
 {showProxyDropdown && (
<div className="fixed left-1/2 top-full z-50 mt-1 w-[calc(100vw-1.5rem)] -translate-x-1/2 min-w-[280px] rounded-sm border border-border bg-bg sm:static sm:left-auto sm:right-0 sm:translate-x-0 sm:w-auto sm:max-w-[calc(100vw-2rem)]">
 {/* Group Selector */}
 <div className="border-b border-border p-3 bg-surface">
 <label className="block text-xs font-medium text-text-muted mb-1.5">Proxy Group</label>
 <select
 value={selectedGroup}
 onChange={(e) => {
 const grp = e.target.value;
 setSelectedGroup(grp);
 if (grp) {
 setSelectedProxyIds([]);
 if (rotationStrategy === "none") setRotationStrategy("round-robin");
 }
 }}
 className="w-full rounded-sm border border-border bg-bg px-2 py-2 min-h-11 text-sm text-text-main focus:border-primary focus:outline-none sm:min-h-9"
 >
 <option value="">None (Select individual proxies)</option>

 <optgroup label="Default Groups (Auto Round-Robin)">
 {defaultGroupsList.map((def) => {
 const count = (proxyPools || []).filter((p) => p.type === def.type && p.isActive).length;
 return (
 <option key={def.id} value={def.key}>
 {def.name} ({count} active pools)
 </option>
 );
 })}
 </optgroup>

 {customGroupsList.length > 0 && (
 <optgroup label="Custom Groups">
 {customGroupsList.map((cg) => {
 const stickyLabel = cg.isSticky ? `Sticky ${cg.stickyLimit || 3}x` : "Round Robin";
 return (
 <option key={cg.id} value={cg.name}>
 {cg.name} ({cg.poolIds?.length || 0} pools, {stickyLabel})
 </option>
 );
 })}
 </optgroup>
 )}

 {/* Legacy groups if any */}
 {(() => {
 const legacy = availableGroups.filter(
 (ag) => !customGroupsList.some((cg) => cg.name.toLowerCase() === ag.toLowerCase())
 );
 if (legacy.length === 0) return null;
 return (
 <optgroup label="Tagged Groups">
 {legacy.map((grp) => {
 const count = (proxyPools || []).filter(p => p.group && p.group.toLowerCase() === grp.toLowerCase()).length;
 return (
 <option key={grp} value={grp}>{grp} ({count} proxies)</option>
 );
 })}
 </optgroup>
 );
 })()}
 </select>
 {selectedGroup && (
 <p className="mt-1 text-[11px] text-primary">Dynamic: All active proxies in group &quot;{selectedGroup}&quot; will be routed automatically.</p>
 )}
 </div>

 {/* Rotation Strategy Selector */}
 <div className="border-b border-border p-3">
 <label className="block text-xs font-medium text-text-muted mb-2">Rotation Strategy</label>
 <select
 value={rotationStrategy}
 onChange={(e) => handleStrategyChange(e.target.value)}
 className="w-full rounded-sm border border-border bg-bg px-2 py-2 min-h-11 text-sm text-text-main focus:border-primary focus:outline-none sm:min-h-9"
 >
 <option value="none">None (Single Proxy)</option>
 <option value="random">Random</option>
 <option value="round-robin">Round Robin</option>
 <option value="failover">Failover</option>
 <option value="smart">Smart</option>
 </select>
 {rotationStrategy !== "none" && (
 <p className="mt-1 text-[11px] text-text-muted">
 {rotationStrategy === "random" && "Randomly select proxy on each request"}
 {rotationStrategy === "round-robin" && "Rotate proxies in order across requests"}
 {rotationStrategy === "failover" && "Try next proxy on failure"}
 {rotationStrategy === "smart" && "Skip pools whose egress IP is blocked for this provider/model (e.g. Freebuff limited-IP). See Proxy Fitness to clear/block."}
 </p>
 )}
 </div>

 {/* Proxy Pool Selection */}
 <div className="max-h-[200px] overflow-y-auto py-1">
 <button
 onClick={() => {
 setSelectedProxyIds([]);
 setSelectedGroup("");
 setRotationStrategy("none");
 }}
 className={`w-full text-left px-3 min-h-11 text-sm hover:bg-surface-2 sm:h-8 sm:min-h-0 ${selectedProxyIds.length === 0 && !selectedGroup ? "text-primary font-medium" : "text-text-main"}`}
 >
 <div className="flex items-center gap-2">
 <Icon name={selectedProxyIds.length === 0 && !selectedGroup ? "check_box" : "check_box_outline_blank"} size={18} />
 <span>None</span>
 </div>
 </button>

 {/* Select All Button (only for rotation strategies) */}
 {rotationStrategy !== "none" && (
 <button
 onClick={() => {
 setSelectedGroup("");
 const activePoolIds = (proxyPools || [])
 .filter(pool => pool.isActive === true)
 .map(pool => pool.id);
 const allSelected = activePoolIds.length > 0 && activePoolIds.every(id => selectedProxyIds.includes(id));
 
 if (allSelected) {
 setSelectedProxyIds([]);
 } else {
 setSelectedProxyIds(activePoolIds);
 }
 }}
 className={`w-full text-left px-3 min-h-11 text-sm border-b border-border hover:bg-surface-2 sm:h-8 sm:min-h-0 ${selectedProxyIds.length === (proxyPools || []).filter(p => p.isActive).length ? "bg-surface-2" : ""}`}
 >
 <div className="flex items-center gap-2">
 <Icon
 name={
 selectedProxyIds.length === (proxyPools || []).filter(p => p.isActive).length && selectedProxyIds.length > 0
 ? "check_box"
 : "check_box_outline_blank"
 }
 size={18}
 />
 <span className="font-medium">Select All Active</span>
 </div>
 </button>
 )}
 
 {(proxyPools || []).map((pool) => {
 const isSelected = selectedProxyIds.includes(pool.id);
 const isActive = pool.isActive === true;
 return (
 <button
 key={pool.id}
 onClick={() => {
 if (rotationStrategy === "none") {
 setSelectedProxyIds([pool.id]);
 } else {
 handleToggleProxySelection(pool.id);
 }
 }}
 className={`w-full text-left px-3 min-h-11 text-sm hover:bg-surface-2 sm:h-8 sm:min-h-0 ${isSelected ? "bg-surface-2" : ""}`}
 >
 <div className="flex items-center gap-2">
 <Icon
 name={
 rotationStrategy === "none"
 ? (isSelected ? "radio_button_checked" : "radio_button_unchecked")
 : (isSelected ? "check_box" : "check_box_outline_blank")
 }
 size={18}
 />
 <span className={isSelected ? "text-primary font-medium" : "text-text-main"}>{pool.name}</span>
 {!isActive && (
 <span className="ml-auto text-[11px] text-danger">(inactive)</span>
 )}
 </div>
 </button>
 );
 })}
 </div>

 {/* Apply Button */}
 <div className="border-t border-border p-3">
 <button
 onClick={handleApplyProxyChanges}
 disabled={updatingProxy}
 className="w-full rounded-sm bg-primary px-3 min-h-11 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed sm:h-8 sm:min-h-0"
 >
 {updatingProxy ? "Applying..." : "Apply"}
 </button>
 </div>
 </div>
 )}
 </div>
 )}
 {autoPing && (
 <Tooltip text={autoPingTooltip}>
 <button
 onClick={() => autoPing.onToggle(!autoPing.on)}
 className={`flex min-h-11 w-full flex-col items-center justify-center rounded-sm px-2 hover:bg-surface-2 sm:min-h-0 sm:py-1 ${autoPing.on ? "text-primary" : "text-text-muted hover:text-primary"}`}
 >
 <Icon name="bolt" size={18} />
 <span className="text-[11px]">Auto-ping</span>
 </button>
 </Tooltip>
 )}
 {onResetStatus && (isCooldown || ["exhausted", "unavailable"].includes(connection.testStatus) || connection.lastError || hasModelAffinityLock) && (
 <Tooltip text="Reset exhausted/cooldown status">
 <button
 onClick={async () => {
 setResettingStatus(true);
 try {
 await onResetStatus(connection.id);
 } finally {
 setResettingStatus(false);
 }
 }}
 disabled={resettingStatus}
 className="flex flex-col items-center rounded-sm px-2 py-1 text-warning hover:bg-warning/10"
 >
 <Icon name="restart_alt" size={18} className={`${resettingStatus ? "animate-spin" : ""}`} />
 <span className="text-[11px]">Reset</span>
 </button>
 </Tooltip>
 )}
 <button onClick={onEdit} className="flex flex-col items-center rounded-sm px-2 py-1 text-text-muted hover:bg-surface-2 hover:text-primary">
 <Icon name="edit" size={18} />
 <span className="text-[11px]">Edit</span>
 </button>
 <button onClick={onDelete} className="flex flex-col items-center rounded-sm px-2 py-1 text-danger hover:bg-danger/10">
 <Icon name="delete" size={18} />
 <span className="text-[11px]">Delete</span>
 </button>
 </div>
 <Toggle
 size="sm"
 checked={connection.isActive ?? true}
 onChange={onToggleActive}
 title={(connection.isActive ?? true) ? "Disable connection" : "Enable connection"}
 />
 </div>
 </div>
 );
}

ConnectionRow.propTypes = {
 connection: PropTypes.shape({
 id: PropTypes.string,
 name: PropTypes.string,
 email: PropTypes.string,
 displayName: PropTypes.string,
 modelLockUntil: PropTypes.string,
 testStatus: PropTypes.string,
 isActive: PropTypes.bool,
 lastError: PropTypes.string,
 priority: PropTypes.number,
 globalPriority: PropTypes.number,
 }).isRequired,
 proxyPools: PropTypes.arrayOf(PropTypes.shape({
 id: PropTypes.string,
 name: PropTypes.string,
 proxyUrl: PropTypes.string,
 noProxy: PropTypes.string,
 isActive: PropTypes.bool,
 })),
 isOAuth: PropTypes.bool.isRequired,
 isFirst: PropTypes.bool.isRequired,
 isLast: PropTypes.bool.isRequired,
 onMoveUp: PropTypes.func.isRequired,
 onMoveDown: PropTypes.func.isRequired,
 onToggleActive: PropTypes.func.isRequired,
 onUpdateProxy: PropTypes.func,
 onEdit: PropTypes.func.isRequired,
 onDelete: PropTypes.func.isRequired,
 onUnlockModel: PropTypes.func,
 proxyGroups: PropTypes.object,
 oneByOneStatus: PropTypes.shape({
 state: PropTypes.string,
 error: PropTypes.string,
 }),
 autoPing: PropTypes.shape({
 on: PropTypes.bool,
 onToggle: PropTypes.func,
 provider: PropTypes.string,
 }),
};
