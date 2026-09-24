"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Button, ModelSelectModal, ManualConfigModal } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import Image from "next/image";
import BaseUrlSelect from "./BaseUrlSelect";
import { rememberEndpoint } from "./cliEndpointPresets";
import ApiKeySelect from "./ApiKeySelect";
import { matchKnownEndpoint } from "./cliEndpointMatch";
import HostSetupCommand from "./HostSetupCommand";

const ENDPOINT = "/api/cli-tools/grok-build-settings";
const MODEL_SLOT = "axonrouter";
const SUBAGENT_TYPES = [
 { id: "general-purpose", label: "General-purpose", help: "Implementation, testing, and full-capability delegated tasks" },
 { id: "explore", label: "Explore", help: "Read-only codebase research and investigation" },
 { id: "plan", label: "Plan", help: "Architecture and implementation planning" },
];

function ModelField({ label, value, placeholder, onChange, onSelect, disabled, help }) {
 return (
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <div className="sm:text-right">
 <span className="text-xs font-medium text-text-main sm:text-sm">{label}</span>
 {help && <p className="mt-0.5 text-[11px] text-text-muted">{help}</p>}
 </div>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <div className="relative w-full min-w-0">
 <input
 type="text"
 value={value}
 onChange={(event) => onChange(event.target.value)}
 placeholder={placeholder}
 className="w-full min-w-0 pl-2 pr-7 h-8 bg-surface rounded-sm border border-border text-xs focus:outline-none sm:py-2"
 />
 {value && (
 <button
 type="button"
 onClick={() => onChange("")}
 className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-danger rounded-sm"
 title="Clear (inherit main model for subagents)"
 >
 <Icon name="close" size={18} />
 </button>
 )}
 </div>
 <button
 type="button"
 onClick={onSelect}
 disabled={disabled}
 className={`w-full sm:w-auto rounded-sm border px-2 h-8 text-xs sm:py-2 whitespace-nowrap sm:shrink-0 ${
 !disabled
 ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer"
 : "opacity-50 cursor-not-allowed border-border"
 }`}
 >
 Select
 </button>
 </div>
 );
}

export default function GrokBuildToolCard({
 tool,
 isExpanded,
 onToggle,
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
 const { getCaps } = useModelCaps();
 const getContextWindow = (model) => getCaps(model)?.contextWindow || null;
 const initialModel = initialStatus?.settings?.model?.model || "";
 const initialSubagents = Object.fromEntries(
 SUBAGENT_TYPES
 .map((type) => [type.id, initialStatus?.settings?.subagentModels?.[type.id]?.model])
 .filter(([, model]) => Boolean(model)),
 );
 const [grokStatus, setGrokStatus] = useState(initialStatus || null);
 const [checking, setChecking] = useState(false);
 const [applying, setApplying] = useState(false);
 const [restoring, setRestoring] = useState(false);
 const [message, setMessage] = useState(null);
 const [selectedApiKey, setSelectedApiKey] = useState(apiKeys?.[0]?.key || "");
 const [selectedModel, setSelectedModel] = useState(initialModel);
 const [subagentModels, setSubagentModels] = useState(initialSubagents);
 const [modelTarget, setModelTarget] = useState(null); // "main" or subagent type
 const [modelAliases, setModelAliases] = useState({});
 const [showManualConfigModal, setShowManualConfigModal] = useState(false);
 const [customBaseUrl, setCustomBaseUrl] = useState("");
 const hasFetchedStatus = useRef(Boolean(initialStatus));

 const configuredModel = grokStatus?.settings?.model;
 const currentBaseUrl = configuredModel?.base_url || "";
 const configStatus = !grokStatus?.installed
 ? null
 : !configuredModel?.base_url
 ? "not_configured"
 : matchKnownEndpoint(configuredModel.base_url, { tunnelPublicUrl, tailscaleUrl })
 ? "configured"
 : "other";

 const hydrateForm = useCallback((status) => {
 const mainModel = status?.settings?.model?.model || "";
 const configuredSubagents = Object.fromEntries(
 SUBAGENT_TYPES
 .map((type) => [type.id, status?.settings?.subagentModels?.[type.id]?.model])
 .filter(([, model]) => Boolean(model)),
 );
 setSelectedModel(mainModel);
 setSubagentModels(configuredSubagents);
 }, []);

 const fetchModelAliases = useCallback(async () => {
 try {
 const res = await fetch("/api/models/alias");
 const data = await res.json();
 if (res.ok) setModelAliases(data.aliases || {});
 } catch (error) {
 console.log("Error fetching model aliases:", error);
 }
 }, []);

 const checkStatus = useCallback(async ({ hydrate = false } = {}) => {
 setChecking(true);
 try {
 const res = await fetch(ENDPOINT);
 const status = await res.json();
 setGrokStatus(status);
 hasFetchedStatus.current = true;
 if (hydrate) hydrateForm(status);
 } catch (error) {
 setGrokStatus({ installed: false, error: error.message });
 } finally {
 setChecking(false);
 }
 }, [hydrateForm]);

 useEffect(() => {
 if (!isExpanded) return;
 let cancelled = false;
 const synchronize = async () => {
 if (!hasFetchedStatus.current) await checkStatus({ hydrate: true });
 if (!cancelled) await fetchModelAliases();
 };
 synchronize();
 return () => { cancelled = true; };
 }, [isExpanded, checkStatus, fetchModelAliases]);

 const getEffectiveBaseUrl = () => {
 const url = customBaseUrl || (typeof window !== "undefined"
 ? window.location.origin.replace("://localhost", "://127.0.0.1")
 : "http://127.0.0.1:3777");
 return url.endsWith("/v1") ? url : `${url}/v1`;
 };

 const handleApply = async () => {
 setApplying(true);
 setMessage(null);
 try {
 const keyToUse = selectedApiKey?.trim()
 || (apiKeys?.length > 0 ? apiKeys[0].key : null)
 || (!cloudEnabled ? "sk_axonrouter" : null);
 const mappedSubagents = {};
 for (const type of SUBAGENT_TYPES) {
 const model = subagentModels[type.id]?.trim();
 if (model) mappedSubagents[type.id] = { model, contextWindow: getContextWindow(model) };
 }

 const res = await fetch(ENDPOINT, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 baseUrl: getEffectiveBaseUrl(),
 apiKey: keyToUse,
 model: selectedModel,
 contextWindow: getContextWindow(selectedModel),
 subagentModels: mappedSubagents,
 }),
 });
 const data = await res.json();
 if (res.ok) {
 // Remember the endpoint so it stays selectable next time
 rememberEndpoint(getEffectiveBaseUrl(), { tunnelPublicUrl, tailscaleUrl });
 setMessage({ type: "success", text: "Main and subagent models applied successfully!" });
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
 const res = await fetch(ENDPOINT, { method: "DELETE" });
 const data = await res.json();
 if (res.ok) {
 setMessage({ type: "success", text: "Settings reset successfully!" });
 setSelectedModel("");
 setSubagentModels({});
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

 const handleModelSelect = (model) => {
 if (modelTarget === "main") {
 setSelectedModel(model.value);
 } else if (modelTarget) {
 setSubagentModels((current) => ({ ...current, [modelTarget]: model.value }));
 }
 setModelTarget(null);
 };

 const getManualConfigs = () => {
 const keyToUse = selectedApiKey?.trim()
 || (!cloudEnabled ? "sk_axonrouter" : "<API_KEY_FROM_DASHBOARD>");
 const baseUrl = getEffectiveBaseUrl();
 const mainModel = selectedModel || "provider/model-id";
 const blocks = [
 `[models]\ndefault = "${MODEL_SLOT}"`,
 `[model.${MODEL_SLOT}]\nmodel = "${mainModel}"\nbase_url = "${baseUrl}"\nname = "AxonRouter"\ndescription = "Routed via AxonRouter gateway"\napi_backend = "chat_completions"\napi_key = "${keyToUse}"\ncontext_window = ${getContextWindow(mainModel) || 200000}`,
 ];
 const mappings = [];
 for (const type of SUBAGENT_TYPES) {
 const model = subagentModels[type.id]?.trim();
 if (!model) continue;
 const slot = `${MODEL_SLOT}-${type.id}`;
 mappings.push(`${type.id} = "${slot}"`);
 blocks.push(`[model.${slot}]\nmodel = "${model}"\nbase_url = "${baseUrl}"\nname = "AxonRouter ${type.id}"\ndescription = "Routed via AxonRouter gateway"\napi_backend = "chat_completions"\napi_key = "${keyToUse}"\ncontext_window = ${getContextWindow(model) || 200000}`);
 }
 if (mappings.length) blocks.splice(1, 0, `[subagents.models]\n${mappings.join("\n")}`);
 return [{ filename: "~/.grok/config.toml", content: `${blocks.join("\n\n")}\n` }];
 };

 return (
 <Card padding="xs" className="overflow-hidden">
 <button type="button" className="flex w-full items-start justify-between gap-3 text-left hover:cursor-pointer sm:items-center focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm" onClick={onToggle} aria-expanded={isExpanded}>
 <div className="flex min-w-0 items-center gap-3">
 <div className="size-8 flex items-center justify-center shrink-0">
 <Image
 src={tool.image || "/providers/grok-cli.png"}
 alt={tool.name}
 width={32}
 height={32}
 className="size-8 object-contain rounded-sm"
 sizes="32px"
 onError={(e) => { e.target.style.display = "none"; }}
 loading="lazy"
 decoding="async"
 />
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
 {checking && <div className="flex items-center gap-2 text-text-muted"><Icon className="animate-spin" name="progress_activity" size={18} /><span>Checking Grok Build...</span></div>}


 <HostSetupCommand
 toolId="grok-build"
 baseUrl={getEffectiveBaseUrl()}
 apiKey={selectedApiKey}
 model={selectedModel}
 />

 {!checking && (
 <>
 <div className="flex flex-col gap-2">
 {tool.notes?.length > 0 && (
 <div className="mb-2 flex flex-col gap-2">
 {tool.notes.map((note, index) => (
 <div key={index} className={`flex items-start gap-2 rounded-sm p-3 text-xs ${note.type === "warning" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>
 <Icon className="mt-0.5" name={note.type === "warning" ? "warning" : "info"} size={18} />
 <span>{note.text}</span>
 </div>
 ))}
 </div>
 )}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Select Endpoint</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <BaseUrlSelect value={customBaseUrl || getEffectiveBaseUrl()} onChange={setCustomBaseUrl} requiresExternalUrl={tool.requiresExternalUrl} tunnelEnabled={tunnelEnabled} tunnelPublicUrl={tunnelPublicUrl} tailscaleEnabled={tailscaleEnabled} tailscaleUrl={tailscaleUrl} currentUrl={currentBaseUrl} />
 </div>

 {configuredModel?.base_url && (
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Current</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <span className="min-w-0 truncate rounded-sm bg-surface/40 px-2 h-8 text-xs text-text-muted sm:py-2">{configuredModel.base_url} · {configuredModel.model}{configuredModel.context_window ? ` · ${(configuredModel.context_window / 1000).toLocaleString()}K ctx` : ""}</span>
 </div>
 )}

 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">API Key</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <ApiKeySelect value={selectedApiKey} onChange={setSelectedApiKey} apiKeys={apiKeys} cloudEnabled={cloudEnabled} />
 </div>

 <ModelField label="Main Model" value={selectedModel} onChange={setSelectedModel} placeholder="provider/model-id" onSelect={() => setModelTarget("main")} disabled={!hasActiveProviders} />

 <div className="my-1 border-t border-border pt-3">
 <div className="mb-2 flex items-start gap-2">
 <Icon className="text-primary" name="account_tree" size={18} />
 <div>
 <p className="text-xs font-medium text-text-main">Subagent model overrides</p>
 <p className="text-[11px] text-text-muted">Leave blank to inherit Main Model. Each override keeps its own context window.</p>
 </div>
 </div>
 </div>

 {SUBAGENT_TYPES.map((type) => (
 <ModelField
 key={type.id}
 label={type.label}
 help={type.help}
 value={subagentModels[type.id] || ""}
 onChange={(value) => setSubagentModels((current) => ({ ...current, [type.id]: value }))}
 placeholder={`${selectedModel || "Main Model"} (inherit)`}
 onSelect={() => setModelTarget(type.id)}
 disabled={!hasActiveProviders}
 />
 ))}
 </div>

 {message && <div className={`flex items-center gap-2 px-2 py-2 rounded-sm text-xs ${message.type === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}><Icon name={message.type === "success" ? "check_circle" : "error"} size={18} /><span>{message.text}</span></div>}

 <div className="flex flex-col sm:flex-row sm:items-center gap-2">
 <Button variant="primary" size="sm" onClick={handleApply} disabled={!selectedModel} loading={applying} className="w-full sm:w-auto"><Icon className="mr-1" name="save" size={18} />Apply</Button>
 <Button variant="outline" size="sm" onClick={handleReset} disabled={!grokStatus?.hasAxonRouter} loading={restoring} className="w-full sm:w-auto"><Icon className="mr-1" name="restore" size={18} />Reset</Button>
 <Button variant="ghost" size="sm" onClick={() => setShowManualConfigModal(true)} className="w-full sm:w-auto"><Icon className="mr-1" name="content_copy" size={18} />Manual Config</Button>
 </div>
 </>
 )}
 </div>
 )}

 {modelTarget && (
 <ModelSelectModal
 isOpen={Boolean(modelTarget)}
 onClose={() => setModelTarget(null)}
 onSelect={handleModelSelect}
 selectedModel={modelTarget === "main" ? selectedModel : subagentModels[modelTarget] || ""}
 activeProviders={activeProviders}
 modelAliases={modelAliases}
 title={modelTarget === "main" ? "Select Main Model for Grok Build" : `Select ${SUBAGENT_TYPES.find((type) => type.id === modelTarget)?.label || "Subagent"} Model`}
 />
 )}

 <ManualConfigModal isOpen={showManualConfigModal} onClose={() => setShowManualConfigModal(false)} title="Grok Build - Manual Configuration" configs={getManualConfigs()} />
 </Card>
 );
}
