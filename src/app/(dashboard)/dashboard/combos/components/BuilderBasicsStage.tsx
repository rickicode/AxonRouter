// BuilderBasicsStage - Following DESIGN.md with CSS variables for dark/light mode support

export default function BuilderBasicsStage({ draft, setDraft }) {
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-4">
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Combo Name
        </label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
          placeholder="my-combo"
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-4 py-3 text-sm text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
        />
        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
          Use letters, numbers, underscore, dash, slash, or dot
        </p>
      </div>
      <div>
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Priority
        </label>
        <input
          type="number"
          value={draft.priority}
          onChange={(e) => setDraft((c) => ({ ...c, priority: e.target.value }))}
          placeholder="0"
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-4 py-3 text-sm text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
        />
        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
          Higher priority combos are checked first (0 = default)
        </p>
      </div>
    </div>
  );
}
