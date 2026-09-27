"use client";

import { useState, useEffect, useMemo } from "react";
import { getComboBadge } from "@/shared/utils/comboBadge";
import { Card, CardSkeleton, SegmentedControl } from "@/shared/components";
import Icon from "@/shared/components/Icon";

const PERIODS = [
 { value: "today", label: "Today" },
 { value: "24h", label: "24h" },
 { value: "7d", label: "7D" },
 { value: "30d", label: "30D" },
];

function pct(success, total) {
 if (!total) return "—";
 return `${Math.round((success / total) * 100)}%`;
}

function HealthDot({ success, total }) {
 if (!total) return null;
 const rate = success / total;
 const color = rate >= 0.9 ? "bg-success" : rate >= 0.6 ? "bg-warning" : "bg-danger";
 return <span className={`inline-block w-2 h-2 rounded-full ${color}`} aria-hidden="true" />;
}

export default function ComboAnalyticsTab() {
 const [period, setPeriod] = useState("today");
 const [data, setData] = useState(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
  let alive = true;
  queueMicrotask(() => setLoading(true));
  fetch(`/api/combos/analytics?period=${period}`)
 .then((r) => (r.ok ? r.json() : { combos: [], members: [] }))
 .then((d) => { if (alive) setData(d); })
 .catch(() => { if (alive) setData({ combos: [], members: [] }); })
 .finally(() => { if (alive) setLoading(false); });
 return () => { alive = false; };
 }, [period]);

 const combos = data?.combos || [];
 const members = data?.members || [];
 const difficulty = data?.difficulty || [];
 const difficultyModels = data?.difficultyModels || [];
 const routingMetrics = data?.routingMetrics || null;

 // Aggregate Jev classifier analytics
 const jevStats = useMemo(() => {
   let dbJevUsed = 0;
   let dbJudgeUsed = 0;
   let dbFallback = 0;
   let totalConfidence = 0;
   let confCount = 0;
   let totalSmartDecisions = 0;

   for (const d of difficulty) {
     totalSmartDecisions += d.total || 0;
     dbJevUsed += d.jevUsed || 0;
     dbJudgeUsed += d.judgeUsed || d.judged || 0;
     dbFallback += d.jevFallback || 0;
     if (d.avgConfidence != null && d.total > 0) {
       totalConfidence += Number(d.avgConfidence) * d.total;
       confCount += d.total;
     }
   }

   const liveJevUsed = routingMetrics?.jevUsed ?? 0;
   const liveJevEscalated = routingMetrics?.jevEscalated ?? 0;
   const liveJevFallback = routingMetrics?.jevFallback ?? 0;

   const effectiveJevUsed = Math.max(dbJevUsed, liveJevUsed);
   const effectiveJudgeUsed = Math.max(dbJudgeUsed, liveJevEscalated);
   const effectiveFallback = Math.max(dbFallback, liveJevFallback);
   const totalClassified = effectiveJevUsed + effectiveJudgeUsed + effectiveFallback;
   const avgConfidence = confCount > 0 ? (totalConfidence / confCount).toFixed(2) : "0.85";

   return {
     totalDecisions: totalSmartDecisions || totalClassified,
     jevUsed: effectiveJevUsed,
     judgeUsed: effectiveJudgeUsed,
     fallback: effectiveFallback,
     liveJevEscalated,
     avgConfidence,
     hasTraffic: totalClassified > 0 || (routingMetrics?.comboRequests ?? 0) > 0,
     jevSharePct: totalClassified > 0 ? Math.round((effectiveJevUsed / totalClassified) * 100) : 0,
   };
 }, [difficulty, routingMetrics]);

 const membersByCombo = useMemo(() => {
 const map = {};
 for (const m of members) {
 (map[m.comboName] ||= []).push(m);
 }
 return map;
 }, [members]);

 const difficultyByCombo = useMemo(() => {
 const map = {};
 for (const d of difficulty) {
 (map[d.comboName] ||= []).push(d);
 }
 return map;
 }, [difficulty]);

 const difficultyModelsByCombo = useMemo(() => {
 const map = {};
 for (const dm of difficultyModels) {
 (map[dm.comboName] ||= []).push(dm);
 }
 return map;
 }, [difficultyModels]);
 // Aggregate model usage across all smart combos
 const smartModelStats = useMemo(() => {
 if (!difficultyModels.length) return null;
 const modelMap = {};
 const comboMap = {};
 let totalSmartRequests = 0;

 for (const dm of difficultyModels) {
 totalSmartRequests += dm.total;

 if (!modelMap[dm.model]) {
 modelMap[dm.model] = {
 model: dm.model,
 total: 0,
 success: 0,
 errors: 0,
 combos: new Set(),
 tiers: new Set(),
 };
 }
 modelMap[dm.model].total += dm.total;
 modelMap[dm.model].success += dm.success;
 modelMap[dm.model].errors += dm.errors;
 if (dm.comboName) modelMap[dm.model].combos.add(dm.comboName);
 if (dm.tier) modelMap[dm.model].tiers.add(dm.tier);

 if (!comboMap[dm.comboName]) {
 comboMap[dm.comboName] = { total: 0, models: {} };
 }
 comboMap[dm.comboName].total += dm.total;
 comboMap[dm.comboName].models[dm.model] = (comboMap[dm.comboName].models[dm.model] || 0) + dm.total;
 }

 const sortedModels = Object.values(modelMap).sort((a, b) => b.total - a.total);
 const topModel = sortedModels[0] || null;

 // Find top model per tier
 const tierTop = { easy: null, hard: null };
   for (const tierKey of ["easy", "hard"]) {
 const tierRows = difficultyModels.filter((dm) => dm.tier === tierKey);
 if (tierRows.length > 0) {
 const tierModels = {};
 for (const r of tierRows) {
 tierModels[r.model] = (tierModels[r.model] || 0) + r.total;
 }
 const topInTier = Object.entries(tierModels).sort((a, b) => b[1] - a[1])[0];
 if (topInTier) {
 tierTop[tierKey] = { model: topInTier[0], count: topInTier[1] };
 }
 }
 }

 return {
 total: totalSmartRequests,
 topModel,
 sortedModels,
 tierTop,
 comboMap,
 };
 }, [difficultyModels]);

 if (loading && !data) {
 return (
 <div className="flex flex-col gap-3">
 <CardSkeleton />
 <CardSkeleton />
 </div>
 );
 }

 return (
 <div className="flex min-w-0 flex-col gap-3">
 {/* Period selector pinned right */}
 <div className="flex w-full items-center justify-start sm:justify-end overflow-x-auto pb-1">
   <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} size="sm" className="min-w-max" />
 </div>

 {combos.length === 0 ? (
 <Card>
 <div className="flex flex-col gap-2 py-2">
 <p className="text-sm font-medium text-text-main">No combo traffic yet</p>
 <p className="text-sm text-text-muted">Combo member attempts will appear here once requests flow through combos.</p>
 </div>
 </Card>
 ) : (
 <>
 {/* Smart Routing Model Insights Banner */}
 {smartModelStats && smartModelStats.total > 0 && (
   <Card padding="sm" className="border-success/30 bg-success/[0.02]">
     <div className="flex flex-col gap-2.5 sm:gap-3">
       <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-2.5 gap-2">
         <div className="flex items-center gap-2 min-w-0">
           <div className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-success/10 text-success">
             <Icon name="auto_awesome" size={18} />
           </div>
           <div className="min-w-0">
             <div className="flex flex-wrap items-center gap-1.5">
               <h3 className="text-sm font-semibold text-text-main truncate">Smart Combo Model Usage</h3>
               <span className="rounded-sm bg-success/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-success border border-success/30 shrink-0">
                 {smartModelStats.total} calls
               </span>
             </div>
             <p className="text-[11px] text-text-muted">
               Breakdown of models selected & executed across prompt difficulty tiers
             </p>
           </div>
         </div>
         {smartModelStats.topModel && (
           <div className="text-left sm:text-right shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40">
             <span className="text-[10px] sm:text-[11px] text-text-muted block">Most Used Overall</span>
             <code className="text-xs font-medium text-success font-mono">
               {smartModelStats.topModel.model} ({smartModelStats.topModel.total}× · {pct(smartModelStats.topModel.total, smartModelStats.total)})
             </code>
           </div>
         )}
       </div>

       {/* Metric Highlights: Leader per Tier */}
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
         <div className="rounded-sm border border-success/30 bg-surface p-2.5 sm:p-3">
           <div className="flex items-center justify-between text-[11px] mb-1">
             <span className="font-medium text-success">Easy Tier Leader</span>
             <Icon className="text-success" name="bolt" size={18} />
           </div>
           {smartModelStats.tierTop.easy ? (
             <div>
               <code className="block text-xs font-mono font-medium text-text-main truncate" title={smartModelStats.tierTop.easy.model}>
                 {smartModelStats.tierTop.easy.model}
               </code>
               <span className="text-[11px] text-text-muted">{smartModelStats.tierTop.easy.count} requests</span>
             </div>
           ) : (
             <span className="text-xs text-text-muted italic">No traffic yet</span>
           )}
         </div>

         <div className="rounded-sm border border-danger/30 bg-surface p-2.5 sm:p-3">
           <div className="flex items-center justify-between text-[11px] mb-1">
             <span className="font-medium text-danger">Hard Tier Leader</span>
             <Icon className="text-danger" name="diamond" size={18} />
           </div>
           {smartModelStats.tierTop.hard ? (
             <div>
               <code className="block text-xs font-mono font-medium text-text-main truncate" title={smartModelStats.tierTop.hard.model}>
                 {smartModelStats.tierTop.hard.model}
               </code>
               <span className="text-[11px] text-text-muted">{smartModelStats.tierTop.hard.count} requests</span>
             </div>
           ) : (
             <span className="text-xs text-text-muted italic">No traffic yet</span>
           )}
         </div>
       </div>

       {/* Jev System One Analytics Banner */}
       {jevStats && jevStats.hasTraffic && (
         <div className="rounded-sm border border-primary/30 bg-primary/[0.03] p-2.5 sm:p-3">
           <div className="flex flex-col gap-2.5">
             <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/60 pb-2 gap-2">
               <div className="flex items-center gap-2 min-w-0">
                 <div className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
                   <Icon name="psychology" size={18} />
                 </div>
                 <div className="min-w-0">
                   <div className="flex flex-wrap items-center gap-1.5">
                     <h4 className="text-sm font-semibold text-text-main truncate">Jev System One Classifier Analytics</h4>
                     <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary border border-primary/30 shrink-0">
                       {jevStats.totalDecisions} classifications
                     </span>
                   </div>
                   <p className="text-[11px] text-text-muted">
                     Zero-latency classification telemetry & LLM Judge escalation metrics
                   </p>
                 </div>
               </div>
               <div className="text-left sm:text-right shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40">
                 <span className="text-[10px] sm:text-[11px] text-text-muted block">Jev Fast-Path Share</span>
                 <code className="text-xs font-semibold text-primary font-mono">
                   {jevStats.jevUsed}× ({jevStats.jevSharePct}%)
                 </code>
               </div>
             </div>

             <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
               <div className="rounded-sm border border-primary/20 bg-surface p-2 sm:p-2.5">
                 <div className="flex items-center justify-between text-[11px] mb-1">
                   <span className="font-medium text-primary">Jev Fast-Path</span>
                   <Icon className="text-primary" name="bolt" size={16} />
                 </div>
                 <div className="text-base font-semibold font-mono text-text-main">{jevStats.jevUsed}</div>
                 <span className="text-[10px] text-text-muted block truncate">Direct ~100ms · 0 cost</span>
               </div>

               <div className="rounded-sm border border-warning/20 bg-surface p-2 sm:p-2.5">
                 <div className="flex items-center justify-between text-[11px] mb-1">
                   <span className="font-medium text-warning">Judge Escalations</span>
                   <Icon className="text-warning" name="balance" size={16} />
                 </div>
                 <div className="text-base font-semibold font-mono text-text-main">{jevStats.judgeUsed}</div>
                 <span className="text-[10px] text-text-muted block truncate">Conf &lt; threshold</span>
               </div>

               <div className="rounded-sm border border-border bg-surface p-2 sm:p-2.5">
                 <div className="flex items-center justify-between text-[11px] mb-1">
                   <span className="font-medium text-text-muted">Fail-Open / Rule</span>
                   <Icon className="text-text-muted" name="shield" size={16} />
                 </div>
                 <div className="text-base font-semibold font-mono text-text-main">{jevStats.fallback}</div>
                 <span className="text-[10px] text-text-muted block truncate">Zero-fail resilience</span>
               </div>

               <div className="rounded-sm border border-success/20 bg-surface p-2 sm:p-2.5">
                 <div className="flex items-center justify-between text-[11px] mb-1">
                   <span className="font-medium text-success">Avg Confidence</span>
                   <Icon className="text-success" name="verified" size={16} />
                 </div>
                 <div className="text-base font-semibold font-mono text-text-main">{jevStats.avgConfidence}</div>
                 <span className="text-[10px] text-text-muted block truncate">Threshold &ge; 0.70</span>
               </div>
             </div>
           </div>
         </div>
       )}

 {/* Leaderboard Table of Models in Smart Routing */}
 {smartModelStats.sortedModels.length > 0 && (
 <div className="overflow-x-auto rounded-sm border border-border bg-surface">
 <table className="data-table w-full text-xs" aria-label="Smart Combo Model Leaderboard">
 <thead>
 <tr className="border-b border-border text-[10px] sm:text-[11px] text-text-muted">
   <th className="text-left py-2 px-2.5 text-xs font-medium text-text-muted">Model</th>
   <th className="text-left py-2 px-2 text-xs font-medium text-text-muted">Combos Used</th>
   <th className="text-left py-2 px-2 text-xs font-medium text-text-muted">Tiers</th>
   <th className="text-right py-2 px-2 text-xs font-medium text-text-muted">Requests</th>
   <th className="text-right py-2 px-2 text-xs font-medium text-text-muted">Share</th>
   <th className="text-right py-2 px-2.5 text-xs font-medium text-text-muted">Success Rate</th>
 </tr>
 </thead>
 <tbody>
 {smartModelStats.sortedModels.map((sm, idx) => (
   <tr key={sm.model} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
     <td className="font-mono font-medium text-text-main py-2 px-2 sm:px-2.5 text-xs sm:text-sm">
       <span className="text-[10px] sm:text-[11px] text-text-muted mr-1">#{idx + 1}</span>
       <span className="truncate inline-block max-w-[130px] sm:max-w-none align-bottom">{sm.model}</span>
     </td>
     <td className="text-text-muted py-2 px-2 text-xs">
       {[...sm.combos].join(", ") || "—"}
     </td>
     <td className="py-2 px-2 text-xs">
       <div className="flex flex-wrap items-center gap-1">
         {[...sm.tiers].map((t) => (
           <span
             key={t}
             className={`px-1 py-0.5 rounded-sm font-mono text-[10px] sm:text-[11px] font-medium ${
               t === "easy"
                 ? "bg-success/10 text-success"
                 : "bg-danger/10 text-danger"
             }`}
           >
             {t}
           </span>
         ))}
       </div>
     </td>
     <td className="text-right font-medium text-text-main py-2 px-2 text-xs sm:text-sm">
       {sm.total}×
     </td>
     <td className="text-right text-text-muted font-mono text-[10px] sm:text-[11px] py-2 px-2">
       {pct(sm.total, smartModelStats.total)}
     </td>
     <td className="text-right font-medium py-2 px-2.5 text-xs sm:text-sm">
       <span className={sm.errors > 0 ? "text-warning" : "text-success"}>
         {pct(sm.success, sm.total)}
       </span>
     </td>
   </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </Card>
 )}
 {/* Per-combo cards */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
 {combos.map((c) => {
 const mems = (membersByCombo[c.comboName] || []).slice(0, 8);
 const worst = [...mems].sort((a, b) => (b.errors - b.success) - (a.errors - a.success)).find((m) => m.errors > 0);
 return (
 <Card key={c.comboName} padding="sm">
 <div className="flex items-start justify-between gap-2 mb-3">
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <HealthDot success={c.success} total={c.total} />
 {(() => {
 const badge = getComboBadge(c.comboName);
 return (
          <Icon name={badge.icon} size={18} className={`shrink-0 ${badge.text}`} title={badge.title} />
 );
 })()}
 <p className="font-medium text-text-main truncate">{c.comboName}</p>
 </div>
 <p className="text-xs text-text-muted mt-0.5">
 {c.total} attempts · {pct(c.success, c.total)} success · avg {c.avgLatencyS}s
 </p>
 </div>
 <div className="text-right shrink-0">
 <p className="text-sm font-semibold text-text-main">{c.success}<span className="text-text-muted">/{c.total}</span></p>
 <p className="text-xs text-danger">{c.errors} errors</p>
 </div>
 </div>
 {mems.length > 0 && (
 <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
 {mems.map((m) => (
 <div key={`${m.model}|${m.provider}`} className="flex items-center justify-between gap-2 text-xs">
 <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-1.5">
 <span className="font-medium text-text-main truncate">{m.model}</span>
 <span className="text-text-muted truncate">{m.provider}</span>
 </div>
 <div className="shrink-0 flex items-center gap-2">
 <span className="text-text-muted">{m.total}×</span>
 {m.errors > 0 ? (
 <span className="text-danger" title={m.sampleError || ""}>{m.errors} err</span>
 ) : (
 <span className="text-success">ok</span>
 )}
 <span className="text-text-muted w-12 text-right">{m.avgLatencyS ? `${m.avgLatencyS}s` : "—"}</span>
 </div>
 </div>
 ))}
 </div>
 )}
 {worst && (
 <p className="text-[11px] text-danger/90 mt-2 truncate" title={worst.sampleError || ""}>
 Weakest member: {worst.model} ({worst.errors} errors{worst.sampleError ? ` — ${String(worst.sampleError).slice(0, 60)}` : ""})
 </p>
 )}
 {(difficultyByCombo[c.comboName] || []).length > 0 && (
 <div className="mt-2 border-t border-border pt-2">
 <div className="flex items-center justify-between mb-1.5">
 <p className="text-[11px] font-medium text-text-muted">Smart routing (difficulty)</p>
 {(() => {
 const comboDiffs = [...(difficultyModelsByCombo[c.comboName] || [])].sort((a, b) => b.total - a.total);
 const topInThisCombo = comboDiffs[0];
 return topInThisCombo ? (
 <span className="text-[11px] text-success font-medium">
 Top model: <code className="font-mono font-medium">{topInThisCombo.model}</code> ({topInThisCombo.total}×)
 </span>
 ) : null;
 })()}
 </div>
 <div className="flex flex-col gap-1.5">
 {(difficultyByCombo[c.comboName] || []).map((d) => {
 const tierModels = (difficultyModelsByCombo[c.comboName] || []).filter((m) => m.tier === d.tier);
 return (
 <div key={`${d.tier}|${d.domain || ""}|${d.policy || ""}`} className="flex flex-col gap-1 rounded-sm bg-surface-2 p-2 sm:p-2.5 text-xs">
   <div className="flex flex-wrap items-center justify-between gap-1.5">
     <span className="flex flex-wrap items-center">
       <span className={`font-medium capitalize ${d.tier === "easy" ? "text-success" : "text-danger"}`}>
         {d.tier}
       </span>
       {d.domain && (
         <span className="text-[10px] sm:text-[11px] text-text-muted ml-1">· {d.domain}</span>
       )}
       {d.policy && (
         <span className="text-[10px] sm:text-[11px] text-text-muted ml-1">· {d.policy}</span>
       )}
       {d.avgConfidence != null && (
         <span className="text-[10px] sm:text-[11px] text-text-muted ml-1" title="average judge/heuristic confidence">
           · conf {Number(d.avgConfidence).toFixed(2)}
         </span>
       )}
     </span>
     <span className="text-text-muted font-medium text-[11px] sm:text-xs">
       {d.total}× · {pct(d.success, d.total)}
       {d.jevUsed > 0 && (
         <span title="decided by Jev System One classifier" className="text-primary ml-1">⚡{d.jevUsed}</span>
       )}
       {d.judgeUsed > 0 && (
         <span title="decided by the judge model"> · ⚖️{d.judgeUsed}</span>
       )}
     </span>
   </div>
   {tierModels.length > 0 && (
     <div className="flex flex-wrap items-center gap-1 text-[11px] pt-1">
       <span className="text-[10px] sm:text-[11px] text-text-muted">Routed to:</span>
       {tierModels.map((tm) => (
         <span key={tm.model} className="inline-flex items-center gap-1 rounded-sm bg-surface border border-border px-1.5 py-0.5 font-mono text-[10px] sm:text-[11px] text-text-main max-w-full">
           <span className="truncate max-w-[130px] sm:max-w-none">{tm.model}</span>
           <span className="text-text-muted font-sans font-medium shrink-0">({tm.total}×)</span>
         </span>
       ))}
     </div>
   )}
 </div>
 );
 })}
 </div>
 {(() => {
   const rows = difficultyByCombo[c.comboName] || [];
   const tot = rows.reduce((s, r) => s + r.total, 0);
   const judged = rows.reduce((s, r) => s + r.judgeUsed, 0);
   const jev = rows.reduce((s, r) => s + (r.jevUsed || 0), 0);
   return tot > 0 ? (
     <p className="text-[11px] text-text-muted mt-1.5">
       Routing Decisions: {jev > 0 ? `${jev} Jev fastpath (${Math.round((jev / tot) * 100)}%), ` : ""}{judged} LLM Judge ({Math.round((judged / tot) * 100)}%) — remainder via zero-latency rules.
     </p>
   ) : null;
 })()}
 </div>
 )}
 </Card>
 );
 })}
 </div>

 {/* Most-failing members across all combos */}
 {members.some((m) => m.errors > 0) && (
 <Card padding="sm">
 <p className="font-medium text-text-main mb-2">Most failing members (all combos)</p>
 <div className="overflow-x-auto">
 <table className="data-table w-full text-xs min-w-[540px]" aria-label="Most failing combo members">
   <thead>
     <tr className="border-b border-border text-[10px] sm:text-[11px] text-text-muted">
       <th className="text-left py-2 pr-2 sm:pr-3 text-xs font-medium text-text-muted">Member</th>
       <th className="text-left py-2 pr-2 sm:pr-3 text-xs font-medium text-text-muted">Provider</th>
       <th className="text-left py-2 pr-2 sm:pr-3 text-xs font-medium text-text-muted">Combo</th>
       <th className="text-right py-2 pr-2 sm:pr-3 text-xs font-medium text-text-muted">Errors</th>
       <th className="text-right py-2 pr-2 sm:pr-3 text-xs font-medium text-text-muted">Total</th>
       <th className="text-right py-2 pr-2 sm:pr-3 text-xs font-medium text-text-muted">Success rate</th>
       <th className="text-left py-2 text-xs font-medium text-text-muted">Last error</th>
     </tr>
   </thead>
   <tbody>
     {members
       .filter((m) => m.errors > 0)
       .sort((a, b) => b.errors - a.errors)
       .slice(0, 10)
       .map((m) => (
         <tr key={`${m.comboName}|${m.model}|${m.provider}`} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
           <td className="py-2 pr-2 sm:pr-3 font-medium text-text-main text-xs sm:text-sm">
             <span className="truncate inline-block max-w-[140px] sm:max-w-none">{m.model}</span>
           </td>
           <td className="py-2 pr-2 sm:pr-3 text-text-muted text-xs">{m.provider}</td>
           <td className="py-2 pr-2 sm:pr-3 text-text-muted text-xs font-mono">{m.comboName}</td>
           <td className="py-2 pr-2 sm:pr-3 text-right text-danger font-medium text-xs sm:text-sm">{m.errors}</td>
           <td className="py-2 pr-2 sm:pr-3 text-right text-text-muted text-xs sm:text-sm">{m.total}</td>
           <td className="py-2 pr-2 sm:pr-3 text-right text-xs sm:text-sm">{pct(m.success, m.total)}</td>
           <td className="py-2 text-text-muted truncate max-w-[180px] sm:max-w-[280px] text-xs" title={m.sampleError || ""}>
             {m.sampleError ? String(m.sampleError).slice(0, 70) : "—"}
           </td>
         </tr>
       ))}
 </tbody>
 </table>
 </div>
 </Card>
 )}
 </>
 )}
 </div>
 );
}
