"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { translate } from "@/i18n/runtime";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import GlassCard from "./shared/GlassCard";
import StatusBadge from "./shared/StatusBadge";
import SectionHeader from "./shared/SectionHeader";

const STATUS_LABELS = {
  online: { label: "Online", color: "#10b981" },
  offline: { label: "Offline", color: "#6b7280" },
  error: { label: "Error", color: "#ef4444" },
  unauthorized: { label: "Unauthorized", color: "#f59e0b" },
  not_registered: { label: "Not Registered", color: "#f59e0b" },
  unknown: { label: "Unknown", color: "#6b7280" },
};

function formatRelative(iso) {
  if (!iso) return "never";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "never";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusPill({ status, latencyMs }) {
  const cfg = STATUS_LABELS[status] || STATUS_LABELS.unknown;
  const variant = status === "online" ? "default" : status === "error" ? "destructive" : status === "unauthorized" || status === "not_registered" ? "outline" : "secondary";
  return (
    <Badge variant={variant} className="uppercase tracking-[0.04em]">
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {cfg.label}
      {typeof latencyMs === "number" ? ` · ${latencyMs}ms` : ""}
    </Badge>
  );
}

function getLastSyncLabel(entry, workerStatus) {
  const lastSyncAt = entry.lastSyncAt || workerStatus?.lastSyncAt;
  if (lastSyncAt) return formatRelative(lastSyncAt);
  if (entry.lastSyncOk === false) return "runtime refresh failed";
  if (entry.registeredAt) return "runtime refresh pending";
  return "never";
}

function getLastSyncStyle(entry, workerStatus) {
  const lastSyncAt = entry.lastSyncAt || workerStatus?.lastSyncAt;
  if (lastSyncAt) return undefined;
  if (entry.lastSyncOk === false) return { color: "#fca5a5" };
  if (entry.registeredAt) return { color: "#fcd34d" };
  return undefined;
}

function getWorkerMessage(entry, workerError, workerStatus) {
  if (entry.lastSyncError) return entry.lastSyncError;
  if (workerError) return workerError;
  if (!(entry.lastSyncAt || workerStatus?.lastSyncAt) && entry.lastSyncOk === false) {
    return "Retry refresh so the worker reloads the latest runtime artifacts.";
  }
  if (!(entry.lastSyncAt || workerStatus?.lastSyncAt) && entry.registeredAt) {
    return "Worker is registered. Runtime refresh is pending.";
  }
  return "";
}

export default function CloudTab() {
  const router = useRouter();
  const inv = useInvalidate();
  const [cloudUrls, setCloudUrls] = useState([]);
  const [statusByUrl, setStatusByUrl] = useState({});
  const [newCloudUrl, setNewCloudUrl] = useState("");
  const [newCloudName, setNewCloudName] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [globalSecretMasked, setGlobalSecretMasked] = useState("");
  const [globalSecretRevealed, setGlobalSecretRevealed] = useState("");
  const [loadingGlobalSecret, setLoadingGlobalSecret] = useState(false);
  const [regeneratingSecret, setRegeneratingSecret] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [tsEnabled, setTsEnabled] = useState(false);
  const [tsUrl, setTsUrl] = useState("");

  const pollTimerRef = useRef(null);
  const { copied, copy } = useCopyToClipboard();

  const loadSettings = useCallback(async () => {
    try {
      const [tunnelRes, cloudUrlsRes] = await Promise.all([
        fetch("/api/tunnel/status"),
        fetch("/api/cloud-urls"),
      ]);

      if (tunnelRes.ok) {
        const data = await tunnelRes.json();
        setTunnelEnabled(data.tunnel?.enabled || false);
        setTunnelUrl(data.tunnel?.publicUrl || data.tunnel?.tunnelUrl || "");
        setTsEnabled(data.tailscale?.enabled || false);
        setTsUrl(data.tailscale?.tunnelUrl || "");
      }

      if (cloudUrlsRes.ok) {
        const data = await cloudUrlsRes.json();
        setCloudUrls(Array.isArray(data.cloudUrls) ? data.cloudUrls : []);
        setGlobalSecretMasked(data.cloudSharedSecretMasked || "");
        if (typeof data.cloudSharedSecret === "string" && data.cloudSharedSecret) {
          setGlobalSecretRevealed(data.cloudSharedSecret);
        }
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }, []);

  const refreshAllStatuses = useCallback(async (entries) => {
    const list = entries || cloudUrls;
    const ids = list.map((c) => c.id);
    if (ids.length === 0) {
      setStatusByUrl({});
      return;
    }

    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/cloud-urls/${id}/status`).then((r) =>
          r.json().then((b) => [id, b, r.ok])
        )
      )
    );

    const next = {};
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const [id, body, ok] = result.value;
      next[id] = ok ? body : { error: body?.error || "fetch failed" };
    }
    setStatusByUrl(next);
  }, [cloudUrls]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => {
      clearTimeout(timer);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [loadSettings]);

  const cloudIdsKey = cloudUrls.map((c) => c.id).join(",");
  useEffect(() => {
    if (!cloudIdsKey) return;

    const timer = setTimeout(() => {
      void refreshAllStatuses(null);
    }, 0);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      if (document.hidden) return;
      void refreshAllStatuses(null);
    }, 30_000);
    return () => {
      clearTimeout(timer);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [cloudIdsKey, refreshAllStatuses]);

  const addWorkerMutation = useMutation({
    retry: false,
    mutationFn: async ({ url, name }: { url: string; name: string }) => {
      const res = await fetch("/api/cloud-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add cloud URL");
      return data;
    },
    onSuccess: async (data) => {
      setNewCloudUrl("");
      setNewCloudName("");
      if (data?.cloudSharedSecretMasked) {
        setGlobalSecretMasked(data.cloudSharedSecretMasked);
      }
      if (data?.initialSync?.ok) {
        setInfo("Cloud worker registered and initial runtime refresh completed.");
      } else if (data?.initialSync?.error) {
        setInfo(`Cloud worker registered, but initial runtime refresh failed: ${data.initialSync.error}`);
      } else {
        setInfo("Cloud worker registered.");
      }
      inv.settings();
      await loadSettings();
      await refreshAllStatuses(data.cloudUrls || undefined);
    },
  });

  const handleAddCloudUrl = async () => {
    if (!newCloudUrl.trim()) return;
    setAdding(true);
    setError("");
    setInfo("");
    addWorkerMutation.mutate(
      { url: newCloudUrl.trim(), name: newCloudName.trim() },
      { onSettled: () => setAdding(false), onError: (e: any) => setError(e.message) },
    );
  };

  const removeWorkerMutation = useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      const res = await fetch("/api/cloud-urls", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete cloud URL");
    },
    onSuccess: async () => {
      inv.settings();
      await loadSettings();
    },
  });

  const handleDeleteCloudUrl = async (id: string) => {
    if (!confirm("Remove this cloud worker? Your local providers stay; the worker's stored data is left as-is.")) {
      return;
    }
    removeWorkerMutation.mutate(id, { onError: (e: any) => setError(e.message) });
  };

  const syncCloudMutation = useMutation({
    retry: false,
    mutationFn: async (entryId: string | null) => {
      const res = await fetch("/api/cloud-urls/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entryId ? { id: entryId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sync failed");
      return { data, entryId };
    },
    onSuccess: async ({ data, entryId }) => {
      setInfo(entryId ? "Worker synced." : `Synced to ${data.workersOk} worker(s).`);
      inv.settings();
      await loadSettings();
      await refreshAllStatuses(null);
    },
  });

  const handleSyncNow = async (entryId: string | null = null) => {
    setSyncingId(entryId || "all");
    setError("");
    setInfo("");
    syncCloudMutation.mutate(entryId, {
      onError: (e: any) => setError(e.message),
      onSettled: () => setSyncingId(null),
    });
  };

  const handleOpenDashboard = async (id) => {
    try {
      const res = await fetch(`/api/cloud-urls/${id}/status`);
      const data = await res.json();
      if (data.dashboardUrl) {
        window.open(data.dashboardUrl, "_blank", "noopener,noreferrer");
      } else {
        setError(data.error || "Worker did not return a dashboard URL");
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRevealSecret = async () => {
    try {
      if (globalSecretRevealed) {
        setGlobalSecretRevealed("");
        return;
      }

      setLoadingGlobalSecret(true);
      const res = await fetch(`/api/cloud-urls?includeSecret=1`, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load cloud secret");
      if (!data.cloudSharedSecret) throw new Error("Cloud secret is unavailable");
      setGlobalSecretRevealed(data.cloudSharedSecret);
      setGlobalSecretMasked(data.cloudSharedSecretMasked || globalSecretMasked);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingGlobalSecret(false);
    }
  };

  const handleCopySecret = async () => {
    if (globalSecretRevealed) {
      copy(globalSecretRevealed, "global-cloud-secret");
      return;
    }

    try {
      setLoadingGlobalSecret(true);
      const res = await fetch(`/api/cloud-urls?includeSecret=1`, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load cloud secret");
      if (!data.cloudSharedSecret) throw new Error("Cloud secret is unavailable");
      setGlobalSecretRevealed(data.cloudSharedSecret);
      setGlobalSecretMasked(data.cloudSharedSecretMasked || globalSecretMasked);
      copy(data.cloudSharedSecret, "global-cloud-secret");
    } catch (e) {
      setError(e.message || "Failed to copy cloud secret");
    } finally {
      setLoadingGlobalSecret(false);
    }
  };

  const regenerateSecretMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch("/api/cloud-urls", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ action: "regenerate-secret" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to regenerate cloud secret");
      return data;
    },
    onSuccess: (data) => {
      setGlobalSecretMasked(data.cloudSharedSecretMasked || "");
      setGlobalSecretRevealed(data.cloudSharedSecret || "");
      setInfo(data.warning || "Global cloud secret regenerated.");
      inv.settings();
    },
  });

  const handleRegenerateSecret = async () => {
    if (!confirm("Regenerate the global cloud secret? All workers will stop syncing until you update CLOUD_SHARED_SECRET on each worker.")) {
      return;
    }
    setRegeneratingSecret(true);
    setError("");
    setInfo("");
    regenerateSecretMutation.mutate(undefined, {
      onError: (e: any) => setError(e.message),
      onSettled: () => setRegeneratingSecret(false),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <SectionHeader
          label={translate("R2 STORAGE")}
          title={translate("R2 Storage")}
          subtitle={translate("Connection details, backup schedule, and restore controls now live in Settings.")}
          badge={<StatusBadge status={translate("Managed in Settings")} />}
        />

        <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium text-[var(--color-text-main)]">
                {translate("R2 Storage is managed in Settings.")}
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                {translate("Open Settings to manage connection details, backup schedule, manual backups, and restore.")}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => router.push("/dashboard/settings")}>
              {translate("Open Settings")}
            </Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHeader
          label={translate("Network")}
          title={translate("Tailscale Funnel")}
          subtitle={translate("Expose your local AxonRouter instance via Tailscale Funnel")}
          badge={<StatusBadge status={tsEnabled ? translate("Enabled") : translate("Disabled")} />}
        />
        <div className="mt-4 flex flex-col gap-3">
          {tsEnabled && tsUrl && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-3">
              <div className="mb-1 text-xs text-[var(--color-text-muted)]">{translate("Tailscale URL")}</div>
              <div className="font-mono text-sm text-[var(--color-text-main)]">{tsUrl}</div>
            </div>
          )}
          <div className="text-xs text-[var(--color-text-muted)]">{translate("Manage Tailscale settings in the Main tab")}</div>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHeader
          label={translate("CLOUDFLARE WORKER")}
          title={translate("Cloud Workers")}
          subtitle={translate("Self-hosted Cloudflare Workers that execute the latest synced config from Settings. AxonRouter owns one global shared secret for all workers until you regenerate it.")}
          badge={<StatusBadge status={cloudUrls.length > 0 ? `${cloudUrls.length} configured` : translate("None")} />}
        />

        {(error || info) && (
          <Alert variant={error ? "destructive" : "default"} className="mt-4 rounded-2xl">
            <AlertDescription>{error || info}</AlertDescription>
          </Alert>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {cloudUrls.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia><AppIcon name="cloud_off" /></EmptyMedia>
                <EmptyTitle>{translate("No cloud workers configured yet")}</EmptyTitle>
                <EmptyDescription>{translate("Deploy cloud/ to Cloudflare Workers, then paste the URL below.")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            cloudUrls.map((entry) => {
              const status = statusByUrl[entry.id];
              const probeStatus = status?.probe?.ok
                ? "online"
                : (status?.probe?.status || entry.status || "unknown");
              const workerError = status?.workerError || status?.error || null;
              const workerStatus = status?.workerStatus;
              const workerMessage = getWorkerMessage(entry, workerError, workerStatus);
              const isSyncingThis = syncingId === entry.id;
              const isAnySyncing = syncingId !== null;

              return (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--color-text-main)]">
                          {entry.name || new URL(entry.url).hostname}
                        </span>
                        <StatusPill status={probeStatus} latencyMs={status?.probe?.latencyMs} />
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-[var(--color-text-muted)]">{entry.url}</div>
                      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-[var(--color-text-muted)] sm:grid-cols-4">
                        <div>
                          <span className="opacity-70">{translate("Last sync")}</span>
                          <div style={getLastSyncStyle(entry, workerStatus)}>{getLastSyncLabel(entry, workerStatus)}</div>
                        </div>
                        <div>
                          <span className="opacity-70">{translate("Providers")}</span>
                          <div>{workerStatus?.counts?.providers ?? entry.providersCount ?? "—"}</div>
                        </div>
                        <div>
                          <span className="opacity-70">{translate("Worker")}</span>
                          <div>v{workerStatus?.version || entry.version || "—"}</div>
                        </div>
                        <div>
                          <span className="opacity-70">{translate("Registered")}</span>
                          <div>{formatRelative(entry.registeredAt)}</div>
                        </div>
                      </div>
                      <div className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
                        <div className="mb-1 text-[11px] uppercase tracking-[0.04em] text-[var(--color-text-muted)]">{translate("Worker Secret")}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">
                          This worker uses the global AxonRouter cloud secret shown below.
                        </div>
                      </div>
                      {workerMessage && (
                        <Alert variant={workerError || entry.lastSyncOk === false ? "destructive" : "default"} className="mt-2 rounded-2xl">
                          <AlertDescription>{workerMessage}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSyncNow(entry.id)}
                        disabled={isAnySyncing}
                        title={translate("Retry sync for this worker")}
                      >
                        {isSyncingThis ? translate("Syncing…") : translate("Sync now")}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleOpenDashboard(entry.id)}>
                        {translate("Open Dashboard")}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleDeleteCloudUrl(entry.id)}
                        title={translate("Remove worker")}
                        aria-label={translate("Remove worker")}
                        variant="ghost"
                        size="sm"
                        className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <AppIcon name="delete" data-icon="inline-start" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <form onSubmit={(event) => { event.preventDefault(); void handleAddCloudUrl(); }} className="rounded-2xl border border-[var(--color-border)] p-3">
            <div className="mb-2 text-xs text-[var(--color-text-muted)]">{translate("Add a new cloud worker")}</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={newCloudName}
                onChange={(e) => setNewCloudName(e.target.value)}
                placeholder={translate("Name (optional, e.g. Production)")}
                className="sm:w-1/3"
              />
              <Input
                value={newCloudUrl}
                onChange={(e) => setNewCloudUrl(e.target.value)}
                placeholder={translate("https://your-worker.workers.dev")}
                className="flex-1"
              />
              <Button type="submit" variant="secondary" disabled={adding || !newCloudUrl.trim()}>
                {adding ? translate("Registering") : translate("Add & Register")}
              </Button>
            </div>
            <div className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              AxonRouter probes <code>/admin/health</code>, then registers the worker with the current global cloud secret automatically.
            </div>
          </form>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-[var(--color-text-main)]">
                  {translate("Global Cloud Secret")}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  Copy this secret into <code>CLOUD_SHARED_SECRET</code> on every worker. Regenerating it updates AxonRouter immediately and requires manual worker env updates.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={handleRevealSecret} disabled={loadingGlobalSecret}>
                  {globalSecretRevealed ? translate("Hide") : (loadingGlobalSecret ? translate("Loading…") : translate("Reveal"))}
                </Button>
                <Button size="sm" variant="secondary" onClick={handleCopySecret} disabled={loadingGlobalSecret}>
                  {copied === "global-cloud-secret" ? translate("Copied") : translate("Copy")}
                </Button>
                <Button size="sm" onClick={handleRegenerateSecret} disabled={regeneratingSecret}>
                  {regeneratingSecret ? translate("Regenerating…") : translate("Regenerate")}
                </Button>
              </div>
            </div>
            <code className="block rounded bg-black/20 px-3 py-2 text-xs text-[var(--color-text-main)] break-all">
              {globalSecretRevealed || globalSecretMasked || translate("Unavailable")}
            </code>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-[var(--color-text-main)]">
                  {translate("Routing behavior is managed in Settings.")}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  Round-robin, sticky sessions, and sticky duration live in one place and sync to every worker automatically.
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => router.push("/dashboard/settings")}>
                {translate("Open Settings")}
              </Button>
            </div>
          </div>

          {cloudUrls.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3">
              <Button size="sm" variant="secondary" onClick={() => refreshAllStatuses(null)}>
                {translate("Refresh status")}
              </Button>
              <Button size="sm" onClick={() => handleSyncNow()} disabled={syncingId !== null} title="Sync all registered workers">
                {syncingId === "all" ? translate("Syncing…") : translate("Sync all")}
              </Button>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
