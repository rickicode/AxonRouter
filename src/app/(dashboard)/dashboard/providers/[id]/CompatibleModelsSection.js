"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Input, Modal } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import Icon from "@/shared/components/Icon";
import { cn } from "@/shared/utils/cn";

function CompatibleModelRow({
  modelId,
  fullModel,
  alias,
  copied,
  onCopy,
  onDeleteAlias,
  onSetAlias,
  onTest,
  testStatus,
  isTesting,
  errorMessage,
}) {
  const isCopied = copied === `model-${modelId}`;

  const statusBorder =
    testStatus === "ok"
      ? "border-success/40 bg-surface/90"
      : testStatus === "error"
      ? "border-danger/40 bg-surface/90"
      : "border-border/70 bg-surface/70 hover:border-primary/40 hover:bg-surface";

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-md border p-2 transition-all duration-150 shadow-xs",
        statusBorder
      )}
    >
      {/* Row 1: Status dot + Model ID + Alias + Actions */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              testStatus === "ok"
                ? "bg-success"
                : testStatus === "error"
                ? "bg-danger"
                : isTesting
                ? "bg-primary animate-pulse"
                : "bg-text-subtle/50"
            )}
            title={
              testStatus === "ok"
                ? "Verified"
                : testStatus === "error"
                ? `Failed: ${errorMessage || "Model unreachable"}`
                : isTesting
                ? "Testing..."
                : "Ready"
            }
          />

          <button
            type="button"
            onClick={() => onCopy(fullModel, `model-${modelId}`)}
            title={isCopied ? "Copied!" : `Click to copy: ${fullModel}`}
            className="truncate font-mono text-xs font-medium text-text-main group-hover:text-primary transition-colors text-left cursor-pointer"
          >
            {isCopied ? (
              <span className="text-success inline-flex items-center gap-1 font-sans text-[11px]">
                <Icon name="check" size={12} /> Copied!
              </span>
            ) : (
              modelId
            )}
          </button>

          {alias && (
            <button
              type="button"
              onClick={() => onSetAlias?.(modelId, alias)}
              className="shrink-0 rounded bg-primary/10 px-1 py-px text-[9px] font-mono text-primary border border-primary/20 hover:border-primary/50 transition-colors cursor-pointer"
              title={`Alias: ${alias} — Click to edit`}
            >
              {alias}
            </button>
          )}
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
          {onTest && (
            <button
              onClick={onTest}
              disabled={isTesting}
              aria-label={`Test ${modelId}`}
              title={isTesting ? "Testing..." : "Test model"}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded text-text-muted hover:bg-surface-2 hover:text-primary transition-colors cursor-pointer",
                isTesting && "text-primary"
              )}
            >
              <Icon
                name={isTesting ? "progress_activity" : "science"}
                size={13}
                style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}
              />
            </button>
          )}

          {onSetAlias && (
            <button
              type="button"
              onClick={() => onSetAlias(modelId, alias)}
              aria-label={`Set alias for ${modelId}`}
              title={alias ? `Edit alias (${alias})` : "Set model alias"}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded text-text-muted hover:bg-surface-2 hover:text-primary transition-colors cursor-pointer",
                alias && "text-primary"
              )}
            >
              <Icon name="label" size={12} />
            </button>
          )}

          <button
            onClick={onDeleteAlias}
            aria-label={`Remove model ${modelId}`}
            title="Remove model"
            className="inline-flex size-6 items-center justify-center rounded text-text-muted hover:bg-danger/10 hover:text-danger transition-colors cursor-pointer"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      </div>

      {/* Row 2: Subtitle fullModel path */}
      <div className="mt-1 flex items-center justify-between gap-1.5 border-t border-border/40 pt-1 text-[10px]">
        <button
          type="button"
          onClick={() => onCopy(fullModel, `model-${modelId}`)}
          title={`Click to copy: ${fullModel}`}
          className="truncate font-mono text-[10px] text-text-subtle hover:text-text-main text-left cursor-pointer"
        >
          {fullModel}
        </button>
        <span className="text-[9px] text-text-subtle font-mono">custom</span>
      </div>

      {/* Error message */}
      {testStatus === "error" && errorMessage && (
        <p className="mt-1 truncate text-[9px] text-danger border-t border-danger/20 pt-0.5 font-mono" title={errorMessage}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}

CompatibleModelRow.propTypes = {
  modelId: PropTypes.string.isRequired,
  fullModel: PropTypes.string.isRequired,
  alias: PropTypes.string,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  onSetAlias: PropTypes.func,
  onTest: PropTypes.func,
  testStatus: PropTypes.oneOf(["ok", "error", null, undefined]),
  isTesting: PropTypes.bool,
  errorMessage: PropTypes.string,
};

export default function CompatibleModelsSection({
  providerStorageAlias,
  providerDisplayAlias,
  modelAliases,
  customModels,
  copied,
  onCopy,
  onSetAlias,
  onDeleteAlias,
  onAddCustomModel,
  onDeleteCustomModel,
  connections,
  isAnthropic,
}) {
  const [newModel, setNewModel] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aliasModal, setAliasModal] = useState(null);
  const [newAliasValue, setNewAliasValue] = useState("");
  const notify = useNotificationStore();
  const [testingModelId, setTestingModelId] = useState(null);
  const [modelTestResults, setModelTestResults] = useState({});
  const [modelTestErrors, setModelTestErrors] = useState({});

  const handleTestModel = async (modelId) => {
    if (testingModelId) return;
    setTestingModelId(modelId);
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerStorageAlias}/${modelId}` }),
      });
      const data = await res.json();
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
      setModelTestErrors((prev) => ({ ...prev, [modelId]: data.ok ? null : (data.error || "Unknown error") }));
    } catch (err) {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      setModelTestErrors((prev) => ({ ...prev, [modelId]: err.message || "Network error" }));
    } finally {
      setTestingModelId(null);
    }
  };

  const allModels = getProviderCustomModelRows({
    customModels,
    modelAliases,
    providerAlias: providerStorageAlias,
    type: "llm",
  });

  const q = search.trim().toLowerCase();
  const filteredModels = q
    ? allModels.filter((m) => m.id.toLowerCase().includes(q) || (m.alias && m.alias.toLowerCase().includes(q)))
    : allModels;

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    if (allModels.some((model) => model.id === modelId)) {
      notify.warning("Model already exists for this provider.");
      return;
    }

    setAdding(true);
    try {
      await onAddCustomModel(modelId);
      setNewModel("");
    } catch {
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) {
      notify.warning("No active connection available to import models.");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        notify.error(data.error || "Failed to fetch models");
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
        notify.warning("No models returned from /models.");
        return;
      }
      let importedCount = 0;
      for (const model of models) {
        const modelId = model.id || model.name || model.model;
        if (!modelId) continue;
        if (allModels.some((entry) => entry.id === modelId)) continue;
        await onAddCustomModel(modelId);
        importedCount += 1;
      }
      if (importedCount === 0) {
        notify.warning("No new models were added.");
      } else {
        notify.success(`Successfully imported ${importedCount} models.`);
      }
    } catch (error) {
      notify.error(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const canImport = connections.some((conn) => conn.isActive !== false);

  return (
    <div className="flex flex-col gap-3">
      {/* Header controls: Add model form & search */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Input
            icon="search"
            placeholder="Search custom models…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search models"
            inputClassName="h-8 text-xs"
            className="w-full sm:w-48 lg:w-56"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={isAnthropic ? "claude-3-opus-20240229" : "gpt-4o"}
              className="h-8 w-44 sm:w-52 rounded border border-border bg-surface px-2 text-xs text-text-main outline-none focus:border-primary"
            />
            <Button size="sm" icon="add" onClick={handleAdd} disabled={!newModel.trim() || adding}>
              {adding ? "Adding..." : "Add"}
            </Button>
          </div>

          <Button
            size="sm"
            variant="secondary"
            icon="download"
            onClick={handleImport}
            disabled={!canImport || importing}
            loading={importing}
          >
            {importing ? "Importing..." : "Import"}
          </Button>
        </div>
      </div>

      {!canImport && (
        <p className="text-xs text-text-muted">
          Add an active connection to enable importing models automatically.
        </p>
      )}

      {/* Grid Cards */}
      {filteredModels.length > 0 ? (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filteredModels.map(({ id, alias, source }) => (
            <CompatibleModelRow
              key={`${source}-${providerStorageAlias}/${id}`}
              modelId={id}
              fullModel={`${providerDisplayAlias}/${id}`}
              alias={alias}
              copied={copied}
              onCopy={onCopy}
              onDeleteAlias={() => (source === "custom" ? onDeleteCustomModel(id) : onDeleteAlias(alias))}
              onSetAlias={() => {
                setAliasModal({ modelId: id, currentAlias: alias || "" });
                setNewAliasValue(alias || "");
              }}
              onTest={connections.length > 0 ? () => handleTestModel(id) : undefined}
              testStatus={modelTestResults[id]}
              isTesting={testingModelId === id}
              errorMessage={modelTestErrors[id]}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border px-4 py-8 text-center">
          <Icon name="apps" size={20} className="text-text-subtle" />
          <p className="text-sm text-text-muted">
            {q ? `No models match "${search}".` : "No models added yet."}
          </p>
          {!q && (
            <p className="text-xs text-text-subtle">
              Type a model ID above or click Import to load from the /models endpoint.
            </p>
          )}
        </div>
      )}

      {/* Set Alias Modal */}
      {aliasModal && (
        <Modal
          isOpen={!!aliasModal}
          onClose={() => setAliasModal(null)}
          title={`Set Model Alias: ${aliasModal.modelId}`}
          size="sm"
        >
          <div className="flex flex-col gap-3 py-2">
            <p className="text-xs text-text-muted">
              Map a friendly alias name (e.g. <code className="text-primary font-mono">gpt-4o</code>) directly to this model.
            </p>
            <Input
              label="Alias Name"
              placeholder="e.g. gpt-4o, my-model"
              value={newAliasValue}
              onChange={(e) => setNewAliasValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newAliasValue.trim()) {
                  onSetAlias?.(aliasModal.modelId, newAliasValue.trim(), providerStorageAlias);
                  setAliasModal(null);
                }
              }}
              autoFocus
            />
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
              {aliasModal.currentAlias ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    onDeleteAlias?.(aliasModal.currentAlias);
                    setAliasModal(null);
                  }}
                >
                  Remove Alias
                </Button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setAliasModal(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!newAliasValue.trim() || newAliasValue.trim() === aliasModal.currentAlias}
                  onClick={() => {
                    onSetAlias?.(aliasModal.modelId, newAliasValue.trim(), providerStorageAlias);
                    setAliasModal(null);
                  }}
                >
                  Save Alias
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

CompatibleModelsSection.propTypes = {
  providerStorageAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  modelAliases: PropTypes.object.isRequired,
  customModels: PropTypes.arrayOf(PropTypes.object),
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onSetAlias: PropTypes.func,
  onDeleteAlias: PropTypes.func.isRequired,
  onAddCustomModel: PropTypes.func.isRequired,
  onDeleteCustomModel: PropTypes.func.isRequired,
  connections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      isActive: PropTypes.bool,
    })
  ).isRequired,
  isAnthropic: PropTypes.bool,
};
