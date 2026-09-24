"use client";

import PropTypes from "prop-types";
import { Modal, Button } from "@/shared/components";
import Icon from "@/shared/components/Icon";

const STRATEGIES = [
  {
    key: "fallback",
    name: "Sequential Fallback",
    icon: "alt_route",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    badge: "Reliability & Uptime",
    summary: "Attempts models sequentially in configured priority order (#1 -> #2 -> #3).",
    mechanism: "The router queries the primary model first. If it encounters a rate limit, timeout, or provider failure, it automatically fails over to the next configured model in milliseconds.",
    pros: ["Zero additional token cost", "Guaranteed highest availability", "Deterministic model preference"],
    cons: ["Only model #1 receives traffic under normal operations"],
    recommendedFor: "Mission-critical endpoints where zero-downtime is required without extra billing overhead.",
  },
  {
    key: "round-robin",
    name: "Load-Balanced Round Robin",
    icon: "sync",
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
    badge: "Traffic Balancing",
    summary: "Rotates incoming requests evenly across all member models.",
    mechanism: "Each request cycles to the next healthy model. With 'Sticky calls per model', you can pin N consecutive requests to the same model before rotating to preserve prompt caching benefits.",
    pros: ["Spreads TPM & RPM across multiple providers/keys", "Prevents quota burnout on single accounts", "Sticky window supports prompt cache efficiency"],
    cons: ["Responses may vary in tone or reasoning depending on model homogeneity"],
    recommendedFor: "High-throughput production services and team accounts with multiple API keys.",
  },
  {
    key: "difficulty",
    name: "Smart Routing (Tier Classifier)",
    icon: "auto_awesome",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    badge: "Cost & Speed Optimization",
    summary: "Evaluates prompt complexity into Easy, Medium, or Hard tiers using a fast judge.",
    mechanism: "An ultra-fast classifier analyzes prompt intent and token count. Simple queries route to cheap, ultra-low-latency models (Easy), typical coding/tasks to balanced models (Medium), and hard architecture problems to frontier models (Hard).",
    pros: ["Cuts overall API billing by 40-70%", "Sub-second responses for simple queries", "Frontier reasoning reserved when actually needed"],
    cons: ["Adds ~15-30ms classifier latency before routing"],
    recommendedFor: "AI coding assistants (Cline, Cursor, Copilot), multi-agent swarms, and general-purpose chat endpoints.",
  },
  {
    key: "fusion",
    name: "Consensus Fusion",
    icon: "groups",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    badge: "Maximum Quality",
    summary: "Queries all panel models in parallel, then a judge synthesizes the ultimate consensus answer.",
    mechanism: "The router fires the user request concurrently to all configured models in the combo. When all answers return, an intelligent judge model evaluates each response and synthesizes a comprehensive final output.",
    pros: ["Combines strengths of multiple distinct AI architectures", "Eliminates hallucinations through cross-model consensus", "Unmatched reasoning quality on difficult questions"],
    cons: ["High cost: every single request incurs N panel calls + 1 judge call", "Latency bounded by slowest panel member"],
    recommendedFor: "Complex mathematical reasoning, critical architectural reviews, and high-stakes decision analysis.",
  },
];

export default function StrategyGuideModal({ isOpen, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Routing Strategies & Tradeoffs Guide"
      size="xl"
      footer={
        <div className="flex items-center justify-end w-full">
          <Button size="sm" variant="primary" onClick={onClose}>
            Got it, Back to Combos
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-text-muted leading-relaxed">
          Combos bundle multiple AI models under a single endpoint. Select the routing strategy that aligns with your uptime, performance, cost, and intelligence requirements:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[60vh] overflow-y-auto pr-1">
          {STRATEGIES.map((strat) => (
            <div
              key={strat.key}
              className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-surface-2 p-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex size-9 shrink-0 items-center justify-center rounded-md border ${strat.color}`}>
                      <Icon name={strat.icon} size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-text-main">{strat.name}</h4>
                      <span className="text-[10px] font-mono text-text-muted block mt-0.5">{strat.badge}</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-text-main font-medium mt-3 leading-snug">{strat.summary}</p>
                <p className="text-[11px] text-text-muted mt-1.5 leading-relaxed">{strat.mechanism}</p>

                <div className="mt-3 pt-2.5 border-t border-border/50 flex flex-col gap-1.5 text-[11px]">
                  <div className="flex items-start gap-1.5 text-emerald-400">
                    <Icon className="shrink-0 mt-0.5" name="check_circle" size={18} />
                    <span className="text-text-muted">{strat.pros.join(" • ")}</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-amber-400">
                    <Icon className="shrink-0 mt-0.5" name="info" size={18} />
                    <span className="text-text-muted">{strat.cons.join(" • ")}</span>
                  </div>
                </div>
              </div>

              <div className="rounded bg-surface p-2 border border-border/60 text-[10px] text-text-muted">
                <strong className="text-text-main font-semibold">Recommended for: </strong>
                {strat.recommendedFor}
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
