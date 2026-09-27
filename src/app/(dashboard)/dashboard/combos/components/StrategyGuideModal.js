"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Modal, Button } from "@/shared/components";
import Icon from "@/shared/components/Icon";

const STRATEGIES = [
  {
    key: "difficulty",
    name: "Smart Routing",
    subtitle: "Binary 2-Tier (Easy & Hard)",
    icon: "auto_awesome",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    badge: "Cost & Latency Optimizer",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    highlights: ["2 Tiers (Easy & Hard)", "<50ms Jev Classification", "40-70% Cost Reduction"],
    summary: "Dynamically routes prompts to either Easy or Hard tier models based on prompt complexity, intent, and required reasoning.",
    mechanism: "An ultra-fast classifier analyzes prompt intent and token count in real time (<50ms). Simple tasks, formatting, code reviews, and routine queries route directly to the Easy tier (fast & cost-efficient models). Complex architectural designs, multi-step math, and hard coding problems route to the Hard tier (frontier reasoning models). In Two-Layer mode, Jev classifies first and escalates to an LLM judge only when confidence is below the threshold.",
    tiers: [
      { name: "Easy Tier", desc: "Fast, low-cost models (e.g. MiMo 2.6 Flash, GLM Flash) for prompt completions, summaries, and lightweight tasks.", icon: "bolt", color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" },
      { name: "Hard Tier", desc: "Frontier reasoning models (e.g. Claude Opus/Sonnet, GPT-5, Gemini Pro) for architecture and complex logic.", icon: "neurology", color: "text-rose-400 border-rose-500/20 bg-rose-500/5" },
    ],
    pros: [
      "Saves 40-70% on token expenditure without sacrificing output quality on hard problems",
      "Sub-50ms classification speed via Jev System One (TypeSafe / OpenCode Zen)",
      "Eliminates middle-tier ambiguity: clear binary choice between speed and frontier power",
      "Per-session tier stickiness preserves prompt caching on large agent threads",
    ],
    cons: [
      "Requires an active Jev provider in Capabilities (TypeSafe AI or OpenCode Zen) for sub-50ms fast-path; otherwise uses LLM judge or policy default tier",
      "Adds minimal classifier overhead (~15-30ms) before initial prompt dispatch",
    ],
    recommendedFor: "AI coding assistants (Cline, Cursor, Copilot, Codex), multi-agent swarms, and production API gateways handling varied prompt loads.",
  },
  {
    key: "fallback",
    name: "Sequential Fallback",
    subtitle: "Priority Order (#1 → #2 → #3)",
    icon: "alt_route",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    badge: "Reliability & Uptime",
    badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    highlights: ["100% High Availability", "Zero Extra Tokens", "Instant Failover"],
    summary: "Queries models strictly in configured priority order (#1 -> #2 -> #3), failing over instantly upon error.",
    mechanism: "The router directs every request to the primary model first. If it encounters a rate limit (HTTP 429), timeout, network failure, or provider outage, it immediately fails over to the next healthy model in milliseconds without dropping the client stream.",
    pros: [
      "Zero additional token cost or judge overhead",
      "Guaranteed maximum uptime by gracefully catching provider outages",
      "Deterministic model preference: always uses your #1 model whenever it is available",
    ],
    cons: [
      "Only the primary model receives traffic under normal healthy conditions",
      "Does not balance load across multiple API quotas or keys",
    ],
    recommendedFor: "Mission-critical production endpoints where zero downtime is essential with zero extra routing costs.",
  },
  {
    key: "round-robin",
    name: "Load-Balanced Round Robin",
    subtitle: "Traffic Distribution & Caching",
    icon: "sync",
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
    badge: "Traffic Balancing",
    badgeClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    highlights: ["Even Quota Distribution", "Sticky Cache Windows", "Quota Protection"],
    summary: "Distributes incoming queries evenly across all configured models in the pool to maximize throughput.",
    mechanism: "Each request cycles to the next healthy model in the pool. With 'Sticky calls per model', you can pin N consecutive calls from the same client to one model before advancing, maximizing prompt caching efficiency while distributing overall token volume.",
    pros: [
      "Evenly distributes TPM and RPM across multiple providers, regions, or API keys",
      "Prevents rate-limit exhaustion and account lockout on high-volume accounts",
      "Sticky windows allow prompt cache re-use for active chat conversations",
    ],
    cons: [
      "Output style or speed may vary slightly if pool contains disparate model families",
    ],
    recommendedFor: "High-throughput shared services, team accounts, and apps utilizing multiple API keys or accounts.",
  },
  {
    key: "fusion",
    name: "Consensus Fusion",
    subtitle: "Parallel Ensemble & Synthesis",
    icon: "groups",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    badge: "Maximum Accuracy",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    highlights: ["Multi-Model Consensus", "Hallucination Defense", "Deep Synthesis"],
    summary: "Broadcasts requests to all models simultaneously, then uses a consensus judge to synthesize the final answer.",
    mechanism: "The gateway fans out the user query concurrently to every model configured in the combo. When all answers return, an intelligent judge model analyzes differing perspectives, cross-verifies facts, and synthesizes a single unified master response.",
    pros: [
      "Combines reasoning strengths of multiple distinct AI foundation models",
      "Drastically reduces hallucinations through real-time cross-model consensus",
      "Unmatched analytical depth on hard mathematical or logical problems",
    ],
    cons: [
      "High cost: each request incurs N parallel model queries plus 1 synthesis judge query",
      "Total latency is bounded by the slowest responding model in the pool",
    ],
    recommendedFor: "High-stakes architectural decision analysis, complex scientific problem solving, and hallucination-sensitive research.",
  },
];

const FILTER_TABS = [
  { id: "all", label: "All Strategies", icon: "view_agenda" },
  { id: "difficulty", label: "Smart Routing (2-Tier)", icon: "auto_awesome" },
  { id: "fallback", label: "Sequential Fallback", icon: "alt_route" },
  { id: "round-robin", label: "Round Robin", icon: "sync" },
  { id: "fusion", label: "Consensus Fusion", icon: "groups" },
];

export default function StrategyGuideModal({ isOpen, onClose }) {
  const [selectedFilter, setSelectedFilter] = useState("all");

  const visibleStrategies =
    selectedFilter === "all"
      ? STRATEGIES
      : STRATEGIES.filter((s) => s.key === selectedFilter);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Routing Strategies & Architecture Guide"
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <span className="text-[11px] text-text-muted hidden sm:inline">
            Tip: You can switch strategies anytime on individual combo cards.
          </span>
          <Button size="sm" variant="primary" onClick={onClose} className="w-full sm:w-auto">
            Got it, Back to Combos
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        {/* Intro */}
        <p className="text-xs text-text-muted leading-relaxed">
          Combos bundle multiple AI models under a unified endpoint name. Choose the strategy that matches your uptime, latency, cost, and reasoning criteria:
        </p>

        {/* Mobile-Friendly Strategy Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {FILTER_TABS.map((tab) => {
            const active = selectedFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedFilter(tab.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  active
                    ? "bg-primary text-white shadow-xs font-semibold"
                    : "bg-surface-2 border border-border text-text-muted hover:border-border/80 hover:text-text-main"
                }`}
              >
                <Icon name={tab.icon} size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Strategies Cards Container */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4 max-h-[72vh] sm:max-h-[64vh] overflow-y-auto pr-1 sm:pr-1.5 overscroll-contain">
          {visibleStrategies.map((strat) => (
            <div
              key={strat.key}
              className="flex flex-col justify-between rounded-xl border border-border bg-surface-2 p-3.5 sm:p-4.5 shadow-xs transition-all hover:border-border/80"
            >
              <div className="flex flex-col gap-3">
                {/* Header: Icon, Title, Badge */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-lg border ${strat.color}`}
                    >
                      <Icon name={strat.icon} size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="text-sm font-bold text-text-main truncate">
                          {strat.name}
                        </h4>
                        <span
                          className={`rounded-full border px-2 py-0.2 font-mono text-[10px] font-semibold ${strat.badgeClass}`}
                        >
                          {strat.badge}
                        </span>
                      </div>
                      <span className="text-[11px] text-text-muted block font-medium">
                        {strat.subtitle}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Highlights bar */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {strat.highlights.map((h, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-md bg-surface px-2 py-0.5 text-[10px] font-mono font-medium text-text-muted border border-border/70"
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {/* Summary sentence */}
                <p className="text-xs text-text-main font-medium leading-snug">
                  {strat.summary}
                </p>

                {/* How it works box */}
                <div className="rounded-lg bg-surface p-2.5 sm:p-3 border border-border/70 text-[11px] text-text-muted leading-relaxed">
                  <span className="font-semibold text-text-main block mb-1 flex items-center gap-1">
                    <Icon name="psychology" size={14} className="text-primary" />
                    <span>How it Works:</span>
                  </span>
                  {strat.mechanism}
                </div>

                {/* Dedicated 2-Tier Breakdown for Smart Routing */}
                {strat.tiers && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                    {strat.tiers.map((t) => (
                      <div
                        key={t.name}
                        className={`rounded-lg border p-2.5 flex flex-col gap-1 ${t.color}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon name={t.icon} size={14} />
                          <span className="text-xs font-bold text-text-main">{t.name}</span>
                        </div>
                        <p className="text-[10px] text-text-muted leading-relaxed">
                          {t.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pros and Cons with clean icons */}
                <div className="pt-2 border-t border-border/50 flex flex-col gap-2.5">
                  {/* Pros */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                      <Icon name="check_circle" size={13} />
                      <span>Strengths</span>
                    </span>
                    <ul className="flex flex-col gap-1 pl-0.5">
                      {strat.pros.map((pro, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-text-muted leading-tight">
                          <span className="size-1 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                          <span>{pro}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Cons / Considerations */}
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <Icon name="info" size={13} />
                      <span>Considerations</span>
                    </span>
                    <ul className="flex flex-col gap-1 pl-0.5">
                      {strat.cons.map((con, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-text-muted leading-tight">
                          <span className="size-1 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                          <span>{con}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Recommended For footer */}
              <div className="mt-3 rounded-lg bg-surface/80 p-2.5 border border-border/60 text-[11px] text-text-muted flex items-start gap-2">
                <Icon name="tips_and_updates" size={15} className="text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <strong className="text-text-main font-semibold">Recommended for: </strong>
                  <span>{strat.recommendedFor}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

StrategyGuideModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
