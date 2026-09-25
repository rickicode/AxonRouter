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

export default function DroidToolCard({
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
 const [droidStatus, setDroidStatus] = useState(initialStatus || null);
 const [checkingDroid, setCheckingDroid] = useState(false);
 const [applying, setApplying] = useState(false);
 const [restoring, setRestoring] = useState(false);
 const [message, setMessage] = useState(null);
 const [selectedApiKey, setSelectedApiKey] = useState("");
 const [modelList, setModelList] = useState([]);
 const [modelInput, setModelInput] = useState("");
 const [modalOpen, setModalOpen] = useState(false);
 const [modelAliases, setModelAliases] = useState({});
 const [showManualConfigModal, setShowManualConfigModal] = useState(false);
 const [showInstallGuide, setShowInstallGuide] = useState(false);
 const [customBaseUrl, setCustomBaseUrl] = useState("");
 const hasInitializedModel = useRef(false);

 const currentBaseUrl = droidStatus?.settings?.customModels?.find((m) => m.id?.startsWith("custom:AxonRouter"))?.baseUrl || "";

 const getConfigStatus = () => {
 if (!droidStatus?.installed) return null;
 // Check for any AxonRouter model entry (support multi-model: custom:AxonRouter-0, custom:AxonRouter-1, ...)
 const currentConfig = droidStatus.settings?.customModels?.find(m => m.id?.startsWith("custom:AxonRouter"));
 if (!currentConfig) return "not_configured";
 return matchKnownEndpoint(currentConfig.baseUrl, { tunnelPublicUrl, tailscaleUrl, cloudUrl: cloudEnabled ? CLOUD_URL : null }) ? "configured" : "other";
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

  const checkDroidStatus = async () => {
  setCheckingDroid(true);
  try {
  const res = await fetch("/api/cli-tools/droid-settings");
  const data = await res.json();
  setDroidStatus(data);
  } catch (error) {
  setDroidStatus({ installed: false, error: error.message });
  } finally {
  setCheckingDroid(false);
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
  setDroidStatus(initialStatus);
  });
  return () => { cancelled = true; };
  }, [initialStatus]);

  useEffect(() => {
  if (!isExpanded) return;
  let cancelled = false;
  queueMicrotask(() => {
  if (cancelled) return;
  if (!droidStatus) checkDroidStatus();
  fetchModelAliases();
  });
  return () => { cancelled = true; };
  }, [isExpanded]);

  // Pre-fill model list from existing config (supports multi-model)
  useEffect(() => {
  if (!(droidStatus?.installed && !hasInitializedModel.current)) return;
  let cancelled = false;
  queueMicrotask(() => {
  if (cancelled || hasInitializedModel.current) return;
  hasInitializedModel.current = true;
  const existingModels = (droidStatus.settings?.customModels || [])
  .filter(m => m.id?.startsWith("custom:AxonRouter"))
  .sort((a, b) => (a.index || 0) - (b.index || 0))
  .map(m => m.model);
  if (existingModels.length > 0) {
  setModelList(existingModels);
  } else {
  // Legacy: single model stored as custom:AxonRouter-0
  const legacy = droidStatus.settings?.customModels?.find(m => m.id === "custom:AxonRouter-0");
  if (legacy?.model) {
  setModelList([legacy.model]);
  }
  }
  });
  return () => { cancelled = true; };
  }, [droidStatus]);

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
 setModelList((prev) => [...prev, val]);
 setModelInput("");
 };

 const removeModel = (id) => setModelList((prev) => prev.filter((m) => m !== id));

 const handleModelSelect = (model) => {
 if (!model.value || modelList.includes(model.value)) return;
 setModelList((prev) => [...prev, model.value]);
 setModalOpen(false);
 };

 const handleApplySettings = async () => {
 setApplying(true);
 setMessage(null);
 try {
 const keyToUse = selectedApiKey?.trim()
 || (apiKeys?.length > 0 ? apiKeys[0].key : null)
 || (!cloudEnabled ? "sk_axonrouter" : null);

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
 if (res.ok) {
 // Remember the endpoint so it stays selectable next time
 rememberEndpoint(getEffectiveBaseUrl(), { tunnelPublicUrl, tailscaleUrl });
 setMessage({ type: "success", text: "Settings applied successfully!" });
 checkDroidStatus();
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
 const res = await fetch("/api/cli-tools/droid-settings", { method: "DELETE" });
 const data = await res.json();
 if (res.ok) {
 setMessage({ type: "success", text: "Settings reset successfully!" });
 setModelList([]);
 checkDroidStatus();
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
 <Card padding="xs" className="overflow-hidden">
 <button type="button" className="flex w-full items-start justify-between gap-3 text-left hover:cursor-pointer sm:items-center focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm" onClick={onToggle} aria-expanded={isExpanded}>
 <div className="flex min-w-0 items-center gap-3">
 <div className="size-8 flex items-center justify-center shrink-0">
 <Image src="/providers/droid.png" alt={tool.name} width={32} height={32} className="size-8 object-contain rounded-sm" sizes="32px" onError={(e) => { e.target.style.display = "none"; }} loading="lazy" decoding="async" />
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
 {checkingDroid && (
 <div className="flex items-center gap-2 text-text-muted">
 <Icon className="animate-spin" name="progress_activity" size={18} />
 <span>Checking Factory Droid CLI...</span>
 </div>
 )}


 <HostSetupCommand
 toolId="droid"
 baseUrl={getEffectiveBaseUrl()}
 apiKey={selectedApiKey}
 modelsList={modelList}
 />

 {!checkingDroid && (
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
 {droidStatus?.settings?.customModels?.find(m => m.id?.startsWith("custom:AxonRouter"))?.baseUrl && (
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Current</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <span className="min-w-0 truncate rounded-sm bg-surface/40 px-2 h-8 text-xs text-text-muted sm:py-2">
 {droidStatus.settings.customModels.find(m => m.id?.startsWith("custom:AxonRouter")).baseUrl}
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
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">
 Models {modelList.length > 0 && <span className="text-primary">({modelList.length})</span>}
 </span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <div className="flex-1 flex flex-col gap-1">
 {/* Model list */}
 {modelList.length > 0 && (
 <div className="flex flex-col gap-0.5 mb-1">
 {modelList.map((id) => (
 <div key={id} className="flex items-center gap-1.5 px-2 bg-surface rounded-sm border border-border h-8">
 <span className="flex-1 text-xs font-mono truncate">{id}</span>
 <button onClick={() => removeModel(id)} className="text-text-muted hover:text-danger shrink-0" title="Remove">
 <Icon name="close" size={18} />
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
 className="w-full min-w-0 px-2 h-8 bg-surface rounded-sm border border-border text-xs focus:outline-none sm:py-2"
 />
 <button
 onClick={() => setModalOpen(true)}
 disabled={!hasActiveProviders}
 className={`px-2 py-2 rounded-sm border text-xs shrink-0 ${hasActiveProviders ? "bg-surface border-border hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
 >
 Select
 </button>
 <button onClick={addModel} disabled={!modelInput.trim()} className="px-2 h-8 rounded-sm border bg-surface border-border hover:border-primary text-xs shrink-0 disabled:opacity-50" title="Add model">
 <Icon name="add" size={18} />
 </button>
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
 <Button variant="primary" size="sm" onClick={handleApplySettings} disabled={modelList.length === 0} loading={applying}>
 <Icon className="mr-1" name="save" size={18} />Apply
 </Button>
 <Button variant="outline" size="sm" onClick={handleResetSettings} disabled={!droidStatus?.hasAxonRouter} loading={restoring}>
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
 selectedModel={null}
 activeProviders={activeProviders}
 modelAliases={modelAliases}
 title="Select Model for Factory Droid"
 />
 )}

 <ManualConfigModal
 isOpen={showManualConfigModal}
 onClose={() => setShowManualConfigModal(false)}
 title="Factory Droid - Manual Configuration"
 configs={getManualConfigs()}
 />
 </Card>
 );
}
