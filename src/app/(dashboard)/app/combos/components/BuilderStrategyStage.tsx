import AppIcon from "@/shared/components/AppIcon";

// BuilderStrategyStage - Using CSS variables for dark/light mode support

export default function BuilderStrategyStage({
  draft,
  setDraft,
  ROUTING_STRATEGIES,
  isIntelligentStrategy,
  normalizeIntelligentRoutingConfig,
  isExpertMode,
  showAdvanced,
  setShowAdvanced,
  t,
}) {
  return (
    <div className="space-y-4">
      {/* Main Container */}
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <label className="mb-3 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Strategy
        </label>
        <div className="flex flex-wrap gap-2">
          {ROUTING_STRATEGIES.map((entry) => {
            const value = entry.value || entry.id || entry;
            const isActive = draft.strategy === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setDraft((c) => ({ ...c, strategy: value, config: isIntelligentStrategy(value) ? normalizeIntelligentRoutingConfig(c.config) : c.config }))}
                className={`rounded px-3 py-2 text-xs transition-all cursor-pointer ${isActive 
                  ? "bg-[var(--color-primary)] text-[var(--color-text-inverse)] font-medium border border-[var(--color-primary)]" 
                  : "border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"}`}
              >
                {value}
              </button>
            );
          })}
        </div>

        {!isExpertMode && (
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            className="mt-4 flex items-center gap-1 text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-main)] cursor-pointer"
          >
            <AppIcon name={showAdvanced ? "expand_less" : "expand_more"} size={16} />
            Advanced settings
          </button>
        )}
      </div>

      {/* Advanced Settings */}
      {(isExpertMode || showAdvanced) && (
        <div className="rounded border border-[var(--color-border)] p-4 bg-[var(--color-bg-alt)]">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[var(--color-text-muted)]">Max retries</label>
              <input
                type="number"
                min="0"
                max="10"
                value={draft.config.maxRetries ?? ""}
                placeholder="1"
                onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, maxRetries: e.target.value ? Number(e.target.value) : undefined } }))}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[var(--color-text-muted)]">Retry delay (ms)</label>
              <input
                type="number"
                min="0"
                max="60000"
                step="500"
                value={draft.config.retryDelayMs ?? ""}
                placeholder="2000"
                onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, retryDelayMs: e.target.value ? Number(e.target.value) : undefined } }))}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
              />
            </div>
          </div>

          {draft.strategy === "round-robin" && (
            <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[var(--color-border)] pt-3 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--color-text-muted)]">Concurrency per model</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={draft.config.concurrencyPerModel ?? ""}
                  placeholder="3"
                  onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, concurrencyPerModel: e.target.value ? Number(e.target.value) : undefined } }))}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--color-text-muted)]">Queue timeout (ms)</label>
                <input
                  type="number"
                  min="1000"
                  max="120000"
                  step="1000"
                  value={draft.config.queueTimeoutMs ?? ""}
                  placeholder="30000"
                  onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, queueTimeoutMs: e.target.value ? Number(e.target.value) : undefined } }))}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
              </div>
            </div>
          )}

          {draft.strategy === "context-relay" && (
            <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[var(--color-border)] pt-3 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--color-text-muted)]">Handoff threshold</label>
                <input
                  type="number"
                  min="0.5"
                  max="0.94"
                  step="0.01"
                  value={draft.config.handoffThreshold ?? ""}
                  placeholder="0.85"
                  onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, handoffThreshold: e.target.value ? Number(e.target.value) : undefined } }))}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--color-text-muted)]">Max messages for summary</label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={draft.config.maxMessagesForSummary ?? ""}
                  placeholder="30"
                  onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, maxMessagesForSummary: e.target.value ? Number(e.target.value) : undefined } }))}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--color-text-muted)]">Handoff model</label>
                <input
                  type="text"
                  value={draft.config.handoffModel ?? ""}
                  placeholder="codex/gpt-5.4"
                  onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, handoffModel: e.target.value || undefined } }))}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
              </div>
            </div>
          )}

          {/* Agent Features Section */}
          <div className="mt-3 border-t border-[var(--color-border)] pt-3">
            <div className="mb-3 flex items-center gap-2">
              <AppIcon name="smart_toy" size={16} className="text-[var(--color-primary)]" />
              <p className="text-xs font-medium text-[var(--color-text-main)]">Agent features</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--color-text-muted)]">System message override</label>
                <textarea
                  rows={2}
                  value={draft.systemMessage || ""}
                  onChange={(e) => setDraft((c) => ({ ...c, systemMessage: e.target.value }))}
                  placeholder="Optional system instructions for this combo"
                  className="w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--color-text-muted)]">Tool filter regex</label>
                <input
                  type="text"
                  value={draft.toolFilterRegex || ""}
                  onChange={(e) => setDraft((c) => ({ ...c, toolFilterRegex: e.target.value }))}
                  placeholder="e.g. ^(bash|computer)$"
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                />
              </div>
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Context cache protection</span>
                <input
                  type="checkbox"
                  checked={Boolean(draft.contextCacheProtection)}
                  onChange={(e) => setDraft((c) => ({ ...c, contextCacheProtection: e.target.checked }))}
                  className="accent-[var(--color-primary)] cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
