"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { ClaudeToolCard, CodexToolCard, DroidToolCard, OpenClawToolCard, HermesToolCard, CoworkToolCard, DefaultToolCard, OpenCodeToolCard, PiToolCard, MitmLinkCard } from "./components";
import { MITM_TOOLS } from "@/shared/constants/cliTools";
import { fetchJson, queryKeys } from "@/shared/query";
import { DEFAULT_AXONROUTER_BASE_URL } from "@/shared/constants/runtimeDefaults";

// Cloud URL is now sourced from settings.cloudUrls (configured via the
// dashboard) rather than from build-time NEXT_PUBLIC_CLOUD_URL.


const STATUS_ENDPOINTS = {
  claude: "/api/cli-tools/claude-settings",
  codex: "/api/cli-tools/codex-settings",
  opencode: "/api/cli-tools/opencode-settings",
  pi: "/api/cli-tools/pi-settings",
  droid: "/api/cli-tools/droid-settings",
  openclaw: "/api/cli-tools/openclaw-settings",
  hermes: "/api/cli-tools/hermes-settings",
  cowork: "/api/cli-tools/cowork-settings",
};

export default function CLIToolsPageClient({ machineId }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTool, setExpandedTool] = useState(null);
  const [modelMappings, setModelMappings] = useState({});
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [cloudUrl, setCloudUrl] = useState("");
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState("");
  const [apiKeys, setApiKeys] = useState([]);
  const [toolStatuses, setToolStatuses] = useState<any>({});
  const [providerModelsByProvider, setProviderModelsByProvider] = useState({});
  const searchQuery: any = useHeaderSearchStore((state: any) => state.query);
  const cliBootstrapQuery = useQuery({
    queryKey: queryKeys.cliToolsBootstrap(),
    queryFn: async ({ signal }) => {
      const [providersData, settingsData, tunnelData, keysData, providerModelsData, statusEntries] = await Promise.all([
        fetchJson<{ connections?: any[] }>("/api/providers", { signal }).catch(() => ({})),
        fetchJson<any>("/api/settings", { signal }).catch(() => ({})),
        fetchJson<any>("/api/tunnel/status", { signal }).catch(() => ({})),
        fetchJson<{ keys?: any[] }>("/api/keys", { signal }).catch(() => ({})),
        fetchJson<any>("/api/provider-models", { signal }).catch(() => ({})),
        Promise.all(
          Object.entries(STATUS_ENDPOINTS).map(async ([toolId, url]) => {
            const data = await fetchJson(url, { signal }).catch(() => null);
            return [toolId, data];
          })
        ),
      ]);
      return { providersData, settingsData, tunnelData, keysData, providerModelsData, statusEntries };
    },
  });

  useEffect(() => {
    if (cliBootstrapQuery.isPending) {
      queueMicrotask(() => setLoading(true));
      return;
    }
    if (cliBootstrapQuery.isError) {
      console.log("Error bootstrapping CLI tools page:", cliBootstrapQuery.error);
      queueMicrotask(() => setLoading(false));
      return;
    }
    if (!cliBootstrapQuery.data) return;
    queueMicrotask(() => {
      const { providersData, settingsData, tunnelData, keysData, providerModelsData, statusEntries } = cliBootstrapQuery.data;
      setConnections((providersData as { connections?: any[] }).connections || []);
      setCloudEnabled(settingsData.cloudEnabled || false);
      const firstCloud = Array.isArray(settingsData.cloudUrls)
        ? settingsData.cloudUrls.find((c) => c?.url)
        : null;
      setCloudUrl(firstCloud?.url || "");
      setTunnelEnabled(tunnelData.enabled || false);
      setTunnelPublicUrl(tunnelData.publicUrl || "");
      setApiKeys((keysData as { keys?: any[] }).keys || []);
      setProviderModelsByProvider(providerModelsData.models || {});
      setToolStatuses(Object.fromEntries(statusEntries));
      setLoading(false);
    });
  }, [cliBootstrapQuery.data, cliBootstrapQuery.error, cliBootstrapQuery.isError, cliBootstrapQuery.isPending]);

  const getActiveProviders = () => connections.filter(c => c.isActive !== false);

  const getAllAvailableModels = () => {
    const activeProviders = getActiveProviders();
    const models = [];
    const seenModels = new Set();
    activeProviders.forEach(conn => {
      const alias = PROVIDER_ID_TO_ALIAS[conn.provider] || conn.provider;
      const providerModels = Array.isArray(providerModelsByProvider?.[conn.provider])
        ? providerModelsByProvider[conn.provider]
        : [];
      providerModels.forEach(m => {
        const modelValue = `${alias}/${m.id}`;
        if (!seenModels.has(modelValue)) {
          seenModels.add(modelValue);
          models.push({ value: modelValue, label: `${alias}/${m.id}`, provider: conn.provider, alias, connectionName: conn.name, modelId: m.id });
        }
      });
    });
    return models;
  };

  const handleModelMappingChange = useCallback((toolId, modelAlias, targetModel) => {
    setModelMappings(prev => {
      if (prev[toolId]?.[modelAlias] === targetModel) return prev;
      return { ...prev, [toolId]: { ...prev[toolId], [modelAlias]: targetModel } };
    });
  }, []);

  const getBaseUrl = () => {
    if (tunnelEnabled && tunnelPublicUrl) return tunnelPublicUrl;
    if (cloudEnabled && cloudUrl) return cloudUrl;
    if (typeof window !== "undefined") return window.location.origin;
    return DEFAULT_AXONROUTER_BASE_URL;
  };

  const availableModels = getAllAvailableModels();
  const hasActiveProviders = availableModels.length > 0;

  const renderToolCard = (toolId, tool) => {
    const commonProps = {
      tool,
      isExpanded: expandedTool === toolId,
      onToggle: () => setExpandedTool(expandedTool === toolId ? null : toolId),
      baseUrl: getBaseUrl(),
      cloudUrl,
      apiKeys,
    };

    switch (toolId) {
      case "claude":
        return (
          <ClaudeToolCard
            key={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            modelMappings={modelMappings[toolId] || {}}
            onModelMappingChange={(alias, target) => handleModelMappingChange(toolId, alias, target)}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
            initialStatus={toolStatuses.claude}
          />
        );
      case "codex":
        return <CodexToolCard key={toolId} {...commonProps} activeProviders={getActiveProviders()} cloudEnabled={cloudEnabled} initialStatus={toolStatuses.codex} />;
      case "opencode":
        return <OpenCodeToolCard key={toolId} {...commonProps} activeProviders={getActiveProviders()} cloudEnabled={cloudEnabled} initialStatus={toolStatuses.opencode} />;
      case "pi":
        return <PiToolCard key={toolId} {...commonProps} activeProviders={getActiveProviders()} cloudEnabled={cloudEnabled} initialStatus={toolStatuses.pi} />;
      case "droid":
        return <DroidToolCard key={toolId} {...commonProps} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} initialStatus={toolStatuses.droid} />;
      case "openclaw":
        return <OpenClawToolCard key={toolId} {...commonProps} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} initialStatus={toolStatuses.openclaw} />;
      case "hermes":
        return <HermesToolCard key={toolId} {...commonProps} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} initialStatus={toolStatuses.hermes} />;
      case "cowork":
        return <CoworkToolCard key={toolId} {...commonProps} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} cloudUrl={cloudUrl} tunnelEnabled={tunnelEnabled} tunnelPublicUrl={tunnelPublicUrl} initialStatus={toolStatuses.cowork} />;
      default:
        return <DefaultToolCard key={toolId} toolId={toolId} {...commonProps} activeProviders={getActiveProviders()} cloudEnabled={cloudEnabled} tunnelEnabled={tunnelEnabled} />;
    }
  };

  const normalizedSearch = (searchQuery || "").trim().toLowerCase();
  const matchesToolSearch = ([toolId, tool]) => {
    if (!normalizedSearch) return true;
    return [toolId, tool?.name, tool?.description].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  };

  const regularTools = Object.entries(CLI_TOOLS).filter(matchesToolSearch);
  const mitmTools = Object.entries(MITM_TOOLS).filter(matchesToolSearch);
  const configuredTools = Object.values(toolStatuses).filter((status: any) => status && (status.hasAxonRouter || status.config || status.installed || status.cowork)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Visible Tools</div><div className="mt-1 text-2xl font-semibold text-foreground">{regularTools.length + mitmTools.length}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Configured</div><div className="mt-1 text-2xl font-semibold text-foreground">{configuredTools}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Active Providers</div><div className="mt-1 text-2xl font-semibold text-foreground">{getActiveProviders().length}</div></CardContent></Card>
      </div>
      {regularTools.length === 0 && mitmTools.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">No CLI tools match current search.</div>
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-col gap-4">
        {regularTools.map(([toolId, tool]) => renderToolCard(toolId, tool))}
      </div>
      <div className="flex flex-col gap-4">
        {mitmTools.map(([toolId, tool]) => (
          <MitmLinkCard key={toolId} tool={tool} />
        ))}
      </div>
    </div>
  );
}
