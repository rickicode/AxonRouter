"use client";

import PropTypes from "prop-types";
import { fmtNumber, fmtTokens } from "./analyticsData";

const TOTAL_CELLS = 100;

function buildCells(segments) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, Number(s.value) || 0), 0);
  if (total <= 0) return [];

  const raw = segments.map((s) => ({
    ...s,
    exact: (Math.max(0, Number(s.value) || 0) / total) * TOTAL_CELLS,
  }));
  const cells = raw.map((s) => ({ ...s, count: Math.floor(s.exact) }));
  let used = cells.reduce((sum, s) => sum + s.count, 0);
  const remainders = cells
    .map((s, i) => ({ i, frac: s.exact - s.count }))
    .sort((a, b) => b.frac - a.frac);
  for (let n = 0; used < TOTAL_CELLS && n < remainders.length; n += 1) {
    cells[remainders[n].i].count += 1;
    used += 1;
  }
  return cells.filter((s) => s.count > 0);
}

function Waffle({ segments, emptyLabel }) {
  const cells = buildCells(segments);
  const total = segments.reduce((sum, s) => sum + Math.max(0, Number(s.value) || 0), 0);

  if (total <= 0) {
    return (
      <div className="flex h-[88px] items-center justify-center rounded-md border border-dashed border-border text-xs text-text-muted">
        {emptyLabel}
      </div>
    );
  }

  const squares = [];
  cells.forEach((segment) => {
    for (let i = 0; i < segment.count; i += 1) {
      squares.push(segment);
    }
  });

  return (
    <div
      className="grid gap-[2px]"
      style={{ gridTemplateColumns: "repeat(20, minmax(0, 1fr))", gridAutoFlow: "row" }}
      role="img"
      aria-label={segments.map((s) => `${s.label} ${s.display}`).join(", ")}
    >
      {squares.map((segment, index) => (
        <span
          key={`${segment.key}-${index}`}
          title={`${segment.label}: ${segment.display}`}
          className={`aspect-square rounded-[2px] ${segment.color}`}
        />
      ))}
    </div>
  );
}

function Legend({ segments }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, Number(s.value) || 0), 0);
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {segments.map((segment) => {
        const pct = total > 0 ? Math.round((Math.max(0, Number(segment.value) || 0) / total) * 100) : 0;
        return (
          <span key={segment.key} className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className={`size-2 rounded-[2px] ${segment.color}`} />
            <span>{segment.label}</span>
            <span className="font-medium tabular-nums text-text-main">{segment.display}</span>
            <span className="tabular-nums">{pct}%</span>
          </span>
        );
      })}
    </div>
  );
}

function Panel({ title, caption, children }) {
  return (
    <section className="min-w-0 rounded-sm border border-border bg-surface p-3">
      <h3 className="text-sm font-semibold text-text-main">{title}</h3>
      <p className="mt-0.5 text-[11px] text-text-muted">{caption}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

const MODEL_COLORS = [
  "bg-amber-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-lime-500",
  "bg-fuchsia-500",
];

export default function AnalyticsWaffleGrid({ data }) {
  const summary = data?.summary || {};
  const models = Array.isArray(data?.models) ? data.models : [];

  const success = Number(summary.successCount) || 0;
  const failed = Number(summary.failureCount) || 0;
  const input = Number(summary.totalInputTokens) || 0;
  const output = Number(summary.totalOutputTokens) || 0;
  const cached = Number(summary.totalCachedTokens) || 0;

  const ranked = [...models]
    .map((model) => ({
      key: `${model.provider || ""}/${model.model || model.name || "unknown"}`,
      label: model.model || model.name || "unknown",
      value: Number(model.totalTokens || model.tokens || model.count || model.requests || 0),
    }))
    .filter((model) => model.value > 0)
    .sort((a, b) => b.value - a.value);

  const top = ranked.slice(0, 7);
  const restValue = ranked.slice(7).reduce((sum, model) => sum + model.value, 0);
  const modelSegments = top.map((model, index) => ({
    ...model,
    color: MODEL_COLORS[index % MODEL_COLORS.length],
    display: fmtNumber(model.value),
  }));
  if (restValue > 0) {
    modelSegments.push({
      key: "other",
      label: "Other",
      value: restValue,
      color: "bg-zinc-500",
      display: fmtNumber(restValue),
    });
  }

  const requestSegments = [
    { key: "ok", label: "Succeeded", value: success, color: "bg-emerald-500", display: fmtNumber(success) },
    { key: "fail", label: "Failed", value: failed, color: "bg-rose-500", display: fmtNumber(failed) },
  ];

  const tokenSegments = [
    { key: "in", label: "Input", value: Math.max(0, input - cached), color: "bg-sky-500", display: fmtTokens(Math.max(0, input - cached)) },
    { key: "out", label: "Output", value: output, color: "bg-amber-500", display: fmtTokens(output) },
    { key: "cache", label: "Cached", value: cached, color: "bg-emerald-500", display: fmtTokens(cached) },
  ];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
      <Panel title="Requests" caption="One cell is one percent of attempts in this window">
        <Waffle segments={requestSegments} emptyLabel="No attempts in this period" />
        <Legend segments={requestSegments} />
      </Panel>
      <Panel title="Tokens" caption="One cell is one percent of tokens moved">
        <Waffle segments={tokenSegments} emptyLabel="No tokens in this period" />
        <Legend segments={tokenSegments} />
      </Panel>
      <Panel title="Models" caption="One cell is one percent of model volume">
        <Waffle segments={modelSegments} emptyLabel="No model volume in this period" />
        <Legend segments={modelSegments} />
      </Panel>
    </div>
  );
}

AnalyticsWaffleGrid.propTypes = {
  data: PropTypes.object,
};
