"use client";

import AppIcon from "@/shared/components/AppIcon";
import { ChevronDown, LoaderCircle, TriangleAlert } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ModelSelectModal, ManualConfigModal } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import EndpointPresetControl from "./EndpointPresetControl";
import { useInvalidate } from "@/shared/query";

export default function OpenCodeToolCard({ tool, isExpanded, onToggle, baseUrl, apiKeys, activeProviders, initialStatus }) {
  const inv = useInvalidate();
  const [status, setStatus] = useState(initialStatus || null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [selectedModelOverride, setSelectedModelOverride] = useState("");
  const [subagentModelOverride, setSubagentModelOverride] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [subagentModalOpen, setSubagentModalOpen] = useState(false);
  const [modelAliases, setModelAliases] = useState({});
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [selectedModelsOverride, setSelectedModelsOverride] = useState([]);
  const [activeModelOverride, setActiveModelOverride] = useState("");
  const effectiveSelectedApiKey = selectedApiKey || (apiKeys?.length > 0 ? apiKeys[0].key : "");

  const parsedConfig = useMemo(() => {
    const configModels = Array.isArray(status?.opencode?.models) ? status.opencode.models : [];
    const configActiveModel = status?.opencode?.activeModel || "";
    const configSubagentModel = status?.config?.agent?.explorer?.model?.startsWith("axonrouter/")
      ? status.config.agent.explorer.model.replace("axonrouter/", "")
      : "";

    return {
      selectedModels: configModels,
      activeModel: configActiveModel,
      subagentModel: configSubagentModel,
    };
  }, [status]);

  const selectedModels = selectedModelsOverride.length > 0 ? selectedModelsOverride : parsedConfig.selectedModels;
  const activeModel = activeModelOverride || parsedConfig.activeModel;
  const subagentModel = subagentModelOverride || parsedConfig.subagentModel;
  const selectedModel = activeModel;

  const getConfigStatus = () => {
    if (!status?.installed) return null;
    if (!status.config) return "not_configured";
    const url = status.config?.provider?.["axonrouter"]?.options?.baseURL || "";
    const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
    return status.hasAxonRouter && (isLocal || url.includes(baseUrl)) ? "configured" : status.hasAxonRouter ? "other" : "not_configured";
  };

  const configStatus = getConfigStatus();

  useEffect(() => {
    if (!isExpanded) return undefined;

    let cancelled = false;

    void (async () => {
      try {
        setChecking(true);
        const [statusRes, aliasesRes] = await Promise.all([
          fetch("/api/cli-tools/opencode-settings"),
          fetch("/api/models/alias"),
        ]);

        const statusData = await statusRes.json().catch(() => ({}));
        const aliasesData = await aliasesRes.json().catch(() => ({}));

        if (!cancelled) {
          if (statusRes.ok) {
            setStatus(statusData);
          } else {
            setStatus({ installed: false, error: statusData.error || "Failed to load OpenCode status" });
          }
          if (aliasesRes.ok) {
            setModelAliases(aliasesData.aliases || {});
          }
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({ installed: false, error: error.message });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isExpanded]);

  const getEffectiveBaseUrl = () => {
    const url = customBaseUrl || baseUrl;
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };

  const getDisplayUrl = () => customBaseUrl || `${baseUrl}/v1`;

  const refreshStatus = async () => {
    try {
      setChecking(true);
      const res = await fetch("/api/cli-tools/opencode-settings");
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
      } else {
        setStatus({ installed: false, error: data.error || "Failed to load OpenCode status" });
      }
    } catch (error) {
      setStatus({ installed: false, error: error.message });
    } finally {
      setChecking(false);
    }
  };

  const applyMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const keyToUse = effectiveSelectedApiKey?.trim()
        ? effectiveSelectedApiKey
        : "sk_axonrouter";

      const res = await fetch("/api/cli-tools/opencode-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          baseUrl: getEffectiveBaseUrl(), 
          apiKey: keyToUse, 
          models: selectedModels,
          activeModel: activeModel === "" ? "" : (activeModel || selectedModels[0]),
          subagentModel: subagentModel
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply settings");
      return data;
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "Settings applied successfully!" });
      inv.cliTools();
      refreshStatus();
    },
    onError: (err) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  const handleApply = () => {
    setMessage(null);
    applyMutation.mutate();
  };

  const resetMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch("/api/cli-tools/opencode-settings", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset settings");
      return data;
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "Settings reset successfully!" });
      inv.cliTools();
      setSelectedModelOverride("");
      setSubagentModelOverride("");
      setSelectedModelsOverride([]);
      setActiveModelOverride("");
      refreshStatus();
    },
    onError: (err) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  const handleReset = () => {
    setMessage(null);
    resetMutation.mutate();
  };

  const clearActiveModelMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch("/api/cli-tools/opencode-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearActiveModel: true }),
      });
      if (!res.ok) throw new Error("Failed to clear active model");
    },
    onSuccess: () => {
      inv.cliTools();
      setActiveModelOverride("");
      refreshStatus();
    },
  });

  const removeModelMutation = useMutation({
    retry: false,
    mutationFn: async (model: string) => {
      const res = await fetch(`/api/cli-tools/opencode-settings?model=${encodeURIComponent(model)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove model");
      return model;
    },
    onSuccess: (model) => {
      inv.cliTools();
      const newModels = selectedModels.filter((m) => m !== model);
      setSelectedModelsOverride(newModels);
      if (activeModel === model) setActiveModelOverride("");
      refreshStatus();
    },
  });

  const getManualConfigs = () => {
    const keyToUse = effectiveSelectedApiKey?.trim()
      ? effectiveSelectedApiKey
      : "sk_axonrouter";

    const modelsToShow = selectedModels.length > 0 ? selectedModels : ["provider/model-id"];
    const activeModelToShow = activeModel || selectedModels[0] || modelsToShow[0];
    const effectiveSubagentModel = subagentModel || activeModelToShow;

    const modelsObj = {};
    modelsToShow.forEach(m => {
      modelsObj[m] = { name: m };
    });

    return [{
      filename: "~/.config/opencode/opencode.json",
      content: JSON.stringify({
        provider: {
          "axonrouter": {
            npm: "@ai-sdk/openai-compatible",
            options: { baseURL: getEffectiveBaseUrl(), apiKey: keyToUse },
            models: modelsObj,
          },
        },
        model: `axonrouter/${activeModelToShow}`,
        agent: {
          explorer: {
            description: "Fast explorer subagent for codebase exploration",
            mode: "subagent",
            model: `axonrouter/${effectiveSubagentModel}`
          }
        }
      }, null, 2),
    }];
  };

  return (
    <Card className="overflow-hidden">
      <CardContent>
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <ProviderIcon src="/providers/opencode.png" alt={tool.name} size={32} className="size-8 object-contain rounded-lg" fallbackText="OP" fallbackColor={tool.color} />
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
        <ChevronDown className={`h-5 w-5 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} strokeWidth={2} />
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
          {checking && (
            <div className="flex items-center gap-2 text-text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />
              <span>Checking OpenCode CLI...</span>
            </div>
          )}

          {!checking && status && !status.installed && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="h-4 w-4 text-yellow-500" strokeWidth={2} />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400">OpenCode CLI not detected locally</p>
                    <p className="text-sm text-text-muted">Manual configuration is still available if axonrouter is deployed on a remote server.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-9">
                  <Button variant="secondary" size="sm" onClick={() => setShowManualConfigModal(true)} className="!bg-yellow-500/20 !border-yellow-500/40 !text-yellow-700 dark:!text-yellow-300 hover:!bg-yellow-500/30">
                    <AppIcon name="content_copy" size={18} className="mr-1" />
                    Manual Config
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowInstallGuide(!showInstallGuide)}>
                    <AppIcon name={showInstallGuide ? "expand_less" : "help"} size={18} className="mr-1" />
                    {showInstallGuide ? "Hide" : "How to Install"}
                  </Button>
                </div>
              </div>
              {showInstallGuide && (
                <div className="p-4 bg-surface border border-border rounded-lg">
                  <h4 className="font-medium mb-3">Installation Guide</h4>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-text-muted mb-1">macOS / Linux:</p>
                      <code className="block px-3 py-2 bg-black/5 dark:bg-white/5 rounded font-mono text-xs">npm install -g opencode-ai</code>
                    </div>
                    <p className="text-text-muted">After installation, run <code className="px-1 bg-black/5 dark:bg-white/5 rounded">opencode</code> to verify.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {!checking && status?.installed && (
            <>
              <div className="flex flex-col gap-2">
                <EndpointPresetControl
                  baseUrl={getDisplayUrl()}
                  apiKey={selectedApiKey}
                  onBaseUrlChange={setCustomBaseUrl}
                  onApiKeyChange={setSelectedApiKey}
                />

                {/* Current base URL */}
                {status?.config?.provider?.["axonrouter"]?.options?.baseURL && (
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Current</span>
                    <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                    <span className="flex-1 px-2 py-1.5 text-xs text-text-muted truncate">
                      {status.config.provider["axonrouter"].options.baseURL}
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
                  {customBaseUrl && customBaseUrl !== `${baseUrl}/v1` && (
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

                {/* Models */}
                <div className="flex items-start gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right pt-1">Models</span>
                  <AppIcon name="arrow_forward" size={14} className="text-text-muted mt-1.5" />
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5 min-h-[28px] px-2 py-1.5 bg-surface rounded border border-border">
                      {selectedModels.length === 0 ? (
                        <span className="text-xs text-text-muted">No models selected</span>
                      ) : (
                        selectedModels.map((model) => (
                          <span
                            key={model}
                            onClick={() => {
                              if (model === activeModel) {
                                clearActiveModelMutation.mutate();
                              } else {
                                setActiveModelOverride(model);
                              }
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer transition-colors ${
                              model === activeModel
                                ? "bg-primary/10 text-primary border border-primary"
                                : "bg-black/5 dark:bg-white/5 text-text-muted border border-transparent hover:border-border"
                            }`}
                            title={model === activeModel ? "Click to clear active model" : "Click to set as active"}
                          >
                            {model === activeModel && <AppIcon name="star" size={10} />}
                            {model}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeModelMutation.mutate(model);
                              }}
                              className="ml-0.5 hover:text-red-500 cursor-pointer"
                            >
                              <AppIcon name="close" size={12} />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setModalOpen(true)} disabled={!activeProviders?.length} className={`px-2 py-1 rounded border text-xs transition-colors ${activeProviders?.length ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Add Model</button>
                      <span className="text-xs text-text-muted">
                        {selectedModels.length > 0 && activeModel ? (
                          <>Active: <span className="text-primary">{activeModel}</span></>
                        ) : selectedModels.length > 0 ? (
                          <span className="text-yellow-500">Click a model to set/clear active</span>
                        ) : (
                          "Select models to add"
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Subagent Model */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Subagent Model</span>
                  <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                  <input 
                    type="text" 
                    value={subagentModel} 
                    onChange={(e) => setSubagentModelOverride(e.target.value)} 
                    placeholder={selectedModel || "provider/model-id (defaults to main model)"} 
                    className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" 
                  />
                  <button 
                    onClick={() => setSubagentModalOpen(true)} 
                    disabled={!activeProviders?.length} 
                    className={`px-2 py-1.5 rounded border text-xs transition-colors shrink-0 whitespace-nowrap ${activeProviders?.length ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                  >
                    Select Model
                  </button>
                  {subagentModel && (
                    <button 
                      onClick={() => setSubagentModelOverride("")} 
                      className="p-1 text-text-muted hover:text-red-500 rounded transition-colors" 
                      title="Clear (will use main model)"
                    >
                      <AppIcon name="close" size={14} />
                    </button>
                  )}
                </div>
              </div>

              {message && (
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                  <AppIcon name={message.type === "success" ? "check_circle" : "error"} size={14} />
                  <span>{message.text}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="default" size="sm" onClick={handleApply} disabled={selectedModels.length === 0 || applyMutation.isPending}>
                  {applyMutation.isPending ? <Spinner data-icon="inline-start" /> : <AppIcon name="save" data-icon="inline-start" />}
                  Apply
                </Button>
                <Button variant="outline" size="sm" onClick={handleReset} disabled={!status.hasAxonRouter || resetMutation.isPending}>
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
        onSelect={(model) => { 
          if (!selectedModels.includes(model.value)) {
            setSelectedModelsOverride([...selectedModels, model.value]);
            if (!activeModel) setActiveModelOverride(model.value);
          }
          setModalOpen(false);
        }}
        selectedModel={null}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Add Model for OpenCode"
      />

      <ModelSelectModal
        isOpen={subagentModalOpen}
        onClose={() => setSubagentModalOpen(false)}
        onSelect={(model) => { setSubagentModelOverride(model.value); setSubagentModalOpen(false); }}
        selectedModel={subagentModel}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Select Subagent Model for OpenCode"
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title="OpenCode - Manual Configuration"
        configs={getManualConfigs()}
      />
    </Card>
  );
}
