"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, ModelSelectModal, ManualConfigModal, Tooltip } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import Image from "@/lib/ui/image.jsx";
import BaseUrlSelect from "./BaseUrlSelect";
import { rememberEndpoint } from "./cliEndpointPresets";
import ApiKeySelect from "./ApiKeySelect";
import { matchKnownEndpoint } from "./cliEndpointMatch";
import HostSetupCommand from "./HostSetupCommand";
import { stripModelContextMarker } from "open-sse/utils/modelMarkers.js";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

// Auto-compact window presets (CLAUDE_CODE_AUTO_COMPACT_WINDOW, valid 100K–1M).
// UI shows the round number; the value written is nudged down 2K to stay safely
// under the upstream hard cap.
const CONTEXT_OPTIONS = [
 { label: "Default", value: "" },
 { label: "200K", value: "198000" },
 { label: "300K", value: "298000" },
 { label: "500K", value: "498000" },
 { label: "700K", value: "698000" },
];

// Claude Code assumes a model's window is 200K unless the name carries the `[1m]`
// marker, which is why the 1M auto-compact preset only takes effect once the
// marker is applied.

export default function ClaudeToolCard({
 tool,
 isExpanded,
 onToggle,
 activeProviders,
 modelMappings,
 onModelMappingChange,
 baseUrl,
 hasActiveProviders,
 apiKeys,
 cloudEnabled,
 initialStatus,
 tunnelEnabled,
 tunnelPublicUrl,
 tailscaleEnabled,
 tailscaleUrl,
}) {
 const [claudeStatus, setClaudeStatus] = useState(initialStatus || null);
 const [checkingClaude, setCheckingClaude] = useState(false);
 const [applying, setApplying] = useState(false);
 const [restoring, setRestoring] = useState(false);
 const [message, setMessage] = useState(null);
 const [showInstallGuide, setShowInstallGuide] = useState(false);
 const [modalOpen, setModalOpen] = useState(false);
 const [currentEditingAlias, setCurrentEditingAlias] = useState(null);
 const [selectedApiKey, setSelectedApiKey] = useState("");
 const [modelAliases, setModelAliases] = useState({});
 const [showManualConfigModal, setShowManualConfigModal] = useState(false);
 const [customBaseUrl, setCustomBaseUrl] = useState("");
 const [ccFilterNaming, setCcFilterNaming] = useState(false);
 const [exaMcpEnabled, setExaMcpEnabled] = useState(false);
 const [autoCompactWindow, setAutoCompactWindow] = useState("");
 const [oneMContext, setOneMContext] = useState(false);
 const hasInitializedModels = useRef(false);

 // Claude Code only string-matches the marker against the model name, so it
 // applies to any id — the user decides which models are worth declaring as 1M.
 // Stripping first keeps repeated toggles from stacking `[1m][1m]`.
 const withContextMarker = (value, enabled) => {
 const { model } = stripModelContextMarker(value);
 return enabled ? `${model}[1m]` : model;
 };

 // Rewrite the mappings in place on toggle, so the inputs show what will be
 // written without waiting for Apply.
 const handleOneMContextToggle = (enabled) => {
 setOneMContext(enabled);
 tool.defaultModels.forEach((model) => {
 const current = modelMappings[model.alias];
 if (current) onModelMappingChange(model.alias, withContextMarker(current, enabled));
 });
 };

 const currentBaseUrl = claudeStatus?.settings?.env?.ANTHROPIC_BASE_URL || "";

 const getConfigStatus = () => {
 if (!claudeStatus?.installed) return null;
 const currentUrl = claudeStatus.settings?.env?.ANTHROPIC_BASE_URL;
 if (!currentUrl) return "not_configured";
 if (matchKnownEndpoint(currentUrl, { tunnelPublicUrl, tailscaleUrl, cloudUrl: cloudEnabled ? CLOUD_URL : null })) return "configured";
 return "other";
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

  const checkClaudeStatus = async () => {
  setCheckingClaude(true);
  try {
  const res = await fetch("/api/cli-tools/claude-settings");
  const data = await res.json();
  setClaudeStatus(data);
  setExaMcpEnabled(!!data.exaMcpEnabled);
  } catch (error) {
  setClaudeStatus({ installed: false, error: error.message });
  } finally {
  setCheckingClaude(false);
  }
  };

  useEffect(() => {
  if (apiKeys?.length > 0 && !selectedApiKey) {
  queueMicrotask(() => setSelectedApiKey(apiKeys[0].key));
  }
  }, [apiKeys, selectedApiKey]);

  useEffect(() => {
  if (initialStatus) {
  queueMicrotask(() => {
  setClaudeStatus(initialStatus);
  setExaMcpEnabled(!!initialStatus.exaMcpEnabled);
  });
  }
  }, [initialStatus]);

  useEffect(() => {
  const v = claudeStatus?.settings?.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
  queueMicrotask(() => setAutoCompactWindow(v || ""));
  }, [claudeStatus?.settings?.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW]);

  useEffect(() => {
  const env = claudeStatus?.settings?.env;
  if (!env) return;
  const oneM = tool.defaultModels.some((model) => env[model.envKey]?.endsWith("[1m]"));
  queueMicrotask(() => setOneMContext(oneM));
  }, [claudeStatus?.settings?.env, tool.defaultModels]);

useEffect(() => {
    if (!isExpanded) return;
    queueMicrotask(() => {
      if (!claudeStatus) checkClaudeStatus();
      fetchModelAliases();
    });
  }, [isExpanded]);

  useEffect(() => {
  fetch("/api/settings").then(r => r.json()).then(data => {
  setCcFilterNaming(!!data.ccFilterNaming);
  }).catch(() => {});
  }, []);

  const handleCcFilterNamingToggle = async (e) => {
  const value = e.target.checked;
  setCcFilterNaming(value);
  await fetch("/api/settings", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ccFilterNaming: value }),
  }).catch(() => {});
  };

  useEffect(() => {
  if (claudeStatus?.installed && !hasInitializedModels.current) {
  hasInitializedModels.current = true;
  const env = claudeStatus.settings?.env || {};

  tool.defaultModels.forEach((model) => {
  if (model.envKey) {
  const value = env[model.envKey] || model.defaultValue || "";
  if (value) {
  onModelMappingChange(model.alias, value);
  }
  }
  });
  const tokenFromFile = env.ANTHROPIC_AUTH_TOKEN;
  if (tokenFromFile) {
  queueMicrotask(() => setSelectedApiKey(tokenFromFile));
  }
  }
  }, [claudeStatus, apiKeys, tool.defaultModels, onModelMappingChange]);

  const getEffectiveBaseUrl = () => {
 const url = customBaseUrl || baseUrl;
 return url.endsWith("/v1") ? url : `${url}/v1`;
 };

 const getDisplayUrl = () => {
 const url = customBaseUrl || baseUrl;
 return url.endsWith("/v1") ? url : `${url}/v1`;
 };

 const handleApplySettings = async () => {
 setApplying(true);
 setMessage(null);
 try {
 const env = { ANTHROPIC_BASE_URL: getEffectiveBaseUrl() };

 // Get key from dropdown, fallback to first key or sk_axonrouter for localhost
 const keyToUse = selectedApiKey?.trim()
 || (apiKeys?.length > 0 ? apiKeys[0].key : null)
 || (!cloudEnabled ? "sk_axonrouter" : null);

 if (keyToUse) {
 env.ANTHROPIC_AUTH_TOKEN = keyToUse;
 }

 tool.defaultModels.forEach((model) => {
 const targetModel = modelMappings[model.alias];
 // Written verbatim — the input may hold a marker typed by hand, and the
 // toggle already decided the marker when it was flipped.
 if (targetModel && model.envKey) env[model.envKey] = targetModel;
 });
 if (autoCompactWindow) {
 env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = autoCompactWindow;
 }
 const res = await fetch("/api/cli-tools/claude-settings", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ env, exaMcpEnabled, autoCompactWindow }),
 });
 const data = await res.json();
 if (res.ok) {
 // Remember the endpoint so it stays selectable next time
 rememberEndpoint(getEffectiveBaseUrl(), { tunnelPublicUrl, tailscaleUrl });
 setMessage({ type: "success", text: "Settings applied successfully!" });
 setClaudeStatus(prev => ({ ...prev, hasBackup: true, settings: { ...prev?.settings, env }, exaMcpEnabled }));
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
 const res = await fetch("/api/cli-tools/claude-settings", { method: "DELETE" });
 const data = await res.json();
 if (res.ok) {
 setMessage({ type: "success", text: "Settings reset successfully!" });
 tool.defaultModels.forEach((model) => onModelMappingChange(model.alias, model.defaultValue || ""));
 setSelectedApiKey("");
 setExaMcpEnabled(false);
 setAutoCompactWindow("");
 setOneMContext(false);
 } else {
 setMessage({ type: "error", text: data.error || "Failed to reset settings" });
 }
 } catch (error) {
 setMessage({ type: "error", text: error.message });
 } finally {
 setRestoring(false);
 }
 };

 const openModelSelector = (alias) => {
 setCurrentEditingAlias(alias);
 setModalOpen(true);
 };

 const handleModelSelect = (model) => {
 if (currentEditingAlias) onModelMappingChange(currentEditingAlias, model.value);
 };

 // Generate settings.json content for manual copy
 const getManualConfigs = () => {
 const keyToUse = (selectedApiKey && selectedApiKey.trim())
 ? selectedApiKey
 : (!cloudEnabled ? "sk_axonrouter" : "<API_KEY_FROM_DASHBOARD>");
 const env = { ANTHROPIC_BASE_URL: getEffectiveBaseUrl(), ANTHROPIC_AUTH_TOKEN: keyToUse };
 tool.defaultModels.forEach((model) => {
 const targetModel = modelMappings[model.alias];
 if (targetModel && model.envKey) env[model.envKey] = targetModel;
 });
 if (autoCompactWindow) {
 env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = autoCompactWindow;
 }

 return [
 {
 filename: "~/.claude/settings.json",
 content: JSON.stringify({ hasCompletedOnboarding: true, env }, null, 2),
 },
 ];
 };

 return (
 <Card padding="xs" className="overflow-hidden">
 <button type="button" className="flex w-full items-start justify-between gap-3 text-left hover:cursor-pointer sm:items-center focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm" onClick={onToggle} aria-expanded={isExpanded}>
 <div className="flex min-w-0 items-center gap-3">
 <div className="size-8 flex items-center justify-center shrink-0">
 <Image src="/providers/claude.png" alt={tool.name} width={32} height={32} className="size-8 object-contain rounded-sm" sizes="32px" onError={(e) => { e.target.style.display = "none"; }} loading="lazy" decoding="async" />
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
 {checkingClaude && (
 <div className="flex items-center gap-2 text-text-muted">
 <Icon className="animate-spin" name="progress_activity" size={18} />
 <span>Checking Claude CLI...</span>
 </div>
 )}


 <HostSetupCommand
 toolId="claude"
 baseUrl={getEffectiveBaseUrl()}
 apiKey={selectedApiKey}
 models={modelMappings}
                  maxContextTokens={autoCompactWindow}
 />

 {!checkingClaude && (
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
 {claudeStatus?.settings?.env?.ANTHROPIC_BASE_URL && (
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Current</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <span className="min-w-0 truncate rounded-sm bg-surface/40 px-2 h-8 text-xs text-text-muted sm:py-2">
 {claudeStatus.settings.env.ANTHROPIC_BASE_URL}
 </span>
 </div>
 )}

 {/* API Key */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">API Key</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <ApiKeySelect value={selectedApiKey} onChange={setSelectedApiKey} apiKeys={apiKeys} cloudEnabled={cloudEnabled} />
 </div>

 {/* Model Mappings */}
 {tool.defaultModels.map((model) => (
 <div key={model.alias} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">{model.name}</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <div className="relative w-full min-w-0">
 <input type="text" value={modelMappings[model.alias] || ""} onChange={(e) => onModelMappingChange(model.alias, e.target.value)} placeholder="provider/model-id" className="w-full min-w-0 pl-2 pr-7 h-8 bg-surface rounded-sm border border-border text-xs focus:outline-none sm:py-2" />
 {modelMappings[model.alias] && <button onClick={() => onModelMappingChange(model.alias, "")} className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-danger rounded-sm" title="Clear"><Icon name="close" size={18} /></button>}
 </div>
 <button onClick={() => openModelSelector(model.alias)} disabled={!hasActiveProviders} className={`w-full sm:w-auto rounded-sm border px-2 h-8 text-xs sm:py-2 whitespace-nowrap sm:shrink-0 ${hasActiveProviders ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Select Model</button>
 </div>
 ))}

 {/* Auto-compact window */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Auto-compact</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <select value={autoCompactWindow} onChange={(e) => setAutoCompactWindow(e.target.value)} className="w-full min-w-0 px-2 h-8 bg-surface rounded-sm border border-border text-xs focus:outline-none sm:py-2">
 {CONTEXT_OPTIONS.map((opt) => (
 <option key={opt.label} value={opt.value}>{opt.label}</option>
 ))}
 </select>
 </div>

 {/* 1M context */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">1M context</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <label className="flex items-center gap-1.5 cursor-pointer select-none">
 <input type="checkbox" checked={oneMContext} onChange={(e) => handleOneMContextToggle(e.target.checked)} className="w-3.5 h-3.5 accent-primary cursor-pointer" />
 <span className="text-xs text-text-muted">Append [1m] to the model name</span>
 <Tooltip text="Claude Code otherwise assumes a 200K window, which clamps the auto-compact window above. Applied to every mapped model — only enable it for models that really accept 1M.">
 <Icon className="text-text-muted cursor-help" name="info" size={18} />
 </Tooltip>
 </label>
 </div>

 {/* CC Filter Naming */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Filter naming</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <label className="flex items-center gap-1.5 cursor-pointer select-none">
 <input type="checkbox" checked={ccFilterNaming} onChange={handleCcFilterNamingToggle} className="w-3.5 h-3.5 accent-primary cursor-pointer" />
 <span className="text-xs text-text-muted">Filter naming requests</span>
 <Tooltip text="Intercepts Claude Code's topic-naming requests and returns a fake response locally, saving API tokens.">
 <Icon className="text-text-muted cursor-help" name="info" size={18} />
 </Tooltip>
 </label>
 </div>

 {/* Exa MCP — ~/.claude.json mcpServers (not settings.json) */}
 <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
 <span className="text-xs font-medium text-text-main sm:text-right sm:text-sm">Web Search</span>
 <Icon className="hidden text-text-muted sm:inline" name="arrow_forward" size={18} />
 <label className="flex items-center gap-1.5 cursor-pointer select-none">
 <input type="checkbox" checked={exaMcpEnabled} onChange={(e) => setExaMcpEnabled(e.target.checked)} className="w-3.5 h-3.5 accent-primary cursor-pointer" />
 <span className="text-xs text-text-muted">Exa MCP</span>
 <Tooltip text="Injects Exa MCP into ~/.claude.json so non-Claude models gain web search. Restart Claude Code after Apply.">
 <Icon className="text-text-muted cursor-help" name="info" size={18} />
 </Tooltip>
 </label>
 </div>
 </div>

 {message && (
 <div className={`flex items-center gap-2 px-2 py-2 rounded-sm text-xs ${message.type === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
 <Icon name={message.type === "success" ? "check_circle" : "error"} size={18} />
 <span>{message.text}</span>
 </div>
 )}

 <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
 <Button variant="primary" size="sm" onClick={handleApplySettings} disabled={!hasActiveProviders} loading={applying}>
 <Icon className="mr-1" name="save" size={18} />Apply
 </Button>
 <Button variant="outline" size="sm" onClick={handleResetSettings} disabled={!claudeStatus?.hasAxonRouter} loading={restoring}>
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
 <ModelSelectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSelect={handleModelSelect} selectedModel={currentEditingAlias ? modelMappings[currentEditingAlias] : null} activeProviders={activeProviders} modelAliases={modelAliases} title={`Select model for ${currentEditingAlias}`} />
 )}

 <ManualConfigModal
 isOpen={showManualConfigModal}
 onClose={() => setShowManualConfigModal(false)}
 title="Claude CLI - Manual Configuration"
 configs={getManualConfigs()}
 />
 </Card>
 );
}
