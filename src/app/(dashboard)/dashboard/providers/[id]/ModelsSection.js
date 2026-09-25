"use client";

import { useState } from "react";
import { Card, Button, SegmentedControl, Input } from "@/shared/components";
import { getModelKind } from "@/shared/constants/models";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import { isFreeModel, sortModelsByFree } from "@/shared/utils/modelHelpers";
import { translate } from "@/i18n/runtime";
import CompatibleModelsSection from "./CompatibleModelsSection";
import ModelRow from "./ModelRow";
import Icon from "@/shared/components/Icon";

export default function ModelsSection(d) {
  const {
    providerId, providerStorageAlias, providerDisplayAlias, providerThinkingLevels, thinkingMode,
    models, kiloFreeModels, customModels, disabledModelIds, modelAliases, connections, copied,
    modelTestResults, testingModelIds, isFreeNoAuth, handleThinkingModeChange, handleDisableAll,
    handleEnableAll, handleDisableModel, handleEnableModel, handleAddCustomModel, handleDeleteCustomModel,
    handleSetAlias, handleDeleteAlias, handleTestModel, handleImportQoderModels, handleImportLiveModels,
    handleImportClineModels, setShowAddCustomModel, importingQoderModels,
    importingClineModels, importingLiveModels, suggestedModels, getCaps, copy, resolveThinkingSuffix,
    isCompatible, isAnthropicCompatible,
  } = d;

  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matchesQuery = (...fields) =>
    !q || fields.some((f) => typeof f === "string" && f.toLowerCase().includes(q));

  const allModels = [
    ...models,
    ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
  ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; });
  const disabledSet = new Set(disabledModelIds);
  const activeModels = allModels.filter((m) => !disabledSet.has(m.id));
  const hidePaidOnClineFree = providerId === "cline-free";
  const displayModels = sortModelsByFree(
    activeModels.filter((m) => !hidePaidOnClineFree || isFreeModel(m, providerId)),
    [],
    providerId
  ).filter((m) => matchesQuery(m.id, m.name));
  const disabledDisplayModels = allModels
    .filter((m) => disabledSet.has(m.id))
    .filter((m) => matchesQuery(m.id, m.name));
  const customModelRows = getProviderCustomModelRows({
    customModels,
    modelAliases,
    providerAlias: providerStorageAlias,
    builtInModels: models,
    type: "llm",
  }).filter((row) => matchesQuery(row.id, row.name, row.alias));

  const activeIds = allModels.map((m) => m.id).filter((id) => !disabledSet.has(id));
  // "Disable All" targets what the user can see once a search is active.
  const disableTargets = q ? displayModels.map((m) => m.id) : activeIds;

  const hasAnyModel = customModelRows.length > 0 || displayModels.length > 0;

  const suggestedNotAdded = (() => {
    const addedFullModels = new Set([
      ...Object.values(modelAliases),
      ...customModelRows.map((row) => row.fullModel),
    ]);
    const hardcodedIds = new Set(models.map((m) => m.id));
    return suggestedModels.filter(
      (m) =>
        !addedFullModels.has(`${providerStorageAlias}/${m.id}`) &&
        !hardcodedIds.has(m.id) &&
        matchesQuery(m.id, m.name)
    );
  })();

  if (isCompatible) {
    return (
      <CompatibleModelsSection
        providerStorageAlias={providerStorageAlias}
        providerDisplayAlias={providerDisplayAlias}
        modelAliases={modelAliases}
        customModels={customModels}
        copied={copied}
        onCopy={copy}
        onSetAlias={handleSetAlias}
        onDeleteAlias={handleDeleteAlias}
        onAddCustomModel={(modelId) => handleAddCustomModel(modelId, "llm", providerStorageAlias)}
        onDeleteCustomModel={(modelId) => handleDeleteCustomModel(modelId, "llm", providerStorageAlias)}
        connections={connections}
        isAnthropic={isAnthropicCompatible}
      />
    );
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Available Models</h2>
          <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-text-muted">
            {activeIds.length}
            {disabledModelIds.length > 0 && (
              <span className="text-text-subtle"> / {allModels.length}</span>
            )}
          </span>
        </div>

        <div className="order-3 w-full sm:order-none sm:w-56">
          <Input
            icon="search"
            placeholder="Search models…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search models"
            inputClassName="h-9 text-xs"
            className="w-full"
          />
        </div>

        {providerThinkingLevels && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="hidden text-xs text-text-muted sm:inline">Thinking:</span>
            <SegmentedControl
              options={providerThinkingLevels.map((opt) => ({
                value: opt,
                label: opt.charAt(0).toUpperCase() + opt.slice(1),
              }))}
              value={thinkingMode}
              onChange={handleThinkingModeChange}
              size="touch"
              snap
              aria-label="Thinking level"
            />
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" icon="add" onClick={() => setShowAddCustomModel(true)}>
            Add Model
          </Button>

          {providerId === "qoder" && connections.some((conn) => conn.isActive !== false) && (
            <Button size="sm" variant="secondary" icon="download" loading={importingQoderModels} onClick={handleImportQoderModels}>
              {importingQoderModels ? translate("Fetching...") : translate("Fetch Qoder Models")}
            </Button>
          )}
          {(providerId === "cline" || providerId === "clinepass") && connections.some((conn) => conn.isActive !== false) && (
            <Button size="sm" variant="secondary" icon="download" loading={importingClineModels} onClick={handleImportClineModels}>
              {importingClineModels ? translate("Fetching...") : translate("Import from /models")}
            </Button>
          )}
          {(providerId === "orcarouter" || providerId === "tokenharbor" || providerId === "openrouter" || providerId === "together" || providerId === "groq" || providerId === "deepinfra" || providerId === "fireworks" || providerId === "novita" || providerId === "mistral" || providerId === "perplexity" || providerId === "xai" || providerId === "hyperbolic" || providerId === "sambanova" || providerId === "cerebras" || providerId === "siliconflow" || providerId === "deepseek" || providerId === "minimax" || providerId === "moonshot" || providerId === "gemini-cli") && connections.some((conn) => conn.isActive !== false) && (
            <Button size="sm" variant="secondary" icon="download" loading={importingLiveModels} onClick={handleImportLiveModels}>
              {importingLiveModels ? translate("Fetching...") : translate("Import from /models")}
            </Button>
          )}

          {disabledModelIds.length > 0 && (
            <Button size="sm" variant="secondary" icon="restart_alt" onClick={handleEnableAll}>
              Active All
            </Button>
          )}
          {activeIds.length > 0 && (
            <Button size="sm" variant="secondary" icon="block" onClick={() => handleDisableAll(disableTargets)}>
              Disable All
            </Button>
          )}
        </div>
      </div>

      {!!d.modelsTestError && (
        <p className="mb-3 break-words text-xs text-danger">{d.modelsTestError}</p>
      )}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {customModelRows.map((model) => (
          <ModelRow
            key={`${model.source}-${model.fullModel}`}
            model={{ id: model.id, name: model.name }}
            fullModel={`${providerDisplayAlias}/${model.id}`}
            alias={model.alias}
            copied={copied}
            onCopy={copy}
            onDeleteAlias={() => {
              if (model.source === "custom") {
                handleDeleteCustomModel(model.id, "llm", providerStorageAlias);
              } else {
                handleDeleteAlias(model.alias);
              }
            }}
            testStatus={modelTestResults[model.id]}
            onTest={connections.length > 0 || isFreeNoAuth ? () => handleTestModel(model.id) : undefined}
            isTesting={testingModelIds.has(model.id)}
            isCustom
            isFree={false}
            caps={getCaps(`${providerId}/${model.id}`)}
            thinkingSuffix={resolveThinkingSuffix(model.id)}
          />
        ))}

        {displayModels.map((model) => {
          const fullModel = `${providerStorageAlias}/${model.id}`;
          const oldFormatModel = `${providerId}/${model.id}`;
          const existingAlias = Object.entries(modelAliases).find(
            ([, m]) => m === fullModel || m === oldFormatModel
          )?.[0];
          return (
            <ModelRow
              key={model.id}
              model={model}
              fullModel={`${providerDisplayAlias}/${model.id}`}
              alias={existingAlias}
              copied={copied}
              onCopy={copy}
              onSetAlias={(alias) => handleSetAlias(model.id, alias, providerStorageAlias)}
              onDeleteAlias={() => handleDeleteAlias(existingAlias)}
              testStatus={modelTestResults[model.id]}
              onTest={connections.length > 0 || isFreeNoAuth ? () => handleTestModel(model.id) : undefined}
              isTesting={testingModelIds.has(model.id)}
              isFree={isFreeModel(model, providerId) || model.id.toLowerCase().includes("free") || model.name?.toLowerCase().includes("free")}
              onDisable={() => handleDisableModel(model.id)}
              caps={getCaps(`${providerId}/${model.id}`)}
              thinkingSuffix={resolveThinkingSuffix(model.id)}
            />
          );
        })}


        {!hasAnyModel && (
          <div className="col-span-full flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border px-4 py-8 text-center">
            <Icon name={q ? "search_off" : "apps"} size={20} className="text-text-subtle" />
            <p className="text-sm text-text-muted">
              {q ? `No models match “${query}”.` : "No models yet."}
            </p>
            {!q && <p className="text-xs text-text-subtle">Add a custom model to get started.</p>}
          </div>
        )}

        {suggestedNotAdded.length > 0 && (
          <div className="col-span-full mt-1">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-text-subtle">
              <Icon name="auto_awesome" size={13} className="text-primary" />
              Suggested free models (≥200k context)
              <span className="ml-auto rounded-sm bg-surface-3 px-1.5 py-px text-[10px] tabular-nums text-text-muted">
                {suggestedNotAdded.length}
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestedNotAdded.map((m) => (
                <button
                  key={m.id}
                  onClick={async () => {
                    await handleAddCustomModel(m.id, "llm", providerStorageAlias);
                  }}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface px-2.5 py-1 text-xs text-text-muted transition-[border-color,background-color,color,transform] duration-150 ease-out hover:border-primary/50 hover:bg-primary/10 hover:text-primary active:scale-95"
                  title={`${m.name} · ${Math.round((m.contextLength || 0) / 1000)}k ctx`}
                >
                  <Icon name="add" size={12} className="text-primary group-hover:rotate-90 transition-transform duration-150" />
                  <span className="font-medium">{m.id.split("/").pop()}</span>
                  {m.contextLength ? (
                    <span className="rounded-full bg-surface-3 px-1.5 py-px text-[9px] font-mono text-text-subtle group-hover:text-primary/70">
                      {Math.round(m.contextLength / 1000)}k
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {disabledDisplayModels.length > 0 && (
          <div className="col-span-full mt-1">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-text-subtle">
              <Icon name="block" size={13} className="text-danger" />
              Disabled models
              <span className="ml-auto rounded-sm bg-surface-3 px-1.5 py-px text-[10px] tabular-nums text-text-muted">
                {disabledDisplayModels.length}
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {disabledDisplayModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleEnableModel(m.id)}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-dashed border-border px-2.5 py-1.5 text-xs text-text-muted transition-[border-color,background-color,color] duration-150 ease-out hover:border-success/40 hover:bg-success/10 hover:text-success active:scale-95"
                  title={`${m.name || m.id} — restore this model`}
                >
                  <Icon name="add" size={14} />
                  {m.name || m.id}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
