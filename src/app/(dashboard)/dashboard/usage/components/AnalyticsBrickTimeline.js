"use client";

import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import { formatMetric, fmtTokens, fmtNumber } from "./analyticsData";

const STREAMS = [
  {
    key: "requests",
    label: "Requests",
    icon: "swap_vert",
    color: "bg-primary",
    hoverColor: "hover:bg-primary-hover",
    textColor: "text-primary",
    getValue: (p) => Number(p.requests || 0),
    format: fmtNumber,
  },
  {
    key: "tokens",
    label: "Tokens",
    icon: "toll",
    color: "bg-cyan-500",
    hoverColor: "hover:bg-cyan-400",
    textColor: "text-cyan-400",
    getValue: (p) => Number(p.inputTokens || 0) + Number(p.outputTokens || 0),
    format: fmtTokens,
  },
  {
    key: "failures",
    label: "Failures",
    icon: "error",
    color: "bg-danger",
    hoverColor: "hover:bg-danger-hover",
    textColor: "text-danger",
    getValue: (p) => Number(p.failures || 0),
    format: fmtNumber,
  },
  {
    key: "latency",
    label: "P50 Latency",
    icon: "speed",
    color: "bg-amber-500",
    hoverColor: "hover:bg-amber-400",
    textColor: "text-amber-400",
    getValue: (p) => Number(p.p50LatencyMs || p.latencyMs || 0),
    format: (v) => formatMetric(v, "latencyMs"),
  },
];

const STREAM_ROWS = 4;

export default function AnalyticsBrickTimeline({ data = [] }) {
  const validPoints = data.filter((point) => point && point.timestamp);

  if (!validPoints.length) {
    return (
      <Card title="Activity Streams" subtitle="Timeline activity across all operational dimensions" icon="grid_view" padding="md">
        <div
          className="flex h-32 items-center justify-center rounded-sm border border-dashed border-border text-xs text-text-muted"
          role="status"
        >
          No telemetry events recorded for this timeframe
        </div>
      </Card>
    );
  }

  const pointsToRender = validPoints.slice(0, 31);

  return (
    <Card
      title="Activity Streams"
      subtitle="Simultaneous timeline view across requests, tokens, failures, and latency — hover columns for exact values"
      icon="grid_view"
      padding="sm"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex flex-col divide-y divide-border/60">
        {STREAMS.map((stream) => {
          const values = pointsToRender.map((p) => stream.getValue(p));
          const max = Math.max(...values, 1);
          const step = max > STREAM_ROWS ? Math.ceil(max / STREAM_ROWS) : 1;
          const total = stream.key === "latency"
            ? null
            : values.reduce((sum, v) => sum + v, 0);

          return (
            <div key={stream.key} className="py-2 first:pt-0 last:pb-0 flex flex-col gap-1.5">
              {/* Stream Title Bar */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${stream.color}`} aria-hidden="true" />
                  <span className={`font-semibold text-xs ${stream.textColor}`}>{stream.label}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-text-muted font-mono">
                  {total !== null && (
                    <span>
                      Total: <strong className="text-text-main font-semibold">{stream.format(total)}</strong>
                    </span>
                  )}
                  <span>
                    Peak: <strong className="text-text-main font-semibold">{stream.format(max)}</strong>
                  </span>
                </div>
              </div>

              {/* Block Grid for this Stream */}
              <div
                className="grid gap-[2px]"
                style={{
                  gridTemplateColumns: `repeat(${pointsToRender.length}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${STREAM_ROWS}, minmax(0, 1fr))`,
                  gridAutoFlow: "column",
                }}
                role="img"
                aria-label={`${stream.label} timeline across ${pointsToRender.length} buckets`}
              >
                {pointsToRender.map((point, columnIndex) => {
                  const val = stream.getValue(point);
                  const blocks = Math.min(STREAM_ROWS, step > 0 ? Math.ceil(val / step) : val > 0 ? 1 : 0);
                  const timeLabel = point.timestampLabel || compactLabel(point.timestamp);

                  return Array.from({ length: STREAM_ROWS }, (_, rowIndex) => {
                    const filled = rowIndex >= STREAM_ROWS - blocks;
                    return (
                      <span
                        key={`${columnIndex}-${rowIndex}`}
                        title={`${timeLabel} · ${stream.label}: ${stream.format(val)}`}
                        className={`h-2.5 w-full rounded-[2px] transition-colors ${
                          filled
                            ? stream.color
                            : "bg-surface-2 hover:bg-surface-3"
                        }`}
                      />
                    );
                  });
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Shared X-Axis Time Labels */}
      <div className="flex min-w-0 justify-between gap-1 border-t border-border pt-1.5 overflow-hidden">
        {pointsToRender.map((point, index) => {
          const total = pointsToRender.length;
          const showEvery = total > 20 ? Math.ceil(total / 6) : total > 10 ? 4 : 2;
          const show = index % showEvery === 0 || index === total - 1;
          if (!show) return <span key={index} className="h-3 shrink-0" style={{ flex: 1 }} />;
          return (
            <span
              key={index}
              className="h-3 shrink-0 truncate font-mono text-[10px] leading-tight text-text-muted"
              style={{ flex: 1 }}
            >
              {point.timestampLabel || compactLabel(point.timestamp)}
            </span>
          );
        })}
      </div>
    </Card>
  );
}

function compactLabel(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return String(timestamp).slice(5, 10);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return String(timestamp).length > 13 ? `${month}/${day} ${hours}:${minutes}` : `${month}/${day}`;
}

AnalyticsBrickTimeline.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object),
};
