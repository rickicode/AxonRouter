"use client";

import AppIcon from "@/shared/components/AppIcon";
import { ChevronDown, Info, LoaderCircle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ModelSelectModal, ManualConfigModal } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useInvalidate } from "@/shared/query";
import { useMutation } from "@tanstack/react-query";

export default function CopilotToolCard({ tool, isExpanded, onToggle, baseUrl, apiKeys, activeProviders, initialStatus }) {
  const inv = useInvalidate();
  const [status, setStatus] = useState(initialStatus || null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [modelAliases, setModelAliases] = useState({});
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);

  // Model list management
  const [modelInput, setModelInput] = useState("");
  const [modelListOverride, setModelListOverride] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const effectiveSelectedApiKey = selectedApiKey || (apiKeys?.length > 0 ? apiKeys[0].key : "");

  const parsedConfig = useMemo(() => {
    const entries = Array.isArray(status?.config) ? status.config : [];
    const entry = entries.find((e) => e.name === "AxonRouter");
    const models = Array.isArray(entry?.models) ? entry.models.map((m) => m.id).filter(Boolean) : [];
    return { modelList: models };
  }, [status]);

  const modelList = modelListOverride.length > 0 ? modelListOverride : parsedConfig.modelList;

  const getConfigStatus = () => {
    if (!status) return null;
    if (!status.hasAxonRouter) return "not_configured";
    const url = status.currentUrl || "";
    return url.includes("localhost") || url.includes("127.0.0.1") || url.includes(baseUrl)
      ? "configured" : "other";
  };

  const configStatus = getConfigStatus();
  const getEffectiveBaseUrl = () => baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;

  useEffect(() => {
    if (!isExpanded) return undefined;

    let cancelled = false;

    void (async () => {
      try {
        setChecking(true);
        const [statusRes, aliasesRes] = await Promise.all([
          fetch("/api/cli-tools/copilot-settings"),
          fetch("/api/models/alias"),
        ]);

        const statusData = await statusRes.json().catch(() => ({}));
        const aliasesData = await aliasesRes.json().catch(() => ({}));

        if (!cancelled) {
          if (statusRes.ok) {
            setStatus(statusData);
          } else {
            setStatus({ error: statusData.error || "Failed to load Copilot status" });
          }
          if (aliasesRes.ok) {
            setModelAliases(aliasesData.aliases || {});
          }
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({ error: error.message });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isExpanded]);

  const refreshStatus = async () => {
    try {
      setChecking(true);
      const res = await fetch("/api/cli-tools/copilot-settings");
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
      } else {
        setStatus({ error: data.error || "Failed to load Copilot status" });
      }
    } catch (error) {
      setStatus({ error: error.message });
    } finally {
      setChecking(false);
    }
  };

  const addModel = () => {
    const val = modelInput.trim();
    if (!val || modelList.includes(val)) return;
    setModelListOverride((prev) => [...prev, val]);
    setModelInput("");
  };

  const removeModel = (id) => setModelListOverride((prev) => prev.filter((m) => m !== id));

  const applyMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const keyToUse = effectiveSelectedApiKey?.trim()
        ? effectiveSelectedApiKey
        : "sk_axonrouter";
      const res = await fetch("/api/cli-tools/copilot-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: getEffectiveBaseUrl(), apiKey: keyToUse, models: modelList }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply settings");
      return data;
    },
    onSuccess: (data) => {
      setMessage({ type: "success", text: data.message || "Settings applied successfully!" });
      inv.cliTools();
      refreshStatus();
    },
    onError: (error: Error) => {
      setMessage({ type: "error", text: error.message });
    },
  });

  const handleApply = () => {
    setMessage(null);
    applyMutation.mutate();
  };

  const resetMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch("/api/cli-tools/copilot-settings", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset settings");
      return data;
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "Settings reset successfully!" });
      inv.cliTools();
      setModelListOverride([]);
      refreshStatus();
    },
    onError: (error: Error) => {
      setMessage({ type: "error", text: error.message });
    },
  });

  const handleReset = () => {
    setMessage(null);
    resetMutation.mutate();
  };

  const getManualConfigs = () => {
    const keyToUse = effectiveSelectedApiKey?.trim()
      ? effectiveSelectedApiKey
      : "sk_axonrouter";
    const effectiveBaseUrl = getEffectiveBaseUrl();

    return [{
      filename: "~/Library/Application Support/Code/User/chatLanguageModels.json",
      content: JSON.stringify([{
        name: "AxonRouter",
        vendor: "azure",
        apiKey: keyToUse,
        models: modelList.map((id) => ({
          id, name: id,
          url: `${effectiveBaseUrl}/chat/completions#models.ai.azure.com`,
          toolCalling: true, vision: false,
          maxInputTokens: 128000, maxOutputTokens: 16000,
        })),
      }], null, 2),
    }];
  };

  return (
    <Card className="overflow-hidden">
      <CardContent>
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <ProviderIcon src="/providers/copilot.png" alt={tool.name} size={32} className="size-8 object-contain rounded-lg" fallbackText="GH" fallbackColor={tool.color} />
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
              <span>Checking Copilot config...</span>
            </div>
          )}

          {!checking && (
            <>
              {/* Info */}
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <Info className="h-[18px] w-[18px] text-blue-500" strokeWidth={2} />
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  <p className="font-medium">Writes to <code className="px-1 bg-black/5 dark:bg-white/10 rounded">chatLanguageModels.json</code></p>
                  <p className="mt-0.5 opacity-80">Reload VS Code after applying for changes to take effect.</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {/* API Key */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-text-muted">API Key</label>
                  {apiKeys.length > 0 ? (
                    <select value={selectedApiKey} onChange={(e) => setSelectedApiKey(e.target.value)} className="px-3 py-2 bg-bg-secondary rounded-lg text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary/50">
                      {apiKeys.map((key) => <option key={key.id} value={key.key}>{key.key}</option>)}
                    </select>
                  ) : (
                    <span className="text-sm text-text-muted">
                      {"sk_axonrouter (default)"}
                    </span>
                  )}
                </div>

                {/* Model input + Add */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-text-muted">
                    Models {modelList.length > 0 && <span className="text-primary">({modelList.length} added)</span>}
                  </label>

                  {/* Model list */}
                  {modelList.length > 0 && (
                    <div className="flex flex-col gap-1 mb-1">
                      {modelList.map((id) => (
                        <div key={id} className="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary rounded-lg border border-border">
                          <span className="flex-1 text-sm font-mono truncate">{id}</span>
                          <button onClick={() => removeModel(id)} className="text-text-muted hover:text-red-500 transition-colors cursor-pointer" title="Remove">
                            <AppIcon name="close" size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={modelInput}
                      onChange={(e) => setModelInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addModel()}
                      placeholder="provider/model-id"
                      className="flex-1 px-3 py-2 bg-bg-secondary rounded-lg text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <button onClick={() => setModalOpen(true)} disabled={!activeProviders?.length} className={`px-3 py-2 rounded-lg border text-sm transition-colors shrink-0 ${activeProviders?.length ? "bg-bg-secondary border-border hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Select</button>
                    <button onClick={addModel} disabled={!modelInput.trim()} className="px-3 py-2 rounded-lg border text-sm bg-bg-secondary border-border hover:border-primary transition-colors shrink-0 disabled:opacity-50 cursor-pointer" title="Add model">
                      <AppIcon name="add" size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {message && (
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                  <AppIcon name={message.type === "success" ? "check_circle" : "error"} size={14} />
                  <span>{message.text}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="default" size="sm" onClick={handleApply} disabled={modelList.length === 0 || applyMutation.isPending}>
                  {applyMutation.isPending ? <Spinner data-icon="inline-start" /> : <AppIcon name="save" data-icon="inline-start" />}
                  Apply
                </Button>
                <Button variant="outline" size="sm" onClick={handleReset} disabled={!status?.hasAxonRouter || resetMutation.isPending}>
                  {resetMutation.isPending ? <Spinner data-icon="inline-start" /> : <AppIcon name="restore" data-icon="inline-start" />}
                  Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowManualConfigModal(true)} disabled={modelList.length === 0}>
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
        onSelect={(model) => { setModelInput(model.value); setModalOpen(false); }}
        selectedModel={modelInput}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Select Model for GitHub Copilot"
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title="GitHub Copilot - Manual Configuration"
        configs={getManualConfigs()}
      />
    </Card>
  );
}
