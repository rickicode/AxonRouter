"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, ModelSelectModal, ManualConfigModal } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import Image from "@/lib/ui/image.jsx";
import BaseUrlSelect from "./BaseUrlSelect";
import { rememberEndpoint } from "./cliEndpointPresets";
import ApiKeySelect from "./ApiKeySelect";
import { matchKnownEndpoint } from "./cliEndpointMatch";
import HostSetupCommand from "./HostSetupCommand";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

export default function OpenClawToolCard({
 tool,
 isExpanded,
 onToggle,
 baseUrl,
 hasActiveProviders,
 apiKeys,
 activeProviders,
 cloudEnabled,
 initialStatus,
 tunnelEnabled,
 tunnelPublicUrl,
 tailscaleEnabled,
 tailscaleUrl,
}) {
 const [openclawStatus, setOpenclawStatus] = useState(initialStatus || null);
 const [checkingOpenclaw, setCheckingOpenclaw] = useState(false);
 const [applying, setApplying] = useState(false);
 const [restoring, setRestoring] = useState(false);
 const [message, setMessage] = useState(null);
 const [selectedApiKey, setSelectedApiKey] = useState("");
 const [selectedModel, setSelectedModel] = useState("");
 const [agentModels, setAgentModels] = useState({}); // { [agentId]: modelId }
 const [agentModalFor, setAgentModalFor] = useState(null); // agentId opening modal
 const [modalOpen, setModalOpen] = useState(false);
 const [modelAliases, setModelAliases] = useState({});
 const [showManualConfigModal, setShowManualConfigModal] = useState(false);
 const [customBaseUrl, setCustomBaseUrl] = useState("");
 const hasInitializedModel = useRef(false);

 const getProvider = () =>
 openclawStatus?.settings?.models?.providers?.["axonrouter"] ||
 openclawStatus?.settings?.models?.providers?.["axonrouter"];

 const currentBaseUrl = getProvider()?.baseUrl || "";

 const getConfigStatus = () => {
 if (!openclawStatus?.installed) return null;
 const currentProvider = getProvider();
 if (!currentProvider) return "not_configured";
 return matchKnownEndpoint(currentProvider.baseUrl, { tunnelPublicUrl, tailscaleUrl }) ? "configured" : "other";
 };

  const configStatus = getConfigStatus();

  const fetchModelAliases = async () => {
  try {
  const res = await fetch("/api/models/alias");
  const data = await res.json();
  if (res.ok) setModelAliases(data.aliases || {});
  } catch (error) {
  console.log("Error fetching model aliases:", error);
  }
  };

  const checkOpenclawStatus = async () => {
  setCheckingOpenclaw(true);
  try {
  const res = await fetch("/api/cli-tools/openclaw-settings");
  const data = await res.json();
  setOpenclawStatus(data);
  } catch (error) {
  setOpenclawStatus({ installed: false, error: error.message });
  } finally {
  setCheckingOpenclaw(false);
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
  setOpenclawStatus(initialStatus);
  });
  return () => { cancelled = true; };
  }, [initialStatus]);

  useEffect(() => {
  if (!isExpanded) return;
  let cancelled = false;
  queueMicrotask(() => {
  if (cancelled) return;
  if (!openclawStatus) checkOpenclawStatus();
  fetchModelAliases();
  });
  return () => { cancelled = true; };
  }, [isExpanded]);

  useEffect(() => {
  if (!(openclawStatus?.installed && !hasInitializedModel.current)) return;
  let cancelled = false;
  queueMicrotask(() => {
  if (cancelled || hasInitializedModel.current) return;
  hasInitializedModel.current = true;
  const provider = getProvider();
  if (provider) {
  const primaryModel = openclawStatus.settings?.agents?.defaults?.model?.primary;
  if (primaryModel) setSelectedModel(primaryModel.replace(/^(axonrouter|axonrouter)\//, ""));
  if (provider.apiKey && apiKeys?.some(k => k.key === provider.apiKey)) {
  setSelectedApiKey(provider.apiKey);
  }
  }
  // Init per-agent models from enriched agents list
  const agentList = openclawStatus.agents || [];
  const initAgentModels = {};
  agentList.forEach((agent) => {
  if (agent.currentModel) initAgentModels[agent.id] = agent.currentModel;
  });
  setAgentModels(initAgentModels);
  });
  return () => { cancelled = true; };
  }, [openclawStatus, apiKeys]);

 const normalizeLocalhost = (url) => url.replace("://localhost", "://127.0.0.1");

 const getLocalBaseUrl = () => {
 if (typeof window !== "undefined") {
 return normalizeLocalhost(window.location.origin);
 }
 return "http://127.0.0.1:3777";
 };

 const getEffectiveBaseUrl = () => {
 const url = customBaseUrl || getLocalBaseUrl();
 return url.endsWith("/v1") ? url : `${url}/v1`;
 };

 const getDisplayUrl = () => {
 const url = customBaseUrl || getLocalBaseUrl();
 return url.endsWith("/v1") ? url : `${url}/v1`;
 };

 const handleApplySettings = async () => {
 setApplying(true);
 setMessage(null);
 try {
 const keyToUse = selectedApiKey?.trim()
 || (apiKeys?.length > 0 ? apiKeys[0].key : null)
 || (!cloudEnabled ? "sk_axonrouter" : null);

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
 if (res.ok) {
 // Remember the endpoint so it stays selectable next time
 rememberEndpoint(getEffectiveBaseUrl(), { tunnelPublicUrl, tailscaleUrl });
 setMessage({ type: "success", text: "Settings applied successfully!" });
 checkOpenclawStatus();
 } else {
 setMessage({ type: "error", text: data.error || "Failed to apply settings" });
 }
 } catch (error) {
 setMessage({ type: "error", text: error.message });
 } finally {
 setApplying(false);
 }
 };

 const handleResetSettings = async () => {
 setRestoring(true);
 setMessage(null);
 try {
 const res = await fetch("/api/cli-tools/openclaw-settings", { method: "DELETE" });
 const data = await res.json();
 if (res.ok) {
 setMessage({ type: "success", text: "Settings reset successfully!" });
 setSelectedModel("");
 setSelectedApiKey("");
 checkOpenclawStatus();
 } else {
 setMessage({ type: "error", text: data.error || "Failed to reset settings" });
 }
 } catch (error) {
 setMessage({ type: "error", text: error.message });
 } finally {
 setRestoring(false);
 }
 };

 const handleModelSelect = (model) => {
 if (agentModalFor) {
 setAgentModels(prev => ({ ...prev, [agentModalFor]: model.value }));
 setAgentModalFor(null);
 } else {
 setSelectedModel(model.value);
 }
 setModalOpen(false);
 };

 const getManualConfigs = () => {
 const keyToUse = (selectedApiKey && selectedApiKey.trim())
 ? selectedApiKey
 : (!cloudEnabled ? "sk_axonrouter" : "<API_KEY_FROM_DASHBOARD>");

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
 filename: "~/.openclaw/openclaw.json",
 content: JSON.stringify(settingsContent, null, 2),
 },
 ];
 };

 return (
 <Card padding="xs" className="overflow-hidden">
 <button type="button" className="flex w-full items-start justify-between gap-3 text-left hover:cursor-pointer sm:items-center focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm" onClick={onToggle} aria-expanded={isExpanded}>
 <div className="flex min-w-0 items-center gap-3">
 <div className="size-8 flex items-center justify-center shrink-0">
 <Image src="/providers/openclaw.png" alt={tool.name} width={32} height={32} className="size-8 object-contain rounded-sm" sizes="32px" onError={(e) => { e.target.style.display = "none"; }} loading="lazy" decoding="async" />
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
 {checkingOpenclaw && (
 <div className="flex items-center gap-2 text-text-muted">
 <Icon className="animate-spin" name="progress_activity" size={18} />
 <span>Checking Open Claw CLI...</span>
 </div>
 )}


 <HostSetupCommand
 toolId="openclaw"
 baseUrl={getEffectiveBaseUrl()}
 apiKey={selectedApiKey}
 model={selectedModel}
 />

 {!checkingOpenclaw && (
 <>
 <div className="flex flex-col gap-2">
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
 {getProvider()?.baseUrl && (
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Current</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <span className="min-w-0 truncate rounded-sm bg-surface/40 px-2 h-8 text-xs text-text-muted sm:py-2">
 {getProvider().baseUrl}
 </span>
 </div>
 )}

 {/* API Key */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">API Key</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <ApiKeySelect value={selectedApiKey} onChange={setSelectedApiKey} apiKeys={apiKeys} cloudEnabled={cloudEnabled} />
 </div>

 {/* Primary Model */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Primary Model</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <div className="relative w-full min-w-0">
 <input type="text" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} placeholder="provider/model-id" className="w-full min-w-0 pl-2 pr-7 h-8 bg-surface rounded-sm border border-border text-xs focus:outline-none sm:py-2" />
 {selectedModel && <button onClick={() => setSelectedModel("")} className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-danger rounded-sm" title="Clear"><Icon name="close" size={18} /></button>}
 </div>
 <button onClick={() => { setAgentModalFor(null); setModalOpen(true); }} disabled={!hasActiveProviders} className={`w-full sm:w-auto rounded-sm border px-2 h-8 text-xs sm:py-2 whitespace-nowrap sm:shrink-0 ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Select Model</button>
 </div>

 {/* Agent Models */}
 {tool.subagents?.map((agent) => (
 <div key={agent.id} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">{agent.name}</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <div className="relative w-full min-w-0">
 <input
 type="text"
 value={agentModels[agent.id] || ""}
 onChange={(e) => setAgentModels(prev => ({ ...prev, [agent.id]: e.target.value }))}
 placeholder={`default (${selectedModel || "provider/model-id"})`}
 className="w-full min-w-0 pl-2 pr-7 h-8 bg-surface rounded-sm border border-border text-xs focus:outline-none sm:py-2"
 />
 {agentModels[agent.id] && <button onClick={() => setAgentModels(prev => ({ ...prev, [agent.id]: "" }))} className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-danger rounded-sm" title="Clear"><Icon name="close" size={18} /></button>}
 </div>
 <button onClick={() => { setAgentModalFor(agent.id); setModalOpen(true); }} disabled={!hasActiveProviders} className={`w-full sm:w-auto rounded-sm border px-2 h-8 text-xs sm:py-2 whitespace-nowrap sm:shrink-0 ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Select</button>
 </div>
 ))}
 </div>

 {message && (
 <div className={`flex items-center gap-2 px-2 py-2 rounded-sm text-xs ${message.type === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
 <Icon name={message.type === "success" ? "check_circle" : "error"} size={18} />
 <span>{message.text}</span>
 </div>
 )}

 <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
 <Button variant="primary" size="sm" onClick={handleApplySettings} disabled={!selectedModel} loading={applying}>
 <Icon className="mr-1" name="save" size={18} />Apply
 </Button>
 <Button variant="outline" size="sm" onClick={handleResetSettings} disabled={!openclawStatus?.hasAxonRouter} loading={restoring}>
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
 onClose={() => setModalOpen(false)}
 onSelect={handleModelSelect}
 selectedModel={selectedModel}
 activeProviders={activeProviders}
 modelAliases={modelAliases}
 title="Select Model for Open Claw"
 />
 )}

 <ManualConfigModal
 isOpen={showManualConfigModal}
 onClose={() => setShowManualConfigModal(false)}
 title="Open Claw - Manual Configuration"
 configs={getManualConfigs()}
 />
 </Card>
 );
}
