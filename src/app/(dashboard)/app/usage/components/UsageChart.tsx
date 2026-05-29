"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataState } from "@/shared/components/data";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;

export default function UsageChart({ period = "7d" }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("tokens");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/usage/chart?period=${period}`);
        if (!cancelled && res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error("Failed to fetch chart data:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [period]);

  const hasData = data.some((d) => d.tokens > 0 || d.cost > 0);
  const chartColors = {
    primary: "var(--primary)",
    info: "var(--color-info)",
    textMuted: "var(--muted-foreground)",
    border: "var(--border)",
    bg: "var(--background)",
  };

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Trend analysis</p>
          <CardTitle className="mt-1 text-lg tracking-[-0.02em]">Token and cost activity</CardTitle>
        </div>
        <Tabs value={viewMode} onValueChange={setViewMode}>
          <TabsList>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
            <TabsTrigger value="cost">Cost</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-48 flex-col justify-center gap-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="grid grid-cols-4 gap-3">
              <Skeleton className="h-3" />
              <Skeleton className="h-3" />
              <Skeleton className="h-3" />
              <Skeleton className="h-3" />
            </div>
          </div>
        ) : !hasData ? (
          <DataState className="h-48" title="No data for this period" description="Usage activity will appear here once requests are routed through AxonRouter." icon="analytics" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColors.info} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={chartColors.info} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} strokeOpacity={0.35} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: chartColors.textMuted }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: chartColors.textMuted }}
                tickLine={false}
                axisLine={false}
                tickFormatter={viewMode === "tokens" ? fmtTokens : fmtCost}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  color: chartColors.textMuted,
                }}
                formatter={(value, name) =>
                  name === "tokens" ? [fmtTokens(value), "Tokens"] : [fmtCost(value), "Cost"]
                }
              />
              {viewMode === "tokens" ? (
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke={chartColors.primary}
                  strokeWidth={2}
                  fill="url(#gradTokens)"
                  dot={false}
                  activeDot={{ r: 4, stroke: chartColors.bg, fill: chartColors.primary }}
                />
              ) : (
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke={chartColors.info}
                  strokeWidth={2}
                  fill="url(#gradCost)"
                  dot={false}
                  activeDot={{ r: 4, stroke: chartColors.bg, fill: chartColors.info }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string,
};
