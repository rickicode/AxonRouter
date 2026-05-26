"use client";

import AppIcon from "@/shared/components/AppIcon";
import { ChevronDown, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ModelSelectModal, ManualConfigModal } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import EndpointPresetControl from "./EndpointPresetControl";
import { useInvalidate } from "@/shared/query";

export default function ClaudeToolCard({
  tool,
  isExpanded,
  onToggle,
  activeProviders,
  modelMappings,
  onModelMappingChange,
  baseUrl,
  hasActiveProviders,
  apiKeys,
  initialStatus,
}) {
  const inv = useInvalidate();
  const [claudeStatus, setClaudeStatus] = useState(initialStatus || null);
  const [checkingClaude, setCheckingClaude] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentEditingAlias, setCurrentEditingAlias] = useState(null);
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [modelAliases, setModelAliases] = useState({});
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [ccFilterNaming, setCcFilterNaming] = useState(false);
  const hasInitializedModels = useRef(false);
  const effectiveSelectedApiKey = selectedApiKey || (apiKeys?.length > 0 ? apiKeys[0].key : "");

  const getConfigStatus = () => {
    if (!claudeStatus?.installed) return null;
    const currentUrl = claudeStatus.settings?.env?.ANTHROPIC_BASE_URL;
    if (!currentUrl) return "not_configured";
    const localMatch = currentUrl.includes("localhost") || currentUrl.includes("127.0.0.1");
    const tunnelMatch = baseUrl && currentUrl.startsWith(baseUrl);
    if (localMatch || tunnelMatch) return "configured";
    return "other";
  };

  const configStatus = getConfigStatus();

  useEffect(() => {
    if (!isExpanded) return undefined;

    let cancelled = false;

    void (async () => {
      try {
        setCheckingClaude(true);
        const [statusRes, aliasesRes] = await Promise.all([
          fetch("/api/cli-tools/claude-settings"),
          fetch("/api/models/alias"),
        ]);

        const statusData = await statusRes.json().catch(() => ({}));
        const aliasesData = await aliasesRes.json().catch(() => ({}));

        if (!cancelled) {
          if (statusRes.ok) {
            setClaudeStatus(statusData);
          } else {
            setClaudeStatus({ installed: false, error: statusData.error || "Failed to load Claude status" });
          }
          if (aliasesRes.ok) {
            setModelAliases(aliasesData.aliases || {});
          }
        }
      } catch (error) {
        if (!cancelled) {
          setClaudeStatus({ installed: false, error: error.message });
        }
      } finally {
        if (!cancelled) setCheckingClaude(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isExpanded]);

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(data => {
      setCcFilterNaming(!!data.ccFilterNaming);
    }).catch(() => {});
  }, []);

  const handleCcFilterNamingToggle = async (e) => {
    const value = e.target.checked;
    setCcFilterNaming(value);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ccFilterNaming: value }),
    }).then(() => inv.cliTools()).catch(() => {});
  };

  useEffect(() => {
    if (claudeStatus?.installed && !hasInitializedModels.current) {
      hasInitializedModels.current = true;
      const env = claudeStatus.settings?.env || {};
      
      tool.defaultModels.forEach((model) => {
        if (model.envKey) {
          const value = env[model.envKey] || model.defaultValue || "";
          // Only sync initial values from file once
          if (value) {
            onModelMappingChange(model.alias, value);
          }
        }
      });
    }
  }, [claudeStatus, tool.defaultModels, onModelMappingChange]);

  const normalizeClaudeBaseUrl = (url) => {
    const trimmed = String(url || "").trim().replace(/\/+$/, "");
    if (!trimmed) return trimmed;
    if (trimmed.endsWith("/api/v1")) return `${trimmed.slice(0, -7)}/v1`;
    if (trimmed.endsWith("/v1")) return trimmed;
    return `${trimmed}/v1`;
  };

  const getEffectiveBaseUrl = () => normalizeClaudeBaseUrl(customBaseUrl || baseUrl);

  const getDisplayUrl = () => normalizeClaudeBaseUrl(customBaseUrl || baseUrl);

  const refreshClaudeStatus = async () => {
    try {
      setCheckingClaude(true);
      const res = await fetch("/api/cli-tools/claude-settings");
      const data = await res.json();
      if (res.ok) {
        setClaudeStatus(data);
      } else {
        setClaudeStatus({ installed: false, error: data.error || "Failed to load Claude status" });
      }
    } catch (error) {
      setClaudeStatus({ installed: false, error: error.message });
    } finally {
      setCheckingClaude(false);
    }
  };

  const applyMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const env: any = { ANTHROPIC_BASE_URL: getEffectiveBaseUrl() };
      const keyToUse = effectiveSelectedApiKey?.trim() || "sk_axonrouter";
      if (keyToUse) {
        env.ANTHROPIC_AUTH_TOKEN = keyToUse;
      }
      tool.defaultModels.forEach((model) => {
        const targetModel = modelMappings[model.alias];
        if (targetModel && model.envKey) env[model.envKey] = targetModel;
      });
      const res = await fetch("/api/cli-tools/claude-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply settings");
      return { env };
    },
    onSuccess: ({ env }) => {
      setMessage({ type: "success", text: "Settings applied successfully!" });
      inv.cliTools();
      setClaudeStatus(prev => ({ ...prev, hasBackup: true, settings: { ...prev?.settings, env } }));
    },
    onError: (err) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  const handleApplySettings = () => {
    setMessage(null);
    applyMutation.mutate();
  };

  const resetMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch("/api/cli-tools/claude-settings", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset settings");
      return data;
    },
    onSuccess: (data) => {
      setMessage({ type: "success", text: "Settings reset successfully!" });
      inv.cliTools();
      setClaudeStatus(data.settings || null);
      tool.defaultModels.forEach((model) => onModelMappingChange(model.alias, model.defaultValue || ""));
      setSelectedApiKey("");
    },
    onError: (err) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  const handleResetSettings = () => {
    setMessage(null);
    resetMutation.mutate();
  };

  const openModelSelector = (alias) => {
    setCurrentEditingAlias(alias);
    setModalOpen(true);
  };

  const handleModelSelect = (model) => {
    if (currentEditingAlias) onModelMappingChange(currentEditingAlias, model.value);
  };

  // Generate settings.json content for manual copy
  const getManualConfigs = () => {
    const keyToUse = effectiveSelectedApiKey?.trim()
      ? effectiveSelectedApiKey
      : "sk_axonrouter";
    const env = { ANTHROPIC_BASE_URL: getEffectiveBaseUrl(), ANTHROPIC_AUTH_TOKEN: keyToUse };
    tool.defaultModels.forEach((model) => {
      const targetModel = modelMappings[model.alias];
      if (targetModel && model.envKey) env[model.envKey] = targetModel;
    });
    
    return [
      {
        filename: "~/.claude/settings.json",
        content: JSON.stringify({ hasCompletedOnboarding: true, env }, null, 2),
      },
    ];
  };

  return (
    <Card className="overflow-hidden">
      <CardContent>
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <ProviderIcon src="/providers/claude.png" alt={tool.name} size={32} className="size-8 object-contain rounded-lg" fallbackText="CC" fallbackColor={tool.color} />
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
          {checkingClaude && (
            <div className="flex items-center gap-2 text-text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />
              <span>Checking Claude CLI...</span>
            </div>
          )}

          {!checkingClaude && claudeStatus && !claudeStatus.installed && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="h-4 w-4 text-yellow-500" strokeWidth={2} />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400">Claude CLI not detected locally</p>
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
                      <p className="text-text-muted mb-1">macOS / Linux / Windows:</p>
                      <code className="block px-3 py-2 bg-black/5 dark:bg-white/5 rounded font-mono text-xs">npm install -g @anthropic-ai/claude-code</code>
                    </div>
                    <p className="text-text-muted">After installation, run <code className="px-1 bg-black/5 dark:bg-white/5 rounded">claude</code> to verify.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {!checkingClaude && claudeStatus?.installed && (
            <>
              <div className="flex flex-col gap-2">
                <EndpointPresetControl
                  baseUrl={getDisplayUrl()}
                  apiKey={selectedApiKey}
                  onBaseUrlChange={setCustomBaseUrl}
                  onApiKeyChange={setSelectedApiKey}
                />

                {/* Current Base URL */}
                {claudeStatus?.settings?.env?.ANTHROPIC_BASE_URL && (
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Current</span>
                    <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                    <span className="flex-1 px-2 py-1.5 text-xs text-text-muted truncate">
                      {claudeStatus.settings.env.ANTHROPIC_BASE_URL}
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
                    <select value={effectiveSelectedApiKey} onChange={(e) => setSelectedApiKey(e.target.value)} className="flex-1 px-2 py-1.5 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50">
                      {apiKeys.map((key) => <option key={key.id} value={key.key}>{key.key}</option>)}
                    </select>
                  ) : (
                    <span className="flex-1 text-xs text-text-muted px-2 py-1.5">
                      sk_axonrouter (default)
                    </span>
                  )}
                </div>

                {/* Model Mappings */}
                {tool.defaultModels.map((model) => (
                  <div key={model.alias} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">{model.name}</span>
                    <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                    <input type="text" value={modelMappings[model.alias] || ""} onChange={(e) => onModelMappingChange(model.alias, e.target.value)} placeholder="provider/model-id" className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    <button onClick={() => openModelSelector(model.alias)} disabled={!hasActiveProviders} className={`px-2 py-1.5 rounded border text-xs transition-colors shrink-0 whitespace-nowrap ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Select Model</button>
                    {modelMappings[model.alias] && <button onClick={() => onModelMappingChange(model.alias, "")} className="p-1 text-text-muted hover:text-red-500 rounded transition-colors cursor-pointer" title="Clear"><AppIcon name="close" size={14} /></button>}
                  </div>
                ))}

                {/* CC Filter Naming */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Filter naming</span>
                  <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={ccFilterNaming} onChange={handleCcFilterNamingToggle} className="w-3.5 h-3.5 accent-primary cursor-pointer" />
                    <span className="text-xs text-text-muted">Filter naming requests</span>
                  </label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-[14px] w-[14px] text-text-muted cursor-help" strokeWidth={2} />
                    </TooltipTrigger>
                    <TooltipContent>
                      Intercepts Claude Code&apos;s topic-naming requests and returns a fake response locally, saving API tokens.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {message && (
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                  <AppIcon name={message.type === "success" ? "check_circle" : "error"} size={14} />
                  <span>{message.text}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="default" size="sm" onClick={handleApplySettings} disabled={!hasActiveProviders || applyMutation.isPending}>
                  {applyMutation.isPending ? <Spinner data-icon="inline-start" /> : <AppIcon name="save" data-icon="inline-start" />}
                  Apply
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetSettings} disabled={!claudeStatus?.hasAxonRouter || resetMutation.isPending}>
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

      <ModelSelectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSelect={handleModelSelect} selectedModel={currentEditingAlias ? modelMappings[currentEditingAlias] : null} activeProviders={activeProviders} modelAliases={modelAliases} title={`Select model for ${currentEditingAlias}`} />
      
      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title="Claude CLI - Manual Configuration"
        configs={getManualConfigs()}
      />
    </Card>
  );
}
