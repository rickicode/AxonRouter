"use client";

import AppIcon from "@/shared/components/AppIcon";
import { Info, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ModelSelectModal, ManualConfigModal } from "@/shared/components";
import Image from "next/image";
import { useInvalidate } from "@/shared/query";
import { useMutation } from "@tanstack/react-query";

const ChevronDown = ({ className, strokeWidth }) => (
  <AppIcon name="keyboard_arrow_down" className={className} strokeWidth={strokeWidth} />
);

const ENDPOINT = "/api/cli-tools/cowork-settings";

const isLocalhostUrl = (url) => /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url || "");
const stripV1 = (url) => (url || "").replace(/\/v1\/?$/, "");
const ensureV1 = (url) => {
  const trimmed = (url || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
};

export default function CoworkToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl,
  apiKeys,
  activeProviders,
  hasActiveProviders,
  tunnelEnabled,
  tunnelPublicUrl,
  initialStatus,
}) {
  const inv = useInvalidate();
  const [status, setStatus] = useState(initialStatus || null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [selectedModelsOverride, setSelectedModelsOverride] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modelAliases, setModelAliases] = useState({});
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);
  const [endpointModeOverride, setEndpointModeOverride] = useState("");
  const [customBaseUrlOverride, setCustomBaseUrlOverride] = useState("");
  const effectiveSelectedApiKey = selectedApiKey || (apiKeys?.length > 0 ? apiKeys[0].key : "");

  const endpointOptions = useMemo(() => {
    const opts = [];
    if (tunnelEnabled && tunnelPublicUrl) {
      opts.push({ value: "tunnel", label: `Tunnel - ${tunnelPublicUrl}`, url: ensureV1(tunnelPublicUrl) });
    }
    opts.push({ value: "custom", label: "Custom URL (VPS / public host)", url: "" });
    return opts;
  }, [tunnelEnabled, tunnelPublicUrl]);

  const parsedConfig = useMemo(() => {
    const models = Array.isArray(status?.cowork?.models) ? status.cowork.models : [];
    const configBaseUrl = status?.cowork?.baseUrl ? stripV1(status.cowork.baseUrl) : "";
    return {
      selectedModels: models,
      customBaseUrl: configBaseUrl,
    };
  }, [status]);

  const selectedModels = selectedModelsOverride.length > 0 ? selectedModelsOverride : parsedConfig.selectedModels;
  const derivedCustomBaseUrl = customBaseUrlOverride || parsedConfig.customBaseUrl || stripV1(endpointOptions[0]?.url || "");
  const customBaseUrl = derivedCustomBaseUrl;
  const endpointMode = endpointModeOverride || (endpointOptions.find((option) => stripV1(option.url) === customBaseUrl)?.value || "custom");

  useEffect(() => {
    if (!isExpanded) return undefined;

    let cancelled = false;

    void (async () => {
      try {
        setChecking(true);
        const [statusRes, aliasesRes] = await Promise.all([
          fetch(ENDPOINT),
          fetch("/api/models/alias"),
        ]);

        const statusData = await statusRes.json().catch(() => ({}));
        const aliasesData = await aliasesRes.json().catch(() => ({}));

        if (!cancelled) {
          if (statusRes.ok) {
            setStatus(statusData);
          } else {
            setStatus({ installed: false, error: statusData.error || "Failed to load Cowork status" });
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

  const refreshStatus = async () => {
    try {
      setChecking(true);
      const res = await fetch(ENDPOINT);
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
      } else {
        setStatus({ installed: false, error: data.error || "Failed to load Cowork status" });
      }
    } catch (error) {
      setStatus({ installed: false, error: error.message });
    } finally {
      setChecking(false);
    }
  };

  const getEffectiveBaseUrl = () => ensureV1(customBaseUrl || baseUrl);

  const getConfigStatus = () => {
    if (!status?.installed) return null;
    const url = status?.cowork?.baseUrl;
    if (!url) return "not_configured";
    if (isLocalhostUrl(url)) return "invalid";
    return status.hasAxonRouter ? "configured" : "other";
  };

  const configStatus = getConfigStatus();
  const hasCustomSelectedApiKey = selectedApiKey && !apiKeys.some((key) => key.key === selectedApiKey);

  const handleEndpointModeChange = (value) => {
    setEndpointModeOverride(value);
    const opt = endpointOptions.find((o) => o.value === value);
    if (opt?.url) setCustomBaseUrlOverride(stripV1(opt.url));
    else setCustomBaseUrlOverride("");
  };

  const applyMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const effectiveUrl = getEffectiveBaseUrl();
      if (isLocalhostUrl(effectiveUrl)) throw new Error("Localhost is not allowed. Enable Tunnel or use a public host.");
      if (selectedModels.length === 0) throw new Error("Please select at least one model");

      const keyToUse = effectiveSelectedApiKey?.trim()
        || "sk_axonrouter";

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: effectiveUrl, apiKey: keyToUse, models: selectedModels }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply settings");
      return data;
    },
    onSuccess: (data) => {
      setMessage({ type: "success", text: data.message || "Settings applied" });
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
      const res = await fetch(ENDPOINT, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset");
      return data;
    },
    onSuccess: (data) => {
      setMessage({ type: "success", text: data.message || "Settings reset successfully" });
      inv.cliTools();
      setSelectedModelsOverride([]);
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

    const modelsToShow = selectedModels.length > 0 ? selectedModels : ["provider/model-id"];
    const cfg = {
      inferenceProvider: "gateway",
      inferenceGatewayBaseUrl: getEffectiveBaseUrl() || "https://your-public-host/v1",
      inferenceGatewayApiKey: keyToUse,
      inferenceModels: modelsToShow.map((name) => ({ name })),
    };

    return [{
      filename: "~/.config/Claude-3p/configLibrary/<appliedId>.json",
      content: JSON.stringify(cfg, null, 2),
    }];
  };

  return (
    <Card className="overflow-hidden">
      <CardContent>
      <div className="flex items-start justify-between gap-3 hover:cursor-pointer sm:items-center" onClick={onToggle}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <Image src={tool.image} alt={tool.name} width={32} height={32} className="size-8 object-contain rounded-lg" sizes="32px" onError={(e) => { (e.target as any).style.display = "none"; }} />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="font-medium text-sm">{tool.name}</h3>
              {configStatus === "configured" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-600 rounded-full">Connected</span>}
              {configStatus === "not_configured" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/10 text-yellow-600 rounded-full">Not configured</span>}
              {configStatus === "invalid" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-600 rounded-full">Localhost (invalid)</span>}
              {configStatus === "other" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 rounded-full">Other</span>}
            </div>
            <p className="text-xs text-text-muted truncate">{tool.description}</p>
          </div>
        </div>
        <AppIcon name="keyboard_arrow_down" className={`h-5 w-5 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} strokeWidth={2} />
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
          <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-700">
            <Info className="mt-0.5 h-4 w-4" strokeWidth={2} />
            <span>Claude Cowork runs in a sandboxed VM and cannot reach localhost. Use Tunnel or another public host.</span>
          </div>

          {checking && (
            <div className="flex items-center gap-2 text-text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />
              <span>Checking Claude Cowork...</span>
            </div>
          )}

          {!checking && status?.installed && (
            <>
              <div className="flex flex-col gap-2">
                {status?.cowork?.baseUrl && (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
                    <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">Current</span>
                    <AppIcon name="arrow_forward" size={14} className="hidden text-text-muted sm:inline" />
                    <span className="min-w-0 truncate rounded bg-surface/40 px-2 py-2 text-xs text-text-muted sm:py-1.5">{status.cowork.baseUrl}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
                  <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">Endpoint Mode</span>
                  <AppIcon name="arrow_forward" size={14} className="hidden text-text-muted sm:inline" />
                  <select value={endpointMode} onChange={(e) => handleEndpointModeChange(e.target.value)} className="w-full min-w-0 px-2 py-2 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5">
                    {endpointOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
                  <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">Base URL</span>
                  <AppIcon name="arrow_forward" size={14} className="hidden text-text-muted sm:inline" />
                  <input type="text" value={getEffectiveBaseUrl()} onChange={(e) => setCustomBaseUrlOverride(stripV1(e.target.value))} placeholder="https://your-host.com/v1" className="w-full min-w-0 px-2 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5" />
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
                  <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">API Key</span>
                  <AppIcon name="arrow_forward" size={14} className="hidden text-text-muted sm:inline" />
                  {apiKeys.length > 0 || selectedApiKey ? (
                    <select value={selectedApiKey} onChange={(e) => setSelectedApiKey(e.target.value)} className="w-full min-w-0 px-2 py-2 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5">
                      {hasCustomSelectedApiKey && <option value={selectedApiKey}>{selectedApiKey}</option>}
                      {apiKeys.map((key) => <option key={key.id} value={key.key}>{key.key}</option>)}
                    </select>
                  ) : (
                    <span className="min-w-0 rounded bg-surface/40 px-2 py-2 text-xs text-text-muted sm:py-1.5">sk_axonrouter (default)</span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr] sm:items-start sm:gap-2">
                  <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm pt-1">Models</span>
                  <AppIcon name="arrow_forward" size={14} className="hidden text-text-muted sm:inline mt-1.5" />
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5 min-h-[28px] px-2 py-1.5 bg-surface rounded border border-border">
                      {selectedModels.length === 0 ? (
                        <span className="text-xs text-text-muted">No models selected</span>
                      ) : (
                        selectedModels.map((m) => (
                          <span key={m} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-black/5 text-text-muted border border-transparent hover:border-border">
                            {m}
                            <button onClick={() => setSelectedModelsOverride((prev) => prev.filter((x) => x !== m))} className="ml-0.5 hover:text-red-500">
                              <AppIcon name="close" size={12} />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <button onClick={() => setModalOpen(true)} disabled={!hasActiveProviders} className={`self-start px-2 py-1 rounded border text-xs transition-colors ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Add Model</button>
                  </div>
                </div>
              </div>

              {message && (
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                  <AppIcon name={message.type === "success" ? "check_circle" : "error"} size={14} />
                  <span>{message.text}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Button variant="default" size="sm" onClick={handleApply} disabled={selectedModels.length === 0 || applyMutation.isPending} className="w-full sm:w-auto">
                  {applyMutation.isPending ? <Spinner data-icon="inline-start" /> : <AppIcon name="save" data-icon="inline-start" />}
                  Apply
                </Button>
                <Button variant="outline" size="sm" onClick={handleReset} disabled={!status.hasAxonRouter || resetMutation.isPending} className="w-full sm:w-auto">
                  {resetMutation.isPending ? <Spinner data-icon="inline-start" /> : <AppIcon name="restore" data-icon="inline-start" />}
                  Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowManualConfigModal(true)} className="w-full sm:w-auto">
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
          }
          setModalOpen(false);
        }}
        selectedModel={null}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Add Model for Claude Cowork"
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title="Claude Cowork - Manual Configuration"
        configs={getManualConfigs()}
      />
    </Card>
  );
}
