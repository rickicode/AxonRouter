"use client";

import PropTypes from "prop-types";
import Link from "next/link";
import { formatTokens, formatTokensExact } from "@/shared/utils/formatTokens";
import Icon from "@/shared/components/Icon";

const fmt = (n) => new Intl.NumberFormat().format(Number(n) || 0);
const fmtCost = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const CARDS = [
  {
    key: "requests",
    label: "Requests",
    icon: "swap_horiz",
    tone: "text-text-main bg-surface-3 border-border",
  },
  {
    key: "input",
    label: "Input Tokens",
    icon: "input",
    tone: "text-primary bg-primary/10 border-primary/20",
  },
  {
    key: "cached",
    label: "Cached Tokens",
    icon: "database",
    tone: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  },
  {
    key: "output",
    label: "Output Tokens",
    icon: "output",
    tone: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    key: "cost",
    label: "Estimated Cost",
    icon: "payments",
    tone: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
];

function Metric({ label, icon, tone, value, valueClass, note, exact, spanTwo = false }) {
  return (
    <div
      className={`flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface px-3 py-2 sm:px-3 sm:py-2.5 ${
        spanTwo ? "col-span-2 sm:col-span-1" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted truncate">
          {label}
        </span>
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${tone}`}>
          <Icon name={icon} size={14} />
        </span>
      </div>
      <div className="mt-1 flex min-w-0 flex-col">
        <span
          title={exact ? (exact.includes("·") || exact.startsWith("Estimated") ? exact : `${exact} · exact count`) : undefined}
          className={`text-lg font-semibold tabular-nums whitespace-nowrap sm:text-xl leading-tight ${valueClass || "text-text-main"}`}
        >
          {value}
        </span>
        <div className="h-4 flex items-center text-[10px] text-text-muted truncate mt-0.5">
          {note}
        </div>
      </div>
    </div>
  );
}

export default function OverviewCards({ stats }) {
  const totalPrompt = Number(stats.totalPromptTokens) || 0;
  const totalCached = Number(stats.totalCachedTokens) || 0;
  const totalCompletion = Number(stats.totalCompletionTokens) || 0;
  const totalCost = Number(stats.totalCost) || 0;
  const totalTokens = totalPrompt + totalCompletion;
  const nonCachedInput = Math.max(0, totalPrompt - totalCached);
  const inputCost = totalTokens > 0 ? (nonCachedInput * totalCost) / totalTokens : 0;
  const cachedCost = totalTokens > 0 ? (totalCached * totalCost) / totalTokens : 0;
  const outputCost = totalTokens > 0 ? (totalCompletion * totalCost) / totalTokens : 0;
  const failed = Number(stats.totalFailedRequests || 0);

  return (
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-5">
      <Metric
        {...CARDS[0]}
        value={fmt(stats.totalRequests)}
        note={
          <span className={failed > 0 ? "text-danger font-medium" : "text-emerald-400 font-medium"}>
            {fmt(failed)} failed
          </span>
        }
      />
      <Metric
        {...CARDS[1]}
        value={formatTokens(stats.totalPromptTokens)}
        exact={formatTokensExact(stats.totalPromptTokens)}
        valueClass="text-primary"
        note={
          <span>{nonCachedInput > 0 ? `${formatTokens(nonCachedInput)} direct` : "All cached"}</span>
        }
      />
      <Metric
        {...CARDS[2]}
        value={formatTokens(stats.totalCachedTokens)}
        exact={formatTokensExact(stats.totalCachedTokens)}
        valueClass="text-cyan-400"
        note={
          <span>{totalPrompt > 0 ? `${Math.round((totalCached / totalPrompt) * 100)}% cache hit` : "0% hit"}</span>
        }
      />
      <Metric
        {...CARDS[3]}
        value={formatTokens(stats.totalCompletionTokens)}
        exact={formatTokensExact(stats.totalCompletionTokens)}
        valueClass="text-emerald-400"
        note={
          <span>{totalTokens > 0 ? `${Math.round((totalCompletion / totalTokens) * 100)}% output` : "0%"}</span>
        }
      />
      <Metric
        {...CARDS[4]}
        value={`~${fmtCost(stats.totalCost)}`}
        exact="Estimated from configured pricing, not billed invoices"
        valueClass="text-amber-400"
        spanTwo
        note={
          <div className="flex items-center justify-between w-full">
            <span className="truncate" title={`In ${fmtCost(inputCost)} · Cache ${fmtCost(cachedCost)} · Out ${fmtCost(outputCost)} (Estimated, not billed)`}>
              In {fmtCost(inputCost)} · Out {fmtCost(outputCost)}
            </span>
            <Link
              href="/dashboard/settings/pricing"
              className="ml-1 text-text-muted hover:text-primary underline decoration-dotted shrink-0"
            >
              Rates
            </Link>
          </div>
        }
      />
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
};
