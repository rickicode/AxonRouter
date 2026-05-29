"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState, useCallback, useEffect } from "react";
import PropTypes from "prop-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getProviderAlias } from "@/shared/constants/providers";
import { filterCodexModelsForConnections, isCodexFreePlan } from "@/lib/codexModelAccess";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { translate } from "@/i18n/runtime";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import { rowHoverClass, subtleCodeClass, toneClasses } from "../designSystem";

export function ModelRow({ model, fullModel, copied, onCopy, testStatus, isCustom, isFree, onDeleteAlias, onTest, isTesting, isDisabled, onToggleDisabled }) {
  const borderColor = testStatus === "ok" ? toneClasses.success.border : testStatus === "error" ? toneClasses.danger.border : "border-border";
  const iconColor = testStatus === "ok" ? "#22c55e" : testStatus === "error" ? "#ef4444" : undefined;

  return (
    <div className={`group rounded border px-3 py-2 ${borderColor} ${rowHoverClass} ${isDisabled ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2">
        <AppIcon name={isDisabled ? "visibility_off" : testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"} size={16} style={iconColor ? { color: iconColor } : undefined} />
        <div className="flex flex-col gap-1">
          <code className={subtleCodeClass}>{fullModel}</code>
          {model.name && <span className="pl-1 text-[9px] italic text-text-muted/70">{model.name}</span>}
        </div>
        {onTest && (
          <Button onClick={onTest} disabled={isTesting} variant="ghost" size="icon-xs" className={`text-text-muted hover:text-primary ${isTesting ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} title={isTesting ? translate("Testing...") : translate("Test")}>
            <AppIcon name={isTesting ? "progress_activity" : "science"} size={14} style={isTesting ? { animation: "spin 1s linear infinite" } : undefined} />
          </Button>
        )}
        <Button onClick={() => onCopy(fullModel, `model-${model.id}`)} variant="ghost" size="icon-xs" className="text-text-muted hover:text-primary" title={copied === `model-${model.id}` ? translate("Copied!") : translate("Copy")}>
          <AppIcon name={copied === `model-${model.id}` ? "check" : "content_copy"} size={14} />
        </Button>
        {isFree && <Badge variant="secondary" className="text-[10px] text-[var(--color-success)]">{translate("FREE")}</Badge>}
        {model.premium && <Badge variant="secondary" className="text-[10px] text-amber-600 dark:text-amber-400">{translate("PREMIUM")}</Badge>}
        {model.source && <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.08em]">{translate(model.source)}</Badge>}
        {isDisabled && <Badge variant="destructive" className="text-[10px]">{translate("DISABLED")}</Badge>}
        {onToggleDisabled && (
          <Button onClick={onToggleDisabled} variant="ghost" size="icon-xs" className="text-text-muted opacity-0 group-hover:opacity-100 hover:text-primary" title={isDisabled ? translate("Enable model") : translate("Disable model")}>
            <AppIcon name={isDisabled ? "visibility" : "visibility_off"} size={14} />
          </Button>
        )}
        {isCustom && (
          <Button onClick={onDeleteAlias} variant="ghost" size="icon-xs" className="ml-auto text-text-muted opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive" title={translate("Remove custom model")}>
            <AppIcon name="close" size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}

function AddCustomModelModal({ isOpen, onSave, onClose }) {
  const [modelId, setModelId] = useState("");
  const handleSave = () => {
    if (!modelId.trim()) return;
    onSave(modelId.trim());
    setModelId("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{translate("Add Custom Model")}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>{translate("Model ID")}</FieldLabel>
            <Input value={modelId} onChange={(e) => setModelId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} placeholder={translate("e.g. tts-1-hd")} autoFocus />
          </Field>
          <div className="flex gap-2">
            <Button onClick={handleSave} className="w-full" disabled={!modelId.trim()}>{translate("Add")}</Button>
            <Button onClick={onClose} variant="ghost" className="w-full">{translate("Cancel")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ModelsCard({ providerId, kindFilter, providerModels = [], syncingModels = false, onSyncModels = null, syncNotice = "", syncError = "" }) {
  const inv = useInvalidate();
  const { copied, copy } = useCopyToClipboard();
  const [modelAliases, setModelAliases] = useState({});
  const [customModels, setCustomModels] = useState([]);
  const [disabledModels, setDisabledModels] = useState([]);
  const [modelTestResults, setModelTestResults] = useState({});
  const [testingModelId, setTestingModelId] = useState(null);
  const [testError, setTestError] = useState("");
  const [showAddCustomModel, setShowAddCustomModel] = useState(false);
  const [connections, setConnections] = useState([]);
  const providerAlias = getProviderAlias(providerId);
  const effectiveType = kindFilter || "llm";

  const fetchData = useCallback(async () => {
    try {
      const [aliasRes, connRes, customRes, disabledRes] = await Promise.all([fetch("/api/models/alias"), fetch("/api/providers", { cache: "no-store" }), fetch("/api/models/custom", { cache: "no-store" }), fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerAlias)}`, { cache: "no-store" })]);
      const aliasData = await aliasRes.json();
      const connData = await connRes.json();
      const customData = await customRes.json();
      const disabledData = await disabledRes.json();
      if (aliasRes.ok) setModelAliases(aliasData.aliases || {});
      if (connRes.ok) setConnections((connData.connections || []).filter((c) => c.provider === providerId));
      if (customRes.ok) setCustomModels(customData.models || []);
      if (disabledRes.ok) setDisabledModels(disabledData.ids || []);
    } catch (e) { console.log("ModelsCard fetch error:", e); }
  }, [providerAlias, providerId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [aliasRes, connRes, customRes, disabledRes] = await Promise.all([fetch("/api/models/alias"), fetch("/api/providers", { cache: "no-store" }), fetch("/api/models/custom", { cache: "no-store" }), fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerAlias)}`, { cache: "no-store" })]);
        const aliasData = await aliasRes.json().catch(() => ({}));
        const connData = await connRes.json().catch(() => ({}));
        const customData = await customRes.json().catch(() => ({}));
        const disabledData = await disabledRes.json().catch(() => ({}));
        if (cancelled) return;
        if (aliasRes.ok) setModelAliases(aliasData.aliases || {});
        if (connRes.ok) setConnections((connData.connections || []).filter((c) => c.provider === providerId));
        if (customRes.ok) setCustomModels(customData.models || []);
        if (disabledRes.ok) setDisabledModels(disabledData.ids || []);
      } catch (e) { console.log("ModelsCard bootstrap error:", e); }
    })();
    return () => { cancelled = true; };
  }, [providerAlias, providerId]);

  const setAliasMutation = useMutation({
    retry: false,
    mutationFn: async ({ modelId, alias }: { modelId: string; alias: string }) => {
      const res = await fetch("/api/models/alias", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: `${providerAlias}/${modelId}`, alias }) });
      if (!res.ok) throw new Error("Failed to set alias");
    },
    onSuccess: () => { inv.modelAliases(); fetchData(); },
  });
  const handleSetAlias = (modelId, alias) => { setAliasMutation.mutate({ modelId, alias }); };
  const deleteAliasMutation = useMutation({
    retry: false,
    mutationFn: async (alias: string) => {
      const res = await fetch(`/api/models/alias?alias=${encodeURIComponent(alias)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete alias");
    },
    onSuccess: () => { inv.modelAliases(); fetchData(); },
  });
  const handleDeleteAlias = (alias) => { deleteAliasMutation.mutate(alias); };
  const addCustomModelMutation = useMutation({
    retry: false,
    mutationFn: async (modelId: string) => {
      const res = await fetch("/api/models/custom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerAlias, id: modelId, type: effectiveType }) });
      if (!res.ok) throw new Error("Failed to add custom model");
    },
    onSuccess: () => { inv.providerModels(); fetchData(); },
  });
  const handleAddCustomModel = (modelId) => { addCustomModelMutation.mutate(modelId); };
  const deleteCustomModelMutation = useMutation({
    retry: false,
    mutationFn: async (modelId: string) => {
      const params = new URLSearchParams({ providerAlias, id: modelId, type: effectiveType });
      const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete custom model");
    },
    onSuccess: () => { inv.providerModels(); fetchData(); },
  });
  const handleDeleteCustomModel = (modelId) => { deleteCustomModelMutation.mutate(modelId); };
  const toggleDisabledMutation = useMutation({
    retry: false,
    mutationFn: async ({ modelId, nextDisabled }: { modelId: string; nextDisabled: boolean }) => {
      if (nextDisabled) await fetch("/api/models/disabled", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerAlias, ids: [modelId] }) });
      else await fetch(`/api/models/disabled?${new URLSearchParams({ providerAlias, id: modelId }).toString()}`, { method: "DELETE" });
    },
    onSuccess: () => { inv.disabledModels(); fetchData(); },
  });
  const handleToggleDisabledModel = (modelId, nextDisabled) => { toggleDisabledMutation.mutate({ modelId, nextDisabled }); };
  const handleTestModel = async (modelId) => { if (testingModelId) return; setTestingModelId(modelId); try { const res = await fetch("/api/models/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: `${providerAlias}/${modelId}`, kind: kindFilter }) }); const data = await res.json(); setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" })); setTestError(data.ok ? "" : (data.error || "Model not reachable")); } catch { setModelTestResults((prev) => ({ ...prev, [modelId]: "error" })); setTestError("Network error"); } finally { setTestingModelId(null); } };

  const aggregateModels = Array.isArray(providerModels) ? providerModels : [];
  const builtInModels = (kindFilter ? aggregateModels.filter((m) => m.kinds ? m.kinds.includes(kindFilter) : (m.type || "llm") === kindFilter) : aggregateModels).filter((model) => providerId !== "codex" || filterCodexModelsForConnections(connections, [model]).length > 0);
  const myCustomModels = customModels.filter((m) => m.providerAlias === providerAlias && (m.type || "llm") === effectiveType && !builtInModels.some((b) => b.id === m.id));
  const displayModels = builtInModels;
  const hasCodexFreeConnection = providerId === "codex" && connections.some((connection) => isCodexFreePlan(connection));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Models{kindFilter ? ` — ${kindFilter.toUpperCase()}` : ""}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {onSyncModels && (
              <Button onClick={onSyncModels} size="sm" variant="secondary" disabled={syncingModels}>
                {syncingModels ? <Spinner className="size-4" /> : null}
                {syncingModels ? "Syncing..." : "Sync from /models"}
              </Button>
            )}
            {disabledModels.length > 0 ? <Badge variant="destructive">{disabledModels.length} disabled</Badge> : null}
          </div>
        </CardHeader>
        <CardContent>
          {disabledModels.length > 0 ? <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-text-muted">Some models hidden from live routing. Use eye icon to re-enable them.</div> : null}
          {hasCodexFreeConnection ? <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-text-muted">Premium models require a non-Free Codex account. Free Codex accounts will not see or route to models like <code className={subtleCodeClass}>cx/gpt-5.5</code>.</div> : null}
          {syncNotice ? <p className="mb-3 break-words text-xs text-emerald-600 dark:text-emerald-400">{syncNotice}</p> : null}
          {syncError ? <p className="mb-3 break-words text-xs text-destructive">{syncError}</p> : null}
          {testError && <p className="mb-3 break-words text-xs text-destructive">{testError}</p>}
          <div className="flex flex-wrap gap-3">
            {displayModels.map((model) => {
              const fullModel = `${providerAlias}/${model.id}`;
              const existingAlias = Object.entries(modelAliases).find(([, m]) => m === fullModel)?.[0];
              return <ModelRow key={model.id} model={model} fullModel={fullModel} copied={copied} onCopy={copy} onDeleteAlias={() => handleDeleteAlias(existingAlias)} testStatus={modelTestResults[model.id]} onTest={connections.length > 0 ? () => handleTestModel(model.id) : undefined} isTesting={testingModelId === model.id} isFree={model.isFree} isDisabled={disabledModels.includes(model.id)} onToggleDisabled={() => handleToggleDisabledModel(model.id, !disabledModels.includes(model.id))} isCustom={false} />;
            })}
            {myCustomModels.map((model) => <ModelRow key={`${model.id}-${model.type}`} model={{ id: model.id, name: model.name }} fullModel={`${providerAlias}/${model.id}`} copied={copied} onCopy={copy} onDeleteAlias={() => handleDeleteCustomModel(model.id)} testStatus={modelTestResults[model.id]} onTest={connections.length > 0 ? () => handleTestModel(model.id) : undefined} isTesting={testingModelId === model.id} isDisabled={disabledModels.includes(model.id)} onToggleDisabled={() => handleToggleDisabledModel(model.id, !disabledModels.includes(model.id))} isCustom isFree={false} />)}
            {!displayModels.length && !myCustomModels.length ? <Empty className="w-full border-border bg-card/60"><EmptyHeader><EmptyMedia><AppIcon name="package" /></EmptyMedia><EmptyTitle>{translate("No models yet")}</EmptyTitle><EmptyDescription>{translate("Sync models or add a custom model for this provider.")}</EmptyDescription></EmptyHeader></Empty> : null}
            <Button onClick={() => setShowAddCustomModel(true)} variant="outline" size="sm" className="border-dashed"><AppIcon name="add" />Add Model</Button>
          </div>
        </CardContent>
      </Card>
      <AddCustomModelModal isOpen={showAddCustomModel} onSave={async (modelId) => { await handleAddCustomModel(modelId); setShowAddCustomModel(false); }} onClose={() => setShowAddCustomModel(false)} />
    </>
  );
}

ModelRow.propTypes = { model: PropTypes.shape({ id: PropTypes.string.isRequired, premium: PropTypes.bool, source: PropTypes.string }).isRequired, fullModel: PropTypes.string.isRequired, copied: PropTypes.string, onCopy: PropTypes.func.isRequired, testStatus: PropTypes.oneOf(["ok", "error"]), isCustom: PropTypes.bool, isFree: PropTypes.bool, onDeleteAlias: PropTypes.func, onTest: PropTypes.func, isTesting: PropTypes.bool, isDisabled: PropTypes.bool, onToggleDisabled: PropTypes.func };
AddCustomModelModal.propTypes = { isOpen: PropTypes.bool.isRequired, onSave: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired };
ModelsCard.propTypes = { providerId: PropTypes.string.isRequired, kindFilter: PropTypes.string, providerModels: PropTypes.array, syncingModels: PropTypes.bool, onSyncModels: PropTypes.func, syncNotice: PropTypes.string, syncError: PropTypes.string };
