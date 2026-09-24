"use client";

import { useState } from "react";
import { Card, ModelSelectModal } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { getProviderIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Image from "next/image";
import ApiKeySelect from "./ApiKeySelect";
import HostSetupCommand from "./HostSetupCommand";
import { TOOL_TEMPLATES } from "@/shared/constants/cliToolTemplates";

export default function DefaultToolCard({ toolId, tool, isExpanded, onToggle, baseUrl, apiKeys, activeProviders = [], cloudEnabled = false }) {
 const [copiedField, setCopiedField] = useState(null);
 const [showModelModal, setShowModelModal] = useState(false);
 const [modelValue, setModelValue] = useState("");
 
 // Initialize state directly with computed value - no need for useEffect
 const [selectedApiKey, setSelectedApiKey] = useState(() => 
 apiKeys?.length > 0 ? apiKeys[0].key : ""
 );

 const replaceVars = (text) => {
 const keyToUse = (selectedApiKey && selectedApiKey.trim()) 
 ? selectedApiKey 
 : (!cloudEnabled ? "sk_axonrouter" : "your-api-key");
 
 // Add /v1 suffix only if not already present (DRY - avoid duplicate)
 const normalizedBaseUrl = baseUrl || "http://localhost:3777";
 const baseUrlWithV1 = normalizedBaseUrl.endsWith("/v1") 
 ? normalizedBaseUrl 
 : `${normalizedBaseUrl}/v1`;
 
 return text
 .replace(/\{\{baseUrl\}\}/g, baseUrlWithV1)
 .replace(/\{\{apiKey\}\}/g, keyToUse)
 .replace(/\{\{model\}\}/g, modelValue || "provider/model-id");
 };

 const { copy: copyToClipboard } = useCopyToClipboard();

 const handleCopy = async (text, field) => {
 await copyToClipboard(replaceVars(text), `toolcard-${field}`);
 setCopiedField(field);
 setTimeout(() => setCopiedField(null), 2000);
 };

 const handleSelectModel = (model) => {
 setModelValue(model.value);
 };

 const hasActiveProviders = activeProviders.length > 0;

 const renderApiKeySelector = () => (
 <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
 <ApiKeySelect value={selectedApiKey} onChange={setSelectedApiKey} apiKeys={apiKeys} cloudEnabled={cloudEnabled} className="flex-1" />
 </div>
 );

 const renderModelSelector = () => {
 return (
 <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
 <input
 type="text"
 value={modelValue}
 onChange={(e) => setModelValue(e.target.value)}
 placeholder="provider/model-id"
 className="w-full sm:w-auto flex-1 px-3 h-8 bg-surface rounded-sm text-sm border border-border focus:outline-none"
 />
 <button
 onClick={() => setShowModelModal(true)}
 disabled={!hasActiveProviders}
 className={`shrink-0 px-3 h-8 rounded-sm border text-sm ${
 hasActiveProviders
 ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer"
 : "opacity-50 cursor-not-allowed border-border"
 }`}
 >
 Select Model
 </button>
 {modelValue && (
 <>
 <button
 onClick={() => handleCopy(modelValue, "model")}
 className="shrink-0 px-3 h-8 bg-surface hover:bg-surface-2 rounded-sm border border-border"
 >
 <Icon name={copiedField === "model" ? "check" : "content_copy"} size={18} />
 </button>
 <button
 onClick={() => setModelValue("")}
 className="size-8 shrink-0 rounded-sm text-text-muted hover:text-danger"
 title="Clear"
 >
 <Icon name="close" size={18} />
 </button>
 </>
 )}
 </div>
 );
 };

 const renderNotes = () => {
 if (!tool.notes || tool.notes.length === 0) return null;
 
 return (
 <div className="flex flex-col gap-2 mb-3">
 {tool.notes.map((note, index) => {
      // Skip cloudCheck note if cloud is enabled
      if (note.type === "cloudCheck" && cloudEnabled) return null;

      const isWarning = note.type === "warning";
      const isError = note.type === "cloudCheck" && !cloudEnabled;
 let bgClass = "bg-primary/10 border-primary/30";
 let textClass = "text-primary";
 let iconClass = "text-primary";
 let icon = "info";
 
 if (isWarning) {
 bgClass = "bg-warning/10 border-warning/30";
 textClass = "text-warning";
 iconClass = "text-warning";
 icon = "warning";
 } else if (isError) {
 bgClass = "bg-danger/10 border-danger/30";
 textClass = "text-danger";
 iconClass = "text-danger";
 icon = "error";
 }
 
 return (
 <div key={index} className={`flex items-start gap-3 p-3 rounded-sm border ${bgClass}`}>
 <Icon name={icon} size={18} className={iconClass} />
 <p className={`text-sm ${textClass}`}>{note.text}</p>
 </div>
 );
 })}
 </div>
 );
 };

 const canShowGuide = () => {
    if (tool.requiresExternalUrl && !cloudEnabled) return false;
 if (tool.requiresCloud && !cloudEnabled) return false;
 return true;
 };

 const renderGuideSteps = () => {
 if (!tool.guideSteps) return <p className="text-text-muted text-sm">Coming soon...</p>;

 return (
 <div className="flex flex-col gap-3">
 {renderNotes()}
 {TOOL_TEMPLATES[toolId] && (
 <HostSetupCommand
 toolId={toolId}
 baseUrl={baseUrl}
 apiKey={selectedApiKey}
 model={modelValue}
 />
 )}
 {canShowGuide() && tool.guideSteps.map((item) => (
 <div key={item.step} className="flex items-start gap-3">
 <div 
 className="size-8 rounded-sm flex items-center justify-center shrink-0 text-sm font-semibold text-white"
 style={{ backgroundColor: tool.color }}
 >
 {item.step}
 </div>
 <div className="flex-1 min-w-0">
 <p className="font-medium text-text">{item.title}</p>
 {item.desc && <p className="text-sm text-text-muted mt-0.5">{item.desc}</p>}
 {item.type === "apiKeySelector" && renderApiKeySelector()}
 {item.type === "modelSelector" && renderModelSelector()}
 {item.value && (
 <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
 <code className="w-full sm:w-auto flex-1 px-3 h-8 bg-surface rounded-sm text-sm font-mono border border-border truncate">
 {replaceVars(item.value)}
 </code>
 {item.copyable && (
 <button
 onClick={() => handleCopy(item.value, `${item.step}-${item.title}`)}
 className="shrink-0 px-3 h-8 bg-surface hover:bg-surface-2 rounded-sm border border-border"
 >
 <Icon name={copiedField === `${item.step}-${item.title}` ? "check" : "content_copy"} size={18} />
 </button>
 )}
 </div>
 )}
 </div>
 </div>
 ))}

 {canShowGuide() && tool.codeBlock && (
 <div className="mt-2">
 <div className="flex items-center justify-between mb-2">
 <span className="text-xs text-text-muted">{tool.codeBlock.language}</span>
 <button
 onClick={() => handleCopy(tool.codeBlock.code, "codeblock")}
 className="flex items-center gap-1 px-2 text-xs bg-surface hover:bg-surface-2 rounded-sm border border-border h-8"
 >
 <Icon name={copiedField === "codeblock" ? "check" : "content_copy"} size={14} />
 {copiedField === "codeblock" ? "Copied!" : "Copy"}
 </button>
 </div>
 <pre className="p-3 -secondary rounded-sm border border-border overflow-x-auto bg-surface p-3 font-mono text-xs text-text-main">
 <code className="text-sm font-mono whitespace-pre">{replaceVars(tool.codeBlock.code)}</code>
 </pre>
 </div>
 )}
 </div>
 );
 };

 const renderIcon = () => {
 if (tool.image) {
 return (
 <Image
 src={tool.image}
 alt={tool.name}
 width={32}
 height={32}
 className="size-8 object-contain rounded-sm"
 sizes="32px"
 onError={(e) => { e.target.style.display = "none"; }}
 loading="lazy"
 decoding="async"
 />
 );
 }
 if (tool.icon) {
 return <Icon name={tool.icon} size={18} style={{ color: tool.color }} />;
 }
 const iconSrc = getProviderIconSrc(toolId);
 if (!iconSrc) {
 return <span className="text-xs font-medium" style={{ color: tool.color }}>{(toolId || "?").slice(0, 2).toUpperCase()}</span>;
 }
 return (
 <Image
 src={iconSrc}
 alt={tool.name}
 width={32}
 height={32}
 className="size-8 object-contain rounded-sm"
 sizes="32px"
 onError={(e) => {
 markProviderIconMissing(toolId);
 e.target.style.display = "none";
 }}
 loading="lazy"
 decoding="async"
 />
 );
 };

 return (
 <Card padding="xs" className="overflow-hidden overflow-x-hidden">
 <button type="button" className="flex w-full items-center justify-between text-left hover:cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:ring-primary/40" onClick={onToggle} aria-expanded={isExpanded}>
 <div className="flex items-center gap-3">
 <div className="size-8 rounded-sm flex items-center justify-center shrink-0">
 {renderIcon()}
 </div>
 <div className="min-w-0">
 <h3 className="font-medium text-sm">{tool.name}</h3>
 <p className="text-xs text-text-muted truncate">{tool.description}</p>
 </div>
 </div>
 <Icon className={`text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} name="expand_more" size={18} />
 </button>

 {isExpanded && (
 <div className="mt-3 pt-3 border-t border-border">
 {renderGuideSteps()}
 </div>
 )}

 {showModelModal && (
 <ModelSelectModal
 isOpen={showModelModal}
 onClose={() => setShowModelModal(false)}
 onSelect={handleSelectModel}
 selectedModel={modelValue}
 activeProviders={activeProviders}
 title="Select Model"
 />
 )}
 </Card>
 );
}

