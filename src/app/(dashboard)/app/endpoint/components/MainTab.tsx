"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { fetchJson, queryKeys } from "@/shared/query";
import { translate } from "@/i18n/runtime";
import GlassCard from "./shared/GlassCard";
import StatusBadge from "./shared/StatusBadge";
import ToggleRow from "./shared/ToggleRow";
import SectionHeader from "./shared/SectionHeader";
import { DEFAULT_AXONROUTER_API_BASE_URL } from "@/shared/constants/runtimeDefaults";

const KEYS_PER_PAGE = 10;

type ApiKeyItem = {
  id: string;
  name: string;
  key: string;
};

type KeysQueryData = {
  keys: ApiKeyItem[];
};

type EndpointMainSettingsData = {
  settings: {
    requireApiKey?: boolean;
    hasPassword?: boolean;
    tunnelDashboardAccess?: boolean;
  };
  tunnelStatus: {
    tunnel?: { enabled?: boolean; publicUrl?: string; tunnelUrl?: string };
    tailscale?: { enabled?: boolean; tunnelUrl?: string };
  };
};

export default function MainTab({ machineId }: { machineId: string }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [visibleKeys, setVisibleKeys] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [remoteAccessError, setRemoteAccessError] = useState("");
  const [remoteAccessInfo, setRemoteAccessInfo] = useState("");

  const { copied, copy } = useCopyToClipboard();
  const queryClient = useQueryClient();

  const keysQuery = useQuery({
    queryKey: queryKeys.keys(),
    queryFn: ({ signal }) => fetchJson<KeysQueryData>("/api/keys", { signal }),
    initialData: { keys: [] },
  });
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: ({ signal }) => fetchJson<Record<string, unknown>>("/api/settings", { signal }),
  });
  const endpointSettingsQuery = useQuery({
    queryKey: queryKeys.endpointMainSettings(),
    queryFn: async ({ signal }) => {
      const [settings, tunnelStatus] = await Promise.all([
        fetchJson<EndpointMainSettingsData["settings"]>("/api/settings", { signal }),
        fetchJson<EndpointMainSettingsData["tunnelStatus"]>("/api/tunnel/status", { signal }),
      ]);
      return { settings, tunnelStatus };
    },
    initialData: {
      settings: {
        requireApiKey: false,
        hasPassword: true,
        tunnelDashboardAccess: true,
      },
      tunnelStatus: {
        tunnel: { enabled: false, publicUrl: "", tunnelUrl: "" },
        tailscale: { enabled: false, tunnelUrl: "" },
      },
    },
  });

  const endpointData = (endpointSettingsQuery.data || {
    settings: {
      requireApiKey: false,
      hasPassword: true,
      tunnelDashboardAccess: true,
    },
    tunnelStatus: {
      tunnel: { enabled: false, publicUrl: "", tunnelUrl: "" },
      tailscale: { enabled: false, tunnelUrl: "" },
    },
  }) as EndpointMainSettingsData;

  const keys = useMemo(() => (keysQuery.data?.keys || []), [keysQuery.data]);
  const settingsPayload = endpointData.settings;
  const tunnelPayload = endpointData.tunnelStatus;
  const loading = keysQuery.isPending;
  const settingsLoading = endpointSettingsQuery.isPending && !endpointSettingsQuery.data;
  const requireApiKey = settingsPayload.requireApiKey === true;
  const hasPassword = settingsPayload.hasPassword || false;
  const tunnelDashboardAccess = settingsPayload.tunnelDashboardAccess !== false;
  const tunnelEnabled = tunnelPayload.tunnel?.enabled || false;
  const tunnelUrl = tunnelPayload.tunnel?.publicUrl || tunnelPayload.tunnel?.tunnelUrl || "";
  const tsEnabled = tunnelPayload.tailscale?.enabled || false;
  const tsUrl = tunnelPayload.tailscale?.tunnelUrl || "";

  const totalPages = Math.max(1, Math.ceil(keys.length / KEYS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedKeys = useMemo(() => keys.slice(
    (safeCurrentPage - 1) * KEYS_PER_PAGE,
    safeCurrentPage * KEYS_PER_PAGE,
  ), [keys, safeCurrentPage]);

  const addKeyMutation = useMutation({
    retry: false,
    mutationFn: async (name: string) => {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add key");
      return data.key as ApiKeyItem;
    },
    onSuccess: (key) => {
      setCreatedKey(key);
      setNewKeyName("");
      queryClient.setQueryData<KeysQueryData>(queryKeys.keys(), (current) => ({
        ...(current || { keys: [] }),
        keys: [...(current?.keys || []), key],
      }));
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.keys() }); },
    onError: (error) => { console.error("Failed to add key:", error); },
  });

  const deleteKeyMutation = useMutation({
    retry: false,
    mutationFn: async (keyId: string) => {
      const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete key");
    },
    onMutate: async (keyId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.keys() });
      const previous = queryClient.getQueryData<KeysQueryData>(queryKeys.keys());
      queryClient.setQueryData<KeysQueryData>(queryKeys.keys(), (current) => ({
        ...(current || { keys: [] }),
        keys: (current?.keys || []).filter((key) => key.id !== keyId),
      }));
      return { previous };
    },
    onError: (error, _keyId, context) => {
      console.error("Failed to delete key:", error);
      if (context?.previous) queryClient.setQueryData(queryKeys.keys(), context.previous);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.keys() }); },
  });

  const saveSettingMutation = useMutation({
    retry: false,
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to save setting");
      }
      return { key, value, data };
    },
    onSuccess: ({ key, value, data }) => {
      queryClient.setQueryData<EndpointMainSettingsData>(queryKeys.endpointMainSettings(), (current) => ({
        settings: {
          ...(current?.settings || endpointData.settings),
          [key]: value,
        },
        tunnelStatus: current?.tunnelStatus || endpointData.tunnelStatus,
      }));
      queryClient.setQueryData<Record<string, unknown>>(queryKeys.settings(), (current) => ({
        ...(current || {}),
        ...(data || {}),
      }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.endpointMainSettings() });
    },
    onError: (error) => { console.error("Failed to save setting:", error); },
  });

  const handleAddKey = (event) => {
    event?.preventDefault();
    if (!newKeyName.trim()) return;
    addKeyMutation.mutate(newKeyName);
  };

  const handleDeleteKey = (keyId) => {
    if (!confirm("Delete this API key?")) return;
    deleteKeyMutation.mutate(keyId);
  };

  const toggleKeyVisibility = (keyId) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyId)) {
        next.delete(keyId);
      } else {
        next.add(keyId);
      }
      return next;
    });
  };

  const saveSetting = (key, value) => {
    saveSettingMutation.mutate({ key, value });
  };

  const toggleTunnelMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const response = await fetch(tunnelEnabled ? "/api/tunnel/disable" : "/api/tunnel/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to update Cloudflare Tunnel");
      return data;
    },
    onMutate: () => {
      setRemoteAccessError("");
      setRemoteAccessInfo("");
    },
    onSuccess: (data) => {
      setRemoteAccessInfo(
        tunnelEnabled ? "Cloudflare Tunnel disabled." : (data.publicUrl ? `Cloudflare Tunnel enabled: ${data.publicUrl}` : "Cloudflare Tunnel enabled.")
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.endpointMainSettings() });
    },
    onError: (error: Error) => { setRemoteAccessError(error.message); },
  });

  const toggleTailscaleMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const response = await fetch(tsEnabled ? "/api/tunnel/tailscale-disable" : "/api/tunnel/tailscale-enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to update Tailscale Funnel");
      return data;
    },
    onMutate: () => {
      setRemoteAccessError("");
      setRemoteAccessInfo("");
    },
    onSuccess: (data) => {
      if (data.needsLogin && data.authUrl) {
        window.open(data.authUrl, "_blank", "noopener,noreferrer");
        setRemoteAccessInfo("Tailscale login opened in a new tab. Finish login, then click Enable again.");
      } else if (data.funnelNotEnabled && data.enableUrl) {
        window.open(data.enableUrl, "_blank", "noopener,noreferrer");
        setRemoteAccessInfo("Enable Funnel in Tailscale admin first, then click Enable again.");
      } else {
        setRemoteAccessInfo(
          tsEnabled ? "Tailscale Funnel disabled." : (data.tunnelUrl ? `Tailscale Funnel enabled: ${data.tunnelUrl}` : "Tailscale Funnel enabled.")
        );
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.endpointMainSettings() });
    },
    onError: (error: Error) => { setRemoteAccessError(error.message); },
  });

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* API Keys */}
      <GlassCard>
        <SectionHeader
          label={translate("Security")}
          title={translate("API Keys")}
          subtitle={translate("Manage API keys for accessing your AxonRouter instance")}
          badge={null}
        />
        <div className="mt-4 flex flex-col gap-3">
          {paginatedKeys.map((key) => (
            <div key={key.id} className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <div className="text-sm font-medium text-[var(--color-text-main)]">{key.name}</div>
                <div className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">
                  {visibleKeys.has(key.id) ? key.key : "••••••••••••••••"}
                </div>
              </div>
              <Button
                type="button"
                onClick={() => toggleKeyVisibility(key.id)}
                variant="ghost"
                size="sm"
                className="rounded-full text-muted-foreground hover:text-foreground"
                aria-label={visibleKeys.has(key.id) ? translate("Hide key") : translate("Show key")}
                title={visibleKeys.has(key.id) ? translate("Hide key") : translate("Show key")}
              >
                <AppIcon name={visibleKeys.has(key.id) ? "visibility_off" : "visibility"} data-icon="inline-start" />
              </Button>
              <Button
                type="button"
                onClick={() => copy(key.key, `key-${key.id}`)}
                variant="ghost"
                size="sm"
                className="rounded-full text-muted-foreground hover:text-foreground"
                aria-label={translate("Copy key")}
                title={translate("Copy key")}
              >
                <AppIcon name={copied === `key-${key.id}` ? "check" : "content_copy"} data-icon="inline-start" />
              </Button>
              <Button
                type="button"
                onClick={() => handleDeleteKey(key.id)}
                variant="ghost"
                size="sm"
                className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label={translate("Delete key")}
                title={translate("Delete key")}
              >
                <AppIcon name="delete" data-icon="inline-start" />
              </Button>
            </div>
          ))}
          {keys.length > KEYS_PER_PAGE && (
            <div className="flex items-center justify-between gap-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2">
              <div className="text-xs text-[var(--color-text-muted)]">
                {translate("Showing")} {(safeCurrentPage - 1) * KEYS_PER_PAGE + 1}-{Math.min(safeCurrentPage * KEYS_PER_PAGE, keys.length)} {translate("of")} {keys.length} {translate("keys")}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeCurrentPage === 1}
                >
                  {translate("Prev")}
                </Button>
                <div className="min-w-[72px] text-center text-xs text-[var(--color-text-muted)]">
                  {translate("Page")} {safeCurrentPage} / {totalPages}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safeCurrentPage === totalPages}
                >
                  {translate("Next")}
                </Button>
              </div>
            </div>
          )}
          <Button onClick={() => setShowAddModal(true)} className="w-full">
            {translate("Add New Key")}
          </Button>
        </div>
      </GlassCard>

      {/* Local Endpoints */}
      <GlassCard>
        <SectionHeader label={translate("Endpoints")} title={translate("Local Endpoints")} subtitle={translate("Your local AxonRouter API endpoints")} badge={null} />
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input value={DEFAULT_AXONROUTER_API_BASE_URL} readOnly className="flex-1 font-mono text-sm" />
            <Button
              type="button"
              onClick={() => copy(DEFAULT_AXONROUTER_API_BASE_URL, "local-url")}
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground hover:text-foreground"
              aria-label={translate("Copy local endpoint")}
              title={translate("Copy local endpoint")}
            >
              <AppIcon name={copied === "local-url" ? "check" : "content_copy"} data-icon="inline-start" />
            </Button>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            Machine ID: <span className="font-mono">{machineId}</span>
          </div>
        </div>
      </GlassCard>

      {/* Remote Access */}
      <GlassCard>
        <SectionHeader label={translate("Network")} title={translate("Remote Access")} subtitle={translate("Enable remote access to your local instance")} badge={null} />
        <div className="mt-4 flex flex-col gap-4">
          {settingsLoading && (
            <div className="text-xs text-muted-foreground">{translate("Loading tunnel status...")}</div>
          )}
          {(remoteAccessError || remoteAccessInfo) && (
            <Alert variant={remoteAccessError ? "destructive" : "default"} className="rounded-2xl">
              <AlertDescription>{remoteAccessError || remoteAccessInfo}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-3">
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--color-text-main)]">{translate("Cloudflare Tunnel")}</div>
              {tunnelEnabled && tunnelUrl && (
                <div className="mt-1 text-xs font-mono text-[var(--color-text-muted)]">{tunnelUrl}</div>
              )}
            </div>
            <StatusBadge status={tunnelEnabled ? "Enabled" : "Disabled"} />
            <Button size="sm" variant="secondary" className="ml-3" onClick={() => toggleTunnelMutation.mutate()} disabled={toggleTunnelMutation.isPending}>
              {toggleTunnelMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {tunnelEnabled ? "Disable" : "Enable"}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-3">
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--color-text-main)]">{translate("Tailscale Funnel")}</div>
              {tsEnabled && tsUrl && (
                <div className="mt-1 text-xs font-mono text-[var(--color-text-muted)]">{tsUrl}</div>
              )}
            </div>
            <StatusBadge status={tsEnabled ? "Enabled" : "Disabled"} />
            <Button size="sm" variant="secondary" className="ml-3" onClick={() => toggleTailscaleMutation.mutate()} disabled={toggleTailscaleMutation.isPending}>
              {toggleTailscaleMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {tsEnabled ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Security Settings */}
      <GlassCard>
        <SectionHeader label={translate("Security")} title="Security Settings" subtitle="Configure remote dashboard exposure and API access" badge={null} />
        <div className="mt-4 flex flex-col gap-3">
          {settingsLoading && (
            <div className="text-xs text-muted-foreground">{translate("Loading security settings...")}</div>
          )}
          <div className="text-xs text-muted-foreground">
            {translate("API key authentication is automatically enforced when API keys are configured.")}
          </div>
          <ToggleRow
            label={translate("Allow Dashboard Over Tunnel")}
            description={translate("Allow remote dashboard access via Cloudflare Tunnel or Tailscale URLs")}
            checked={tunnelDashboardAccess}
            onChange={(checked) => {
              saveSetting("tunnelDashboardAccess", checked);
            }}
          />
        </div>
      </GlassCard>

      {/* Add Key Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("Add API Key")}</DialogTitle>
          </DialogHeader>
        <form onSubmit={handleAddKey} className="flex flex-col gap-4">
          <Field>
            <FieldLabel>{translate("Key Name")}</FieldLabel>
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder={translate("My API Key")}
              required
            />
          </Field>
          {createdKey && (
            <Alert className="rounded-2xl border-[var(--color-success)]/20 bg-[var(--color-success)]/10">
              <AlertDescription>
                <span className="mb-2 block text-sm font-medium text-[var(--color-success)]">{translate("Key created successfully!")}</span>
                <span className="block break-all font-mono text-xs text-[var(--color-text-main)]">{createdKey}</span>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="w-full" disabled={!newKeyName.trim()}>
              {translate("Create Key")}
            </Button>
            <Button type="button" onClick={() => setShowAddModal(false)} variant="ghost" className="w-full">
              Close
            </Button>
          </div>
        </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
