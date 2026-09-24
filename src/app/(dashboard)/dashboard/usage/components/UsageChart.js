"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import SegmentedControl from "@/shared/components/SegmentedControl";
import BlockGrid, { buildColumns, GridLegend } from "./BlockGrid";
import { formatTokens } from "@/shared/utils/formatTokens";
import Icon from "@/shared/components/Icon";

const fmtTokens = formatTokens;

const fmtCost = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const MODES = [
  { value: "tokens", label: "Tokens", color: "bg-primary", hover: "hover:bg-primary/80", fmt: fmtTokens },
  { value: "cost", label: "Cost", color: "bg-amber-500", hover: "hover:bg-amber-400", fmt: fmtCost },
];

export default function UsageChart({ period = "7d", viewMode: controlledViewMode, onViewModeChange }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [internalViewMode, setInternalViewMode] = useState("tokens");

  const viewMode = controlledViewMode !== undefined ? controlledViewMode : internalViewMode;
  const setViewMode = onViewModeChange || setInternalViewMode;
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/usage/chart?period=${period}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch chart data (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("Failed to fetch chart data:", e);
      setError(e.message || "Failed to fetch chart data");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) fetchData();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  const mode = MODES.find((m) => m.value === viewMode);
  const hasData = data.some((d) => Number(d.tokens) > 0 || Number(d.cost) > 0);

  const points = data.map((d) => ({ ...d, value: Number(d[viewMode]) || 0 }));
  const { columns, step, max } = buildColumns(points, (point) => point.value);

  return (
    <Card
      title="Volume Grid"
      subtitle="One block equals a fixed share of the peak bucket in this period"
      icon="grid_view"
      padding="md"
      className="flex min-w-0 flex-col gap-4 p-4 sm:p-4"
      action={
        <SegmentedControl
          options={MODES.map((m) => ({ value: m.value, label: m.label }))}
          value={viewMode}
          onChange={setViewMode}
          size="touch"
          snap
          aria-label="Volume grid metric"
        />
      }
    >
      {error ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-danger" role="alert">
          <div className="flex items-center gap-1.5 font-medium">
            <Icon name="error" size={18} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="rounded-sm border border-danger/30 bg-danger/10 px-3 py-1 text-xs text-text-main"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-text-muted" role="status" aria-live="polite">
          Loading…
        </div>
      ) : !hasData ? (
        <div className="flex h-48 items-center justify-center text-sm text-text-muted" role="status">
          No usage recorded for this period
        </div>
      ) : (
        <>
          <BlockGrid
            columns={columns}
            color={mode.color}
            hoverColor={mode.hover}
            label={`${mode.label} per bucket`}
            valueFormatter={mode.fmt}
            axisFormatter={mode.fmt}
            step={step}
            max={max}
          />
          <GridLegend
            items={[
              { label: `1 block ≈ ${mode.fmt(step)}`, color: mode.color },
              { label: "Peak", value: mode.fmt(max) },
              {
                label: "Estimated",
                value: viewMode === "cost" ? "not billed" : "",
                hint: "Cost figures are estimated from configured pricing, not provider invoices.",
              },
            ]}
            note={`${columns.length} buckets · ${period}`}
          />
        </>
      )}
    </Card>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string,
};