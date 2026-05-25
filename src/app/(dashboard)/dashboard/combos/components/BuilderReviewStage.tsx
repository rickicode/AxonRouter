// BuilderReviewStage - Using CSS variables for dark/light mode support

function stepBadgeClassDark(step) {
  return step.startsWith("ref:")
    ? "border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
    : "border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)] text-[var(--color-primary)]";
}

export default function BuilderReviewStage({
  draft,
  comboRefCount,
  pinnedAccountCount,
  uniqueProviderCount,
  pricedModelCount,
  pricingCoveragePercent,
  formatStepLabel,
  getStepKey,
  stepBadgeClass,
  t,
}) {
  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded border p-3 bg-[var(--color-bg-alt)] border-[var(--color-border)]">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Steps</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-text-main)]">{draft.models.length}</p>
        </div>
        <div className="rounded border p-3 bg-[var(--color-bg-alt)] border-[var(--color-border)]">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Providers</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-text-main)]">{uniqueProviderCount}</p>
        </div>
        <div className="rounded border p-3 bg-[var(--color-bg-alt)] border-[var(--color-border)]">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Combo refs</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-text-main)]">{comboRefCount}</p>
        </div>
        <div className="rounded border p-3 bg-[var(--color-bg-alt)] border-[var(--color-border)]">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Pinned</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-text-main)]">{pinnedAccountCount}</p>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <div className="rounded border p-3 border-[var(--color-border)]">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Config keys</p>
          <p className="mt-1 font-semibold text-[var(--color-text-main)]">{Object.keys(draft.config || {}).length}</p>
        </div>
        <div className="rounded border p-3 border-[var(--color-border)]">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Agent flags</p>
          <p className="mt-1 font-semibold text-[var(--color-text-main)]">{[draft.systemMessage, draft.toolFilterRegex, draft.contextCacheProtection ? "cache" : ""].filter(Boolean).length}</p>
        </div>
      </div>

      {/* Pricing Coverage */}
      {draft.strategy === "cost-optimized" && draft.models.length > 0 && (
        <div className="rounded border px-3 py-2.5 bg-[var(--color-bg-alt)] border-[var(--color-border)]">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-[var(--color-text-muted)]">Pricing coverage</span>
            <span className="font-medium text-[var(--color-text-main)]">{pricedModelCount}/{draft.models.length} ({pricingCoveragePercent}%)</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-border-strong)]">
            <div className={`h-full ${pricingCoveragePercent === 100 ? "bg-[var(--color-success)]" : pricingCoveragePercent > 0 ? "bg-[var(--color-warning)]" : "bg-[var(--color-danger)]"}`} style={{ width: `${pricingCoveragePercent}%` }} />
          </div>
          {pricingCoveragePercent < 100 ? (
            <p className="mt-1.5 text-[10px] text-[var(--color-warning)]">Some models do not have pricing, so cost-optimized routing may be partial.</p>
          ) : null}
        </div>
      )}

      {/* Steps List */}
      <div className="space-y-2">
        {draft.models.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">No steps added yet.</p>
        ) : (
          draft.models.map((model, index) => (
            <div 
              key={`${getStepKey(model)}-${index}`} 
              className="flex items-center justify-between rounded border px-3 py-2.5 bg-[var(--color-surface)] border-[var(--color-border)]"
            >
              <div className="min-w-0 flex-1">
                <span className="text-xs text-[var(--color-text-main)]">{formatStepLabel(model)}</span>
                {model && typeof model === "object" && model.connectionId ? (
                  <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">Pinned: {model.label || model.connectionId}</div>
                ) : null}
              </div>
              <span 
                className={`rounded-full border px-2 py-0.5 text-[10px] ${stepBadgeClassDark(formatStepLabel(model))}`}
              >
                {formatStepLabel(model).startsWith("ref:") ? "Combo Ref" : "Model Step"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
