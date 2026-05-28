import AppIcon from "@/shared/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export default function ComboCard({
  combo,
  selectedIntelligentCombo,
  formatStepLabel,
  getStepKey,
  testingCombo,
  handleTestCombo,
  handleDuplicateCombo,
  startEdit,
  handleDeleteCombo,
  handleToggleCombo,
  handleCreateMapping,
  t,
}) {
  const models = combo.models || [];
  const strategy = combo.strategy || "priority";
  const isSelected = selectedIntelligentCombo?.id === combo.id;
  const isDisabled = combo.isHidden === true;

  return (
    <div
      key={combo.id}
      className={`group rounded-xl border p-3 transition-all ${
        isSelected ? "border-pink-500/40 bg-pink-500/5" : "border-[var(--color-border)] bg-[var(--color-bg-alt)]"
      } ${isDisabled ? "opacity-50" : ""}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500">
              <AppIcon name="layers" size={16} />
            </div>
            <code className="truncate text-sm font-medium text-text-main">{combo.name}</code>
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] uppercase dark:bg-white/5">{strategy}</span>
            {isSelected ? <span className="rounded-full bg-pink-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-pink-600 dark:text-pink-400">selected</span> : null}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {models.length === 0 ? (
              <span className="text-xs italic text-text-muted">No models</span>
            ) : (
              models.slice(0, 3).map((entry, index) => {
                const label = formatStepLabel(entry);
                return (
                  <code key={`${getStepKey(entry)}-${index}`} className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] text-text-muted dark:bg-white/5">
                    {label}
                  </code>
                );
              })
            )}
            {models.length > 3 ? <span className="text-[10px] text-text-muted">+{models.length - 3} more</span> : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-text-muted">
            <span>{models.length} steps</span>
            <span>{strategy}</span>
            {combo.isHidden ? <span className="text-amber-600 dark:text-amber-400">disabled</span> : <span className="text-emerald-600 dark:text-emerald-400">active</span>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-black/5 pt-2 dark:border-white/5 md:justify-end md:border-t-0 md:pt-0">
          <div className="flex items-center gap-2">
            <Switch checked={!combo.isHidden} onToggle={() => handleToggleCombo(combo)} />
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleTestCombo({ name: combo.name })} className="rounded p-1.5 text-text-muted hover:text-emerald-500" title="Test combo">
              <AppIcon name={testingCombo === combo.name ? "progress_activity" : "play_arrow"} data-icon="inline-start" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => handleDuplicateCombo(combo)} className="rounded p-1.5 text-text-muted hover:text-pink-500" title="Duplicate combo">
              <AppIcon name="content_copy" data-icon="inline-start" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => handleCreateMapping(combo)} className="rounded p-1.5 text-text-muted hover:text-primary" title="Create model mapping">
              <AppIcon name="route" data-icon="inline-start" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(combo)} className="rounded p-1.5 text-text-muted hover:text-primary" title="Edit combo">
              <AppIcon name="edit" data-icon="inline-start" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteCombo(combo.id)} className="rounded p-1.5 text-text-muted hover:text-red-500" title="Delete combo">
              <AppIcon name="delete" data-icon="inline-start" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
