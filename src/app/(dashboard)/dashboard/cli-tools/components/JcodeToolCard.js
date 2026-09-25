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

export default function JcodeToolCard({
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
 const [jcodeStatus, setJcodeStatus] = useState(initialStatus || null);
 const [checkingJcode, setCheckingJcode] = useState(false);
 const [applying, setApplying] = useState(false);
 const [restoring, setRestoring] = useState(false);
 const [message, setMessage] = useState(null);
 const [selectedApiKey, setSelectedApiKey] = useState("");
 const [selectedModel, setSelectedModel] = useState("");
 const [modalOpen, setModalOpen] = useState(false);
 const [modelAliases, setModelAliases] = useState({});
 const [showManualConfigModal, setShowManualConfigModal] = useState(false);
 const [customBaseUrl, setCustomBaseUrl] = useState("");
 const hasInitializedModel = useRef(false);

 const getProvider = () =>
 jcodeStatus?.config?.providers?.["axonrouter"] ||
 jcodeStatus?.config?.providers?.["axonrouter"];

 const currentBaseUrl = getProvider()?.base_url || "";

 const getConfigStatus = () => {
 if (!jcodeStatus?.installed) return null;
 if (!jcodeStatus?.hasAxonRouter) return "not_configured";
 const currentProvider = getProvider();
 if (!currentProvider) return "not_configured";
 return matchKnownEndpoint(currentProvider.base_url, { tunnelPublicUrl, tailscaleUrl }) ? "configured" : "other";
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

  const checkJcodeStatus = async () => {
  setCheckingJcode(true);
  try {
  const res = await fetch("/api/cli-tools/jcode-settings");
  const data = await res.json();
  setJcodeStatus(data);
  } catch (error) {
  setJcodeStatus({ installed: false, error: error.message });
  } finally {
  setCheckingJcode(false);
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
  setJcodeStatus(initialStatus);
  });
  return () => { cancelled = true; };
  }, [initialStatus]);

  useEffect(() => {
  if (!isExpanded) return;
  let cancelled = false;
  queueMicrotask(() => {
  if (cancelled) return;
  if (!jcodeStatus) checkJcodeStatus();
  fetchModelAliases();
  });
  return () => { cancelled = true; };
  }, [isExpanded]);

  useEffect(() => {
  if (!(jcodeStatus?.installed && !hasInitializedModel.current)) return;
  let cancelled = false;
  queueMicrotask(() => {
  if (cancelled || hasInitializedModel.current) return;
  hasInitializedModel.current = true;
  const provider = getProvider();
  if (provider) {
  if (provider.default_model) {
  setSelectedModel(provider.default_model);
  }
  // Try to match API key from env file
  const envApiKey = jcodeStatus.envApiKey;
  if (envApiKey && apiKeys?.some(k => k.key === envApiKey)) {
  setSelectedApiKey(envApiKey);
  }
  }
  });
  return () => { cancelled = true; };
  }, [jcodeStatus, apiKeys]);

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

 const res = await fetch("/api/cli-tools/jcode-settings", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 baseUrl: getEffectiveBaseUrl(),
 apiKey: keyToUse,
 models: selectedModel ? [selectedModel] : [],
 }),
 });
 const data = await res.json();
 if (res.ok) {
 // Remember the endpoint so it stays selectable next time
 rememberEndpoint(getEffectiveBaseUrl(), { tunnelPublicUrl, tailscaleUrl });
 setMessage({ type: "success", text: "Settings applied successfully!" });
 checkJcodeStatus();
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
 const res = await fetch("/api/cli-tools/jcode-settings", { method: "DELETE" });
 const data = await res.json();
 if (res.ok) {
 setMessage({ type: "success", text: "Settings reset successfully!" });
 setSelectedModel("");
 setSelectedApiKey("");
 checkJcodeStatus();
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
 setSelectedModel(model.value);
 setModalOpen(false);
 };

 const getManualConfigs = () => {
 const keyToUse = (selectedApiKey && selectedApiKey.trim())
 ? selectedApiKey
 : (!cloudEnabled ? "sk_axonrouter" : "<API_KEY_FROM_DASHBOARD>");

 const configToml = `[providers.axonrouter]
type = "openai-compatible"
base_url = "${getEffectiveBaseUrl()}"
auth = "bearer"
api_key_env = "JCODE_AXONROUTER_API_KEY"
env_file = "provider-axonrouter.env"
default_model = "${selectedModel || "cc/claude-opus-4-7"}"
requires_api_key = true

[[providers.axonrouter.models]]
id = "${selectedModel || "cc/claude-opus-4-7"}"`;

 const envContent = `JCODE_AXONROUTER_API_KEY="${keyToUse}"`;

 return [
 {
 filename: "~/.jcode/config.toml",
 content: configToml,
 },
 {
 filename: "~/.config/jcode/provider-axonrouter.env",
 content: envContent,
 },
 ];
 };

 return (
 <Card padding="xs" className="overflow-hidden">
 <button type="button" className="flex w-full items-start justify-between gap-3 text-left hover:cursor-pointer sm:items-center focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm" onClick={onToggle} aria-expanded={isExpanded}>
 <div className="flex min-w-0 items-center gap-3">
 <div className="size-8 flex items-center justify-center shrink-0">
 <Image src={tool.image || "/providers/jcode.png"} alt={tool.name} width={32} height={32} className="size-8 object-contain rounded-sm" sizes="32px" onError={(e) => { e.target.style.display = "none"; }} loading="lazy" decoding="async" />
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
 {checkingJcode && (
 <div className="flex items-center gap-2 text-text-muted">
 <Icon className="animate-spin" name="progress_activity" size={18} />
 <span>Checking jcode CLI...</span>
 </div>
 )}


 <HostSetupCommand
 toolId="jcode"
 baseUrl={getEffectiveBaseUrl()}
 apiKey={selectedApiKey}
 model={selectedModel}
 />

 {!checkingJcode && (
 <>
 <div className="flex flex-col gap-2">
 {/* Info notes */}
 {tool.notes && tool.notes.length > 0 && (
 <div className="flex flex-col gap-2 mb-2">
 {tool.notes.map((note, idx) => (
 <div key={idx} className={`flex items-start gap-2 p-3 rounded-sm text-xs ${
 note.type === "info" ? "bg-primary/10 text-primary" :
 note.type === "warning" ? "bg-warning/10 text-warning" :
 "bg-text-muted/10 text-text-muted"
 }`}>
 <Icon className="mt-0.5" name={note.type === "info" ? "info" : note.type === "warning" ? "warning" : "help"} size={18} />
 <span>{note.text}</span>
 </div>
 ))}
 </div>
 )}

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
 {getProvider()?.base_url && (
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Current</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <span className="min-w-0 truncate rounded-sm bg-surface/40 px-2 h-8 text-xs text-text-muted sm:py-2">
 {getProvider().base_url}
 </span>
 </div>
 )}

 {/* API Key */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">API Key</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <ApiKeySelect value={selectedApiKey} onChange={setSelectedApiKey} apiKeys={apiKeys} cloudEnabled={cloudEnabled} />
 </div>

 {/* Default Model */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Default Model</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <div className="relative w-full min-w-0">
 <input type="text" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} placeholder="cc/claude-opus-4-7" className="w-full min-w-0 pl-2 pr-7 h-8 bg-surface rounded-sm border border-border text-xs focus:outline-none sm:py-2" />
 {selectedModel && <button onClick={() => setSelectedModel("")} className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-danger rounded-sm" title="Clear"><Icon name="close" size={18} /></button>}
 </div>
 <button onClick={() => setModalOpen(true)} disabled={!hasActiveProviders} className={`w-full sm:w-auto rounded-sm border px-2 h-8 text-xs sm:py-2 whitespace-nowrap sm:shrink-0 ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Select</button>
 </div>

 {/* Usage hint */}
 <div className="flex flex-col gap-1 p-3 bg-primary/10 border border-primary/30 rounded-sm">
 <p className="text-xs font-medium text-primary">Usage:</p>
 <code className="text-xs font-mono text-text-muted">jcode --provider-profile axonrouter</code>
 <code className="text-xs font-mono text-text-muted">jcode --provider-profile axonrouter --model {selectedModel || "cc/claude-opus-4-7"}</code>
 </div>
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
 <Button variant="outline" size="sm" onClick={handleResetSettings} disabled={!jcodeStatus?.hasAxonRouter} loading={restoring}>
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
 title="Select Model for jcode"
 />
 )}

 <ManualConfigModal
 isOpen={showManualConfigModal}
 onClose={() => setShowManualConfigModal(false)}
 title="jcode - Manual Configuration"
 configs={getManualConfigs()}
 />
 </Card>
 );
}
