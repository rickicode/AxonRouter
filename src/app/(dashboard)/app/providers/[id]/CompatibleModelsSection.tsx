"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PropTypes from "prop-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fetchJson, useInvalidate } from "@/shared/query";
import { rowHoverClass, subtleCodeClass, toneClasses } from "../designSystem";

function CompatibleModelRow({ modelId, fullModel, copied, onCopy, onDeleteAlias, onTest, testStatus, isTesting, source }) {
  const borderColor = testStatus === "ok" ? toneClasses.success.border : testStatus === "error" ? toneClasses.danger.border : "border-border";
  const iconColor = testStatus === "ok" ? "#22c55e" : testStatus === "error" ? "#ef4444" : undefined;

  return (
    <div className={`flex items-center gap-3 rounded border p-3 ${borderColor} ${rowHoverClass}`}>
      <AppIcon name={testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"} size={16} className="text-text-muted" style={iconColor ? { color: iconColor } : undefined} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{modelId}</p>
        <div className="mt-1 flex items-center gap-1">
          <code className={subtleCodeClass}>{fullModel}</code>
          {source ? <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.08em]">{source}</Badge> : null}
          <Button variant="ghost" size="icon-xs" onClick={() => onCopy(fullModel, `model-${modelId}`)} title={copied === `model-${modelId}` ? "Copied!" : "Copy"}>
            <AppIcon name={copied === `model-${modelId}` ? "check" : "content_copy"} size={14} />
          </Button>
          {onTest && (
            <Button variant="ghost" size="icon-xs" onClick={onTest} disabled={isTesting} title={isTesting ? "Testing..." : "Test"}>
              <AppIcon name={isTesting ? "progress_activity" : "science"} size={14} style={isTesting ? { animation: "spin 1s linear infinite" } : undefined} />
            </Button>
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon-xs" onClick={onDeleteAlias} className="text-destructive hover:bg-destructive/10 hover:text-destructive" title="Remove model">
        <AppIcon name="delete" size={14} />
      </Button>
    </div>
  );
}

export default function CompatibleModelsSection({ providerStorageAlias, providerDisplayAlias, modelAliases, copied, onCopy, onSetAlias, onDeleteAlias, connections, isAnthropic }) {
  const inv = useInvalidate();
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testingModelId, setTestingModelId] = useState(null);
  const [modelTestResults, setModelTestResults] = useState({});
  const [syncNotice, setSyncNotice] = useState("");
  const [syncError, setSyncError] = useState("");

  const activeConnection = connections.find((conn) => conn.isActive !== false);
  const syncedModelsQuery = useQuery({
    queryKey: ["provider-models", activeConnection?.provider],
    queryFn: ({ signal }) => fetchJson<any>(`/api/provider-models?provider=${encodeURIComponent(activeConnection!.provider)}`, { signal }),
    enabled: !!activeConnection?.id,
    select: (data) => Array.isArray(data.models) ? data.models.filter((model) => model?.source !== "custom") : [],
  });
  const syncedModels = syncedModelsQuery.data ?? [];

  const handleTestModel = async (modelId) => {
    if (testingModelId) return;
    setTestingModelId(modelId);
    try {
      const res = await fetch("/api/models/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: `${providerStorageAlias}/${modelId}` }) });
      const data = await res.json();
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
    } finally {
      setTestingModelId(null);
    }
  };

  const providerAliases = Object.entries(modelAliases).filter(([, model]) => String(model || "").startsWith(`${providerStorageAlias}/`));
  const aliasModels = providerAliases.map(([alias, fullModel]) => {
    const modelText = String(fullModel || "");
    return { modelId: modelText.replace(`${providerStorageAlias}/`, ""), fullModel: `${providerDisplayAlias}/${modelText.replace(`${providerStorageAlias}/`, "")}`, alias, source: "alias" };
  });
  const allModels = [
    ...syncedModels.filter((model) => model?.id && !aliasModels.some((aliasModel) => aliasModel.modelId === model.id)).map((model) => ({ modelId: model.id, fullModel: `${providerDisplayAlias}/${model.id}`, alias: null, source: model.source || "imported" })),
    ...aliasModels,
  ];

  const generateDefaultAlias = (modelId) => modelId.split("/").at(-1);
  const resolveAlias = (modelId) => {
    const fullModel = `${providerStorageAlias}/${modelId}`;
    if (Object.values(modelAliases).includes(fullModel)) return null;
    const baseAlias = generateDefaultAlias(modelId);
    if (!modelAliases[baseAlias]) return baseAlias;
    const prefixedAlias = `${providerDisplayAlias}-${baseAlias}`;
    if (!modelAliases[prefixedAlias]) return prefixedAlias;
    return null;
  };

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    const resolvedAlias = resolveAlias(modelId);
    if (!resolvedAlias) {
      alert("All suggested aliases already exist. Please choose a different model or remove conflicting aliases.");
      return;
    }
    setAdding(true);
    try {
      await onSetAlias(modelId, resolvedAlias, providerStorageAlias);
      setNewModel("");
    } catch (error) {
      console.log("Error adding model:", error);
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    if (importing) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) return;
    setImporting(true);
    setSyncNotice("");
    setSyncError("");
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/sync-models?mode=import`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncError(data.error || "Failed to import models");
        return;
      }
      setSyncNotice(`Imported ${data.syncedCount || 0} model${data.syncedCount === 1 ? "" : "s"} from /models.`);
      inv.providerModels();
      inv.providerDetail(activeConnection.id);
    } catch (error) {
      console.log("Error importing models:", error);
      setSyncError(error?.message || "Failed to import models");
    } finally {
      setImporting(false);
    }
  };

  const canImport = connections.some((conn) => conn.isActive !== false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">Add {isAnthropic ? "Anthropic" : "OpenAI"}-compatible models manually or import them from the /models endpoint.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-[240px] flex-1">
          <FieldLabel htmlFor="new-compatible-model-input">Model ID</FieldLabel>
          <Input id="new-compatible-model-input" value={newModel} onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()} placeholder={isAnthropic ? "claude-3-opus-20240229" : "gpt-4o"} />
        </Field>
        <Button size="sm" onClick={handleAdd} disabled={!newModel.trim() || adding}>
          {adding ? <Spinner className="size-4" /> : <AppIcon name="add" />}
          {adding ? "Adding..." : "Add"}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleImport} disabled={!canImport || importing}>
          {importing ? <Spinner className="size-4" /> : <AppIcon name="download" />}
          {importing ? "Importing..." : "Import from /models"}
        </Button>
      </div>
      {!canImport && <p className="text-xs text-text-muted">Add a connection to enable importing models.</p>}
      {syncNotice ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{syncNotice}</p> : null}
      {syncError ? <p className="text-xs text-destructive">{syncError}</p> : null}
      {allModels.length > 0 && (
        <div className="flex flex-col gap-3">
          {allModels.map(({ modelId, fullModel, alias, source }) => (
            <CompatibleModelRow key={`${fullModel}-${source}`} modelId={modelId} fullModel={fullModel} copied={copied} onCopy={onCopy} onDeleteAlias={() => alias ? onDeleteAlias(alias) : undefined} onTest={connections.length > 0 ? () => handleTestModel(modelId) : undefined} testStatus={modelTestResults[modelId]} isTesting={testingModelId === modelId} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

CompatibleModelsSection.propTypes = {
  providerStorageAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  modelAliases: PropTypes.object.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onSetAlias: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  connections: PropTypes.array.isRequired,
  isAnthropic: PropTypes.bool,
};
