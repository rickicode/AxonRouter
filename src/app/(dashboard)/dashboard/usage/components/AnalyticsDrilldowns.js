"use client";

import PropTypes from "prop-types";
import BlockGrid, { buildColumns, GridLegend } from "./BlockGrid";
import { formatMetric, fmtNumber } from "./analyticsData";

const METRICS = [
  {
    key: "requests",
    title: "Request volume",
    color: "bg-primary",
    hover: "hover:bg-primary/80",
    format: fmtNumber,
    value: (point) => Number(point.requests) || 0,
  },
  {
    key: "successRate",
    title: "Success rate",
    color: "bg-emerald-500",
    hover: "hover:bg-emerald-400",
    format: (n) => `${Math.round((Number(n) || 0) * 100)}%`,
    value: (point) => (point.successRate == null ? 0 : Number(point.successRate) * 100),
  },
  {
    key: "latency",
    title: "Successful latency P50",
    color: "bg-amber-500",
    hover: "hover:bg-amber-400",
    format: (n) => formatMetric(n, "latencyMs"),
    value: (point) => Number(point.latencyMs) || 0,
  },
];

function TrendGrid({ metric, series }) {
  const points = series.map((point) => ({
    ...point,
    value: metric.value(point),
    label: point.timestamp ? String(point.timestamp).slice(0, 10) : "",
  }));
  const { columns, step, max } = buildColumns(points, (point) => point.value);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h4 className="text-xs font-semibold text-text-main">{metric.title}</h4>
      <BlockGrid
        columns={columns}
        color={metric.color}
        hoverColor={metric.hover}
        label={metric.title}
        valueFormatter={metric.format}
        axisFormatter={metric.format}
        step={step}
        max={max}
        rows={6}
      />
      <GridLegend
        items={[
          { label: `1 block ≈ ${metric.format(step)}`, color: metric.color },
          { label: "Peak", value: metric.format(max) },
        ]}
      />
    </section>
  );
}

export default function AnalyticsDrilldowns({ data }) {
  const series = Array.isArray(data?.series) ? data.series : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-main">Metric Drilldowns</h3>
        <span className="text-xs text-text-muted">Block grids per metric</span>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {METRICS.map((metric) => (
          <TrendGrid key={metric.key} metric={metric} series={series} />
        ))}
      </div>
    </div>
  );
}

AnalyticsDrilldowns.propTypes = {
  data: PropTypes.object.isRequired,
};