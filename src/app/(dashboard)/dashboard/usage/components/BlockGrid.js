"use client";

import PropTypes from "prop-types";
import Tooltip from "@/shared/components/Tooltip";

export const MAX_ROWS = 12;

/**
 * Render a value as a stacked column of unit blocks scaled to a shared step.
 * Used by every grid view on the usage dashboard so the physical meaning of a
 * block ("1 block = N") stays consistent across panels.
 */
export function buildColumns(points, getValue, maxRows = MAX_ROWS) {
  const values = points.map((point) => Number(getValue(point)) || 0);
  const max = Math.max(...values, 0);
  const step = max > maxRows ? max / maxRows : 1;
  return {
    max,
    step,
    columns: points.map((point, index) => {
      const value = values[index];
      return {
        point,
        value,
        blocks: value > 0 ? Math.max(1, Math.round(value / step)) : 0,
      };
    }),
  };
}

export default function BlockGrid({
  columns,
  color,
  hoverColor,
  rows = MAX_ROWS,
  label,
  valueFormatter,
  axisFormatter,
  step,
  max,
}) {
  const visible = columns.slice(0, 31);
  const maxValue = Math.max(...visible.map((column) => column.value), 1);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Compact list (<640): cells would measure ~9px in the grid, so the same
          data renders as labelled rows with a proportional bar and a real value. */}
      <div className="flex flex-col gap-1 sm:hidden" role="list" aria-label={`${label}, per bucket`}>
        {visible.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-muted">No buckets in this window</p>
        ) : (
          visible.map((column, index) => (
            <div
              key={`${column.label}-${index}`}
              role="listitem"
              className="flex min-h-11 items-center gap-2.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5"
            >
              <span className="w-16 shrink-0 truncate font-mono text-[10px] text-text-muted">
                {column.label}
              </span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                <span
                  className={`block h-full rounded-full ${color}`}
                  style={{ width: `${Math.max(column.value > 0 ? 3 : 0, (column.value / maxValue) * 100)}%` }}
                />
              </span>
              <span className="shrink-0 font-mono text-[11px] font-medium tabular-nums text-text-main">
                {valueFormatter(column.value)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Block grid (>=640): cells measure >=14px here, so the metaphor holds. */}
      <div className="hidden min-w-0 gap-2.5 sm:flex">
        <div className="flex shrink-0 flex-col-reverse justify-between py-0.5 text-right">
          {Array.from({ length: rows + 1 }, (_, rowIndex) => {
            const show = rowIndex % 3 === 0 || rowIndex === rows;
            return (
              <span
                key={rowIndex}
                className="font-mono text-[10px] leading-none text-text-muted"
                style={{ visibility: show ? "visible" : "hidden" }}
              >
                {axisFormatter(rowIndex * step)}
              </span>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="grid gap-[3px]"
            style={{
              gridTemplateColumns: `repeat(${Math.min(visible.length, 31)}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              gridAutoFlow: "column",
            }}
            role="img"
            aria-label={`${label} grid, peak ${valueFormatter(max)}`}
          >
            {visible.map((column, columnIndex) =>
              Array.from({ length: rows }, (_, rowIndex) => {
                const filled = rowIndex >= rows - column.blocks;
                return (
                  <span
                    key={`${columnIndex}-${rowIndex}`}
                    title={`${column.label}: ${valueFormatter(column.value)}`}
                    className={`aspect-square rounded-[2px] transition-colors ${
                      filled ? `${color} ${hoverColor || "hover:opacity-80"}` : "bg-surface-2 hover:bg-surface-3"
                    }`}
                  />
                );
              }),
            )}
          </div>

          <div className="mt-2 flex min-w-0 justify-between gap-1 overflow-hidden">
            {visible.map((column, index) => {
              const total = visible.length;
              const every = total > 20 ? Math.ceil(total / 8) : total > 10 ? 4 : 2;
              const show = index % every === 0 || index === total - 1;
              return (
                <span
                  key={index}
                  className="h-3 min-w-0 shrink truncate text-center font-mono text-[10px] leading-tight text-text-muted"
                  style={{ flex: 1 }}
                >
                  {show ? column.label : ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

BlockGrid.propTypes = {
  columns: PropTypes.array.isRequired,
  color: PropTypes.string.isRequired,
  hoverColor: PropTypes.string,
  rows: PropTypes.number,
  label: PropTypes.string,
  valueFormatter: PropTypes.func.isRequired,
  axisFormatter: PropTypes.func.isRequired,
  step: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
};

export function GridLegend({ items, note }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 text-[11px] text-text-muted">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={`size-2 rounded-[2px] ${item.color}`} />
          {item.label}
          {item.value ? (
            <span className="font-medium tabular-nums text-text-main">{item.value}</span>
          ) : null}
          {item.hint ? <Tooltip text={item.hint} position="top" /> : null}
        </span>
      ))}
      {note ? <span className="ml-auto italic">{note}</span> : null}
    </div>
  );
}

GridLegend.propTypes = {
  items: PropTypes.array.isRequired,
  note: PropTypes.string,
};