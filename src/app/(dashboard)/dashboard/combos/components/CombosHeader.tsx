import AppIcon from "@/shared/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { translate } from "@/i18n/runtime";

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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AppIcon name="account_tree" size={20} className="text-primary" />
          <div>
            <h1 className="text-xl font-semibold text-text-main">{translate("Combos")}</h1>
            <p className="text-xs text-text-muted">{combos.length} {translate("combos")} · {mappings.length} {translate("mappings")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-48">
            <AppIcon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={translate("Search...")}
              className="pl-9"
            />
          </div>
          <Button onClick={startCreate}>
            <AppIcon name="add" data-icon="inline-start" />
            {translate("Create")}
          </Button>
          {isExpertMode && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">{translate("Expert")}</span>
          )}
          <button
            type="button"
            onClick={() => setIsExpertMode(!isExpertMode)}
            className={`cursor-pointer rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors ${isExpertMode ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" : "border-[var(--color-border)] text-text-muted hover:border-amber-500/30 hover:text-amber-600"}`}
          >
            {translate("Expert")}
          </button>
        </div>
      </div>

      {recentlyCreatedCombo && (
        <Card className="rounded-xl border border-pink-500/30 bg-pink-500/5">
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

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-1">
        <button
          key="all"
          type="button"
          onClick={() => setStrategyFilter("all")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-all ${strategyFilter === "all" ? "border border-pink-500 bg-pink-500 text-white font-medium shadow-sm" : "border border-transparent text-text-muted hover:bg-black/10 dark:hover:bg-white/10 hover:text-text-main"}`}
        >
          <AppIcon name="layers" size={14} />
          {translate("All")}
          <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${strategyFilter === "all" ? "bg-white/20" : "bg-black/10 dark:bg-white/10"}`}>{combos.length}</span>
        </button>
        <button
          key="intelligent"
          type="button"
          onClick={() => setStrategyFilter("intelligent")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-all ${strategyFilter === "intelligent" ? "border border-pink-500 bg-pink-500 text-white font-medium shadow-sm" : "border border-transparent text-text-muted hover:bg-black/10 dark:hover:bg-white/10 hover:text-text-main"}`}
        >
          <AppIcon name="auto_awesome" size={14} />
          {translate("Intelligent")}
          <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${strategyFilter === "intelligent" ? "bg-white/20" : "bg-black/10 dark:bg-white/10"}`}>{combos.filter((c) => isIntelligentStrategy(c?.strategy)).length}</span>
        </button>
        <button
          key="deterministic"
          type="button"
          onClick={() => setStrategyFilter("deterministic")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-all ${strategyFilter === "deterministic" ? "border border-pink-500 bg-pink-500 text-white font-medium shadow-sm" : "border border-transparent text-text-muted hover:bg-black/10 dark:hover:bg-white/10 hover:text-text-main"}`}
        >
          <AppIcon name="sort" size={14} />
          {translate("Deterministic")}
          <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${strategyFilter === "deterministic" ? "bg-white/20" : "bg-black/10 dark:bg-white/10"}`}>{combos.filter((c) => !isIntelligentStrategy(c?.strategy)).length}</span>
        </button>
      </div>
    </div>
  );
}
