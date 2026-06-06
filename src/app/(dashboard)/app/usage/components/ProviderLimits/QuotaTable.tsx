"use client";

import { formatResetTime, calculatePercentage } from "./utils";
import { cn } from "@/lib/utils";

function toFiniteNumber(value: any): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatQuotaNumber(value: any, fallback = "0") {
  const number = toFiniteNumber(value);
  return number === null ? fallback : number.toLocaleString();
}

function getRemaining(quota: any): number {
  const remainingPercentage = toFiniteNumber(quota.remainingPercentage);
  if (remainingPercentage !== null) return Math.round(remainingPercentage);
  const used = toFiniteNumber(quota.used) ?? 0;
  const total = toFiniteNumber(quota.total) ?? 0;
  return calculatePercentage(used, total);
}

type ColorSet = { text: string; bg: string; muted: string };

function getColors(remaining: number): ColorSet {
  if (remaining > 70) return { text: "text-emerald-400", bg: "bg-emerald-500", muted: "text-emerald-400/70" };
  if (remaining >= 30) return { text: "text-amber-400", bg: "bg-amber-500", muted: "text-amber-400/70" };
  return { text: "text-rose-400", bg: "bg-rose-500", muted: "text-rose-400/70" };
}

function formatResetTimeShort(resetAt: any): string | null {
  if (!resetAt) return null;
  const countdown = formatResetTime(resetAt);
  return countdown !== "-" ? countdown : null;
}

function formatResetTimeAbsolute(resetAt: any): string | null {
  if (!resetAt) return null;

  try {
    const resetDate = new Date(resetAt);
    if (!Number.isFinite(resetDate.getTime())) return null;

    const now = new Date();
    const isToday = resetDate.toDateString() === now.toDateString();
    const isTomorrow = resetDate.toDateString() === new Date(now.getTime() + 86400000).toDateString();
    const timeStr = resetDate.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    if (isToday) return `Today, ${timeStr}`;
    if (isTomorrow) return `Tomorrow, ${timeStr}`;

    return resetDate.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
}

function formatQuotaLabel(quota: any): string {
  const normalized = typeof quota?.name === "string" ? quota.name.trim().toLowerCase() : "";
  if (normalized === "session") {
    return quota?.hasSessionWindow === true || quota?.usageWindowType === "session_and_weekly"
      ? "Session window (5h)"
      : "Session window";
  }
  if (normalized === "weekly") return "Weekly window (7d)";
  return typeof quota?.name === "string" && quota.name.trim() ? quota.name : "Quota";
}

// --- Percentage Row (claude/codex: session + weekly with prominent %) ---
function PercentageLayout({ quotas }: { quotas: any[] }) {
  return (
    <div className="space-y-2.5 py-1">
      {quotas.map((quota, i) => {
        const remaining = getRemaining(quota);
        const colors = getColors(remaining);
        const reset = formatResetTimeShort(quota.resetAt);
        const absoluteReset = formatResetTimeAbsolute(quota.resetAt);

        return (
          <div key={i} className="space-y-1.5 rounded-md border border-zinc-800/80 bg-zinc-900/30 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-zinc-200">{formatQuotaLabel(quota)}</span>
              <span className={cn("text-sm font-bold tabular-nums", colors.text)}>{remaining}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-zinc-800">
              <div className={cn("h-full rounded-full transition-all duration-300", colors.bg)} style={{ width: `${remaining}%` }} />
            </div>
            {(reset || absoluteReset) && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500">
                {reset && <span>Reset in {reset}</span>}
                {reset && absoluteReset && <span>•</span>}
                {absoluteReset && <span>Reset at {absoluteReset}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Credit Layout (kiro/amazon-q: used / total credits) ---
function CreditLayout({ quotas }: { quotas: any[] }) {
  return (
    <div className="space-y-2 py-1">
      {quotas.map((quota, i) => {
        const used = toFiniteNumber(quota.used) ?? 0;
        const total = toFiniteNumber(quota.total) ?? 0;
        const remaining = getRemaining(quota);
        const colors = getColors(remaining);
        const reset = formatResetTimeShort(quota.resetAt);
        const barWidth = total > 0 ? Math.min(100, (used / total) * 100) : 0;

        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300 truncate">{quota.name}</span>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-bold tabular-nums", colors.text)}>
                  {formatQuotaNumber(total - used)}
                </span>
                <span className="text-[10px] text-zinc-500">/ {formatQuotaNumber(total)}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className={cn("h-full rounded-full transition-all duration-300", colors.bg)} style={{ width: `${barWidth}%` }} />
            </div>
            {reset && <span className="text-[9px] text-zinc-500">resets in {reset}</span>}
          </div>
        );
      })}
    </div>
  );
}

// --- Model Grid (antigravity: per-model compact bars grouped by family) ---
function ModelGridLayout({ quotas }: { quotas: any[] }) {
  // Group quotas by family
  const familyOrder = ["Claude", "Gemini", "Other"];
  const grouped = new Map<string, any[]>();
  for (const quota of quotas) {
    const family = quota.family || "Other";
    if (!grouped.has(family)) grouped.set(family, []);
    grouped.get(family)!.push(quota);
  }

  // Sort groups in canonical order
  const sortedFamilies = [...grouped.entries()].sort(([a], [b]) => {
    const ai = familyOrder.indexOf(a);
    const bi = familyOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="space-y-3 py-1">
      {sortedFamilies.map(([familyName, familyQuotas]) => {
        // Family-level remaining = best (highest) remaining across all models in the family
        const familyRemaining = Math.max(...familyQuotas.map((q: any) => getRemaining(q)));
        const familyColors = getColors(familyRemaining);
        const allExhausted = familyQuotas.every((q: any) => getRemaining(q) <= 0);

        return (
          <div key={familyName}>
            {/* Family header */}
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                {familyName}
              </span>
              {allExhausted ? (
                <span className="text-[10px] font-bold text-rose-400">Exhausted</span>
              ) : (
                <span className={cn("text-[10px] font-bold tabular-nums", familyColors.text)}>
                  {familyRemaining}%
                </span>
              )}
            </div>
            {/* Model bars */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {familyQuotas.map((quota: any, i: number) => {
                const remaining = getRemaining(quota);
                const colors = getColors(remaining);
                const reset = formatResetTimeShort(quota.resetAt);

                return (
                  <div key={i} className="min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-[10px] font-medium text-zinc-400 truncate">{quota.name}</span>
                      <span className={cn("text-[10px] font-bold tabular-nums shrink-0", colors.text)}>{remaining}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-300", colors.bg)} style={{ width: `${remaining}%` }} />
                    </div>
                    {reset && <span className="text-[8px] text-zinc-600">{reset}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Standard Row (github, generic fallback) ---
function StandardLayout({ quotas }: { quotas: any[] }) {
  return (
    <div className="space-y-2 py-1">
      {quotas.map((quota, i) => {
        const used = toFiniteNumber(quota.used) ?? 0;
        const total = toFiniteNumber(quota.total) ?? 0;
        const remaining = getRemaining(quota);
        const colors = getColors(remaining);
        const reset = formatResetTimeShort(quota.resetAt);

        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300 truncate">{quota.name}</span>
              <span className={cn("text-[10px] font-bold tabular-nums", colors.text)}>{remaining}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className={cn("h-full rounded-full transition-all duration-300", colors.bg)} style={{ width: `${remaining}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <span>{formatQuotaNumber(used)} / {total > 0 ? formatQuotaNumber(total) : "∞"}</span>
              {reset && <span>resets in {reset}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Detect provider type from quota shape ---
type QuotaDisplayType = "percentage" | "credit" | "model-grid" | "standard";

function detectDisplayType(provider: string | undefined, quotas: any[]): QuotaDisplayType {
  const p = (provider || "").toLowerCase();

  // Percentage-based: claude, codex (session/weekly with % values, total=100)
  if (p === "claude" || p === "codex") return "percentage";

  // Credit-based: kiro, amazon-q (used/total numeric credits)
  if (p === "kiro" || p === "amazon-q") return "credit";

  // Model grid: antigravity (many models with per-model %)
  if (p === "antigravity") return "model-grid";

  // Heuristic fallback: if all quotas have total=100, treat as percentage
  if (quotas.length > 0 && quotas.length <= 4 && quotas.every((q) => (toFiniteNumber(q.total) ?? 0) === 100)) {
    return "percentage";
  }

  // If many items (>4), use model grid
  if (quotas.length > 4) return "model-grid";

  return "standard";
}

/**
 * Provider-aware Quota Display
 */
export default function QuotaTable({ quotas = [], compact = false, provider }: { quotas?: any[]; compact?: boolean; provider?: string }) {
  if (!quotas || quotas.length === 0) return null;

  const displayType = detectDisplayType(provider, quotas);

  switch (displayType) {
    case "percentage":
      return <PercentageLayout quotas={quotas} />;
    case "credit":
      return <CreditLayout quotas={quotas} />;
    case "model-grid":
      return <ModelGridLayout quotas={quotas} />;
    default:
      return <StandardLayout quotas={quotas} />;
  }
}
