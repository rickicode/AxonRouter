"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getConnectionCooldownUntil, getDisplayPlanType } from "@/lib/connectionStatus";
import { getConnectionRoutingOrderLock, isConnectionRoutingOrderLockActive } from "@/lib/connectionUsageRank";
import { getConnectionStatusPresentation } from "../statusDisplay";
import CooldownTimer from "./CooldownTimer";
import { rowHoverClass, subtleCodeClass } from "../designSystem";

export default function ConnectionRow({
  connection,
  proxyPools,
  isOAuth,
  isActiveAccount,
  onSetActive,
  isSwitchingActive,
  providerDefaultProxyPoolId,
  onToggleActive,
  onUpdateProxy,
  onEdit,
  onDelete
}) {
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);
  const [updatingProxy, setUpdatingProxy] = useState(false);
  const proxyDropdownRef = useRef(null);
  const proxyPoolMap = new Map((proxyPools || []).map((pool: any) => [pool.id, pool]));
  const connectionProxyPoolId = connection.providerSpecificData?.proxyPoolId || null;
  const inheritedProxyPoolId = !connectionProxyPoolId ? (providerDefaultProxyPoolId || null) : null;
  const effectiveProxyPoolId = connectionProxyPoolId || inheritedProxyPoolId;
  const boundProxyPool: any = effectiveProxyPoolId ? proxyPoolMap.get(effectiveProxyPoolId) : null;
  const hasLegacyProxy = connection.providerSpecificData?.connectionProxyEnabled === true && !!connection.providerSpecificData?.connectionProxyUrl;
  const hasAnyProxy = !!effectiveProxyPoolId || hasLegacyProxy;
  const proxyDisplayText = boundProxyPool
    ? `Pool: ${boundProxyPool.name}${inheritedProxyPoolId ? " (provider default)" : ""}`
    : effectiveProxyPoolId
      ? `Pool: ${effectiveProxyPoolId} (inactive/missing)`
      : hasLegacyProxy
        ? `Legacy: ${connection.providerSpecificData?.connectionProxyUrl}`
        : "";

  let maskedProxyUrl = "";
  if (boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl) {
    const rawProxyUrl = boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl;
    try {
      const parsed = new URL(rawProxyUrl);
      maskedProxyUrl = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
    } catch {
      maskedProxyUrl = rawProxyUrl;
    }
  }

  const noProxyText = boundProxyPool?.noProxy || connection.providerSpecificData?.connectionNoProxy || "";
  const proxyBadgeVariant = boundProxyPool?.isActive === true ? "default" : effectiveProxyPoolId || hasLegacyProxy ? "destructive" : "secondary";

  useEffect(() => {
    if (!showProxyDropdown) return;
    const handler = (e) => {
      if (proxyDropdownRef.current && !proxyDropdownRef.current.contains(e.target)) setShowProxyDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProxyDropdown]);

  const handleSelectProxy = async (poolId) => {
    setUpdatingProxy(true);
    try {
      await onUpdateProxy(poolId === "__none__" ? null : poolId);
    } finally {
      setUpdatingProxy(false);
      setShowProxyDropdown(false);
    }
  };

  const displayName = isOAuth
    ? connection.name || connection.email || connection.displayName || "OAuth Account"
    : connection.maskedApiKey
      ? connection.maskedApiKey
      : connection.name;
  const connectionPlanType = getDisplayPlanType(connection);
  const { statusDetails, badge: statusBadge, reasonLabel: statusReasonLabel } = getConnectionStatusPresentation(connection);
  const modelLockUntil = statusDetails.activeModelLocks.length > 0 ? statusDetails.activeModelLocks.map((lock) => lock.until).sort()[0] : getConnectionCooldownUntil(connection);
  const [isCooldown, setIsCooldown] = useState(false);
  const routingOrderLock = getConnectionRoutingOrderLock(connection);
  const routingOrderLockActive = isConnectionRoutingOrderLockActive(connection);

  useEffect(() => {
    const checkCooldown = () => setIsCooldown(Boolean(modelLockUntil && new Date(modelLockUntil).getTime() > Date.now()));
    checkCooldown();
    const interval = modelLockUntil ? setInterval(checkCooldown, 1000) : null;
    return () => { if (interval) clearInterval(interval); };
  }, [modelLockUntil]);

  const isSwitchableProvider = connection.provider === "codex" || connection.provider === "antigravity";

  return (
    <div className={`group flex items-center justify-between rounded p-2 transition-colors ${rowHoverClass} ${connection.isActive === false ? "opacity-60" : ""} ${isActiveAccount ? "ring-1 ring-emerald-500/30 bg-emerald-500/3" : ""}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <AppIcon name={isOAuth ? "lock" : "key"} size={16} className="text-text-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="truncate text-sm font-medium">{displayName}</p>
            {isActiveAccount && (
              <Badge variant="default" className="h-4 rounded border border-emerald-500/40 bg-emerald-500/12 text-emerald-400 text-[8px] px-1 py-0 leading-none">
                Active
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={statusBadge.variant === "error" ? "destructive" : statusBadge.variant === "default" ? "secondary" : "default"} className="text-xs"><span className="size-1.5 rounded-full bg-current" />{statusBadge.label}</Badge>
            <span className="text-[11px] text-text-muted capitalize">{statusReasonLabel}</span>
            {connectionPlanType && <Badge variant="secondary">{connectionPlanType}</Badge>}
            {hasAnyProxy && <Badge variant={proxyBadgeVariant}>Proxy</Badge>}
            {connectionProxyPoolId && <Badge variant="secondary">Override</Badge>}
            {inheritedProxyPoolId && <Badge variant="secondary">Inherited</Badge>}
            {routingOrderLock.locked && routingOrderLock.order !== null && (
              <Badge variant={routingOrderLockActive ? "default" : "secondary"}>Locked #{routingOrderLock.order}</Badge>
            )}
            {isCooldown && connection.isActive !== false && <CooldownTimer until={modelLockUntil} />}
            {connection.reasonDetail && connection.isActive !== false && <span className="max-w-[300px] truncate text-xs text-destructive" title={connection.reasonDetail}>{connection.reasonDetail}</span>}
            <span className="text-xs text-text-muted">#{connection.priority}</span>
            {connection.globalPriority && <span className="text-xs text-text-muted">Auto: {connection.globalPriority}</span>}
          </div>
          {hasAnyProxy && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="max-w-[420px] truncate text-[11px] text-text-muted" title={proxyDisplayText}>{proxyDisplayText}</span>
              {maskedProxyUrl && <code className={subtleCodeClass}>{maskedProxyUrl}</code>}
              {noProxyText && <span className="max-w-[320px] truncate text-[11px] text-text-muted" title={noProxyText}>no_proxy: {noProxyText}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {isSwitchableProvider && !isActiveAccount && onSetActive && (
            <Button
              onClick={onSetActive}
              disabled={isSwitchingActive || connection.isActive === false}
              variant="ghost"
              size="sm"
              className="flex h-auto flex-col rounded-xl px-2 py-1 text-[10px] text-emerald-500 hover:text-emerald-400"
            >
              <AppIcon name="stars" />
              {isSwitchingActive ? "Activating..." : "Set Active"}
            </Button>
          )}
          {(hasAnyProxy || (proxyPools || []).length > 0) && (
            <div className="relative" ref={proxyDropdownRef}>
              <Button onClick={() => setShowProxyDropdown((v) => !v)} variant="ghost" size="sm" className={`flex h-auto flex-col rounded-xl px-2 py-1 text-[10px] ${hasAnyProxy ? "text-primary" : "text-text-muted hover:text-primary"}`} disabled={updatingProxy}>
                <AppIcon name={updatingProxy ? "progress_activity" : "lan"} />Proxy
              </Button>
              {showProxyDropdown && (
                <div className="absolute right-0 top-full z-[70] mt-1 min-w-[160px] rounded border border-border bg-popover py-1 shadow-lg">
                  <Button variant="ghost" className={`h-auto w-full justify-start rounded-none px-3 py-1.5 text-sm ${!connectionProxyPoolId ? "text-primary font-medium" : "text-foreground"}`} onClick={() => handleSelectProxy("__none__")}>{providerDefaultProxyPoolId ? "Use provider default" : "No proxy / clear override"}</Button>
                  {(proxyPools || []).map((pool) => <Button key={pool.id} variant="ghost" className={`h-auto w-full justify-start rounded-none px-3 py-1.5 text-sm ${connectionProxyPoolId === pool.id ? "text-primary font-medium" : "text-foreground"}`} onClick={() => handleSelectProxy(pool.id)}>{pool.name}</Button>)}
                </div>
              )}
            </div>
          )}
          <Button onClick={onEdit} variant="ghost" size="sm" className="flex h-auto flex-col rounded-xl px-2 py-1 text-[10px] text-text-muted hover:text-primary"><AppIcon name="edit" />Edit</Button>
          <Button onClick={onDelete} variant="ghost" size="sm" className="flex h-auto flex-col rounded-xl px-2 py-1 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"><AppIcon name="delete" />Delete</Button>
        </div>
        <Switch checked={connection.isActive ?? true} onToggle={onToggleActive} title={(connection.isActive ?? true) ? "Disable connection" : "Enable connection"} />
      </div>
    </div>
  );
}

ConnectionRow.propTypes = {
  connection: PropTypes.shape({ id: PropTypes.string, name: PropTypes.string, email: PropTypes.string, displayName: PropTypes.string, modelLockUntil: PropTypes.string, isActive: PropTypes.bool, priority: PropTypes.number, globalPriority: PropTypes.number, provider: PropTypes.string }).isRequired,
  proxyPools: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, name: PropTypes.string, proxyUrl: PropTypes.string, noProxy: PropTypes.string, isActive: PropTypes.bool })),
  providerDefaultProxyPoolId: PropTypes.string,
  isOAuth: PropTypes.bool.isRequired,
  isActiveAccount: PropTypes.bool,
  onSetActive: PropTypes.func,
  isSwitchingActive: PropTypes.bool,
  onToggleActive: PropTypes.func.isRequired,
  onUpdateProxy: PropTypes.func,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
