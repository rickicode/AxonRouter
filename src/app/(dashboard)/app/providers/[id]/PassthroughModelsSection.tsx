"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useInvalidate } from "@/shared/query";
import { rowHoverClass, subtleCodeClass, toneClasses } from "../designSystem";

function PassthroughModelRow({ modelId, fullModel, copied, onCopy, onDeleteAlias, onTest, testStatus, isTesting, source = "alias" }) {
  const borderColor = testStatus === "ok" ? toneClasses.success.border : testStatus === "error" ? toneClasses.danger.border : "border-border";
  const iconColor = testStatus === "ok" ? "#22c55e" : testStatus === "error" ? "#ef4444" : undefined;

  return (
    <div className={`flex items-center gap-3 rounded border p-3 ${borderColor} ${rowHoverClass}`}>
      <AppIcon name={testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"} size={16} className="text-text-muted" style={iconColor ? { color: iconColor } : undefined} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{modelId}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <code className={subtleCodeClass}>{fullModel}</code>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.08em]">{source}</Badge>
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

PassthroughModelRow.propTypes = {
  modelId: PropTypes.string.isRequired,
  fullModel: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  onTest: PropTypes.func,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  isTesting: PropTypes.bool,
  source: PropTypes.string,
};

export default function PassthroughModelsSection({ providerAlias, providerId = providerAlias, modelAliases, copied, onCopy, onSetAlias, onDeleteAlias, connections = [] }) {
  const inv = useInvalidate();
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncedModels, setSyncedModels] = useState([]);
  const [importing, setImporting] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection?.id) {
      const resetTimer = setTimeout(() => setSyncedModels([]), 0);
      return () => clearTimeout(resetTimer);
    }
    fetch(`/api/provider-models?provider=${encodeURIComponent(activeConnection.provider)}`)
      .then((res) => (res.ok ? res.json() : { models: [] }))
      .then((data) => {
        if (!cancelled) setSyncedModels(Array.isArray(data.models) ? data.models.filter((model) => model?.source !== "custom") : []);
      })
      .catch(() => {
        if (!cancelled) setSyncedModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [connections]);

  const providerAliases = Object.entries(modelAliases).filter(([, model]) => String(model || "").startsWith(`${providerAlias}/`));
  const aliasModels = providerAliases.map(([alias, fullModel]) => {
    const modelText = String(fullModel || "");
    return { modelId: modelText.replace(`${providerAlias}/`, ""), fullModel: modelText, alias, source: "alias" };
  });
  const allModels = [
    ...syncedModels
      .filter((model) => model?.id && !aliasModels.some((aliasModel) => aliasModel.modelId === model.id))
      .map((model) => ({ modelId: model.id, fullModel: `${providerAlias}/${model.id}`, alias: null, source: model.source || "imported" })),
    ...aliasModels,
  ];

  const generateDefaultAlias = (modelId) => modelId.split("/").at(-1);

  const handleImport = async () => {
    if (importing) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection?.id) return;
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
      setSyncedModels(Array.isArray(data.models) ? data.models : []);
      inv.providerModels();
      inv.providerDetail(activeConnection.id);
    } catch (error) {
      console.log("Error importing models:", error);
      setSyncError(error?.message || "Failed to import models");
    } finally {
      setImporting(false);
    }
  };

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    const defaultAlias = generateDefaultAlias(modelId);
    if (modelAliases[defaultAlias]) {
      alert(`Alias "${defaultAlias}" already exists. Please use a different model or edit existing alias.`);
      return;
    }
    setAdding(true);
    try {
      await onSetAlias(modelId, defaultAlias);
      setNewModel("");
    } catch (error) {
      console.log("Error adding model:", error);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">OpenRouter supports any model. Add models and create aliases for quick access.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field className="flex-1">
          <FieldLabel htmlFor="new-model-input">Model ID (from OpenRouter)</FieldLabel>
          <Input id="new-model-input" value={newModel} onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()} placeholder="anthropic/claude-3-opus" />
        </Field>
        <Button size="sm" onClick={handleAdd} disabled={!newModel.trim() || adding}>
          {adding ? <Spinner className="size-4" /> : <AppIcon name="add" />}
          {adding ? "Adding..." : "Add"}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleImport} disabled={!connections.some((conn) => conn.isActive !== false) || importing}>
          {importing ? <Spinner className="size-4" /> : <AppIcon name="download" />}
          {importing ? "Importing..." : "Import from /models"}
        </Button>
      </div>
      {syncNotice ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{syncNotice}</p> : null}
      {syncError ? <p className="text-xs text-destructive">{syncError}</p> : null}
      {allModels.length > 0 && (
        <div className="flex flex-col gap-3">
          {allModels.map(({ modelId, fullModel, alias, source }) => (
            <PassthroughModelRow key={`${fullModel}-${source}`} modelId={modelId} fullModel={fullModel} copied={copied} onCopy={onCopy} onDeleteAlias={() => alias ? onDeleteAlias(alias) : undefined} onTest={undefined} testStatus={null} isTesting={false} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

PassthroughModelsSection.propTypes = {
  providerAlias: PropTypes.string.isRequired,
  providerId: PropTypes.string,
  modelAliases: PropTypes.object.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onSetAlias: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  connections: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, isActive: PropTypes.bool, provider: PropTypes.string })),
};
