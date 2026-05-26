"use client";

import AppIcon from "@/shared/components/AppIcon";
import { ChevronDown, LoaderCircle, TriangleAlert } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ModelSelectModal, ManualConfigModal } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useInvalidate } from "@/shared/query";
import { useMutation } from "@tanstack/react-query";

// Cloud URL system has been removed.

export default function DroidToolCard({
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
  const [droidStatus, setDroidStatus] = useState(initialStatus || null);
  const [checkingDroid, setCheckingDroid] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [modelListOverride, setModelListOverride] = useState([]);
  const [modelInput, setModelInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modelAliases, setModelAliases] = useState({});
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const effectiveSelectedApiKey = selectedApiKey || (apiKeys?.length > 0 ? apiKeys[0].key : "");

  const parsedModelList = useMemo(() => {
    const customModels = Array.isArray(droidStatus?.settings?.customModels)
      ? droidStatus.settings.customModels
      : [];
    const existingModels = customModels
      .filter((m) => m.id?.startsWith("custom:AxonRouter"))
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .map((m) => m.model)
      .filter(Boolean);
    return existingModels;
  }, [droidStatus]);

  const modelList = modelListOverride.length > 0 ? modelListOverride : parsedModelList;

  const getConfigStatus = () => {
    if (!droidStatus?.installed) return null;
    // Check for any AxonRouter model entry (support multi-model: custom:AxonRouter-0, custom:AxonRouter-1, ...)
    const currentConfig = droidStatus.settings?.customModels?.find(m => m.id?.startsWith("custom:AxonRouter"));
    if (!currentConfig) return "not_configured";
    const localMatch = currentConfig.baseUrl?.includes("localhost") || currentConfig.baseUrl?.includes("127.0.0.1");
    const tunnelMatch = baseUrl && currentConfig.baseUrl?.startsWith(baseUrl);
    if (localMatch || tunnelMatch) return "configured";
    return "other";
  };

  const configStatus = getConfigStatus();

  useEffect(() => {
    if (!isExpanded) return undefined;

    let cancelled = false;

    void (async () => {
      try {
        setCheckingDroid(true);
        const [statusRes, aliasesRes] = await Promise.all([
          fetch("/api/cli-tools/droid-settings"),
          fetch("/api/models/alias"),
        ]);

        const statusData = await statusRes.json().catch(() => ({}));
        const aliasesData = await aliasesRes.json().catch(() => ({}));

        if (!cancelled) {
          if (statusRes.ok) {
            setDroidStatus(statusData);
          } else {
            setDroidStatus({ installed: false, error: statusData.error || "Failed to load Droid status" });
          }
          if (aliasesRes.ok) {
            setModelAliases(aliasesData.aliases || {});
          }
        }
      } catch (error) {
        if (!cancelled) {
          setDroidStatus({ installed: false, error: error.message });
        }
      } finally {
        if (!cancelled) setCheckingDroid(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isExpanded]);

  const refreshDroidStatus = async () => {
    try {
      setCheckingDroid(true);
      const res = await fetch("/api/cli-tools/droid-settings");
      const data = await res.json();
      if (res.ok) {
        setDroidStatus(data);
      } else {
        setDroidStatus({ installed: false, error: data.error || "Failed to load Droid status" });
      }
    } catch (error) {
      setDroidStatus({ installed: false, error: error.message });
    } finally {
      setCheckingDroid(false);
    }
  };

  const getEffectiveBaseUrl = () => {
    const url = customBaseUrl || baseUrl;
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };

  const getDisplayUrl = () => {
    const url = customBaseUrl || baseUrl;
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };

  const addModel = () => {
    const val = modelInput.trim();
    if (!val || modelList.includes(val)) return;
    setModelListOverride((prev) => [...prev, val]);
    setModelInput("");
  };

  const removeModel = (id) => setModelListOverride((prev) => prev.filter((m) => m !== id));

  const handleModelSelect = (model) => {
    if (!model.value || modelList.includes(model.value)) return;
    setModelListOverride((prev) => [...prev, model.value]);
    setModalOpen(false);
  };

  const applyMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const keyToUse = effectiveSelectedApiKey?.trim()
        || ("sk_axonrouter");
      const res = await fetch("/api/cli-tools/droid-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: getEffectiveBaseUrl(),
          apiKey: keyToUse,
          models: modelList,
          activeModel: modelList[0] || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply settings");
      return data;
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "Settings applied successfully!" });
      inv.cliTools();
      refreshDroidStatus();
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
      const res = await fetch("/api/cli-tools/droid-settings", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset settings");
      return data;
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "Settings reset successfully!" });
      inv.cliTools();
      setModelListOverride([]);
      refreshDroidStatus();
    },
    onError: (error: Error) => {
      setMessage({ type: "error", text: error.message });
    },
  });

  const handleResetSettings = () => {
    setMessage(null);
    resetMutation.mutate();
  };

  const getManualConfigs = () => {
    const keyToUse = effectiveSelectedApiKey?.trim()
      ? effectiveSelectedApiKey
      : "sk_axonrouter";

    const settingsContent = {
      customModels: modelList.map((m, i) => ({
        model: m,
        id: `custom:AxonRouter-${i}`,
        index: i,
        baseUrl: getEffectiveBaseUrl(),
        apiKey: keyToUse,
        displayName: m,
        maxOutputTokens: 131072,
        noImageSupport: false,
        provider: "openai",
      })),
    };

    const platform = typeof navigator !== "undefined" && navigator.platform;
    const isWindows = platform?.toLowerCase().includes("win");
    const settingsPath = isWindows
      ? "%USERPROFILE%\\.factory\\settings.json"
      : "~/.factory/settings.json";

    return [
      {
        filename: settingsPath,
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
            <ProviderIcon src="/providers/droid.png" alt={tool.name} size={32} className="size-8 object-contain rounded-lg" fallbackText="DR" fallbackColor={tool.color} />
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
          {checkingDroid && (
            <div className="flex items-center gap-2 text-text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />
              <span>Checking Factory Droid CLI...</span>
            </div>
          )}

          {!checkingDroid && droidStatus && !droidStatus.installed && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="h-4 w-4 text-yellow-500" strokeWidth={2} />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400">Factory Droid CLI not detected locally</p>
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
                      <code className="block px-3 py-2 bg-black/5 dark:bg-white/5 rounded font-mono text-xs">curl -fsSL https://app.factory.ai/cli | sh</code>
                    </div>
                    <p className="text-text-muted">After installation, run <code className="px-1 bg-black/5 dark:bg-white/5 rounded">droid</code> to verify.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {!checkingDroid && droidStatus?.installed && (
            <>
              <div className="flex flex-col gap-2">
                {/* Current Base URL */}
                {droidStatus?.settings?.customModels?.find(m => m.id?.startsWith("custom:AxonRouter"))?.baseUrl && (
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Current</span>
                    <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                    <span className="flex-1 px-2 py-1.5 text-xs text-text-muted truncate">
                      {droidStatus.settings.customModels.find(m => m.id?.startsWith("custom:AxonRouter")).baseUrl}
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

                {/* Models */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                    Models {modelList.length > 0 && <span className="text-primary">({modelList.length})</span>}
                  </span>
                  <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                  <div className="flex-1 flex flex-col gap-1">
                    {/* Model list */}
                    {modelList.length > 0 && (
                      <div className="flex flex-col gap-0.5 mb-1">
                        {modelList.map((id) => (
                          <div key={id} className="flex items-center gap-1.5 px-2 py-1 bg-bg-secondary rounded border border-border">
                            <span className="flex-1 text-xs font-mono truncate">{id}</span>
                            <button onClick={() => removeModel(id)} className="text-text-muted hover:text-red-500 transition-colors shrink-0 cursor-pointer" title="Remove">
                              <AppIcon name="close" size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Model input row */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={modelInput}
                        onChange={(e) => setModelInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addModel(); } }}
                        placeholder="provider/model-id"
                        className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <button
                        onClick={() => setModalOpen(true)}
                        disabled={!hasActiveProviders}
                        className={`px-2 py-1.5 rounded border text-xs shrink-0 ${hasActiveProviders ? "bg-surface border-border hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                      >
                        Select
                      </button>
                      <button onClick={addModel} disabled={!modelInput.trim()} className="px-2 py-1.5 rounded border bg-surface border-border hover:border-primary text-xs shrink-0 disabled:opacity-50 cursor-pointer" title="Add model">
                        <AppIcon name="add" size={14} />
                      </button>
                    </div>
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
                <Button variant="default" size="sm" onClick={handleApplySettings} disabled={modelList.length === 0 || applyMutation.isPending}>
                  {applyMutation.isPending ? <Spinner data-icon="inline-start" /> : <AppIcon name="save" data-icon="inline-start" />}
                  Apply
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetSettings} disabled={!droidStatus?.hasAxonRouter || resetMutation.isPending}>
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
        selectedModel={null}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Select Model for Factory Droid"
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title="Factory Droid - Manual Configuration"
        configs={getManualConfigs()}
      />
    </Card>
  );
}
