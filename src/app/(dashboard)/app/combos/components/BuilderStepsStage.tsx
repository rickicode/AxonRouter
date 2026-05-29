import AppIcon from "@/shared/components/AppIcon";

// BuilderStepsStage - Using CSS variables for dark/light mode support

export default function BuilderStepsStage({
  draft,
  builderProviders,
  effectiveBuilderProviderId,
  setBuilderProviderId,
  setBuilderModelValue,
  setBuilderConnectionId,
  selectedBuilderProvider,
  effectiveBuilderModelValue,
  selectedBuilderConnections,
  effectiveBuilderConnectionId,
  builderComboRefName,
  setBuilderComboRefName,
  builderComboRefs,
  handleAddBuilderStep,
  stepInput,
  setStepInput,
  handleAddManualStep,
  setShowModelSelect,
  handleAddComboReference,
  dragOverIndex,
  dragIndex,
  formatStepLabel,
  getStepKey,
  getPricingForModel,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDrop,
  handleMoveUp,
  handleMoveDown,
  handleRemoveModel,
  WeightTotalBar,
  pricedModelCount,
  pricingCoveragePercent,
  t,
}) {
  return (
    <div className="space-y-4">
      {/* Main Container */}
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <label className="mb-3 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Steps ({draft.models.length})
        </label>

        {/* Provider / Model / Account Selection Grid */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">1. Provider</label>
            <select
              value={effectiveBuilderProviderId}
              onChange={(e) => {
                setBuilderProviderId(e.target.value);
                setBuilderModelValue("");
                setBuilderConnectionId("__auto__");
              }}
              className="w-full cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-xs text-[var(--color-text-main)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
            >
              <option value="">Select provider</option>
              {builderProviders.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.name} ({provider.models?.length || 0} models)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">2. Model</label>
            <select
              value={effectiveBuilderModelValue}
              onChange={(e) => setBuilderModelValue(e.target.value)}
              disabled={!selectedBuilderProvider}
              className="w-full cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-xs text-[var(--color-text-main)] focus:border-[var(--color-primary)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              <option value="">{selectedBuilderProvider ? "Select model" : "Choose provider first"}</option>
              {(selectedBuilderProvider?.models || []).map((model) => (
                <option key={model.value} value={model.value}>
                  {model.name}{model.isCustom ? " · custom" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">3. Account</label>
            <select
              value={effectiveBuilderConnectionId}
              onChange={(e) => setBuilderConnectionId(e.target.value)}
              disabled={!effectiveBuilderModelValue}
              className="w-full cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-xs text-[var(--color-text-main)] focus:border-[var(--color-primary)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              <option value="__auto__">Auto-select account at runtime</option>
              {selectedBuilderConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.label || connection.name || connection.id}
                  {connection.status && connection.status !== "active" ? ` · ${connection.status}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Current Step Preview */}
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-[var(--color-border)] px-3 py-2.5 bg-[var(--color-bg-alt)]">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Preview</p>
          <p className="text-xs text-[var(--color-text-main)]">
            {effectiveBuilderModelValue || "Choose provider and model to preview the next step."}
          </p>
          <button
            onClick={handleAddBuilderStep}
            disabled={!effectiveBuilderModelValue}
            className="ml-auto rounded bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Add step
          </button>
        </div>

        {/* Combo Reference Section */}
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Reference another combo</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={builderComboRefName}
              onChange={(e) => setBuilderComboRefName(e.target.value)}
              className="flex-1 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-xs text-[var(--color-text-main)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
            >
              <option value="">Select an existing combo to reference</option>
              {builderComboRefs.map((comboRef) => (
                <option key={comboRef.id} value={comboRef.name}>
                  {comboRef.name} · {comboRef.strategy} · {(comboRef.models || []).length} step{(comboRef.models || []).length === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddComboReference}
              disabled={!builderComboRefName}
              className="rounded border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Add combo ref
            </button>
          </div>
        </div>

        {/* Manual Input Section */}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={stepInput}
            onChange={(e) => setStepInput(e.target.value)}
            placeholder="provider/model or ref:combo-name"
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
          />
          <button
            onClick={handleAddManualStep}
            className="rounded border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] cursor-pointer"
          >
            Add
          </button>
          <button
            onClick={() => setShowModelSelect(true)}
            className="rounded border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] cursor-pointer"
          >
            Pick Model
          </button>
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-2">
        {draft.models.map((m, i) => {
          const raw = formatStepLabel(m);
          const isDropTarget = dragOverIndex === i && dragIndex !== i;
          return (
            <div
              key={`${getStepKey(m)}-${i}`}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              className={`flex items-center gap-3 rounded border px-4 py-3 ${isDropTarget ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border)]"} ${dragIndex === i ? "opacity-50" : ""}`}
              style={{ backgroundColor: "var(--color-surface)" }}
            >
              <AppIcon name="drag_indicator" size={16} className="text-[var(--color-text-muted)]" />
              <span className="w-5 text-center text-[10px] font-medium text-[var(--color-text-muted)]">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-[var(--color-text-main)]">{raw}</div>
                {m && typeof m === "object" && m.connectionId ? (
                  <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">Pinned: {m.label || m.connectionId}</div>
                ) : null}
                {draft.strategy === "cost-optimized" && !raw.startsWith("ref:") && (() => {
                  const [provider, ...rest] = raw.split("/");
                  const model = rest.join("/");
                  const hasPricing = !!getPricingForModel(provider, model);
                  return (
                    <div className={`mt-1 inline-flex rounded px-2 py-0.5 text-[9px] font-semibold uppercase ${hasPricing ? "bg-[var(--color-success-soft)] text-[var(--color-success)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"}`}>
                      {hasPricing ? "Pricing available" : "No pricing"}
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => handleMoveUp(i)} disabled={i === 0} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] disabled:opacity-20 cursor-pointer">
                  <AppIcon name="arrow_upward" size={14} />
                </button>
                <button type="button" onClick={() => handleMoveDown(i)} disabled={i === draft.models.length - 1} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] disabled:opacity-20 cursor-pointer">
                  <AppIcon name="arrow_downward" size={14} />
                </button>
                <button type="button" onClick={() => handleRemoveModel(i)} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] cursor-pointer">
                  <AppIcon name="close" size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Weight Total Bar for Weighted Strategy */}
      {draft.strategy === "weighted" && <WeightTotalBar models={draft.models} />}

      {/* Pricing Coverage for Cost-Optimized Strategy */}
      {draft.strategy === "cost-optimized" && draft.models.length > 0 && (
        <div className="rounded border border-[var(--color-border)] px-3 py-2.5 bg-[var(--color-bg-alt)]">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-[var(--color-text-muted)]">Pricing coverage</span>
            <span className="font-medium text-[var(--color-text-main)]">{pricedModelCount}/{draft.models.length} ({pricingCoveragePercent}%)</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-border-strong)]">
            <div className={`h-full ${pricingCoveragePercent === 100 ? "bg-[var(--color-success)]" : pricingCoveragePercent > 0 ? "bg-[var(--color-warning)]" : "bg-[var(--color-danger)]"}`} style={{ width: `${pricingCoveragePercent}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--color-text-muted)]">Cost-optimized works best when all combo models have pricing.</p>
        </div>
      )}
    </div>
  );
}
