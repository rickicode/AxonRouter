import AppIcon from "@/shared/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { translate } from "@/i18n/runtime";
import { cn } from "@/lib/utils";

const filterButtonClass = (active) =>
  cn(
    "inline-flex cursor-pointer items-center gap-2 rounded-[4px] border px-3 py-2 text-sm transition-all",
    active
      ? "border-primary bg-primary text-primary-foreground shadow-sm"
      : "border-transparent text-text-muted hover:bg-muted hover:text-text-main",
  );

const filterCountClass = (active) =>
  cn("rounded-full px-1.5 py-0.5 text-[11px]", active ? "bg-primary-foreground/20" : "bg-muted");

export default function CombosHeader({
  combos,
  mappings,
  search,
  setSearch,
  startCreate,
  isExpertMode,
  setIsExpertMode,
  recentlyCreatedCombo,
  handleTestCombo,
  setRecentlyCreatedCombo,
  strategyFilter,
  setStrategyFilter,
  isIntelligentStrategy,
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-[4px] border border-primary/20 bg-primary/10 text-primary">
            <AppIcon name="account_tree" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-main">{translate("Combos")}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
              {translate("Build ordered fallback chains, intelligent routing pools, and model mappings in one place.")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-2 py-1">{combos.length} {translate("combos")}</span>
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-2 py-1">{mappings.length} {translate("mappings")}</span>
              {isExpertMode ? (
                <span className="rounded-full border border-[var(--color-warning)]/35 bg-[var(--color-warning)]/15 px-2 py-1 font-medium uppercase tracking-wider text-[var(--color-warning)]">{translate("Expert")}</span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <AppIcon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={translate("Search combos...")}
                className="pl-9"
              />
            </div>
            <Button onClick={startCreate}>
              <AppIcon name="add" data-icon="inline-start" />
              {translate("Create")}
            </Button>
            <Button variant="secondary" onClick={onAutoSeed} disabled={isAutoSeeding}>
              <AppIcon name="auto_awesome" data-icon="inline-start" />
              {isAutoSeeding ? translate("Seeding...") : translate("Auto-Seed")}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setIsExpertMode(!isExpertMode)}
            aria-pressed={isExpertMode}
            className={cn(
              "w-fit cursor-pointer rounded-[4px] border px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors",
              isExpertMode
                ? "border-[var(--color-warning)]/35 bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                : "border-[var(--color-border)] text-text-muted hover:border-[var(--color-warning)]/35 hover:text-[var(--color-warning)]",
            )}
          >
            {isExpertMode ? translate("Expert mode on") : translate("Enable expert mode")}
          </button>
        </div>
      </div>

      {recentlyCreatedCombo && (
        <Card className="rounded-[4px] border border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-text-main">{translate("Combo")} {recentlyCreatedCombo} {translate("created!")}</p>
              <p className="text-xs text-text-muted">{translate("Run a test now to confirm fallback and latency behavior.")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => { handleTestCombo({ name: recentlyCreatedCombo }); setRecentlyCreatedCombo(""); }}>
                <AppIcon name="play_arrow" data-icon="inline-start" />
                {translate("Test now")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRecentlyCreatedCombo("")}>{translate("Dismiss")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-1">
        <button
          key="all"
          type="button"
          onClick={() => setStrategyFilter("all")}
          aria-pressed={strategyFilter === "all"}
          className={filterButtonClass(strategyFilter === "all")}
        >
          <AppIcon name="layers" size={14} />
          {translate("All")}
          <span className={filterCountClass(strategyFilter === "all")}>{combos.length}</span>
        </button>
        <button
          key="intelligent"
          type="button"
          onClick={() => setStrategyFilter("intelligent")}
          aria-pressed={strategyFilter === "intelligent"}
          className={filterButtonClass(strategyFilter === "intelligent")}
        >
          <AppIcon name="auto_awesome" size={14} />
          {translate("Intelligent")}
          <span className={filterCountClass(strategyFilter === "intelligent")}>{combos.filter((c) => isIntelligentStrategy(c?.strategy)).length}</span>
        </button>
        <button
          key="deterministic"
          type="button"
          onClick={() => setStrategyFilter("deterministic")}
          aria-pressed={strategyFilter === "deterministic"}
          className={filterButtonClass(strategyFilter === "deterministic")}
        >
          <AppIcon name="sort" size={14} />
          {translate("Deterministic")}
          <span className={filterCountClass(strategyFilter === "deterministic")}>{combos.filter((c) => !isIntelligentStrategy(c?.strategy)).length}</span>
        </button>
      </div>
    </div>
  );
}
