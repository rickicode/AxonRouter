"use client";

import AppIcon from "@/shared/components/AppIcon";
import { ChevronDown, CircleAlert, LoaderCircle, TriangleAlert } from "lucide-react";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ModelSelectModal } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useInvalidate } from "@/shared/query";

export default function AntigravityToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl,
  apiKeys,
  activeProviders,
  hasActiveProviders,
  initialStatus,
}) {
  const inv = useInvalidate();
  const [status, setStatus] = useState(initialStatus || null);
  const [startingStep, setStartingStep] = useState(null); // "cert" | "server" | "dns" | null
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [sudoPassword, setSudoPassword] = useState("");
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [message, setMessage] = useState(null);
  const [modelMappings, setModelMappings] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [currentEditingAlias, setCurrentEditingAlias] = useState(null);
  const [modelAliases, setModelAliases] = useState({});
  const effectiveSelectedApiKey = selectedApiKey || (apiKeys?.length > 0 ? apiKeys[0].key : "");

  useEffect(() => {
    if (!isExpanded) return undefined;

    let cancelled = false;

    void (async () => {
      try {
        const [statusRes, mappingsRes, aliasesRes] = await Promise.all([
          fetch("/api/cli-tools/antigravity-mitm"),
          fetch("/api/cli-tools/antigravity-mitm/alias?tool=antigravity"),
          fetch("/api/models/alias"),
        ]);

        const statusData = await statusRes.json().catch(() => ({}));
        const mappingsData = await mappingsRes.json().catch(() => ({}));
        const aliasesData = await aliasesRes.json().catch(() => ({}));

        if (!cancelled) {
          if (statusRes.ok) {
            setStatus(statusData);
          } else {
            setStatus({ running: false, error: statusData.error || "Failed to load MITM status" });
          }
          const aliases = mappingsData.aliases || {};
          if (Object.keys(aliases).length > 0) {
            setModelMappings(aliases);
          }
          if (aliasesRes.ok) {
            setModelAliases(aliasesData.aliases || {});
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.log("Error bootstrapping Antigravity tool:", error);
          setStatus({ running: false, error: error.message });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isExpanded]);

  const refreshStatus = async () => {
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (error) {
      console.log("Error fetching status:", error);
      setStatus({ running: false });
    }
  };

  // The API reports the actual server platform; fall back to the browser only until status loads.
  const requiresSudo = status?.requiresSudo !== false;
  const isWindows = status?.serverPlatform === "win32" || (!requiresSudo && typeof navigator !== "undefined" && navigator.userAgent?.includes("Windows"));

  const handleStart = () => {
    if (!requiresSudo || isWindows || status?.hasCachedPassword) {
      doStart("");
    } else {
      setShowPasswordModal(true);
      setMessage(null);
    }
  };

  const handleStop = () => {
    if (!requiresSudo || isWindows || status?.hasCachedPassword) {
      doStop("");
    } else {
      setShowPasswordModal(true);
      setMessage(null);
    }
  };

  const startMutation = useMutation({
    retry: false,
    mutationFn: async (password: string) => {
      const keyToUse = effectiveSelectedApiKey?.trim()
        || "sk_axonrouter";

      const res = await fetch("/api/cli-tools/antigravity-mitm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyToUse, sudoPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      return data;
    },
    onSuccess: () => {
      setStartingStep(null);
      setMessage({ type: "success", text: "MITM started" });
      inv.cliTools();
      setShowPasswordModal(false);
      setSudoPassword("");
      refreshStatus();
    },
    onError: (err) => {
      setStartingStep(null);
      setMessage({ type: "error", text: err.message });
    },
  });

  const doStart = (password: string) => {
    setMessage(null);
    setStartingStep("cert");
    startMutation.mutate(password);
  };

  const stopMutation = useMutation({
    retry: false,
    mutationFn: async (password: string) => {
      const res = await fetch("/api/cli-tools/antigravity-mitm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sudoPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to stop");
      return data;
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "MITM stopped" });
      inv.cliTools();
      setShowPasswordModal(false);
      setSudoPassword("");
      refreshStatus();
    },
    onError: (err) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  const doStop = (password: string) => {
    setMessage(null);
    stopMutation.mutate(password);
  };

  const handleConfirmPassword = () => {
    if (!sudoPassword.trim()) {
      setMessage({ type: "error", text: "Sudo password is required" });
      return;
    }
    if (status?.running) {
      doStop(sudoPassword);
    } else {
      doStart(sudoPassword);
    }
  };

  const openModelSelector = (alias) => {
    setCurrentEditingAlias(alias);
    setModalOpen(true);
  };

  const handleModelSelect = (model) => {
    if (currentEditingAlias) {
      setModelMappings(prev => ({
        ...prev,
        [currentEditingAlias]: model.value,
      }));
    }
  };

  const handleModelMappingChange = (alias, value) => {
    setModelMappings(prev => ({
      ...prev,
      [alias]: value,
    }));
  };

  const saveMappingsMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch("/api/cli-tools/antigravity-mitm/alias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "antigravity", mappings: modelMappings }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save mappings");
      }
      return res.json();
    },
    onSuccess: () => {
      inv.cliTools();
      setMessage({ type: "success", text: "Mappings saved!" });
    },
    onError: (err) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  const handleSaveMappings = () => {
    setMessage(null);
    saveMappingsMutation.mutate();
  };

  const isRunning = status?.running;

  return (
    <Card className="overflow-hidden">
      <CardContent>
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <ProviderIcon
              src="/providers/antigravity.png"
              alt={tool.name}
              size={32}
              className="size-8 object-contain rounded-lg"
              fallbackText="AG"
              fallbackColor={tool.color}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">{tool.name}</h3>
              {isRunning ? (
                <Badge variant="default">Active</Badge>
              ) : (
                <Badge variant="default">Inactive</Badge>
              )}
            </div>
            <p className="text-xs text-text-muted truncate">{tool.description}</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} strokeWidth={2} />
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
          {/* Status indicators — ordered: Cert → Server → DNS */}
          <div className="flex items-center gap-1">
            {[
              { key: "cert", label: "Cert", ok: status?.certExists },
              { key: "server", label: "Server", ok: status?.running },
              { key: "dns", label: "DNS", ok: status?.dnsConfigured },
            ].map(({ key, label, ok }, i) => {
              const isLoading = startingStep === key;
              return (
                <div key={key} className="flex items-center">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md">
                    {isLoading ? (
                      <LoaderCircle className="h-[14px] w-[14px] text-primary animate-spin" strokeWidth={2} />
                    ) : (
                      <AppIcon
                        name={ok ? "check_circle" : "radio_button_unchecked"}
                        size={14}
                        className={ok ? "text-green-500" : "text-text-muted"}
                      />
                    )}
                    <span className={`text-xs font-medium ${isLoading ? "text-primary" : ok ? "text-green-500" : "text-text-muted"}`}>
                      {label}
                    </span>
                  </div>
                  {i < 2 && <AppIcon name="arrow_forward" size={12} className="text-text-muted" />}
                </div>
              );
            })}
          </div>

          {/* Start/Stop Button */}
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={handleStop}
                disabled={startMutation.isPending || stopMutation.isPending}
                className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 font-medium text-sm flex items-center gap-2 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <AppIcon name="stop_circle" size={18} />
                Stop MITM
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={startMutation.isPending || stopMutation.isPending || !hasActiveProviders}
                className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-medium text-sm flex items-center gap-2 hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AppIcon name="play_circle" size={18} />
                Start MITM
              </button>
            )}
          </div>

          {message?.type === "error" && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600">
              <CircleAlert className="h-[14px] w-[14px]" strokeWidth={2} />
              <span>{message.text}</span>
            </div>
          )}

          {/* When running: API Key + Model Mappings */}
          {isRunning && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">API Key</span>
                <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                {apiKeys.length > 0 ? (
                  <select
                    value={selectedApiKey}
                    onChange={(e) => setSelectedApiKey(e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    {apiKeys.map((key) => <option key={key.id} value={key.key}>{key.key}</option>)}
                  </select>
                ) : (
                  <span className="flex-1 text-xs text-text-muted px-2 py-1.5">
                    {"sk_axonrouter (default)"}
                  </span>
                )}
              </div>

              {tool.defaultModels.map((model) => (
                <div key={model.alias} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">{model.name}</span>
                  <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                  <input
                    type="text"
                    value={modelMappings[model.alias] || ""}
                    onChange={(e) => handleModelMappingChange(model.alias, e.target.value)}
                    placeholder="provider/model-id"
                    className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <button
                    onClick={() => openModelSelector(model.alias)}
                    disabled={!hasActiveProviders}
                    className={`px-2 py-1.5 rounded border text-xs transition-colors shrink-0 whitespace-nowrap ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                  >
                    Select
                  </button>
                  {modelMappings[model.alias] && (
                    <button
                      onClick={() => handleModelMappingChange(model.alias, "")}
                      className="p-1 text-text-muted hover:text-red-500 rounded transition-colors"
                      title="Clear"
                    >
                      <AppIcon name="close" size={14} />
                    </button>
                  )}
                </div>
              ))}

              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                 
                  onClick={handleSaveMappings}
                  disabled={saveMappingsMutation.isPending || Object.keys(modelMappings).length === 0}
                >
                  <AppIcon name="save" size={14} className="mr-1" />
                  Save Mappings
                </Button>
              </div>
            </>
          )}

          {/* Windows admin warning */}
          {!isRunning && isWindows && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">
              <TriangleAlert className="h-[14px] w-[14px]" strokeWidth={2} />
              <span>Windows: Run terminal (AxonRouter) as Administrator to enable MITM</span>
            </div>
          )}

          {/* When stopped: how it works */}
          {!isRunning && (
            <div className="flex flex-col gap-1.5 px-1">
              <p className="text-xs text-text-muted">
                <span className="font-medium text-text-main">How it works:</span> Intercepts Antigravity traffic via DNS redirect, letting you reroute models through AxonRouter.
              </p>
              <div className="flex flex-col gap-0.5 text-[11px] text-text-muted">
                <span>1. Generates SSL cert & adds to system keychain</span>
                <span>2. Redirects <code className="text-[10px] bg-surface px-1 rounded">daily-cloudcode-pa.googleapis.com</code> → localhost</span>
                <span>3. Maps Antigravity models to any provider via AxonRouter</span>
              </div>
            </div>
          )}
        </div>
      )}

      </CardContent>

      {/* Password Modal */}
      <Dialog
        open={showPasswordModal}
        onOpenChange={(open) => {
          if (open) return;
          setShowPasswordModal(false);
          setSudoPassword("");
          setMessage(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sudo Password Required</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <TriangleAlert className="h-5 w-5 text-yellow-500" strokeWidth={2} />
            <p className="text-xs text-text-muted">Required on macOS/Linux for SSL certificate and DNS configuration</p>
          </div>

          <Input
            type="password"
            placeholder="Enter sudo password"
            value={sudoPassword}
            onChange={(e) => setSudoPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !startMutation.isPending) handleConfirmPassword();
            }}
          />

          {message && (
            <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
              <AppIcon name={message.type === "success" ? "check_circle" : "error"} size={14} />
              <span>{message.text}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
             
              onClick={() => { setShowPasswordModal(false); setSudoPassword(""); setMessage(null); }}
              disabled={startMutation.isPending || stopMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleConfirmPassword}
              disabled={startMutation.isPending || stopMutation.isPending}
            >
              {(startMutation.isPending || stopMutation.isPending) ? <Spinner data-icon="inline-start" /> : null}
              Confirm
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Model Select Modal */}
      <ModelSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleModelSelect}
        selectedModel={currentEditingAlias ? modelMappings[currentEditingAlias] : null}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title={`Select model for ${currentEditingAlias}`}
      />
    </Card>
  );
}
