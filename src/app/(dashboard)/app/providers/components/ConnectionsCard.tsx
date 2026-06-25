"use client";

import AppIcon from "@/shared/components/AppIcon";
import { PlusIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import PropTypes from "prop-types";
import { EditConnectionModal } from "@/shared/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { getConnectionEffectiveStatus } from "@/lib/connectionStatus";
import { fetchJson, queryKeys } from "@/shared/query";
import { translate } from "@/i18n/runtime";

type ProviderConnection = {
  id: string;
  provider?: string;
  priority?: number;
  isActive?: boolean;
  lastError?: string;
  name?: string;
  email?: string;
  displayName?: string;
  providerSpecificData?: Record<string, any>;
  [key: string]: any;
};

type ProvidersQueryData = {
  connections: ProviderConnection[];
};

type ProxyPool = {
  id: string;
  name?: string;
  proxyUrl?: string;
  noProxy?: string;
  isActive?: boolean;
};

type ProxyPoolsQueryData = {
  proxyPools: ProxyPool[];
};

type ProviderStrategyOverride = {
  strategy?: string | null;
  fallbackStrategy?: string | null;
  stickyLimit?: number;
  stickyRoundRobinLimit?: number;
};

type SettingsQueryData = {
  routing?: {
    providerStrategies?: Record<string, ProviderStrategyOverride>;
  };
  providerStrategies?: Record<string, ProviderStrategyOverride>;
};

// ── CooldownTimer ──────────────────────────────────────────────
function CooldownTimer({ until }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(until).getTime() - Date.now();
      if (diff <= 0) { setRemaining(""); return; }
      const s = Math.floor(diff / 1000);
      if (s < 60) setRemaining(`${s}s`);
      else if (s < 3600) setRemaining(`${Math.floor(s / 60)}m ${s % 60}s`);
      else setRemaining(`${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [until]);

  if (!remaining) return null;
  return <span className="text-xs text-orange-500 font-mono">⏱ {remaining}</span>;
}

CooldownTimer.propTypes = { until: PropTypes.string.isRequired };

// ── ConnectionRow ──────────────────────────────────────────────
function ConnectionRow({ connection, proxyPools, isOAuth, onToggleActive, onUpdateProxy, onEdit, onDelete }) {
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);
  const [updatingProxy, setUpdatingProxy] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);
  const proxyDropdownRef = useRef(null);

  const proxyPoolMap = new Map((proxyPools || []).map((p: any) => [p.id, p]));
  const boundProxyPoolId = connection.providerSpecificData?.proxyPoolId || null;
  const boundProxyPool: any = boundProxyPoolId ? proxyPoolMap.get(boundProxyPoolId) : null;
  const proxyTypeLabel = boundProxyPool?.type === "relay" ? translate("Relay") : translate("Proxy");
  const hasLegacyProxy = connection.providerSpecificData?.connectionProxyEnabled === true && !!connection.providerSpecificData?.connectionProxyUrl;
  const hasAnyProxy = !!boundProxyPoolId || hasLegacyProxy;

  const proxyDisplayText = boundProxyPool
    ? `${translate("Pool:")} ${boundProxyPool.name}`
    : boundProxyPoolId ? `${translate("Pool:")} ${boundProxyPoolId} ${translate("(inactive/missing)")}`
    : hasLegacyProxy ? `${translate("Legacy:")} ${connection.providerSpecificData?.connectionProxyUrl}` : "";

  let maskedProxyUrl = "";
  const rawProxyUrl = boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl;
  if (rawProxyUrl) {
    try {
      const p = new URL(rawProxyUrl);
      maskedProxyUrl = `${p.protocol}//${p.hostname}${p.port ? `:${p.port}` : ""}`;
    } catch { maskedProxyUrl = rawProxyUrl; }
  }

  const noProxyText = boundProxyPool?.noProxy || connection.providerSpecificData?.connectionNoProxy || "";
  const proxyBadgeVariant = boundProxyPool?.isActive === true ? "default" : (boundProxyPoolId || hasLegacyProxy) ? "destructive" : "secondary";

  const modelLockUntil = Object.entries(connection)
    .filter(([k]) => k.startsWith("modelLock_"))
    .map(([, v]) => v).filter(Boolean).sort()[0] || null;

  useEffect(() => {
    const check = () => {
      const until = Object.entries(connection)
        .filter(([k]) => k.startsWith("modelLock_"))
        .map(([, v]) => v).filter(v => v && new Date(v as any).getTime() > Date.now()).sort()[0] || null;
      setIsCooldown(!!until);
    };
    check();
    const t = modelLockUntil ? setInterval(check, 1000) : null;
    return () => { if (t) clearInterval(t); };
  }, [connection, modelLockUntil]);

  useEffect(() => {
    if (!showProxyDropdown) return;
    const handler = (e) => {
      if (proxyDropdownRef.current && !proxyDropdownRef.current.contains(e.target))
        setShowProxyDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProxyDropdown]);

  const effectiveStatus = getConnectionEffectiveStatus(connection);

  const getStatusVariant = () => {
    if (connection.isActive === false) return "secondary";
    if (effectiveStatus === "active" || effectiveStatus === "success") return "default";
    if (effectiveStatus === "error" || effectiveStatus === "expired" || effectiveStatus === "unavailable") return "destructive";
    return "secondary";
  };

  const getStatusLabel = () => {
    if (connection.isActive === false) return translate("disabled");
    if (effectiveStatus === "active" || effectiveStatus === "success") return translate("online");
    if (effectiveStatus === "error" || effectiveStatus === "expired" || effectiveStatus === "unavailable") return translate("offline");
    return translate("unknown");
  };

  const displayName = isOAuth
    ? connection.name || connection.email || connection.displayName || "OAuth Account"
    : connection.name;

  const handleSelectProxy = async (poolId) => {
    setUpdatingProxy(true);
    try { await onUpdateProxy(poolId === "__none__" ? null : poolId); }
    finally { setUpdatingProxy(false); setShowProxyDropdown(false); }
  };

  return (
    <div className={`group flex items-center justify-between p2 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors ${connection.isActive === false ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <AppIcon name={isOAuth ? "lock" : "key"} size={16} className="text-text-muted" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{displayName}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={getStatusVariant()}>
              <span className="size-1.5 rounded-full bg-current" />
              {getStatusLabel()}
            </Badge>
            {hasAnyProxy && <Badge variant={proxyBadgeVariant}>{proxyTypeLabel}</Badge>}
            {isCooldown && connection.isActive !== false && <CooldownTimer until={modelLockUntil} />}
            {connection.lastError && connection.isActive !== false && (
              <span className="text-xs text-red-500 truncate max-w-[300px]" title={connection.lastError}>{connection.lastError}</span>
            )}
            <span className="text-xs text-text-muted">{translate("Priority")} #{connection.priority}</span>
          </div>
          {hasAnyProxy && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-text-muted truncate max-w-[420px]" title={proxyDisplayText}>{proxyDisplayText}</span>
              {maskedProxyUrl && <code className="text-[10px] font-mono bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded text-text-muted">{maskedProxyUrl}</code>}
              {noProxyText && <span className="text-[11px] text-text-muted truncate max-w-[320px]" title={noProxyText}>{translate("no_proxy:")} {noProxyText}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {(proxyPools || []).length > 0 && (
            <div className="relative" ref={proxyDropdownRef}>
              <button
                onClick={() => setShowProxyDropdown((v) => !v)}
                className={`flex flex-col items-center px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer ${hasAnyProxy ? "text-primary" : "text-text-muted hover:text-primary"}`}
                disabled={updatingProxy}
              >
                <AppIcon name={updatingProxy ? "progress_activity" : "lan"} size={18} />
                <span className="text-[10px] leading-tight">{translate("Proxy")}</span>
              </button>
              {showProxyDropdown && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-bg border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
                  <button onClick={() => handleSelectProxy("__none__")} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer ${!boundProxyPoolId ? "text-primary font-medium" : "text-text-main"}`}>{translate("None")}</button>
                  {(proxyPools || []).map((pool) => (
                    <button key={pool.id} onClick={() => handleSelectProxy(pool.id)} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer ${boundProxyPoolId === pool.id ? "text-primary font-medium" : "text-text-main"}`}>{pool.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={onEdit} className="flex flex-col items-center px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-text-muted hover:text-primary cursor-pointer">
            <AppIcon name="edit" size={18} />
            <span className="text-[10px] leading-tight">{translate("Edit")}</span>
          </button>
          <button onClick={onDelete} className="flex flex-col items-center px-2 py-1 rounded hover:bg-red-500/10 text-red-500 cursor-pointer">
            <AppIcon name="delete" size={18} />
            <span className="text-[10px] leading-tight">{translate("Delete")}</span>
          </button>
        </div>
        <Switch size="sm" checked={connection.isActive ?? true} onToggle={onToggleActive} title={(connection.isActive ?? true) ? translate("Disable") : translate("Enable")} />
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
    testStatus: PropTypes.string,
    isActive: PropTypes.bool,
    lastError: PropTypes.string,
    priority: PropTypes.number,
  }).isRequired,
  proxyPools: PropTypes.array,
  isOAuth: PropTypes.bool.isRequired,
  onToggleActive: PropTypes.func.isRequired,
  onUpdateProxy: PropTypes.func,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

// ── AddApiKeyModal ─────────────────────────────────────────────
function AddApiKeyModal({ isOpen, provider, providerName, proxyPools, onSave, onClose }) {
  const NONE = "__none__";
  const [formData, setFormData] = useState({ name: "", apiKey: "", priority: 1, proxyPoolId: NONE });
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: formData.apiKey }),
      });
      const data = await res.json();
      setValidationResult(data.valid ? "success" : "failed");
    } catch { setValidationResult("failed"); }
    finally { setValidating(false); }
  };

  const handleSubmit = async () => {
    if (!provider || !formData.apiKey) return;
    setSaving(true);
    try {
      let isValid = false;
      try {
        setValidating(true); setValidationResult(null);
        const res = await fetch("/api/providers/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey: formData.apiKey }),
        });
        const data = await res.json();
        isValid = !!data.valid;
        setValidationResult(isValid ? "success" : "failed");
      } catch { setValidationResult("failed"); }
      finally { setValidating(false); }
      await onSave({
        name: formData.name,
        apiKey: formData.apiKey,
        priority: formData.priority,
        proxyPoolId: formData.proxyPoolId === NONE ? null : formData.proxyPoolId,
        testStatus: isValid ? "online" : "unknown",
      });
    } finally { setSaving(false); }
  };

  if (!provider) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate(`Add ${providerName || provider} API Key`)}</DialogTitle>
          <DialogDescription>{translate("Add an API key connection and optionally bind it to a proxy pool.")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="connection-name">{translate("Name")}</FieldLabel>
            <Input id="connection-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={translate("Production Key")} />
          </Field>
          <Field data-invalid={!formData.apiKey && validationResult === "failed"}>
            <FieldLabel htmlFor="connection-api-key">{translate("API Key")}</FieldLabel>
            <div className="flex gap-2">
              <Input id="connection-api-key" type="password" value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} />
              <Button onClick={handleValidate} disabled={!formData.apiKey || validating || saving} variant="secondary">
                {validating ? <Spinner className="size-4" /> : null}
                {validating ? translate("Checking...") : translate("Check")}
              </Button>
            </div>
            <FieldError>{validationResult === "failed" ? translate("Invalid API key") : null}</FieldError>
          </Field>
          {validationResult && (
            <Badge variant={validationResult === "success" ? "default" : "destructive"}>
              {validationResult === "success" ? translate("Valid") : translate("Invalid")}
            </Badge>
          )}
          <Field>
            <FieldLabel htmlFor="connection-priority">{translate("Priority")}</FieldLabel>
            <Input id="connection-priority" type="number" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value) || 1 })} />
          </Field>
          <Field>
            <FieldLabel>{translate("Proxy Pool")}</FieldLabel>
            <Select value={formData.proxyPoolId} onValueChange={(value) => setFormData({ ...formData, proxyPoolId: value })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={translate("None")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{translate("None")}</SelectItem>
                {(proxyPools || []).map((pool) => (
                  <SelectItem key={pool.id} value={pool.id}>{pool.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">{translate("Cancel")}</Button>
          <Button onClick={handleSubmit} disabled={!provider || !formData.apiKey || saving}>
            {saving ? <Spinner className="size-4" /> : null}
            {saving ? translate("Saving...") : translate("Add Key")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

AddApiKeyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  provider: PropTypes.string,
  providerName: PropTypes.string,
  proxyPools: PropTypes.array,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

// ── ConnectionsCard ────────────────────────────────────────────
// Self-contained card: fetches, displays and manages all connections for a provider.
export default function ConnectionsCard({ providerId, isOAuth }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const queryClient = useQueryClient();
  const providersQuery = useQuery({
    queryKey: queryKeys.providers(),
    queryFn: ({ signal }) => fetchJson<ProvidersQueryData>("/api/providers", { signal }),
    initialData: { connections: [] },
  });
  const proxyPoolsQuery = useQuery({
    queryKey: queryKeys.proxyPools({ active: true }),
    queryFn: ({ signal }) => fetchJson<ProxyPoolsQueryData>("/api/proxy-pools?isActive=true", { signal }),
    initialData: { proxyPools: [] },
  });
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: ({ signal }) => fetchJson<SettingsQueryData>("/api/settings", { signal }),
    initialData: {},
  });
  const connections = (providersQuery.data?.connections || []).filter((c) => c.provider === providerId);
  const proxyPools = proxyPoolsQuery.data?.proxyPools || [];
  const loading = providersQuery.isPending && connections.length === 0;

  const override = (settingsQuery.data?.routing?.providerStrategies || settingsQuery.data?.providerStrategies || {})[providerId] || {};
  const providerStrategy = override.strategy || override.fallbackStrategy || null;
  const providerStickyLimit = override.stickyLimit != null ? String(override.stickyLimit) : (override.stickyRoundRobinLimit != null ? String(override.stickyRoundRobinLimit) : "1");

  const invalidateProvidersAfterWrite = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.providers() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.proxyPools({ active: true }) }),
    ]);
  };

  const patchProviderConnections = (updater: (connections: ProviderConnection[]) => ProviderConnection[]) => {
    queryClient.setQueryData<ProvidersQueryData>(queryKeys.providers(), (current) => ({
      ...(current || { connections: [] }),
      connections: updater(current?.connections || []),
    }));
  };

  const providerConnectionsSnapshot = () => providersQuery.data?.connections || [];

  const saveStrategyMutation = useMutation({
    retry: false,
    mutationFn: async ({ strategy, stickyLimit }: { strategy: string | null; stickyLimit: string }) => {
      const data = settingsQuery.data || {};
      const current = data.routing?.providerStrategies || data.providerStrategies || {};
      const override: any = {};
      if (strategy) override.strategy = strategy;
      if (strategy === "round-robin" && stickyLimit !== "") override.stickyLimit = Number(stickyLimit) || 1;
      const updated = { ...current };
      if (Object.keys(override).length === 0) delete updated[providerId];
      else updated[providerId] = override;

      const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ routing: { providerStrategies: updated } }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save provider strategy");
      }
      return payload as Partial<SettingsQueryData>;
    },
    onSuccess: (payload) => {
      queryClient.setQueryData<SettingsQueryData>(queryKeys.settings(), (currentSettings) => ({
        ...(currentSettings || {}),
        ...payload,
      }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings() });
    },
    onError: (e) => { console.log("saveStrategy error:", e); },
  });

  const deleteConnectionMutation = useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete connection");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.providers() });
      const previousConnections = providerConnectionsSnapshot();
      patchProviderConnections((allConnections) => allConnections.filter((c) => c.id !== id));
      return { previousConnections };
    },
    onError: (e, _id, context) => {
      console.log("delete error:", e);
      if (context?.previousConnections) {
        queryClient.setQueryData<ProvidersQueryData>(queryKeys.providers(), { connections: context.previousConnections });
      }
    },
    onSettled: () => { void invalidateProvidersAfterWrite(); },
  });

  const toggleActiveMutation = useMutation({
    retry: false,
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/providers/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }) });
      if (!res.ok) throw new Error("Failed to update connection state");
    },
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.providers() });
      const previousConnections = providerConnectionsSnapshot();
      patchProviderConnections((allConnections) => allConnections.map((c) => c.id === id ? { ...c, isActive } : c));
      return { previousConnections };
    },
    onError: (e, _variables, context) => {
      console.log("toggle error:", e);
      if (context?.previousConnections) {
        queryClient.setQueryData<ProvidersQueryData>(queryKeys.providers(), { connections: context.previousConnections });
      }
    },
    onSettled: () => { void invalidateProvidersAfterWrite(); },
  });

  const updateProxyMutation = useMutation({
    retry: false,
    mutationFn: async ({ connId, proxyPoolId }: { connId: string; proxyPoolId: string | null }) => {
      const res = await fetch(`/api/providers/${connId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proxyPoolId: proxyPoolId || null }) });
      if (!res.ok) throw new Error("Failed to update proxy binding");
    },
    onMutate: async ({ connId, proxyPoolId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.providers() });
      const previousConnections = providerConnectionsSnapshot();
      patchProviderConnections((allConnections) => allConnections.map((c) => c.id === connId ? { ...c, providerSpecificData: { ...c.providerSpecificData, proxyPoolId: proxyPoolId || null } } : c));
      return { previousConnections };
    },
    onError: (e, _variables, context) => {
      console.log("proxy error:", e);
      if (context?.previousConnections) {
        queryClient.setQueryData<ProvidersQueryData>(queryKeys.providers(), { connections: context.previousConnections });
      }
    },
    onSettled: () => { void invalidateProvidersAfterWrite(); },
  });

  const saveApiKeyMutation = useMutation({
    retry: false,
    mutationFn: async (formData: any) => {
      const res = await fetch("/api/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: providerId, ...formData }) });
      if (!res.ok) throw new Error("Failed to save API key");
    },
    onSuccess: async () => {
      await invalidateProvidersAfterWrite();
      setShowAddModal(false);
    },
    onError: (e) => { console.log("save apikey error:", e); },
  });

  const updateConnectionMutation = useMutation({
    retry: false,
    mutationFn: async (formData: any) => {
      const res = await fetch(`/api/providers/${selectedConnection.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update connection");
      }
    },
    onSuccess: async () => {
      await invalidateProvidersAfterWrite();
      setShowEditModal(false);
    },
    onError: (e) => { alert(e?.message || "Failed to update connection"); },
  });

  const saveStrategy = (strategy, stickyLimit) => {
    saveStrategyMutation.mutate({ strategy, stickyLimit });
  };

  const handleDelete = (id) => {
    if (!confirm("Delete this connection?")) return;
    deleteConnectionMutation.mutate(id);
  };

  const handleToggleActive = (id, isActive) => {
    toggleActiveMutation.mutate({ id, isActive });
  };

  const handleUpdateProxy = (connId, proxyPoolId) => {
    updateProxyMutation.mutate({ connId, proxyPoolId });
  };

  const handleSaveApiKey = (formData) => {
    saveApiKeyMutation.mutate(formData);
  };

  const handleUpdateConnection = (formData) => {
    updateConnectionMutation.mutate(formData);
  };

  if (loading) return <Card><CardContent><Skeleton className="h-20 rounded-[4px]" /></CardContent></Card>;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{translate("Connections")}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{translate("Round Robin")}</span>
            <Switch
              checked={providerStrategy === "round-robin"}
              onToggle={(enabled) => {
                const strategy = enabled ? "round-robin" : null;
                saveStrategy(strategy, enabled ? (providerStickyLimit || "1") : providerStickyLimit);
              }}
            />
            {providerStrategy === "round-robin" && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{translate("Sticky:")}</span>
                <Input
                  type="number" min={1} value={providerStickyLimit}
                  onChange={(e) => { saveStrategy("round-robin", e.target.value); }}
                  className="h-8 w-14 px-2 py-1 text-xs"
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <Empty className="border-border bg-card/60">
              <EmptyMedia variant="icon"><AppIcon name="key" size={22} /></EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{translate("No connections yet")}</EmptyTitle>
                <EmptyDescription>{translate("Add a provider connection to start routing requests.")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col divide-y divide-black/[0.03] dark:divide-white/[0.03]">
              {connections.map((conn, idx) => (
                <ConnectionRow
                  key={conn.id}
                  connection={conn}
                  proxyPools={proxyPools}
                  isOAuth={isOAuth}
                  onToggleActive={(isActive) => handleToggleActive(conn.id, isActive)}
                  onUpdateProxy={(poolId) => handleUpdateProxy(conn.id, poolId)}
                  onEdit={() => { setSelectedConnection(conn); setShowEditModal(true); }}
                  onDelete={() => handleDelete(conn.id)}
                />
              ))}
            </div>
          )}
          <div className="mt-4">
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <PlusIcon data-icon className="size-4" />
              {translate("Add Connection")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AddApiKeyModal
        isOpen={showAddModal}
        provider={providerId}
        providerName={providerId}
        proxyPools={proxyPools}
        onSave={handleSaveApiKey}
        onClose={() => setShowAddModal(false)}
      />
      <EditConnectionModal
        isOpen={showEditModal}
        connection={selectedConnection}
        connections={connections}
        onSave={handleUpdateConnection}
        onClose={() => setShowEditModal(false)}
      />
    </>
  );
}

ConnectionsCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  isOAuth: PropTypes.bool,
};
