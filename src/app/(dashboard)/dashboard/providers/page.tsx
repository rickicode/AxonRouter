"use client";

import AppIcon from "@/shared/components/AppIcon";
import { DownloadIcon, LoaderCircle, PauseCircle, PlusIcon, UploadIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import {
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
  getProviderSupportedModes,
} from "@/shared/constants/providers";
import Link from "next/link";
import { getRelativeTime } from "@/shared/utils";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import { useNotificationStore } from "@/store/notificationStore";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import ModelAvailabilityBadge from "./components/ModelAvailabilityBadge";
import { getConnectionErrorTag } from "./errorTag";
import { getDashboardConnectionStatus, getStatusDisplayItems } from "./statusDisplay";

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

  const filteredOauthProviders = Object.entries(OAUTH_PROVIDERS).filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredFreeProviders = Object.entries(FREE_PROVIDERS).filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredFreeTierProviders = Object.entries(FREE_TIER_PROVIDERS).filter(([key, info]) => matchesHeaderSearch(key, info));
  const filteredApiKeyProviders = Object.entries(APIKEY_PROVIDERS)
    .filter(([, rawInfo]) => ((rawInfo as any).serviceKinds ?? ["llm"]).includes("llm"))
    .filter(([key, info]) => matchesHeaderSearch(key, info));

  const filteredManagedApiKeyProviders = filteredApiKeyProviders.filter(([, rawInfo]) => (rawInfo as any).systemManaged === true);
  const filteredRegularApiKeyProviders = filteredApiKeyProviders.filter(([, rawInfo]) => (rawInfo as any).systemManaged !== true);

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
          {filteredOauthProviders.map(([key, info]) => (
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

      {/* Web Cookie Providers — use browser subscription cookie instead of API key */}
      {/* <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            Web Cookie Providers{" "}
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Object.entries(WEB_COOKIE_PROVIDERS).map(([key, info]) => (
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
      </div> */}

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

function getProviderBadgeVariant(tone) {
  if (tone === "error") return "destructive";
  return tone === "secondary" ? "secondary" : "outline";
}

function getProviderBadgeClass(tone) {
  if (tone === "ready") return "border-[var(--color-success)]/35 bg-[var(--color-success)]/18 text-white";
  if (tone === "success") return "border-[var(--color-success)]/35 bg-[var(--color-success)]/14 text-[var(--color-success)]";
  return "";
}

function ProviderStatusBadge({ children, tone = "default", showDot = false }) {
  return (
    <ShadcnBadge variant={getProviderBadgeVariant(tone)} className={getProviderBadgeClass(tone)}>
      {showDot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </ShadcnBadge>
  );
}

function ProviderCard({ providerId, provider, stats, authType, onToggle }) {
  const { connected, error, errorCode, errorTime, allDisabled } = stats;
  const isNoAuth = !!provider.noAuth;

  const getIconPath = () => {
    if (provider.id === "commandcode" || provider.id === "mimo") {
      return `/providers/${provider.id}.svg`;
    }
    if (provider.id === "morph-fast") {
      return "/providers/morph-fast.svg";
    }
    return `/providers/${provider.id}.png`;
  };

  const dotColors = {
    free: "bg-[var(--color-success)]",
    oauth: "bg-[var(--color-info)]",
    apikey: "bg-[var(--color-warning)]",
    compatible: "bg-[var(--color-primary)]",
  };
  const dotLabels = {
    free: "Free",
    oauth: "OAuth",
    apikey: "API Key",
    compatible: "Compatible",
  };

  return (
    <Link href={`/dashboard/providers/${providerId}`} className="group">
      <Card
        className={`h-full cursor-pointer transition-colors hover:bg-card/70 ${allDisabled ? "opacity-50" : ""}`}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="size-8 rounded flex items-center justify-center"
                style={{
                  backgroundColor: `${provider.color?.length > 7 ? provider.color : provider.color + "15"}`,
                }}
              >
                <ProviderIcon
                  src={getIconPath()}
                  alt={provider.name}
                  size={30}
                  className="object-contain rounded max-w-[32px] max-h-[32px]"
                  fallbackText={
                    provider.textIcon || provider.id.slice(0, 2).toUpperCase()
                  }
                  fallbackColor={provider.color}
                />
              </div>
              <div>
                <h3 className="font-semibold">{provider.name}</h3>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {allDisabled ? (
                    <ProviderStatusBadge tone="secondary">
                      <span className="flex items-center gap-1">
                        <PauseCircle className="size-3" strokeWidth={2} />
                        Disabled
                      </span>
                    </ProviderStatusBadge>
                  ) : isNoAuth ? (
                    <>
                      <ProviderStatusBadge tone="ready">Ready</ProviderStatusBadge>
                      {getProviderSupportedModes(provider).map((mode) => (
                        <ProviderStatusBadge key={mode}>{mode}</ProviderStatusBadge>
                      ))}
                    </>
                  ) : (
                    <>
                       {getStatusDisplayItems(connected, error, stats.total, errorCode).map((item) => (
                        <ProviderStatusBadge key={item.key} tone={item.variant} showDot={item.dot}>
                          {item.label}
                        </ProviderStatusBadge>
                      ))}
                      {getProviderSupportedModes(provider).map((mode) => (
                        <ProviderStatusBadge key={mode}>{mode}</ProviderStatusBadge>
                      ))}
                      {errorTime && (
                        <span className="text-muted-foreground">{errorTime}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {stats.total > 0 && (
                <div
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggle(!allDisabled ? false : true);
                  }}
                >
                  <Switch
                    size="sm"
                    checked={!allDisabled}
                    onToggle={() => {}}
                    title={allDisabled ? "Enable provider" : "Disable provider"}
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

ProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    textIcon: PropTypes.string,
  }).isRequired,
  stats: PropTypes.shape({
    connected: PropTypes.number,
    error: PropTypes.number,
    errorCode: PropTypes.string,
    errorTime: PropTypes.string,
  }).isRequired,
  authType: PropTypes.string,
  onToggle: PropTypes.func,
};

function ApiKeyProviderCard({
  providerId,
  provider,
  stats,
  authType,
  onToggle,
}) {
  const isSystemManaged = provider.systemManaged === true;
  const { connected, error, errorCode, errorTime, allDisabled } = stats;
  const isCompatible = providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
  const isAnthropicCompatible = providerId.startsWith(
    ANTHROPIC_COMPATIBLE_PREFIX,
  );

  const dotColors = {
    free: "bg-[var(--color-success)]",
    oauth: "bg-[var(--color-info)]",
    apikey: "bg-[var(--color-warning)]",
    compatible: "bg-[var(--color-primary)]",
  };
  const dotLabels = {
    free: "Free",
    oauth: "OAuth",
    apikey: "API Key",
    compatible: "Compatible",
  };

  const getIconPath = () => {
    if (isCompatible)
      return provider.apiType === "responses"
        ? "/providers/oai-r.png"
        : "/providers/oai-cc.png";
    if (isAnthropicCompatible) return "/providers/anthropic-m.png";
    if (provider.id === "commandcode" || provider.id === "mimo") {
      return `/providers/${provider.id}.svg`;
    }
    if (provider.id === "morph-fast") {
      return "/providers/morph-fast.svg";
    }
    return `/providers/${provider.id}.png`;
  };

  return (
    <Link href={`/dashboard/providers/${providerId}`} className="group">
      <Card
        className={`h-full cursor-pointer transition-colors hover:bg-card/70 ${allDisabled ? "opacity-50" : ""}`}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="size-8 rounded flex items-center justify-center"
                style={{
                  backgroundColor: `${provider.color?.length > 7 ? provider.color : provider.color + "15"}`,
                }}
              >
                <ProviderIcon
                  src={getIconPath()}
                  alt={provider.name}
                  size={30}
                  className="object-contain rounded max-w-[30px] max-h-[30px]"
                  fallbackText={
                    provider.textIcon || provider.id.slice(0, 2).toUpperCase()
                  }
                  fallbackColor={provider.color}
                />
              </div>
              <div>
                <h3 className="font-semibold">{provider.name}</h3>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {allDisabled ? (
                    <ProviderStatusBadge tone="secondary">
                      <span className="flex items-center gap-1">
                        <PauseCircle className="size-3" strokeWidth={2} />
                        Disabled
                      </span>
                    </ProviderStatusBadge>
                  ) : (
                    <>
                       {getStatusDisplayItems(connected, error, stats.total, errorCode).map((item) => (
                        <ProviderStatusBadge key={item.key} tone={item.variant} showDot={item.dot}>
                          {item.label}
                        </ProviderStatusBadge>
                      ))}
                      {isCompatible && (
                        <ProviderStatusBadge>
                          {provider.apiType === "responses"
                            ? "Responses"
                            : "Chat"}
                        </ProviderStatusBadge>
                      )}
                      {isAnthropicCompatible && (
                        <ProviderStatusBadge>
                          Messages
                        </ProviderStatusBadge>
                      )}
                      {getProviderSupportedModes(provider).map((mode) => (
                        <ProviderStatusBadge key={mode}>{mode}</ProviderStatusBadge>
                      ))}
                      {isSystemManaged && (
                        <ProviderStatusBadge>
                          Managed in Morph
                        </ProviderStatusBadge>
                      )}
                      {errorTime && (
                        <span className="text-muted-foreground">{errorTime}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {stats.total > 0 && !isSystemManaged && (
                <div
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggle(!allDisabled ? false : true);
                  }}
                >
                  <Switch
                    size="sm"
                    checked={!allDisabled}
                    onToggle={() => {}}
                    title={allDisabled ? "Enable provider" : "Disable provider"}
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

ApiKeyProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    textIcon: PropTypes.string,
    apiType: PropTypes.string,
  }).isRequired,
  stats: PropTypes.shape({
    connected: PropTypes.number,
    error: PropTypes.number,
    errorCode: PropTypes.string,
    errorTime: PropTypes.string,
  }).isRequired,
  authType: PropTypes.string,
  onToggle: PropTypes.func,
};

function AddOpenAICompatibleModal({ isOpen, onClose, onCreated }) {
  const inv = useInvalidate();
  const validationAlertClass = "border-0 rounded-[4px] text-[var(--color-danger)] !bg-[var(--color-danger)]/15";
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    apiType: "chat",
    baseUrl: "https://api.openai.com/v1",
  });
  const [submitting, setSubmitting] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [showAdvancedCheck, setShowAdvancedCheck] = useState(false);

  const apiTypeOptions = [
    { value: "chat", label: "Chat Completions" },
    { value: "responses", label: "Responses API" },
  ];

  const createOpenAINodeMutation = useMutation({
    retry: false,
    mutationFn: async (body: typeof formData) => {
      const res = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, type: "openai-compatible" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create node");
      return data;
    },
    onSuccess: (data) => {
      onCreated(data.node);
      inv.providerNodes(); inv.providerModels();
      setFormData({ name: "", prefix: "", apiType: "chat", baseUrl: "https://api.openai.com/v1" });
      setCheckKey("");
      setCheckModelId("");
      setValidationResult(null);
    },
    onSettled: () => setSubmitting(false),
  });

  const handleSubmit = (event) => {
    event?.preventDefault();
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSubmitting(true);
    createOpenAINodeMutation.mutate(formData);
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: checkKey,
          type: "openai-compatible",
          modelId: checkModelId.trim() || undefined,
        }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: "Network error" });
    } finally {
      setValidating(false);
    }
  };

  const renderValidationResult = () => {
    if (!validationResult) return null;
    const { valid, error, method } = validationResult;

    return (
      <Alert variant={valid ? "default" : "destructive"} className={valid ? "border-0 rounded-[4px] text-[var(--color-success)] !bg-[var(--color-success)]/15" : validationAlertClass}>
        <AlertTitle className="flex items-center gap-2">
          <ShadcnBadge variant={valid ? "default" : "destructive"}>{valid ? "Valid" : "Invalid"}</ShadcnBadge>
          {valid ? "Endpoint check passed" : "Endpoint check failed"}
        </AlertTitle>
        <AlertDescription>
          {valid && method === "chat"
            ? "Validated with an inference test because model listing was unavailable."
            : valid
              ? "The endpoint accepted the supplied key."
              : error || "AxonRouter could not validate this endpoint."}
        </AlertDescription>
      </Alert>
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          return;
        }
        setShowAdvancedCheck(false);
        setCheckKey("");
        setCheckModelId("");
        setValidationResult(null);
      }}
    >
      <DialogContent className="max-w-[min(calc(100vw-2rem),42rem)]">
        <DialogHeader>
          <DialogTitle>Add OpenAI Compatible</DialogTitle>
          <DialogDescription>Add an OpenAI-compatible provider endpoint and optionally validate it first.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="openai-compatible-name">Name</FieldLabel>
              <ShadcnInput
                id="openai-compatible-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="OpenAI Compatible (Prod)"
                required
              />
              <FieldDescription>Required. A friendly label for this node.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="openai-compatible-prefix">Prefix</FieldLabel>
              <ShadcnInput
                id="openai-compatible-prefix"
                value={formData.prefix}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                placeholder="oc-prod"
                required
              />
              <FieldDescription>Required. Used as the provider prefix for model IDs.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>API Type</FieldLabel>
              <ShadcnSelect value={formData.apiType} onValueChange={(value) => setFormData({ ...formData, apiType: value })}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Select API type" />
                </SelectTrigger>
                <SelectContent>
                  {apiTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </ShadcnSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="openai-compatible-base-url">Base URL</FieldLabel>
              <ShadcnInput
                id="openai-compatible-base-url"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                required
              />
              <FieldDescription>Use the base URL (ending in /v1) for your OpenAI-compatible API.</FieldDescription>
            </Field>
          </FieldGroup>
          <div className="rounded-[4px] border border-border bg-muted/30 p-4">
            <div className="mb-3 flex flex-col gap-1">
              <h3 className="text-sm font-semibold tracking-[-0.01em]">Credential flow</h3>
              <p className="text-sm text-muted-foreground">Create the compatible endpoint first. Add and validate API keys from the connection list after node creation.</p>
            </div>
            <details
              className="rounded-[4px] border border-border/60 bg-background/50 p-3"
              open={showAdvancedCheck}
              onToggle={(event) => setShowAdvancedCheck((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-sm font-medium text-foreground">Optional pre-check (advanced)</summary>
              <div className="mt-3 flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="openai-compatible-check-key">API Key (optional)</FieldLabel>
                  <ShadcnInput
                    id="openai-compatible-check-key"
                    type="password"
                    value={checkKey}
                    onChange={(e) => setCheckKey(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="openai-compatible-check-model">Model ID (optional)</FieldLabel>
                  <ShadcnInput
                    id="openai-compatible-check-model"
                    value={checkModelId}
                    onChange={(e) => setCheckModelId(e.target.value)}
                    placeholder="e.g. gpt-4, claude-3-opus"
                  />
                  <FieldDescription>If provider lacks /models endpoint, enter a model ID to validate via chat/completions instead.</FieldDescription>
                </Field>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <Button
                    type="button"
                    onClick={handleValidate}
                    disabled={!checkKey || validating || !formData.baseUrl.trim()}
                    variant="secondary"
                  >
                    {validating ? <Spinner className="size-4" /> : null}
                    {validating ? "Checking" : "Check endpoint"}
                  </Button>
                  <div className="flex-1">{renderValidationResult()}</div>
                </div>
              </div>
            </details>
          </div>
          <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <p className="order-3 text-xs text-muted-foreground sm:order-1 sm:mr-auto">After create, open provider details and add API key from Connections.</p>
            <Button type="button" onClick={onClose} variant="ghost" className="order-1 sm:order-2">
              Cancel
            </Button>
            <Button
              type="submit"
              className="order-2 sm:order-3"
              disabled={
                !formData.name.trim() ||
                !formData.prefix.trim() ||
                !formData.baseUrl.trim() ||
                submitting
              }
            >
              {submitting ? <Spinner className="size-4" /> : null}
              {submitting ? "Creating" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

AddOpenAICompatibleModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};

function AddAnthropicCompatibleModal({ isOpen, onClose, onCreated }) {
  const inv = useInvalidate();
  const validationAlertClass = "border-0 rounded-[4px] text-[var(--color-danger)] !bg-[var(--color-danger)]/15";
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    baseUrl: "https://api.anthropic.com/v1",
  });
  const [submitting, setSubmitting] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null); // { valid, error, method }
  const [showAdvancedCheck, setShowAdvancedCheck] = useState(false);

  const handleOpenChange = (nextOpen) => {
    if (nextOpen) {
      setValidationResult(null);
      setCheckKey("");
      setCheckModelId("");
      setShowAdvancedCheck(false);
      return;
    }
    onClose?.(nextOpen);
  };

  const createAnthropicNodeMutation = useMutation({
    retry: false,
    mutationFn: async (body: typeof formData) => {
      const res = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, type: "anthropic-compatible" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create node");
      return data;
    },
    onSuccess: (data) => {
      onCreated(data.node);
      inv.providerNodes(); inv.providerModels();
      setFormData({ name: "", prefix: "", baseUrl: "https://api.anthropic.com/v1" });
      setCheckKey("");
      setCheckModelId("");
      setValidationResult(null);
    },
    onSettled: () => setSubmitting(false),
  });

  const handleSubmit = (event) => {
    event?.preventDefault();
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSubmitting(true);
    createAnthropicNodeMutation.mutate(formData);
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: checkKey,
          type: "anthropic-compatible",
          modelId: checkModelId.trim() || undefined,
        }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: "Network error" });
    } finally {
      setValidating(false);
    }
  };

  const renderValidationResult = () => {
    if (!validationResult) return null;
    const { valid, error, method } = validationResult;

    return (
      <Alert variant={valid ? "default" : "destructive"} className={valid ? "border-0 rounded-[4px] text-[var(--color-success)] !bg-[var(--color-success)]/15" : validationAlertClass}>
        <AlertTitle className="flex items-center gap-2">
          <ShadcnBadge variant={valid ? "default" : "destructive"}>{valid ? "Valid" : "Invalid"}</ShadcnBadge>
          {valid ? "Endpoint check passed" : "Endpoint check failed"}
        </AlertTitle>
        <AlertDescription>
          {valid && method === "chat"
            ? "Validated with an inference test because model listing was unavailable."
            : valid
              ? "The endpoint accepted the supplied key."
              : error || "AxonRouter could not validate this endpoint."}
        </AlertDescription>
      </Alert>
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && handleOpenChange(false)}
    >
      <DialogContent className="max-w-[min(calc(100vw-2rem),42rem)]">
        <DialogHeader>
          <DialogTitle>Add Anthropic Compatible</DialogTitle>
          <DialogDescription>Add an Anthropic-compatible provider endpoint and optionally validate it first.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="anthropic-compatible-name">Name</FieldLabel>
              <ShadcnInput
                id="anthropic-compatible-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Anthropic Compatible (Prod)"
                required
              />
              <FieldDescription>Required. A friendly label for this node.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="anthropic-compatible-prefix">Prefix</FieldLabel>
              <ShadcnInput
                id="anthropic-compatible-prefix"
                value={formData.prefix}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                placeholder="ac-prod"
                required
              />
              <FieldDescription>Required. Used as the provider prefix for model IDs.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="anthropic-compatible-base-url">Base URL</FieldLabel>
              <ShadcnInput
                id="anthropic-compatible-base-url"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder="https://api.anthropic.com/v1"
                required
              />
              <FieldDescription>Use the base URL (ending in /v1) for your Anthropic-compatible API. The system will append /messages.</FieldDescription>
            </Field>
          </FieldGroup>
          <div className="rounded-[4px] border border-border bg-muted/30 p-4">
            <div className="mb-3 flex flex-col gap-1">
              <h3 className="text-sm font-semibold tracking-[-0.01em]">Credential flow</h3>
              <p className="text-sm text-muted-foreground">Create the compatible endpoint first. Add and validate API keys from the connection list after node creation.</p>
            </div>
            <details
              className="rounded-[4px] border border-border/60 bg-background/50 p-3"
              open={showAdvancedCheck}
              onToggle={(event) => setShowAdvancedCheck((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-sm font-medium text-foreground">Optional pre-check (advanced)</summary>
              <div className="mt-3 flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="anthropic-compatible-check-key">API Key (optional)</FieldLabel>
                  <ShadcnInput
                    id="anthropic-compatible-check-key"
                    type="password"
                    value={checkKey}
                    onChange={(e) => setCheckKey(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="anthropic-compatible-check-model">Model ID (optional)</FieldLabel>
                  <ShadcnInput
                    id="anthropic-compatible-check-model"
                    value={checkModelId}
                    onChange={(e) => setCheckModelId(e.target.value)}
                    placeholder="e.g. claude-3-opus"
                  />
                  <FieldDescription>If provider lacks /models endpoint, enter a model ID to validate via chat/completions instead.</FieldDescription>
                </Field>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <Button
                    type="button"
                    onClick={handleValidate}
                    disabled={!checkKey || validating || !formData.baseUrl.trim()}
                    variant="secondary"
                  >
                    {validating ? <Spinner className="size-4" /> : null}
                    {validating ? "Checking" : "Check endpoint"}
                  </Button>
                  <div className="flex-1">{renderValidationResult()}</div>
                </div>
              </div>
            </details>
          </div>
          <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <p className="order-3 text-xs text-muted-foreground sm:order-1 sm:mr-auto">After create, open provider details and add API key from Connections.</p>
            <Button type="button" onClick={onClose} variant="ghost" className="order-1 sm:order-2">
              Cancel
            </Button>
            <Button
              type="submit"
              className="order-2 sm:order-3"
              disabled={
                !formData.name.trim() ||
                !formData.prefix.trim() ||
                !formData.baseUrl.trim() ||
                submitting
              }
            >
              {submitting ? <Spinner className="size-4" /> : null}
              {submitting ? "Creating" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

AddAnthropicCompatibleModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};

function ProviderTestResultsView({ results }) {
  if (results.error && !results.results) {
    return (
      <div className="text-center py-6">
        <AppIcon name="error" size={32} className="text-[var(--color-danger)] mb-2 block" />
        <p className="text-sm text-[var(--color-danger)]">{results.error}</p>
      </div>
    );
  }

  const { summary, mode } = results;
  const items = results.results || [];
  const modeLabel =
    {
      oauth: "OAuth",
      free: "Free",
      apikey: "API Key",
      provider: "Provider",
      all: "All",
    }[mode] || mode;

  return (
    <div className="flex flex-col gap-3">
      {summary && (
        <div className="flex items-center gap-3 text-xs mb-1">
          <span className="text-text-muted">{modeLabel} Test</span>
          <span className="px-2 py-0.5 rounded border border-[var(--color-success)]/20 bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)] font-medium">
            {summary.passed} passed
          </span>
          {summary.failed > 0 && (
            <span className="px-2 py-0.5 rounded border border-[var(--color-danger)]/20 bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] text-[var(--color-danger)] font-medium">
              {summary.failed} failed
            </span>
          )}
          <span className="text-text-muted ml-auto">
            {summary.total} tested
          </span>
        </div>
      )}
      {items.map((r, i) => (
        <div
          key={r.connectionId || i}
          className="flex items-center gap-2 text-xs px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)]"
        >
          <AppIcon name={r.valid ? "check_circle" : "error"} size={16} className={r.valid ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"} />
          <div className="flex-1 min-w-0">
            <span className="font-medium">{r.connectionName}</span>
            <span className="text-text-muted ml-1.5">({r.provider})</span>
          </div>
          {r.latencyMs !== undefined && (
            <span className="text-text-muted font-mono tabular-nums">
              {r.latencyMs}ms
            </span>
          )}
          <span
            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
              r.valid
                ? "border border-[var(--color-success)]/20 bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)]"
                : "border border-[var(--color-danger)]/20 bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] text-[var(--color-danger)]"
            }`}
          >
            {r.valid ? "OK" : r.diagnosis?.type || "ERROR"}
          </span>
        </div>
      ))}
      {items.length === 0 && (
        <div className="text-center py-4 text-text-muted text-sm">
          No active connections found for this group.
        </div>
      )}
    </div>
  );
}

ProviderTestResultsView.propTypes = {
  results: PropTypes.shape({
    mode: PropTypes.string,
    results: PropTypes.array,
    summary: PropTypes.shape({
      total: PropTypes.number,
      passed: PropTypes.number,
      failed: PropTypes.number,
    }),
    error: PropTypes.string,
  }).isRequired,
};
