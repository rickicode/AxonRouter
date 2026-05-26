"use client";

import AppIcon from "@/shared/components/AppIcon";
import { ChevronDown, LoaderCircle, TriangleAlert } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ModelSelectModal, ManualConfigModal } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import EndpointPresetControl from "./EndpointPresetControl";
import { useInvalidate } from "@/shared/query";
import { useMutation } from "@tanstack/react-query";

export default function CodexToolCard({ tool, isExpanded, onToggle, baseUrl, apiKeys, activeProviders, initialStatus }) {
  const inv = useInvalidate();
  const [codexStatus, setCodexStatus] = useState(initialStatus || null);
  const [checkingCodex, setCheckingCodex] = useState(false);
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
  const effectiveSelectedApiKey = selectedApiKey || (apiKeys?.length > 0 ? apiKeys[0].key : "");

  const parsedConfigModels = useMemo(() => {
    const config = codexStatus?.config || "";
    const modelMatch = config.match(/^model\s*=\s*"([^"]+)"/m);
    const subagentModelMatch = config.match(/\[agents\.subagent\]\s*\n\s*model\s*=\s*"([^"]+)"/m);
    return {
      selectedModel: modelMatch?.[1] || "",
      subagentModel: subagentModelMatch?.[1] || "",
    };
  }, [codexStatus]);

  const selectedModel = selectedModelOverride || parsedConfigModels.selectedModel;
  const subagentModel = subagentModelOverride || parsedConfigModels.subagentModel;

  const getConfigStatus = () => {
    if (!codexStatus?.installed) return null;
    if (!codexStatus.config) return "not_configured";
    const hasBaseUrl = codexStatus.config.includes(baseUrl) || codexStatus.config.includes("localhost") || codexStatus.config.includes("127.0.0.1");
    return hasBaseUrl ? "configured" : "other";
  };

  const configStatus = getConfigStatus();

  useEffect(() => {
    if (!isExpanded) return undefined;

    let cancelled = false;

    void (async () => {
      try {
        setCheckingCodex(true);
        const [statusRes, aliasesRes] = await Promise.all([
          fetch("/api/cli-tools/codex-settings"),
          fetch("/api/models/alias"),
        ]);

        const statusData = await statusRes.json().catch(() => ({}));
        const aliasesData = await aliasesRes.json().catch(() => ({}));

        if (!cancelled) {
          if (statusRes.ok) {
            setCodexStatus(statusData);
          } else {
            setCodexStatus({ installed: false, error: statusData.error || "Failed to load Codex status" });
          }
          if (aliasesRes.ok) {
            setModelAliases(aliasesData.aliases || {});
          }
        }
      } catch (error) {
        if (!cancelled) {
          setCodexStatus({ installed: false, error: error.message });
        }
      } finally {
        if (!cancelled) setCheckingCodex(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isExpanded]);

  const getEffectiveBaseUrl = () => {
    const url = customBaseUrl || `${baseUrl}/v1`;
    // Ensure URL ends with /v1
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };
  
  const getDisplayUrl = () => customBaseUrl || `${baseUrl}/v1`;

  const refreshCodexStatus = async () => {
    try {
      setCheckingCodex(true);
      const res = await fetch("/api/cli-tools/codex-settings");
      const data = await res.json();
      if (res.ok) {
        setCodexStatus(data);
      } else {
        setCodexStatus({ installed: false, error: data.error || "Failed to load Codex status" });
      }
    } catch (error) {
      setCodexStatus({ installed: false, error: error.message });
    } finally {
      setCheckingCodex(false);
    }
  };

  const applyMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const keyToUse = effectiveSelectedApiKey?.trim()
        ? effectiveSelectedApiKey
        : "sk_axonrouter";
      const res = await fetch("/api/cli-tools/codex-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          baseUrl: getEffectiveBaseUrl(), 
          apiKey: keyToUse, 
          model: selectedModel,
          subagentModel: subagentModel || selectedModel
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply settings");
      return data;
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "Settings applied successfully!" });
      inv.cliTools();
      refreshCodexStatus();
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
      const res = await fetch("/api/cli-tools/codex-settings", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset settings");
      return data;
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "Settings reset successfully!" });
      inv.cliTools();
      setSelectedModelOverride("");
      setSubagentModelOverride("");
      refreshCodexStatus();
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
    setSelectedModelOverride(model.value);
    // Auto-set subagent model if not set
    if (!subagentModel) {
      setSubagentModelOverride(model.value);
    }
    setModalOpen(false);
  };

  const getManualConfigs = () => {
    const keyToUse = effectiveSelectedApiKey?.trim()
      ? effectiveSelectedApiKey
      : "sk_axonrouter";
    
    const effectiveSubagentModel = subagentModel || selectedModel;
    
    const configContent = `# AxonRouter Configuration for Codex CLI
model = "${selectedModel}"
model_provider = "axonrouter"

[model_providers.axonrouter]
name = "AxonRouter"
base_url = "${getEffectiveBaseUrl()}"
wire_api = "responses"

[agents.subagent]
model = "${effectiveSubagentModel}"
`;

    const authContent = JSON.stringify({
      OPENAI_API_KEY: keyToUse
    }, null, 2);

    return [
      {
        filename: "~/.codex/config.toml",
        content: configContent,
      },
      {
        filename: "~/.codex/auth.json",
        content: authContent,
      },
    ];
  };

  return (
    <Card className="overflow-hidden">
      <CardContent>
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <ProviderIcon src="/providers/codex.png" alt={tool.name} size={32} className="size-8 object-contain rounded-lg" fallbackText="CX" fallbackColor={tool.color} />
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
          {checkingCodex && (
            <div className="flex items-center gap-2 text-text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />
              <span>Checking Codex CLI...</span>
            </div>
          )}

          {!checkingCodex && codexStatus && !codexStatus.installed && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="h-4 w-4 text-yellow-500" strokeWidth={2} />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400">Codex CLI not detected locally</p>
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
                      <code className="block px-3 py-2 bg-black/5 dark:bg-white/5 rounded font-mono text-xs">npm install -g @openai/codex</code>
                    </div>
                    <p className="text-text-muted">After installation, run <code className="px-1 bg-black/5 dark:bg-white/5 rounded">codex</code> to verify.</p>
                    <div className="pt-2 border-t border-border">
                      <p className="text-text-muted text-xs">
                        Codex uses <code className="px-1 bg-black/5 dark:bg-white/5 rounded">~/.codex/auth.json</code> with <code className="px-1 bg-black/5 dark:bg-white/5 rounded">OPENAI_API_KEY</code>. 
                        Click &quot;Apply&quot; to auto-configure.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!checkingCodex && codexStatus?.installed && (
            <>
              <div className="flex flex-col gap-2">
                <EndpointPresetControl
                  baseUrl={getDisplayUrl()}
                  apiKey={selectedApiKey}
                  onBaseUrlChange={setCustomBaseUrl}
                  onApiKeyChange={setSelectedApiKey}
                />

                {/* Current Base URL */}
                {codexStatus?.config && (() => {
                  const parsed = codexStatus.config.match(/base_url\s*=\s*"([^"]+)"/);
                  const currentBaseUrl = parsed ? parsed[1] : null;
                  return currentBaseUrl ? (
                    <div className="flex items-center gap-2">
                      <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Current</span>
                      <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                      <span className="flex-1 px-2 py-1.5 text-xs text-text-muted truncate">
                        {currentBaseUrl}
                      </span>
                    </div>
                  ) : null;
                })()}

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
                    <select value={effectiveSelectedApiKey} onChange={(e) => setSelectedApiKey(e.target.value)} className="flex-1 px-2 py-1.5 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50">
                      {apiKeys.map((key) => <option key={key.id} value={key.key}>{key.key}</option>)}
                    </select>
                  ) : (
                    <span className="flex-1 text-xs text-text-muted px-2 py-1.5">
                      sk_axonrouter (default)
                    </span>
                  )}
                </div>

                {/* Model */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Model</span>
                  <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                  <input type="text" value={selectedModel} onChange={(e) => setSelectedModelOverride(e.target.value)} placeholder="provider/model-id" className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  <button onClick={() => setModalOpen(true)} disabled={!activeProviders?.length} className={`px-2 py-1.5 rounded border text-xs transition-colors shrink-0 whitespace-nowrap ${activeProviders?.length ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Select Model</button>
                  {selectedModel && <button onClick={() => setSelectedModelOverride("")} className="p-1 text-text-muted hover:text-red-500 rounded transition-colors cursor-pointer" title="Clear"><AppIcon name="close" size={14} /></button>}
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
                      className="p-1 text-text-muted hover:text-red-500 rounded transition-colors cursor-pointer" 
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
                <Button variant="default" size="sm" onClick={handleApplySettings} disabled={!selectedModel || applyMutation.isPending}>
                  {applyMutation.isPending ? <Spinner data-icon="inline-start" /> : <AppIcon name="save" data-icon="inline-start" />}
                  Apply
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetSettings} disabled={resetMutation.isPending}>
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
        title="Select Model for Codex"
      />

      <ModelSelectModal
        isOpen={subagentModalOpen}
        onClose={() => setSubagentModalOpen(false)}
        onSelect={(model) => { setSubagentModelOverride(model.value); setSubagentModalOpen(false); }}
        selectedModel={subagentModel}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Select Subagent Model for Codex"
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title="Codex CLI - Manual Configuration"
        configs={getManualConfigs()}
      />
    </Card>
  );
}
