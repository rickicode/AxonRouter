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

export default function OpenCodeToolCard({ tool, isExpanded, onToggle, baseUrl, apiKeys, activeProviders, cloudEnabled, initialStatus, tunnelEnabled, tunnelPublicUrl, tailscaleEnabled, tailscaleUrl }) {
 const [status, setStatus] = useState(initialStatus || null);
 const [checking, setChecking] = useState(false);
 const [applying, setApplying] = useState(false);
 const [restoring, setRestoring] = useState(false);
 const [message, setMessage] = useState(null);
 const [showInstallGuide, setShowInstallGuide] = useState(false);
 const [selectedApiKey, setSelectedApiKey] = useState("");
 const [selectedModel, setSelectedModel] = useState("");
 const [subagentModel, setSubagentModel] = useState("");
 const [modalOpen, setModalOpen] = useState(false);
 const [subagentModalOpen, setSubagentModalOpen] = useState(false);
 const [modelAliases, setModelAliases] = useState({});
 const [showManualConfigModal, setShowManualConfigModal] = useState(false);
 const [customBaseUrl, setCustomBaseUrl] = useState("");
 const [selectedModels, setSelectedModels] = useState([]);
 const [activeModel, setActiveModel] = useState("");
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
  const res = await fetch("/api/cli-tools/opencode-settings");
  const data = await res.json();
  setStatus(data);
  } catch (error) {
  setStatus({ installed: false, error: error.message });
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

  // Sync models from existing config
  useEffect(() => {
  if (!(status?.opencode?.models
  || status?.opencode?.activeModel
  || status?.config?.agent?.explorer?.model?.match(/^(axonrouter|axonrouter)\//))) return;
  let cancelled = false;
  queueMicrotask(() => {
  if (cancelled) return;
  if (status?.opencode?.models) {
  setSelectedModels(status.opencode.models);
  }
  if (status?.opencode?.activeModel) {
  setActiveModel(status.opencode.activeModel);
  }
  if (status?.config?.agent?.explorer?.model?.match(/^(axonrouter|axonrouter)\//)) {
  setSubagentModel(status.config.agent.explorer.model.replace(/^(axonrouter|axonrouter)\//, ""));
  }
  });
  return () => { cancelled = true; };
  }, [status]);

 const saveModels = async (models) => {
 try {
 const keyToUse = (selectedApiKey && selectedApiKey.trim())
 ? selectedApiKey
 : (!cloudEnabled ? "sk_axonrouter" : selectedApiKey);
 const validActiveModel = models.includes(activeModel) ? activeModel : (models[0] || "");
 await fetch("/api/cli-tools/opencode-settings", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 baseUrl: getEffectiveBaseUrl(),
 apiKey: keyToUse,
 models,
 activeModel: validActiveModel,
 subagentModel,
 }),
 });
 } catch (error) {
 console.log("Error saving models:", error);
 }
 };

 const getProvider = () =>
 status?.config?.provider?.["axonrouter"] ||
 status?.config?.provider?.["axonrouter"];

 const currentBaseUrl = getProvider()?.options?.baseURL || "";

 const getConfigStatus = () => {
 if (!status?.installed) return null;
 if (!status.config) return "not_configured";
 if (!status.hasAxonRouter) return "not_configured";
 const url = getProvider()?.options?.baseURL || "";
 return matchKnownEndpoint(url, { tunnelPublicUrl, tailscaleUrl }) ? "configured" : "other";
 };

 const configStatus = getConfigStatus();

 const getEffectiveBaseUrl = () => {
 const url = customBaseUrl || baseUrl;
 return url.endsWith("/v1") ? url : `${url}/v1`;
 };

  const getDisplayUrl = () => customBaseUrl || `${baseUrl}/v1`;

  const handleApply = async () => {
 setApplying(true);
 setMessage(null);
 try {
 const keyToUse = (selectedApiKey && selectedApiKey.trim())
 ? selectedApiKey
 : (!cloudEnabled ? "sk_axonrouter" : selectedApiKey);

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
 if (res.ok) {
 // Remember the endpoint so it stays selectable next time
 rememberEndpoint(getEffectiveBaseUrl(), { tunnelPublicUrl, tailscaleUrl });
 setMessage({ type: "success", text: "Settings applied successfully!" });
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
 const res = await fetch("/api/cli-tools/opencode-settings", { method: "DELETE" });
 const data = await res.json();
 if (res.ok) {
 setMessage({ type: "success", text: "Settings reset successfully!" });
 setSelectedModel("");
 setSubagentModel("");
 setSelectedModels([]);
 setActiveModel("");
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

 const modelsToShow = selectedModels.length > 0 ? selectedModels : ["provider/model-id"];
 const activeModelToShow = activeModel || selectedModels[0] || modelsToShow[0];
 const effectiveSubagentModel = subagentModel || activeModelToShow;

 const modelsObj = {};
 modelsToShow.forEach(m => {
 modelsObj[m] = { name: m, modalities: { input: ["text", "image"], output: ["text"] } };
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
 <Card padding="xs" className="overflow-hidden">
 <button type="button" className="flex w-full items-start justify-between gap-3 text-left hover:cursor-pointer sm:items-center focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm" onClick={onToggle} aria-expanded={isExpanded}>
 <div className="flex min-w-0 items-center gap-3">
 <div className="size-8 flex items-center justify-center shrink-0">
 <Image src="/providers/opencode.png" alt={tool.name} width={32} height={32} className="size-8 object-contain rounded-sm" sizes="32px" onError={(e) => { e.target.style.display = "none"; }} loading="lazy" decoding="async" />
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
 <span>Checking OpenCode CLI...</span>
 </div>
 )}


 <HostSetupCommand
 toolId="opencode"
 baseUrl={getEffectiveBaseUrl()}
 apiKey={selectedApiKey}
 model={activeModel || selectedModels[0]}
 subagentModel={subagentModel}
 modelsList={selectedModels}
 />

 {!checking && (
 <>
 <div className="flex flex-col gap-2">
 {/* Current base URL */}
 {/* Endpoint (selector) */}
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

 {/* Current configured */}
 {getProvider()?.options?.baseURL && (
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Current</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <span className="min-w-0 truncate rounded-sm bg-surface/40 px-2 h-8 text-xs text-text-muted sm:py-2">
 {getProvider().options.baseURL}
 </span>
 </div>
 )}

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
 <span
 key={model}
 onClick={async () => {
 if (model === activeModel) {
 try {
 const res = await fetch("/api/cli-tools/opencode-settings", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ clearActiveModel: true }),
 });
 if (res.ok) {
 setActiveModel("");
 checkStatus();
 }
 } catch (error) {
 console.log("Error clearing active model:", error);
 }
 } else {
 setActiveModel(model);
 }
 }}
 className={`inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs cursor-pointer ${
 model === activeModel
 ? "bg-primary/10 text-primary border border-primary"
 : "bg-surface text-text-muted border border-transparent hover:border-border"
 }`}
 title={model === activeModel ? "Click to clear active model" : "Click to set as active"}
 >
 {model === activeModel && <Icon name="star" size={18} />}
 {model}
 <button
 onClick={async (e) => {
 e.stopPropagation();
 try {
 const res = await fetch(`/api/cli-tools/opencode-settings?model=${encodeURIComponent(model)}`, { method: "DELETE" });
 if (res.ok) {
 const newModels = selectedModels.filter((m) => m !== model);
 setSelectedModels(newModels);
 if (activeModel === model) {
 setActiveModel("");
 }
 checkStatus();
 }
 } catch (error) {
 console.log("Error removing model:", error);
 }
 }}
 className="ml-0.5 hover:text-danger"
 >
 <Icon name="close" size={18} />
 </button>
 </span>
 ))
 )}
 </div>
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <button onClick={() => setModalOpen(true)} disabled={!activeProviders?.length} className={`px-2 py-1 rounded-sm border text-xs ${activeProviders?.length ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Add Model</button>
 <span className="text-xs text-text-muted">
 {selectedModels.length > 0 && activeModel ? (
 <>Active: <span className="text-primary">{activeModel}</span></>
 ) : selectedModels.length > 0 ? (
 <span className="text-warning">Click a model to set/clear active</span>
 ) : (
 "Select models to add"
 )}
 </span>
 </div>
 </div>
 </div>

 {/* Subagent Model */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Subagent Model</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <input
 type="text"
 value={subagentModel}
 onChange={(e) => setSubagentModel(e.target.value)}
 placeholder={selectedModel || "provider/model-id (defaults to main model)"}
 className="w-full min-w-0 px-2 h-8 bg-surface rounded-sm border border-border text-xs focus:outline-none sm:py-2"
 />
 <button
 onClick={() => setSubagentModalOpen(true)}
 disabled={!activeProviders?.length}
 className={`w-full sm:w-auto rounded-sm border px-2 h-8 text-xs sm:py-2 whitespace-nowrap sm:shrink-0 ${activeProviders?.length ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
 >
 Select Model
 </button>
 {subagentModel && (
 <button
 onClick={() => setSubagentModel("")}
 className="size-8 text-text-muted hover:text-danger rounded-sm"
 title="Clear (will use main model)"
 >
 <Icon name="close" size={18} />
 </button>
 )}
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
 <Button variant="outline" size="sm" onClick={handleReset} disabled={!status.hasAxonRouter} loading={restoring}>
 <Icon className="mr-1" name="restore" size={18} />Reset
 </Button>
 <Button variant="ghost" size="sm" onClick={() => setShowManualConfigModal(true)}>
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
 if (!activeModel) setActiveModel(model.value);
 }
 }}
 onDeselect={(model) => {
 const remaining = selectedModels.filter(m => m !== model.value);
 setSelectedModels(remaining);
 if (activeModel === model.value) {
 setActiveModel(remaining[0] || "");
 }
 }}
 selectedModel={null}
 activeProviders={activeProviders}
 modelAliases={modelAliases}
 addedModelValues={selectedModels}
 closeOnSelect={false}
 title="Add Model for OpenCode"
 />
 )}

 {subagentModalOpen && (
 <ModelSelectModal
 isOpen={subagentModalOpen}
 onClose={() => setSubagentModalOpen(false)}
 onSelect={(model) => { setSubagentModel(model.value); setSubagentModalOpen(false); }}
 selectedModel={subagentModel}
 activeProviders={activeProviders}
 modelAliases={modelAliases}
 title="Select Subagent Model for OpenCode"
 />
 )}

 <ManualConfigModal
 isOpen={showManualConfigModal}
 onClose={() => setShowManualConfigModal(false)}
 title="OpenCode - Manual Configuration"
 configs={getManualConfigs()}
 />
 </Card>
 );
}
