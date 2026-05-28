"use client";

import AppIcon from "@/shared/components/AppIcon";
import { ChevronDown, DownloadIcon, LoaderCircle, PlusIcon, Search, UploadIcon, Zap } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import {
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
  getProviderCategory,
} from "@/shared/constants/providers";
import { cn } from "@/lib/utils";
import { getRelativeTime } from "@/shared/utils";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import { useNotificationStore } from "@/store/notificationStore";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import ModelAvailabilityBadge from "./components/ModelAvailabilityBadge";
import { getConnectionErrorTag } from "./errorTag";
import { getDashboardConnectionStatus } from "./statusDisplay";
import { ProviderCard, ApiKeyProviderCard } from "./components/ProviderCards";
import { AddOpenAICompatibleModal, AddAnthropicCompatibleModal } from "./components/AddCompatibleModals";
import { ProviderTestResultsView } from "./components/ProviderTestResults";
import { ProviderFilterBar } from "./components/ProviderFilterBar";
import type { FilterOption } from "./components/ProviderFilterBar";

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

interface CollapsibleSectionProps {
  title: string;
  count: number;
  testMode: string;
  testingMode: string | null;
  onTest: () => void;
  children: React.ReactNode;
  extra?: React.ReactNode;
}

function CollapsibleSection({ title, count, testMode, testingMode, onTest, children, extra }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em] text-foreground hover:opacity-80 transition-opacity">
            <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} />
            {title}
            <ShadcnBadge variant="secondary" className="text-xs">{count}</ShadcnBadge>
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2">
          {extra}
          <Button
            onClick={onTest}
            disabled={!!testingMode}
            variant={testingMode === testMode ? "secondary" : "outline"}
            size="sm"
            title={`Test all ${title} connections`}
          >
            <LoaderCircle data-icon="inline-start" className={testingMode === testMode ? "animate-spin" : undefined} />
            {testingMode === testMode ? "Testing..." : "Test"}
          </Button>
        </div>
      </div>
      <CollapsibleContent>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function ProvidersPage() {
  const [connections, setConnections] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [localSearch, setLocalSearch] = useState("");
  const [showCredentialImportModal, setShowCredentialImportModal] = useState(false);
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
  const [showAddAnthropicCompatibleModal, setShowAddAnthropicCompatibleModal] = useState(false);
  const [testingMode, setTestingMode] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [providerSummaries, setProviderSummaries] = useState<any>({});
  const credentialFileInputRef = useRef(null);
  const notify = useNotificationStore();
  const inv = useInvalidate();
  const headerSearchQuery: any = useHeaderSearchStore((state: any) => state.query);
  const normalizedHeaderSearch = (headerSearchQuery || "").trim().toLowerCase();
  const normalizedLocalSearch = localSearch.trim().toLowerCase();

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

  const matchesSearch = (providerId, info) => {
    const headerMatch = !normalizedHeaderSearch || [providerId, info?.name, info?.alias, info?.website, info?.textIcon].some((value) => String(value || "").toLowerCase().includes(normalizedHeaderSearch));
    const localMatch = !normalizedLocalSearch || [providerId, info?.name, info?.alias, info?.website, info?.textIcon].some((value) => String(value || "").toLowerCase().includes(normalizedLocalSearch));
    return headerMatch && localMatch;
  };

  const categoryFilterFn = (providerId: string) => {
    if (activeFilter === "all") return true;
    const category = getProviderCategory(providerId);
    switch (activeFilter) {
      case "free": return category === "Free";
      case "oauth": return category === "OAuth";
      case "apikey": return category === "API Key";
      case "freetier": return category === "Free Tier";
      case "local": return category === "Local";
      case "compatible": return category === "OpenAI Compatible" || category === "Anthropic Compatible";
      case "webcookie": return category === "Web Cookie";
      default: return true;
    }
  };

  const filteredOauthProviders = Object.entries(OAUTH_PROVIDERS).filter(([key, info]) => matchesSearch(key, info) && categoryFilterFn(key));
  const filteredFreeProviders = Object.entries(FREE_PROVIDERS).filter(([key, info]) => matchesSearch(key, info) && categoryFilterFn(key));
  const filteredFreeTierProviders = Object.entries(FREE_TIER_PROVIDERS).filter(([key, info]) => matchesSearch(key, info) && categoryFilterFn(key));
  const filteredWebCookieProviders = Object.entries(WEB_COOKIE_PROVIDERS).filter(([key, info]) => matchesSearch(key, info) && categoryFilterFn(key));
  const filteredApiKeyProviders = Object.entries(APIKEY_PROVIDERS)
    .filter(([, rawInfo]) => ((rawInfo as any).serviceKinds ?? ["llm"]).includes("llm"))
    .filter(([key, info]) => matchesSearch(key, info) && categoryFilterFn(key));

  const filteredManagedApiKeyProviders = filteredApiKeyProviders.filter(([, rawInfo]) => (rawInfo as any).systemManaged === true);
  const filteredRegularApiKeyProviders = filteredApiKeyProviders
    .filter(([, rawInfo]) => (rawInfo as any).systemManaged !== true)
    .sort(([keyA, infoA], [keyB, infoB]) => {
      const aCompat = (infoA as any).apiKeyCompatible === true ? 0 : 1;
      const bCompat = (infoB as any).apiKeyCompatible === true ? 0 : 1;
      if (aCompat !== bCompat) return aCompat - bCompat;
      return keyA.localeCompare(keyB);
    });



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

  // Category counts for filter pills
  const allProviderIds = [
    ...Object.keys(FREE_PROVIDERS),
    ...Object.keys(FREE_TIER_PROVIDERS),
    ...Object.keys(OAUTH_PROVIDERS),
    ...Object.keys(APIKEY_PROVIDERS),
    ...Object.keys(WEB_COOKIE_PROVIDERS),
  ];
  const filterOptions: FilterOption[] = [
    { value: "all", label: "All", category: "All", count: allProviderIds.length },
    { value: "free", label: "Free", category: "Free", count: Object.keys(FREE_PROVIDERS).length },
    { value: "oauth", label: "OAuth", category: "OAuth", count: Object.keys(OAUTH_PROVIDERS).length },
    { value: "apikey", label: "API Key", category: "API Key", count: Object.keys(APIKEY_PROVIDERS).length },
    { value: "freetier", label: "Free Tier", category: "Free Tier", count: Object.keys(FREE_TIER_PROVIDERS).length },
    { value: "webcookie", label: "Web Cookie", category: "Web Cookie", count: Object.keys(WEB_COOKIE_PROVIDERS).length },
    { value: "compatible", label: "Compatible", category: "OpenAI Compatible", count: compatibleProviders.length + anthropicCompatibleProviders.length },
  ];

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
      {/* Compact Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Providers</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportCredentials}
            loading={exportingCredentials}
            title="Export credentials backup"
          >
            <UploadIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCredentialImportModal(true)}
            title="Import credentials backup"
          >
            <DownloadIcon className="size-4" />
          </Button>
          <Button
            onClick={() => handleBatchTest("all")}
            disabled={!!testingMode}
            variant={testingMode === "all" ? "secondary" : "default"}
            size="sm"
          >
            <Zap className={cn("size-4", testingMode === "all" && "animate-pulse")} />
            {testingMode === "all" ? "Testing..." : "Test All"}
          </Button>
        </div>
      </div>

      {/* Search + Filter Pills */}
      <div className="flex flex-col gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search providers..."
            className="pl-8"
          />
        </div>
        <ProviderFilterBar value={activeFilter} onChange={setActiveFilter} options={filterOptions} />
      </div>

      {/* OAuth Providers */}
      {filteredOauthProviders.length > 0 && (
        <CollapsibleSection
          title="OAuth Providers"
          count={filteredOauthProviders.length}
          testMode="oauth"
          testingMode={testingMode}
          onTest={() => handleBatchTest("oauth")}
          extra={<ModelAvailabilityBadge />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOauthProviders.map(([key, info]) => (
              <ProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "oauth")}
                authType="oauth"
                onToggle={(active) => handleToggleProvider(key, "oauth", active)}
                onTest={() => handleBatchTest("provider", key)}
                testing={testingMode === key}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Free & Free Tier Providers */}
      {(filteredFreeProviders.length > 0 || filteredFreeTierProviders.length > 0) && (
        <CollapsibleSection
          title="Free & Free Tier Providers"
          count={filteredFreeProviders.length + filteredFreeTierProviders.length}
          testMode="free"
          testingMode={testingMode}
          onTest={() => handleBatchTest("free")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredFreeProviders.map(([key, info]) => (
              <ProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "oauth")}
                authType="free"
                onToggle={(active) => handleToggleProvider(key, "oauth", active)}
                onTest={() => handleBatchTest("provider", key)}
                testing={testingMode === key}
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
                onTest={() => handleBatchTest("provider", key)}
                testing={testingMode === key}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Managed Providers */}
      {filteredManagedApiKeyProviders.length > 0 && (
        <CollapsibleSection
          title="Managed Providers"
          count={filteredManagedApiKeyProviders.length}
          testMode="managed"
          testingMode={testingMode}
          onTest={() => handleBatchTest("apikey")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredManagedApiKeyProviders.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
                onTest={() => handleBatchTest("provider", key)}
                testing={testingMode === key}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* API Key Providers */}
      {filteredRegularApiKeyProviders.length > 0 && (
        <CollapsibleSection
          title="API Key Providers"
          count={filteredRegularApiKeyProviders.length}
          testMode="apikey"
          testingMode={testingMode}
          onTest={() => handleBatchTest("apikey")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredRegularApiKeyProviders.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
                onTest={() => handleBatchTest("provider", key)}
                testing={testingMode === key}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Web Cookie Providers */}
      {filteredWebCookieProviders.length > 0 && (
        <CollapsibleSection
          title="Web Cookie Providers"
          count={filteredWebCookieProviders.length}
          testMode="webcookie"
          testingMode={testingMode}
          onTest={() => handleBatchTest("webcookie")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredWebCookieProviders.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => handleToggleProvider(key, "apikey", active)}
                onTest={() => handleBatchTest("provider", key)}
                testing={testingMode === key}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* API Key Compatible Providers */}
      {(activeFilter === "all" || activeFilter === "compatible") && (
      <CollapsibleSection
        title="Compatible Providers"
        count={compatibleProviders.length + anthropicCompatibleProviders.length}
        testMode="compatible"
        testingMode={testingMode}
        onTest={() => handleBatchTest("compatible")}
        extra={
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setShowAddAnthropicCompatibleModal(true)}
            >
              <PlusIcon data-icon className="size-4" />
              Anthropic
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowAddCompatibleModal(true)}
            >
              <PlusIcon data-icon className="size-4" />
              OpenAI
            </Button>
          </div>
        }
      >
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
                  onTest={() => handleBatchTest("provider", info.id)}
                  testing={testingMode === info.id}
                />
              ),
            )}
          </div>
        )}
      </CollapsibleSection>
      )}

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
