import AppIcon from "@/shared/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

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
  const strategy = combo.strategy || "round-robin";
  const isSelected = selectedIntelligentCombo?.id === combo.id;
  const isDisabled = combo.isHidden === true;
  const statusLabel = isDisabled ? t("disabled") : t("active");

  return (
    <div
      key={combo.id}
      className={cn(
        "group rounded-[4px] border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm",
        isSelected ? "border-primary/40 bg-primary/5" : "border-[var(--color-border)]",
        isDisabled && "opacity-60",
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-[4px] border border-primary/20 bg-primary/10 text-primary">
              <AppIcon name="layers" size={16} />
            </div>
            <code className="truncate text-sm font-semibold text-text-main">{combo.name}</code>
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-2 py-0.5 text-[10px] font-medium uppercase text-text-muted">{strategy}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                isDisabled
                  ? "border border-[var(--color-warning)]/35 bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                  : "border border-[var(--color-success)]/35 bg-[var(--color-success)]/15 text-[var(--color-success)]",
              )}
            >
              {statusLabel}
            </span>
            {isSelected ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{t("selected")}</span> : null}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {models.length === 0 ? (
              <span className="text-xs italic text-text-muted">No models</span>
            ) : (
              models.slice(0, 3).map((entry, index) => {
                const label = formatStepLabel(entry);
                return (
                  <code key={`${getStepKey(entry)}-${index}`} className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-1.5 py-0.5 text-[10px] text-text-muted">
                    {label}
                  </code>
                );
              })
            )}
            {models.length > 3 ? <span className="text-[10px] text-text-muted">+{models.length - 3} more</span> : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-text-muted">
            <span className="inline-flex items-center gap-1"><AppIcon name="route" size={12} />{models.length} steps</span>
            <span className="inline-flex items-center gap-1"><AppIcon name="alt_route" size={12} />{strategy}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-2 md:justify-end md:border-t-0 md:pt-0">
          <div className="flex items-center gap-2">
            <Switch checked={!combo.isHidden} onToggle={() => handleToggleCombo(combo)} />
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleTestCombo({ name: combo.name })} className="rounded p-1.5 text-text-muted hover:text-[var(--color-success)]" title="Test combo">
              <AppIcon name={testingCombo === combo.name ? "progress_activity" : "play_arrow"} data-icon="inline-start" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => handleDuplicateCombo(combo)} className="rounded p-1.5 text-text-muted hover:text-primary" title="Duplicate combo">
              <AppIcon name="content_copy" data-icon="inline-start" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => handleCreateMapping(combo)} className="rounded p-1.5 text-text-muted hover:text-primary" title="Create model mapping">
              <AppIcon name="route" data-icon="inline-start" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(combo)} className="rounded p-1.5 text-text-muted hover:text-primary" title="Edit combo">
              <AppIcon name="edit" data-icon="inline-start" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteCombo(combo.id)} className="rounded p-1.5 text-text-muted hover:text-destructive" title="Delete combo">
              <AppIcon name="delete" data-icon="inline-start" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
