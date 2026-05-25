"use client";

import AppIcon from "@/shared/components/AppIcon";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ModelSelectModal } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { DEFAULT_AXONROUTER_BASE_URL } from "@/shared/constants/runtimeDefaults";

export default function DefaultToolCard({ toolId, tool, isExpanded, onToggle, baseUrl, apiKeys, activeProviders = [], cloudEnabled = false, tunnelEnabled = false }) {
  const [copiedField, setCopiedField] = useState(null);
  const [showModelModal, setShowModelModal] = useState(false);
  const [modelValue, setModelValue] = useState("");
  const [providerModelsByProvider, setProviderModelsByProvider] = useState({});
  const [cursorExpertEnabled, setCursorExpertEnabled] = useState(false);
  
  // Initialize state directly with computed value - no need for useEffect
  const [selectedApiKey, setSelectedApiKey] = useState(() => 
    apiKeys?.length > 0 ? apiKeys[0].key : ""
  );

  const replaceVars = (text) => {
    const keyToUse = (selectedApiKey && selectedApiKey.trim()) 
      ? selectedApiKey 
      : (!cloudEnabled ? "sk_axonrouter" : "your-api-key");
    
    // Add /v1 suffix only if not already present (DRY - avoid duplicate)
    const normalizedBaseUrl = baseUrl || DEFAULT_AXONROUTER_BASE_URL;
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

  useEffect(() => {
    fetch("/api/provider-models")
      .then((res) => (res.ok ? res.json() : { models: {} }))
      .then((data) => setProviderModelsByProvider(data.models || {}))
      .catch(() => setProviderModelsByProvider({}));
  }, []);

  const handleSelectModel = (model) => {
    setModelValue(model.value);
  };

  const hasActiveProviders = activeProviders.length > 0;

  const renderApiKeySelector = () => {
    return (
      <div className="mt-2 flex items-center gap-2">
        {apiKeys && apiKeys.length > 0 ? (
          <>
            <select
              value={selectedApiKey}
              onChange={(e) => setSelectedApiKey(e.target.value)}
              className="flex-1 px-3 py-2 bg-bg-secondary rounded-lg text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {apiKeys.map((key) => (
                <option key={key.id} value={key.key}>{key.key}</option>
              ))}
            </select>
            <button
              onClick={() => handleCopy(selectedApiKey, "apiKey")}
              className="shrink-0 px-3 py-2 bg-bg-secondary hover:bg-bg-tertiary rounded-lg border border-border transition-colors"
            >
              <AppIcon name={copiedField === "apiKey" ? "check" : "content_copy"} size={18} />
            </button>
          </>
        ) : (
          <span className="text-sm text-text-muted">
            {cloudEnabled ? "No API keys - Create one in Keys page" : "sk_axonrouter"}
          </span>
        )}
      </div>
    );
  };

  const renderModelSelector = () => {
    return (
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="text"
          value={modelValue}
          onChange={(e) => setModelValue(e.target.value)}
          placeholder="provider/model-id"
          className="flex-1"
        />
        <Button
          onClick={() => setShowModelModal(true)}
          disabled={!hasActiveProviders}
          variant="outline"
          className="shrink-0"
        >
          Select Model
        </Button>
        {modelValue && (
          <>
            <button
              onClick={() => handleCopy(modelValue, "model")}
              className="shrink-0 px-3 py-2 bg-bg-secondary hover:bg-bg-tertiary rounded-lg border border-border transition-colors"
            >
              <AppIcon name={copiedField === "model" ? "check" : "content_copy"} size={18} />
            </button>
            <button
              onClick={() => setModelValue("")}
              className="p-2 text-text-muted hover:text-red-500 rounded transition-colors"
              title="Clear"
            >
              <AppIcon name="close" size={18} />
            </button>
          </>
        )}
      </div>
    );
  };

  const renderNotes = () => {
    if (!tool.notes || tool.notes.length === 0) return null;
    
    return (
      <div className="flex flex-col gap-2 mb-4">
        {tool.notes.map((note, index) => {
          // Skip cloudCheck note if tunnel or cloud is enabled
          if (note.type === "cloudCheck" && (cloudEnabled || tunnelEnabled)) return null;
          
          const isWarning = note.type === "warning";
          const isError = note.type === "cloudCheck" && !cloudEnabled && !tunnelEnabled;
          
          let bgClass = "bg-blue-500/10 border-blue-500/30";
          let textClass = "text-blue-600 dark:text-blue-400";
          let iconClass = "text-blue-500";
          let icon = "info";
          
          if (isWarning) {
            bgClass = "bg-yellow-500/10 border-yellow-500/30";
            textClass = "text-yellow-600 dark:text-yellow-400";
            iconClass = "text-yellow-500";
            icon = "warning";
          } else if (isError) {
            bgClass = "bg-red-500/10 border-red-500/30";
            textClass = "text-red-600 dark:text-red-400";
            iconClass = "text-red-500";
            icon = "error";
          }
          
          return (
            <div key={index} className={`flex items-start gap-3 p-3 rounded-lg border ${bgClass}`}>
              <AppIcon name={icon} size={18} className={iconClass} />
              <p className={`text-sm ${textClass}`}>{note.text}</p>
            </div>
          );
        })}
      </div>
    );
  };

  const canShowGuide = () => {
    if (tool.requiresExternalUrl && !cloudEnabled && !tunnelEnabled) return false;
    if (tool.requiresCloud && !cloudEnabled) return false;
    return true;
  };

  const renderCursorExpertToggle = () => {
    if (toolId !== "cursor") return null;

    return (
      <div className="mb-4 rounded-lg border border-border bg-bg-secondary/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Expert Cursor</p>
            <p className="text-xs text-muted-foreground">Toggle expert setup hints for advanced Cursor configuration.</p>
          </div>
          <Switch checked={cursorExpertEnabled} onToggle={(checked) => setCursorExpertEnabled(checked === true)} />
        </div>
      </div>
    );
  };

  const renderGuideSteps = () => {
    if (!tool.guideSteps) return <p className="text-text-muted text-sm">Coming soon...</p>;

    return (
      <div className="flex flex-col gap-4">
        {renderNotes()}
        {renderCursorExpertToggle()}
        {canShowGuide() && tool.guideSteps.map((item) => (
          <div key={item.step} className="flex items-start gap-4">
            <div 
              className="size-8 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold text-white"
              style={{ backgroundColor: tool.color }}
            >
              {item.step}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-text">{item.title}</p>
              {item.desc && <p className="text-sm text-text-muted mt-0.5">{item.desc}</p>}
              {toolId === "cursor" && cursorExpertEnabled && item.step === 6 ? (
                <p className="text-xs text-text-muted mt-1">For expert setups, prefer the exact routed model alias you want Cursor to pin instead of relying on a generic default.</p>
              ) : null}
              {item.type === "apiKeySelector" && renderApiKeySelector()}
              {item.type === "modelSelector" && renderModelSelector()}
              {item.value && (
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-bg-secondary rounded-lg text-sm font-mono border border-border truncate">
                    {replaceVars(item.value)}
                  </code>
                  {item.copyable && (
                    <button
                      onClick={() => handleCopy(item.value, `${item.step}-${item.title}`)}
                      className="shrink-0 px-3 py-2 bg-bg-secondary hover:bg-bg-tertiary rounded-lg border border-border transition-colors"
                    >
                      <AppIcon name={copiedField === `${item.step}-${item.title}` ? "check" : "content_copy"} size={18} />
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
              <span className="text-xs text-text-muted uppercase tracking-wide">{tool.codeBlock.language}</span>
              <button
                onClick={() => handleCopy(tool.codeBlock.code, "codeblock")}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-bg-secondary hover:bg-bg-tertiary rounded border border-border transition-colors"
              >
                <AppIcon name={copiedField === "codeblock" ? "check" : "content_copy"} size={14} />
                {copiedField === "codeblock" ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="p-4 bg-bg-secondary rounded-lg border border-border overflow-x-auto">
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
        <ProviderIcon
          src={tool.image}
          alt={tool.name}
          size={32}
          className="size-8 object-contain rounded-lg"
          fallbackText={tool.name.slice(0, 2).toUpperCase()}
          fallbackColor={tool.color}
        />
      );
    }
    if (tool.icon) {
      return <AppIcon name={tool.icon} size={20} style={{ color: tool.color }} />;
    }
    return (
      <ProviderIcon
        src={`/providers/${toolId}.png`}
        alt={tool.name}
        size={32}
        className="size-8 object-contain rounded-lg"
        fallbackText={tool.name.slice(0, 2).toUpperCase()}
        fallbackColor={tool.color}
      />
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardContent>
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg flex items-center justify-center shrink-0">
            {renderIcon()}
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-sm">{tool.name}</h3>
            <p className="text-xs text-text-muted truncate">{tool.description}</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} strokeWidth={2} />
      </div>

      {isExpanded && (
        <div className="mt-6 pt-6 border-t border-border">
          {renderGuideSteps()}
        </div>
      )}

      <ModelSelectModal
        isOpen={showModelModal}
        onClose={() => setShowModelModal(false)}
        onSelect={handleSelectModel}
        selectedModel={modelValue}
        activeProviders={activeProviders.map((provider) => ({
          ...provider,
          availableImportedModels: providerModelsByProvider?.[provider.provider] || [],
        }))}
        title="Select Model"
      />
      </CardContent>
    </Card>
  );
}

