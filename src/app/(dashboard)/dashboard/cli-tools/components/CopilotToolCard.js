"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, ModelSelectModal, ManualConfigModal } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import Image from "next/image";
import BaseUrlSelect from "./BaseUrlSelect";
import { rememberEndpoint } from "./cliEndpointPresets";
import ApiKeySelect from "./ApiKeySelect";
import { matchKnownEndpoint } from "./cliEndpointMatch";
import HostSetupCommand from "./HostSetupCommand";

export default function CopilotToolCard({ tool, isExpanded, onToggle, baseUrl, apiKeys, activeProviders, cloudEnabled, initialStatus, tunnelEnabled, tunnelPublicUrl, tailscaleEnabled, tailscaleUrl }) {
 const [status, setStatus] = useState(initialStatus || null);
 const [checking, setChecking] = useState(false);
 const [applying, setApplying] = useState(false);
 const [restoring, setRestoring] = useState(false);
 const [message, setMessage] = useState(null);
 const [selectedApiKey, setSelectedApiKey] = useState("");
 const [customBaseUrl, setCustomBaseUrl] = useState("");
 const [modelAliases, setModelAliases] = useState({});
 const [showManualConfigModal, setShowManualConfigModal] = useState(false);
 const [selectedModels, setSelectedModels] = useState([]);
 const [modalOpen, setModalOpen] = useState(false);
  const selectedModelsRef = useRef([]);

  useEffect(() => {
  selectedModelsRef.current = selectedModels;
  }, [selectedModels]);

  const fetchModelAliases = async () => {
  try {
  const res = await fetch("/api/models/alias");
  const data = await res.json();
  if (res.ok) setModelAliases(data.aliases || {});
  } catch (error) {
  console.log("Error fetching model aliases:", error);
  }
  };

  const checkStatus = async () => {
  setChecking(true);
  try {
  const res = await fetch("/api/cli-tools/copilot-settings");
  const data = await res.json();
  setStatus(data);
  } catch (error) {
  setStatus({ error: error.message });
  } finally {
  setChecking(false);
  }
  };

  useEffect(() => {
  if (!(apiKeys?.length > 0 && !selectedApiKey)) return;
  let cancelled = false;
  queueMicrotask(() => {
  if (cancelled) return;
  if (apiKeys?.length > 0 && !selectedApiKey) {
  setSelectedApiKey(apiKeys[0].key);
  }
  });
  return () => { cancelled = true; };
  }, [apiKeys, selectedApiKey]);

  useEffect(() => {
  if (!initialStatus) return;
  let cancelled = false;
  queueMicrotask(() => {
  if (cancelled) return;
  setStatus(initialStatus);
  });
  return () => { cancelled = true; };
  }, [initialStatus]);

  useEffect(() => {
  if (!isExpanded) return;
  let cancelled = false;
  queueMicrotask(() => {
  if (cancelled) return;
  if (!status) checkStatus();
  fetchModelAliases();
  });
  return () => { cancelled = true; };
  }, [isExpanded]);

  useEffect(() => {
  if (!(status?.config && Array.isArray(status.config) && selectedModels.length === 0)) return;
  let cancelled = false;
  queueMicrotask(() => {
  if (cancelled) return;
  if (!(status?.config && Array.isArray(status.config) && selectedModels.length === 0)) return;
  const entry = status.config.find((e) => e.name === "AxonRouter");
  if (entry?.models?.length > 0) {
  setSelectedModels(entry.models.map((m) => m.id));
  }
  });
  return () => { cancelled = true; };
  }, [status]);

 const saveModels = async (models) => {
 try {
 const keyToUse = (selectedApiKey && selectedApiKey.trim())
 ? selectedApiKey
 : (!cloudEnabled ? "sk_axonrouter" : selectedApiKey);
 await fetch("/api/cli-tools/copilot-settings", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ baseUrl: getEffectiveBaseUrl(), apiKey: keyToUse, models }),
 });
 } catch (error) {
 console.log("Error saving models:", error);
 }
 };

 const currentBaseUrl = status?.currentUrl || "";

 const getConfigStatus = () => {
 if (!status) return null;
 if (!status.hasAxonRouter) return "not_configured";
 const url = status.currentUrl || "";
 return matchKnownEndpoint(url, { tunnelPublicUrl, tailscaleUrl }) ? "configured" : "other";
 };

 const configStatus = getConfigStatus();

 const getEffectiveBaseUrl = () => {
 const url = customBaseUrl || baseUrl;
 return url.endsWith("/v1") ? url : `${url}/v1`;
 };

  const getDisplayUrl = () => customBaseUrl || `${baseUrl}/v1`;

  const removeModel = (id) => setSelectedModels((prev) => prev.filter((m) => m !== id));

  const handleApply = async () => {
 setApplying(true);
 setMessage(null);
 try {
 const keyToUse = (selectedApiKey && selectedApiKey.trim())
 ? selectedApiKey
 : (!cloudEnabled ? "sk_axonrouter" : selectedApiKey);

 const res = await fetch("/api/cli-tools/copilot-settings", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ baseUrl: getEffectiveBaseUrl(), apiKey: keyToUse, models: selectedModels }),
 });
 const data = await res.json();
 if (res.ok) {
 // Remember the endpoint so it stays selectable next time
 rememberEndpoint(getEffectiveBaseUrl(), { tunnelPublicUrl, tailscaleUrl });
 setMessage({ type: "success", text: data.message || "Settings applied! Reload VS Code." });
 checkStatus();
 } else {
 setMessage({ type: "error", text: data.error || "Failed to apply settings" });
 }
 } catch (error) {
 setMessage({ type: "error", text: error.message });
 } finally {
 setApplying(false);
 }
 };

 const handleReset = async () => {
 setRestoring(true);
 setMessage(null);
 try {
 const res = await fetch("/api/cli-tools/copilot-settings", { method: "DELETE" });
 const data = await res.json();
 if (res.ok) {
 setMessage({ type: "success", text: "Settings reset successfully!" });
 setSelectedModels([]);
 checkStatus();
 } else {
 setMessage({ type: "error", text: data.error || "Failed to reset settings" });
 }
 } catch (error) {
 setMessage({ type: "error", text: error.message });
 } finally {
 setRestoring(false);
 }
 };

 const getManualConfigs = () => {
 const keyToUse = (selectedApiKey && selectedApiKey.trim())
 ? selectedApiKey
 : (!cloudEnabled ? "sk_axonrouter" : "<API_KEY_FROM_DASHBOARD>");
 const effectiveBaseUrl = getEffectiveBaseUrl();
 const modelsToShow = selectedModels.length > 0 ? selectedModels : ["provider/model-id"];

 return [{
 filename: "~/Library/Application Support/Code/User/chatLanguageModels.json",
 content: JSON.stringify([{
 name: "AxonRouter",
 vendor: "azure",
 apiKey: keyToUse,
 models: modelsToShow.map((id) => ({
 id, name: id,
 url: `${effectiveBaseUrl}/chat/completions#models.ai.azure.com`,
 toolCalling: true, vision: false,
 maxInputTokens: 128000, maxOutputTokens: 16000,
 })),
 }], null, 2),
 }];
 };

 return (
 <Card padding="xs" className="overflow-hidden">
 <button type="button" className="flex w-full items-start justify-between gap-3 text-left hover:cursor-pointer sm:items-center focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm" onClick={onToggle} aria-expanded={isExpanded}>
 <div className="flex min-w-0 items-center gap-3">
 <div className="size-8 flex items-center justify-center shrink-0">
 <Image src="/providers/copilot.png" alt={tool.name} width={32} height={32} className="size-8 object-contain rounded-sm" sizes="32px" onError={(e) => { e.target.style.display = "none"; }} loading="lazy" decoding="async" />
 </div>
 <div className="min-w-0">
 <div className="flex min-w-0 flex-wrap items-center gap-2">
 <h3 className="font-medium text-sm">{tool.name}</h3>
 {configStatus === "configured" && <span className="px-1.5 py-1 text-[11px] font-medium bg-success/10 text-success rounded-sm">Connected</span>}
 {configStatus === "not_configured" && <span className="px-1.5 py-1 text-[11px] font-medium bg-warning/10 text-warning rounded-sm">Not configured</span>}
 {configStatus === "other" && <span className="px-1.5 py-1 text-[11px] font-medium bg-primary/10 text-primary rounded-sm">Other</span>}
 </div>
 <p className="text-xs text-text-muted truncate">{tool.description}</p>
 </div>
 </div>
 <Icon className={`text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} name="expand_more" size={18} />
 </button>

 {isExpanded && (
 <div className="mt-4 pt-3 border-t border-border flex flex-col gap-3">
 {checking && (
 <div className="flex items-center gap-2 text-text-muted">
 <Icon className="animate-spin" name="progress_activity" size={18} />
 <span>Checking Copilot config...</span>
 </div>
 )}


 <HostSetupCommand
 toolId="copilot"
 baseUrl={getEffectiveBaseUrl()}
 apiKey={selectedApiKey}
 modelsList={selectedModels}
 />

 {!checking && (
 <>
 <div className="flex items-start gap-3 p-3 bg-primary/10 border border-primary/30 rounded-sm">
 <Icon className="text-primary" name="info" size={18} />
 <div className="text-xs text-primary">
 <p className="font-medium">Writes to <code className="px-1 bg-surface-2 rounded-sm">chatLanguageModels.json</code></p>
 <p className="mt-0.5 opacity-80">Reload VS Code after applying for changes to take effect.</p>
 </div>
 </div>

 <div className="flex flex-col gap-2">
 {/* Endpoint */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Select Endpoint</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <BaseUrlSelect
 value={customBaseUrl || getDisplayUrl()}
 onChange={setCustomBaseUrl}
 requiresExternalUrl={tool.requiresExternalUrl}
 tunnelEnabled={tunnelEnabled}
 tunnelPublicUrl={tunnelPublicUrl}
 tailscaleEnabled={tailscaleEnabled}
 tailscaleUrl={tailscaleUrl}
 currentUrl={currentBaseUrl}
 />
 </div>

 {/* API Key */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">API Key</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <ApiKeySelect value={selectedApiKey} onChange={setSelectedApiKey} apiKeys={apiKeys} cloudEnabled={cloudEnabled} />
 </div>

 {/* Models */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr] sm:items-start sm:gap-2">
 <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right pt-1">Models</span>
 <Icon className="text-text-muted mt-1.5" name="arrow_forward" size={18} />
 <div className="flex-1 flex flex-col gap-2">
 <div className="flex flex-wrap gap-1.5 min-h-[28px] px-2 py-2 bg-surface rounded-sm border border-border">
 {selectedModels.length === 0 ? (
 <span className="text-xs text-text-muted">No models selected</span>
 ) : (
 selectedModels.map((model) => (
 <span key={model} className="inline-flex items-center gap-1 px-2 rounded-sm text-xs bg-surface text-text-muted border border-transparent hover:border-border h-8">
 {model}
 <button onClick={(e) => { e.stopPropagation(); removeModel(model); }} className="ml-0.5 hover:text-danger">
 <Icon name="close" size={18} />
 </button>
 </span>
 ))
 )}
 </div>
 <div>
 <button onClick={() => setModalOpen(true)} disabled={!activeProviders?.length} className={`px-2 py-1 rounded-sm border text-xs ${activeProviders?.length ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Add Model</button>
 </div>
 </div>
 </div>
 </div>

 {message && (
 <div className={`flex items-center gap-2 px-2 py-2 rounded-sm text-xs ${message.type === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
 <Icon name={message.type === "success" ? "check_circle" : "error"} size={18} />
 <span>{message.text}</span>
 </div>
 )}

 <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
 <Button variant="primary" size="sm" onClick={handleApply} disabled={selectedModels.length === 0} loading={applying}>
 <Icon className="mr-1" name="save" size={18} />Apply
 </Button>
 <Button variant="outline" size="sm" onClick={handleReset} disabled={!status?.hasAxonRouter} loading={restoring}>
 <Icon className="mr-1" name="restore" size={18} />Reset
 </Button>
 <Button variant="ghost" size="sm" onClick={() => setShowManualConfigModal(true)} disabled={selectedModels.length === 0}>
 <Icon className="mr-1" name="content_copy" size={18} />Manual Config
 </Button>
 </div>
 </>
 )}
 </div>
 )}

 {modalOpen && (
 <ModelSelectModal
 isOpen={modalOpen}
 onClose={() => {
 setModalOpen(false);
 saveModels(selectedModelsRef.current);
 }}
 onSelect={(model) => {
 if (!selectedModels.includes(model.value)) {
 setSelectedModels([...selectedModels, model.value]);
 }
 }}
 onDeselect={(model) => {
 setSelectedModels(selectedModels.filter(m => m !== model.value));
 }}
 selectedModel={null}
 activeProviders={activeProviders}
 modelAliases={modelAliases}
 addedModelValues={selectedModels}
 closeOnSelect={false}
 title="Add Model for GitHub Copilot"
 />
 )}

 <ManualConfigModal
 isOpen={showManualConfigModal}
 onClose={() => setShowManualConfigModal(false)}
 title="GitHub Copilot - Manual Configuration"
 configs={getManualConfigs()}
 />
 </Card>
 );
}
