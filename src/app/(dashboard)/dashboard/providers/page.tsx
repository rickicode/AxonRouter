"use client";

import AppIcon from "@/shared/components/AppIcon";
import { DownloadIcon, LoaderCircle, PlusIcon, UploadIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import {
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  LOCAL_PROVIDERS,
  SEARCH_PROVIDERS,
  AUDIO_ONLY_PROVIDERS,
  UPSTREAM_PROXY_PROVIDERS,
  CLOUD_AGENT_PROVIDERS,
  IDE_PROVIDER_IDS,
} from "@/shared/constants/providers";
import { getRelativeTime } from "@/shared/utils";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import { useNotificationStore } from "@/store/notificationStore";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { ProviderCard, ApiKeyProviderCard } from "./components/ProviderCards";
import { AddOpenAICompatibleModal, AddAnthropicCompatibleModal } from "./components/AddCompatibleModals";
import { ProviderTestResultsView } from "./components/ProviderTestResults";
import ModelAvailabilityBadge from "./components/ModelAvailabilityBadge";
import { getConnectionErrorTag } from "./errorTag";
import { getDashboardConnectionStatus } from "./statusDisplay";

function extractCredentialImportRecords(payload: any) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const candidates = [
    payload.credentials,
    payload.entries,
    payload.items,
    payload.connections,
    payload.providerConnections,
    payload.data,
  ];
  return candidates.find((candidate) => Array.isArray(candidate)) || [];
}

function getCredentialImportAccountLabel(record: any, index: number) {
  if (!record || typeof record !== "object") return `account ${index + 1}`;
  const identity = record.identity && typeof record.identity === "object" ? record.identity : {};
  return (
    record.email ||
    identity.email ||
    record.name ||
    identity.name ||
    record.displayName ||
    record.display_name ||
    record.provider ||
    `account ${index + 1}`
  );
}

export default function ProvidersPage() {
  const [connections, setConnections] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCredentialImportModal, setShowCredentialImportModal] =
    useState(false);
  const [credentialImportText, setCredentialImportText] = useState("");
  const [credentialImportFileName, setCredentialImportFileName] = useState("");
  const [importingCredentials, setImportingCredentials] = useState(false);
  const [credentialImportStatus, setCredentialImportStatus] = useState({
    type: "",
    message: "",
    detail: "",
  });
  const [credentialImportProgress, setCredentialImportProgress] = useState({
    current: 0,
    total: 0,
    label: "",
  });
  const [exportingCredentials, setExportingCredentials] = useState(false);
  const [showAddCompatibleModal, setShowAddCompatibleModal] = useState(false);
  const [showAddAnthropicCompatibleModal, setShowAddAnthropicCompatibleModal] =
    useState(false);
  const [testingMode, setTestingMode] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [providerSummaries, setProviderSummaries] = useState<any>({});
  const credentialFileInputRef = useRef(null);
  const notify = useNotificationStore();
  const inv = useInvalidate();
  const headerSearchQuery: any = useHeaderSearchStore((state: any) => state.query);
  const normalizedHeaderSearch = (headerSearchQuery || "").trim().toLowerCase();

  const refreshConnections = async () => {
    const res = await fetch("/api/providers");
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "Failed to refresh providers");
    }
    setConnections(data.connections || []);
    setProviderSummaries(data.providerSummaries || {});
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [connectionsRes, nodesRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/provider-nodes"),
        ]);
        const connectionsData = await connectionsRes.json();
        const nodesData = await nodesRes.json();
        if (connectionsRes.ok) {
          setConnections(connectionsData.connections || []);
          setProviderSummaries(connectionsData.providerSummaries || {});
        }
        if (nodesRes.ok) setProviderNodes(nodesData.nodes || []);
      } catch (error) {
        console.log("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleExportCredentials = async () => {
    setExportingCredentials(true);
    try {
      const res = await fetch("/api/credentials/export");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to export credentials");
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `axonrouter-credentials-${timestamp}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      notify.success("Credentials backup exported");
    } catch (error) {
      notify.error(error?.message || "Failed to export credentials");
    } finally {
      setExportingCredentials(false);
    }
  };

  const handlePickImportFile = () => {
    credentialFileInputRef.current?.click();
  };

  const handleCredentialFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setCredentialImportText(text);
      setCredentialImportFileName(file.name);
      setCredentialImportStatus({
        type: "info",
        message: "Backup file loaded",
        detail: file.name,
      });
      notify.success(`Loaded backup file: ${file.name}`);
    } catch {
      setCredentialImportStatus({
        type: "error",
        message: "Failed to read backup file",
        detail: "Choose a valid JSON backup file",
      });
      notify.error("Failed to read backup file");
    } finally {
      // Allow selecting the same file again.
      event.target.value = "";
    }
  };

  const importCredentialsMutation = useMutation({
    retry: false,
    mutationFn: async (payload: unknown) => {
      const res = await fetch("/api/credentials/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to import credentials");
      return data;
    },
    onSuccess: async (data) => {
      inv.allProviders();
      setCredentialImportProgress((current) => ({
        current: current.total,
        total: current.total,
        label: data.preserved ? `${data.preserved} valid duplicate kept` : "Finalizing restore",
      }));
      setCredentialImportStatus({
        type: "info",
        message: "Import complete",
        detail: `Refreshing providers after ${data.imported} imported, ${data.updated} updated${data.preserved ? `, ${data.preserved} kept because existing tokens are valid` : ""}${data.skipped ? `, ${data.skipped} skipped` : ""}`,
      });
      try { await refreshConnections(); } catch {
        setCredentialImportStatus({
          type: "warning",
          message: "Import completed, but provider refresh failed",
          detail: "The restored credentials are saved; close the modal and refresh the page later if needed.",
        });
      }
      setCredentialImportText("");
      setCredentialImportFileName("");
      if (credentialFileInputRef.current) credentialFileInputRef.current.value = "";
      setCredentialImportStatus({
        type: "success",
        message: "Credentials restored successfully",
        detail: `${data.imported} imported, ${data.updated} updated, ${data.created} created${data.preserved ? `, ${data.preserved} valid duplicates kept` : ""}${data.skipped ? `, ${data.skipped} skipped` : ""}`,
      });
      setShowCredentialImportModal(false);
      setCredentialImportText("");
      setCredentialImportFileName("");
      if (credentialFileInputRef.current) credentialFileInputRef.current.value = "";
      notify.success(
        `Credentials restored (${data.imported} imported, ${data.updated} updated, ${data.created} created${data.preserved ? `, ${data.preserved} kept` : ""}${data.skipped ? `, ${data.skipped} skipped` : ""})`,
      );
    },
    onError: (error: any) => {
      setCredentialImportStatus({
        type: "error",
        message: "Restore failed",
        detail: error?.message || "Failed to import credentials",
      });
      notify.error(error?.message || "Failed to import credentials");
    },
    onSettled: () => setImportingCredentials(false),
  });

  useEffect(() => {
    if (!importingCredentials || credentialImportProgress.total <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCredentialImportProgress((progress) => {
        if (progress.current >= progress.total) return progress;
        return { ...progress, current: Math.min(progress.current + 1, progress.total) };
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [credentialImportProgress.total, importingCredentials]);

  const handleImportCredentials = () => {
    if (!credentialImportText.trim()) {
      setCredentialImportStatus({
        type: "warning",
        message: "No backup JSON found",
        detail: "Paste backup JSON or choose a file before restoring",
      });
      notify.warning("Please paste a backup JSON or choose a backup file");
      return;
    }
    setImportingCredentials(true);
    setCredentialImportStatus({
      type: "info",
      message: "Validating backup JSON",
      detail: credentialImportFileName || "Parsing pasted backup text",
    });
    setCredentialImportProgress({ current: 0, total: 0, label: "" });
    try {
      const payload = JSON.parse(credentialImportText);
      const records = extractCredentialImportRecords(payload);
      const firstLabel = records.length > 0 ? getCredentialImportAccountLabel(records[0], 0) : "credentials payload";
      setCredentialImportProgress({
        current: records.length > 0 ? 1 : 0,
        total: records.length,
        label: firstLabel,
      });
      setCredentialImportStatus({
        type: "info",
        message: "Uploading backup to restore service",
        detail: records.length > 0 ? `Importing account 1 of ${records.length}: ${firstLabel}` : "Sending credentials for import",
      });
      importCredentialsMutation.mutate(payload);
    } catch (error: any) {
      setImportingCredentials(false);
      setCredentialImportStatus({
        type: "error",
        message: "Restore failed",
        detail: error?.message || "Invalid JSON",
      });
      notify.error(error?.message || "Invalid JSON");
    }
  };

  const matchesHeaderSearch = (providerId, info) => {
    if (!normalizedHeaderSearch) return true;
    return [providerId, info?.name, info?.alias, info?.website, info?.textIcon].some((value) => String(value || "").toLowerCase().includes(normalizedHeaderSearch));
  };

  const filteredFreeProviders = Object.entries(FREE_PROVIDERS).filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredFreeTierProviders = Object.entries(FREE_TIER_PROVIDERS).filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredApiKeyProviders = Object.entries(APIKEY_PROVIDERS)
    .filter(([, rawInfo]) => ((rawInfo as any).serviceKinds ?? ["llm"]).includes("llm"))
    .filter(([key, info]) => matchesHeaderSearch(key, info));

  const filteredManagedApiKeyProviders = filteredApiKeyProviders.filter(([, rawInfo]) => (rawInfo as any).systemManaged === true);
  const filteredRegularApiKeyProviders = filteredApiKeyProviders.filter(([, rawInfo]) => (rawInfo as any).systemManaged !== true);

  const filteredIdeProviders = Object.entries(OAUTH_PROVIDERS)
    .filter(([key]) => IDE_PROVIDER_IDS.has(key))
    .filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredNonIdeOauthProviders = Object.entries(OAUTH_PROVIDERS)
    .filter(([key]) => !IDE_PROVIDER_IDS.has(key))
    .filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredWebCookieProviders = Object.entries(WEB_COOKIE_PROVIDERS).filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredLocalProviders = Object.entries(LOCAL_PROVIDERS).filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredSearchProviders = Object.entries(SEARCH_PROVIDERS).filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredAudioProviders = Object.entries(AUDIO_ONLY_PROVIDERS).filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredCloudAgentProviders = Object.entries(CLOUD_AGENT_PROVIDERS).filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredUpstreamProxyProviders = Object.entries(UPSTREAM_PROXY_PROVIDERS).filter(([key, info]) => matchesHeaderSearch(key, info));

  const getProviderStats = (providerId, authType) => {
    const providerConnections = connections.filter(
      (c) => c.provider === providerId && c.authType === authType,
    );

    const summary = providerSummaries?.[providerId]?.[authType];
    if (summary) {
      return {
        connected: summary.connected,
        error: summary.error,
        unknown: summary.unknown,
        total: summary.total,
        errorCode: providerConnections
          .filter((c) => {
            const status = getDashboardConnectionStatus(c);
            return status === "blocked" || status === "exhausted";
          })
          .sort((a, b) => new Date(b.lastCheckedAt || 0).getTime() - new Date(a.lastCheckedAt || 0).getTime())[0]
          ? getConnectionErrorTag(
              providerConnections
                .filter((c) => {
                  const status = getDashboardConnectionStatus(c);
                  return status === "blocked" || status === "exhausted";
                })
                .sort((a, b) => new Date(b.lastCheckedAt || 0).getTime() - new Date(a.lastCheckedAt || 0).getTime())[0],
            )
          : null,
        errorTime: providerConnections
          .filter((c) => {
            const status = getDashboardConnectionStatus(c);
            return status === "blocked" || status === "exhausted";
          })
          .sort((a, b) => new Date(b.lastCheckedAt || 0).getTime() - new Date(a.lastCheckedAt || 0).getTime())[0]?.lastCheckedAt
          ? getRelativeTime(
              providerConnections
                .filter((c) => {
                  const status = getDashboardConnectionStatus(c);
                  return status === "blocked" || status === "exhausted";
                })
                .sort((a, b) => new Date(b.lastCheckedAt || 0).getTime() - new Date(a.lastCheckedAt || 0).getTime())[0].lastCheckedAt,
            )
          : null,
        allDisabled: summary.total > 0 && providerConnections.every((c) => c.isActive === false),
      };
    }

    const getEffectiveStatus = (conn) => getDashboardConnectionStatus(conn);

    const connected = providerConnections.filter((c) => {
      const status = getEffectiveStatus(c);
      return status === "eligible";
    }).length;

    const errorConns = providerConnections.filter((c) => {
      const status = getEffectiveStatus(c);
      return status === "blocked" || status === "exhausted";
    });

    const error = errorConns.length;
    const total = providerConnections.length;
    const unknown = Math.max(total - connected - error, 0);
    const allDisabled =
      total > 0 && providerConnections.every((c) => c.isActive === false);

    const latestError = errorConns.sort(
      (a, b) => new Date(b.lastCheckedAt || 0).getTime() - new Date(a.lastCheckedAt || 0).getTime(),
    )[0];
    const errorCode = latestError ? getConnectionErrorTag(latestError) : null;
    const errorTime = latestError?.lastCheckedAt
      ? getRelativeTime(latestError.lastCheckedAt)
      : null;

    return { connected, error, unknown, total, errorCode, errorTime, allDisabled };
  };

  const batchPriorityMutation = useMutation({
    retry: false,
    mutationFn: async ({ providerConns, newActive }: { providerConns: any[]; newActive: boolean }) => {
      await Promise.allSettled(
        providerConns.map((c) =>
          fetch(`/api/providers/${c.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: newActive }),
          }),
        ),
      );
    },
    onSuccess: () => { inv.providers(); },
  });

  // Toggle all connections for a provider on/off
  const handleToggleProvider = (providerId, authType, newActive) => {
    const providerConns = connections.filter(
      (c) => c.provider === providerId && c.authType === authType,
    );
    setConnections((prev) =>
      prev.map((c) =>
        c.provider === providerId && c.authType === authType
          ? { ...c, isActive: newActive }
          : c,
      ),
    );
    batchPriorityMutation.mutate({ providerConns, newActive });
  };

  const handleBatchTest = async (mode, providerId = null) => {
    if (testingMode) return;
    setTestingMode(mode === "provider" ? providerId : mode);
    setTestResults(null);
    try {
      const res = await fetch("/api/providers/test-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, providerId }),
      });
      const data = await res.json();
      setTestResults(data);
      if (data.summary) {
        const { passed, failed, total } = data.summary;
        if (failed === 0) notify.success(`All ${total} tests passed`);
        else notify.warning(`${passed}/${total} passed, ${failed} failed`);
      }
    } catch (error) {
      setTestResults({ error: "Test request failed" });
      notify.error("Provider test failed");
    } finally {
      setTestingMode(null);
    }
  };

  const compatibleProviders = providerNodes
    .filter((node) => node.type === "openai-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "OpenAI Compatible",
      color: "#10A37F",
      textIcon: "OC",
      apiType: node.apiType,
    }));

  const anthropicCompatibleProviders = providerNodes
    .filter((node) => node.type === "anthropic-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "Anthropic Compatible",
      color: "#D97757",
      textIcon: "AC",
    }));

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <Card>
          <CardContent className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <ShadcnBadge variant="secondary" className="uppercase tracking-[0.16em]">
                <AppIcon name="backup" size={14} />
                Credentials
              </ShadcnBadge>
              <h2 className="mt-3 text-xl font-bold tracking-[-0.02em] text-foreground">
                Backup and restore credentials
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Export and restore access tokens, refresh tokens, API keys, and
                provider-specific auth data. This keeps OAuth sessions like Codex
                usable after moving devices.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-[4px] border border-border bg-card/60 p-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCredentials}
                loading={exportingCredentials}
                className="min-w-[96px]"
              >
                <UploadIcon data-icon className="size-4" />
                Export
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowCredentialImportModal(true)}
                className="min-w-[96px]"
              >
                <DownloadIcon data-icon className="size-4" />
                Import
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* OAuth Providers */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
            OAuth Providers
          </h2>
          <div className="flex items-center gap-2">
            <ModelAvailabilityBadge />
            <Button
              onClick={() => handleBatchTest("oauth")}
              disabled={!!testingMode}
              variant={testingMode === "oauth" ? "secondary" : "outline"}
              size="sm"
              className="rounded-[4px]"
              title="Test all OAuth connections"
              aria-label="Test all OAuth connections"
            >
              <LoaderCircle data-icon="inline-start" className={testingMode === "oauth" ? "animate-spin" : undefined} />
              {testingMode === "oauth" ? "Testing..." : "Test All"}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredNonIdeOauthProviders.map(([key, info]) => (
            <ProviderCard
              key={key}
              providerId={key}
              provider={info}
              stats={getProviderStats(key, "oauth")}
              authType="oauth"
              onToggle={(active) => handleToggleProvider(key, "oauth", active)}
            />
          ))}
        </div>
      </div>

      {/* IDE Providers */}
      {filteredIdeProviders.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
                IDE Providers
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                IDE-native AI integrations. Credentials are imported from the IDE keychain.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredIdeProviders.map(([key, info]) => (
              <ProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "oauth")}
                authType="oauth"
                onToggle={(active) => handleToggleProvider(key, "oauth", active)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Free & Free Tier Providers */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
            Free &amp; Free Tier Providers
          </h2>
          <Button
            onClick={() => handleBatchTest("free")}
            disabled={!!testingMode}
            variant={testingMode === "free" ? "secondary" : "outline"}
            size="sm"
            className="rounded-[4px]"
            title="Test all Free connections"
            aria-label="Test all Free provider connections"
          >
            <LoaderCircle data-icon="inline-start" className={testingMode === "free" ? "animate-spin" : undefined} />
            {testingMode === "free" ? "Testing..." : "Test All"}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFreeProviders.map(([key, info]) => (
            <ProviderCard
              key={key}
              providerId={key}
              provider={info}
              stats={getProviderStats(key, "oauth")}
              authType="free"
              onToggle={(active) => handleToggleProvider(key, "oauth", active)}
            />
          ))}
          {filteredFreeTierProviders.map(([key, info]) => (
            <ApiKeyProviderCard
              key={key}
              providerId={key}
              provider={info}
              stats={getProviderStats(key, "apikey")}
              authType="apikey"
              onToggle={(active) => handleToggleProvider(key, "apikey", active)}
            />
          ))}
        </div>
      </div>

      {/* Managed Providers */}
      {filteredManagedApiKeyProviders.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
                Managed Providers
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                Visible in routing and usage, but configured from their dedicated pages.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredManagedApiKeyProviders.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
              />
            ))}
          </div>
        </div>
      )}

      {/* API Key Providers — fixed list */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
            API Key Providers{" "}
          </h2>
          <Button
            onClick={() => handleBatchTest("apikey")}
            disabled={!!testingMode}
            variant={testingMode === "apikey" ? "secondary" : "outline"}
            size="sm"
            className="rounded-[4px]"
            title="Test all API Key connections"
            aria-label="Test all API Key connections"
          >
            <LoaderCircle data-icon="inline-start" className={testingMode === "apikey" ? "animate-spin" : undefined} />
            {testingMode === "apikey" ? "Testing..." : "Test All"}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRegularApiKeyProviders.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
              />
            ))}
        </div>
      </div>

      {/* Web Cookie Providers */}
      {filteredWebCookieProviders.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
                Web Cookie Providers
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                Use browser subscription cookies instead of API keys.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredWebCookieProviders.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Local / Self-Hosted Providers */}
      {filteredLocalProviders.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
                Local / Self-Hosted Providers
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                Run AI models locally on your own hardware. No cloud dependency.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredLocalProviders.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Search Providers */}
      {filteredSearchProviders.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
                Search Providers
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                Web search and retrieval APIs for grounding AI responses.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredSearchProviders.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Audio Providers */}
      {filteredAudioProviders.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
                Audio Providers
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                Text-to-speech and speech-to-text services.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredAudioProviders.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Cloud Agent Providers */}
      {filteredCloudAgentProviders.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
                Cloud Agent Providers
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                Cloud-based coding agents that run tasks autonomously.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCloudAgentProviders.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upstream Proxy Providers */}
      {filteredUpstreamProxyProviders.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
                Upstream Proxy Providers
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                Proxy services that aggregate and route to multiple upstream providers.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredUpstreamProxyProviders.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
              />
            ))}
          </div>
        </div>
      )}

      {/* API Key Compatible Providers — dynamic (OpenAI/Anthropic compatible) */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-[var(--color-text-main)]">
            API Key Compatible Providers{" "}
          </h2>
          <div className="flex gap-2">
            {/* {(compatibleProviders.length > 0 || anthropicCompatibleProviders.length > 0) && (
              <button
                onClick={() => handleBatchTest("compatible")}
                disabled={!!testingMode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs font-medium border transition-colors ${testingMode === "compatible"
                  ? "bg-primary/20 border-primary/40 text-primary animate-pulse"
                  : "bg-bg border-border text-text-muted hover:text-text-main hover:border-primary/40"
                  }`}
                title="Test all Compatible connections"
              >
                <LoaderCircle className={`h-[14px] w-[14px]${testingMode === "compatible" ? " animate-spin" : ""}`} strokeWidth={2} />
                {testingMode === "compatible" ? "Testing..." : "Test All"}
              </button>
            )} */}
            <Button
              size="sm"
              onClick={() => setShowAddAnthropicCompatibleModal(true)}
            >
              <PlusIcon data-icon className="size-4" />
              Add Anthropic Compatible
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowAddCompatibleModal(true)}
            >
              <PlusIcon data-icon className="size-4" />
              Add OpenAI Compatible
            </Button>
          </div>
        </div>
        {compatibleProviders.length === 0 &&
        anthropicCompatibleProviders.length === 0 ? (
          <Empty className="border-border bg-card/60 py-10">
            <EmptyMedia variant="icon"><AppIcon name="extension" size={22} /></EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No compatible providers added yet</EmptyTitle>
              <EmptyDescription>Use the buttons above to add OpenAI or Anthropic compatible endpoints.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...compatibleProviders, ...anthropicCompatibleProviders].map(
              (info) => (
                <ApiKeyProviderCard
                  key={info.id}
                  providerId={info.id}
                  provider={info}
                  stats={getProviderStats(info.id, "apikey")}
                  authType="compatible"
                  onToggle={(active) =>
                    handleToggleProvider(info.id, "apikey", active)
                  }
                />
              ),
            )}
          </div>
        )}
      </div>

      <AddOpenAICompatibleModal
        isOpen={showAddCompatibleModal}
        onClose={() => setShowAddCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddCompatibleModal(false);
        }}
      />
      <AddAnthropicCompatibleModal
        isOpen={showAddAnthropicCompatibleModal}
        onClose={() => setShowAddAnthropicCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddAnthropicCompatibleModal(false);
        }}
      />

      {/* Test Results Modal */}
      <Dialog open={!!testResults} onOpenChange={(open) => !open && setTestResults(null)}>
        <DialogContent className="max-h-[80vh] max-w-[600px] overflow-y-auto rounded-[4px] p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>Test Results</DialogTitle>
            <DialogDescription>Provider connection test results.</DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {testResults && <ProviderTestResultsView results={testResults} />}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCredentialImportModal}
        onOpenChange={(open) => {
          if (!open && importingCredentials) return;
          setShowCredentialImportModal(open);
          if (!open) setCredentialImportStatus({ type: "", message: "", detail: "" });
        }}
      >
        <DialogContent className="max-w-[min(calc(100vw-2rem),42rem)]" showCloseButton={!importingCredentials}>
          <DialogHeader>
            <DialogTitle>Import Credentials Backup</DialogTitle>
            <DialogDescription>
              Paste exported backup JSON or load a backup file. Existing provider connections will be matched and updated.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Import accepts universal JSON shapes (entries/credentials/items/connections) with camelCase or snake_case fields.
            </p>

            <Alert variant={credentialImportStatus.type === "error" ? "destructive" : "default"} className={credentialImportStatus.type === "error" ? "border-0 rounded-[4px] text-[var(--color-danger)] !bg-[var(--color-danger)]/15" : "border-0 rounded-[4px] text-[var(--color-primary)] !bg-[var(--color-primary)]/15"}>
              <AlertTitle>
                {credentialImportStatus.message || (importingCredentials ? "Restoring credentials" : "Ready to restore")}
              </AlertTitle>
              <AlertDescription>
                {credentialImportStatus.detail || (importingCredentials ? "The modal stays open until the restore finishes." : "Load a backup file or paste JSON to begin.")}
              </AlertDescription>
              {importingCredentials && (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                      style={{ width: credentialImportProgress.total > 0 ? `${Math.max(8, Math.round((credentialImportProgress.current / credentialImportProgress.total) * 100))}%` : "66%" }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="truncate">
                      {credentialImportProgress.total > 0
                        ? `Importing account ${credentialImportProgress.current} of ${credentialImportProgress.total}: ${credentialImportProgress.label || "checking credentials"}`
                        : "Preparing credentials import..."}
                    </span>
                    {credentialImportProgress.total > 0 && (
                      <span className="font-mono text-foreground">
                        {Math.round((credentialImportProgress.current / credentialImportProgress.total) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              )}
            </Alert>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handlePickImportFile}
              >
                <UploadIcon data-icon className="size-4" />
                Choose Backup File
              </Button>
              {credentialImportFileName && (
                <span className="text-xs text-muted-foreground">
                  Loaded: {credentialImportFileName}
                </span>
              )}
            </div>

            <input
              ref={credentialFileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleCredentialFileChange}
            />

            <Textarea
              value={credentialImportText}
              onChange={(e) => setCredentialImportText(e.target.value)}
              className="min-h-[240px] rounded-[4px] bg-card font-mono"
              placeholder="Paste credentials backup JSON here"
            />

            <p className="rounded-[4px] border border-border bg-card/60 p-3 text-xs text-muted-foreground">
              Restore is additive: existing credentials with matching identity (id, email, name, or token fingerprint) are checked first. If the old account still has valid access/refresh tokens it is kept; otherwise the imported token replaces it. Existing providers that are not in the backup are kept untouched.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowCredentialImportModal(false);
                setCredentialImportText("");
                setCredentialImportFileName("");
                setCredentialImportStatus({ type: "", message: "", detail: "" });
                if (credentialFileInputRef.current) {
                  credentialFileInputRef.current.value = "";
                }
              }}
              disabled={importingCredentials}
            >
              Close
            </Button>
            <Button
              variant="default"
              onClick={handleImportCredentials}
              loading={importingCredentials}
              disabled={importingCredentials || !credentialImportText.trim()}
            >
              {importingCredentials ? null : <DownloadIcon data-icon className="size-4" />}
              Restore Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
