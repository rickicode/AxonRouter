"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ModelSelectModal, ManualConfigModal } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import { DEFAULT_AXONROUTER_BASE_URL } from "@/shared/constants/runtimeDefaults";

export default function OpenClawToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl,
  hasActiveProviders,
  apiKeys,
  activeProviders,
  initialStatus,
}) {
  const inv = useInvalidate();
  const [openclawStatus, setOpenclawStatus] = useState(initialStatus || null);
  const [checkingOpenclaw, setCheckingOpenclaw] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [selectedModelOverride, setSelectedModelOverride] = useState("");
  const [agentModelsOverride, setAgentModelsOverride] = useState({}); // { [agentId]: modelId }
  const [agentModalFor, setAgentModalFor] = useState(null); // agentId opening modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modelAliases, setModelAliases] = useState({});
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const effectiveSelectedApiKey = selectedApiKey || (apiKeys?.length > 0 ? apiKeys[0].key : "");

  const parsedConfig = useMemo(() => {
    const provider = openclawStatus?.settings?.models?.providers?.["axonrouter"];
    const primaryModel = openclawStatus?.settings?.agents?.defaults?.model?.primary;
    const agentList = Array.isArray(openclawStatus?.agents) ? openclawStatus.agents : [];
    const parsedAgentModels = {};
    agentList.forEach((agent) => {
      if (agent.currentModel) parsedAgentModels[agent.id] = agent.currentModel;
    });

    return {
      selectedModel: primaryModel ? primaryModel.replace("axonrouter/", "") : "",
      selectedApiKey: provider?.apiKey || "",
      agentModels: parsedAgentModels,
    };
  }, [openclawStatus]);

  const selectedModel = selectedModelOverride || parsedConfig.selectedModel;
  const agentModels = Object.keys(agentModelsOverride).length > 0 ? agentModelsOverride : parsedConfig.agentModels;

  const getConfigStatus = () => {
    if (!openclawStatus?.installed) return null;
    const currentProvider = openclawStatus.settings?.models?.providers?.["axonrouter"];
    if (!currentProvider) return "not_configured";
    const localMatch = currentProvider.baseUrl?.includes("localhost") || currentProvider.baseUrl?.includes("127.0.0.1") || currentProvider.baseUrl?.includes("0.0.0.0");
    const tunnelMatch = baseUrl && currentProvider.baseUrl?.startsWith(baseUrl);
    if (localMatch || tunnelMatch) return "configured";
    return "other";
  };

  const configStatus = getConfigStatus();

  useEffect(() => {
    if (!isExpanded) return undefined;

    let cancelled = false;

    void (async () => {
      try {
        setCheckingOpenclaw(true);
        const [statusRes, aliasesRes] = await Promise.all([
          fetch("/api/cli-tools/openclaw-settings"),
          fetch("/api/models/alias"),
        ]);

        const statusData = await statusRes.json().catch(() => ({}));
        const aliasesData = await aliasesRes.json().catch(() => ({}));

        if (!cancelled) {
          if (statusRes.ok) {
            setOpenclawStatus(statusData);
          } else {
            setOpenclawStatus({ installed: false, error: statusData.error || "Failed to load OpenClaw status" });
          }
          if (aliasesRes.ok) {
            setModelAliases(aliasesData.aliases || {});
          }
        }
      } catch (error) {
        if (!cancelled) {
          setOpenclawStatus({ installed: false, error: error.message });
        }
      } finally {
        if (!cancelled) setCheckingOpenclaw(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isExpanded]);

  const refreshOpenclawStatus = async () => {
    try {
      setCheckingOpenclaw(true);
      const res = await fetch("/api/cli-tools/openclaw-settings");
      const data = await res.json();
      if (res.ok) {
        setOpenclawStatus(data);
      } else {
        setOpenclawStatus({ installed: false, error: data.error || "Failed to load OpenClaw status" });
      }
    } catch (error) {
      setOpenclawStatus({ installed: false, error: error.message });
    } finally {
      setCheckingOpenclaw(false);
    }
  };

  const normalizeLocalhost = (url) => url.replace("://localhost", "://127.0.0.1");

  const getLocalBaseUrl = () => {
    if (typeof window !== "undefined") {
      return normalizeLocalhost(window.location.origin);
    }
    return DEFAULT_AXONROUTER_BASE_URL.replace("://localhost", "://127.0.0.1");
  };

  const getEffectiveBaseUrl = () => {
    const url = customBaseUrl || getLocalBaseUrl();
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };

  const getDisplayUrl = () => {
    const url = customBaseUrl || getLocalBaseUrl();
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };

  const applyMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const keyToUse = effectiveSelectedApiKey?.trim()
        || ("sk_axonrouter");

      const res = await fetch("/api/cli-tools/openclaw-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          baseUrl: getEffectiveBaseUrl(), 
          apiKey: keyToUse,
          model: selectedModel,
          agentModels,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply settings");
      return data;
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "Settings applied successfully!" });
      inv.cliTools();
      refreshOpenclawStatus();
    },
    onError: (error: Error) => {
      setMessage({ type: "error", text: error.message });
    },
  });

  const handleApplySettings = () => {
    setMessage(null);
    applyMutation.mutate();
  };

  const resetMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch("/api/cli-tools/openclaw-settings", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset settings");
      return data;
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "Settings reset successfully!" });
      inv.cliTools();
      setSelectedModelOverride("");
      setSelectedApiKey("");
      setAgentModelsOverride({});
      refreshOpenclawStatus();
    },
    onError: (error: Error) => {
      setMessage({ type: "error", text: error.message });
    },
  });

  const handleResetSettings = () => {
    setMessage(null);
    resetMutation.mutate();
  };

  const handleModelSelect = (model) => {
    if (agentModalFor) {
      setAgentModelsOverride(prev => ({ ...prev, [agentModalFor]: model.value }));
      setAgentModalFor(null);
    } else {
      setSelectedModelOverride(model.value);
    }
    setModalOpen(false);
  };

  const getManualConfigs = () => {
    const keyToUse = effectiveSelectedApiKey?.trim()
      ? effectiveSelectedApiKey
      : "sk_axonrouter";

    const settingsContent = {
      agents: {
        defaults: {
          model: {
            primary: `axonrouter/${selectedModel || "provider/model-id"}`,
          },
        },
      },
      models: {
        providers: {
          "axonrouter": {
            baseUrl: getEffectiveBaseUrl(),
            apiKey: keyToUse,
            api: "openai-completions",
            models: [
              {
                id: selectedModel || "provider/model-id",
                name: (selectedModel || "provider/model-id").split("/").pop(),
              },
            ],
          },
        },
      },
    };

    return [
      {
        filename: "~/.openclaw/settings.json",
        content: JSON.stringify(settingsContent, null, 2),
      },
    ];
  };

  return (
    <Card className="overflow-hidden">
      <CardContent>
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <ProviderIcon src="/providers/openclaw.png" alt={tool.name} size={32} className="size-8 object-contain rounded-lg" fallbackText="OC" fallbackColor={tool.color} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">{tool.name}</h3>
              {configStatus === "configured" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 rounded-full">Connected</span>}
              {configStatus === "not_configured" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-full">Not configured</span>}
              {configStatus === "other" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full">Other</span>}
            </div>
            <p className="text-xs text-text-muted truncate">{tool.description}</p>
          </div>
        </div>
        <AppIcon name="keyboard_arrow_down" className={`h-5 w-5 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} strokeWidth={2} />
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
          {checkingOpenclaw && (
            <div className="flex items-center gap-2 text-text-muted">
              <AppIcon name="progress_activity" className="h-4 w-4 animate-spin" strokeWidth={2} />
              <span>Checking Open Claw CLI...</span>
            </div>
          )}

          {!checkingOpenclaw && openclawStatus && !openclawStatus.installed && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <AppIcon name="warning" className="h-4 w-4 text-yellow-500" strokeWidth={2} />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400">Open Claw CLI not detected locally</p>
                    <p className="text-sm text-text-muted">Manual configuration is still available if axonrouter is deployed on a remote server.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-9">
                  <Button variant="secondary" size="sm" onClick={() => setShowManualConfigModal(true)} className="!bg-yellow-500/20 !border-yellow-500/40 !text-yellow-700 dark:!text-yellow-300 hover:!bg-yellow-500/30">
                    <AppIcon name="content_copy" size={18} className="mr-1" />
                    Manual Config
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!checkingOpenclaw && openclawStatus?.installed && (
            <>
              <div className="flex flex-col gap-2">
                {/* Current Base URL */}
                {openclawStatus?.settings?.models?.providers?.["axonrouter"]?.baseUrl && (
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Current</span>
                    <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                    <span className="flex-1 px-2 py-1.5 text-xs text-text-muted truncate">
                      {openclawStatus.settings.models.providers["axonrouter"].baseUrl}
                    </span>
                  </div>
                )}

                {/* Base URL */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Base URL</span>
                  <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                  <input 
                    type="text" 
                    value={getDisplayUrl()} 
                    onChange={(e) => setCustomBaseUrl(e.target.value)} 
                    placeholder="https://.../v1" 
                    className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" 
                  />
                  {customBaseUrl && customBaseUrl !== baseUrl && (
                    <button onClick={() => setCustomBaseUrl("")} className="p-1 text-text-muted hover:text-primary rounded transition-colors cursor-pointer" title="Reset to default">
                      <AppIcon name="restart_alt" size={14} />
                    </button>
                  )}
                </div>

                {/* API Key */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">API Key</span>
                  <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                  {apiKeys.length > 0 ? (
                    <select value={selectedApiKey} onChange={(e) => setSelectedApiKey(e.target.value)} className="flex-1 px-2 py-1.5 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50">
                      {apiKeys.map((key) => <option key={key.id} value={key.key}>{key.key}</option>)}
                    </select>
                  ) : (
                    <span className="flex-1 text-xs text-text-muted px-2 py-1.5">
                      sk_axonrouter (default)
                    </span>
                  )}
                </div>

                {/* Default Model */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Default Model</span>
                  <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                  <input type="text" value={selectedModel} onChange={(e) => setSelectedModelOverride(e.target.value)} placeholder="provider/model-id" className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  <button onClick={() => { setAgentModalFor(null); setModalOpen(true); }} disabled={!hasActiveProviders} className={`px-2 py-1.5 rounded border text-xs transition-colors shrink-0 whitespace-nowrap ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Select</button>
                  {selectedModel && <button onClick={() => setSelectedModelOverride("")} className="p-1 text-text-muted hover:text-red-500 rounded transition-colors cursor-pointer" title="Clear"><AppIcon name="close" size={14} /></button>}
                </div>

                {/* Per-agent model overrides */}
                {(openclawStatus.agents || []).filter(a => a.agentDir).map((agent) => (
                  <div key={agent.id} className="flex items-center gap-2 pl-4">
                    <span className="w-32 shrink-0 text-xs text-primary text-right truncate" title={agent.name || agent.id}>Agent {agent.name || agent.id}</span>
                    <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                    <input
                      type="text"
                      value={agentModelsOverride[agent.id] || ""}
                      onChange={(e) => setAgentModelsOverride(prev => ({ ...prev, [agent.id]: e.target.value }))}
                      placeholder={`default (${selectedModel || "provider/model-id"})`}
                      className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <button onClick={() => { setAgentModalFor(agent.id); setModalOpen(true); }} disabled={!hasActiveProviders} className={`px-2 py-1.5 rounded border text-xs transition-colors shrink-0 whitespace-nowrap ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Select</button>
                    {agentModelsOverride[agent.id] && <button onClick={() => setAgentModelsOverride(prev => ({ ...prev, [agent.id]: "" }))} className="p-1 text-text-muted hover:text-red-500 rounded transition-colors cursor-pointer" title="Clear"><AppIcon name="close" size={14} /></button>}
                  </div>
                ))}
              </div>

              {message && (
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                  <AppIcon name={message.type === "success" ? "check_circle" : "error"} size={14} />
                  <span>{message.text}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="default" size="sm" onClick={handleApplySettings} disabled={!selectedModel || applyMutation.isPending}>
                  {applyMutation.isPending ? <Spinner data-icon="inline-start" /> : <AppIcon name="save" data-icon="inline-start" />}
                  Apply
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetSettings} disabled={!openclawStatus?.hasAxonRouter || resetMutation.isPending}>
                  {resetMutation.isPending ? <Spinner data-icon="inline-start" /> : <AppIcon name="restore" data-icon="inline-start" />}
                  Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowManualConfigModal(true)}>
                  <AppIcon name="content_copy" size={14} className="mr-1" />Manual Config
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      </CardContent>

      <ModelSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleModelSelect}
        selectedModel={selectedModel}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Select Model for Open Claw"
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title="Open Claw - Manual Configuration"
        configs={getManualConfigs()}
      />
    </Card>
  );
}
