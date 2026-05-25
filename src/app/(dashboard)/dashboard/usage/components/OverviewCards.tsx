"use client";

import PropTypes from "prop-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const fmt = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
};
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

function MetricCard({ label, value, description, tone = "default" }) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-[var(--color-success)]",
    warning: "text-[var(--color-warning)]",
    purple: "text-[var(--color-purple)]",
  }[tone];

  return (
    <Card className="bg-card/95 shadow-[var(--shadow-card)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-shell)]">
      <CardHeader className="pb-2">
        <Badge variant="outline" className="w-fit rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]">
          {label}
        </Badge>
      </CardHeader>
      <CardContent>
        <CardTitle className={`text-3xl font-extrabold tracking-[-0.04em] ${toneClass}`}>{value}</CardTitle>
        <CardDescription className="mt-2 leading-6">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}

export default function OverviewCards({ stats }) {
  const morphFastStats = stats?.byProvider?.["morph-fast"] || null;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard
        label="Total Requests"
        value={fmt(stats.totalRequests)}
        description="All requests currently tracked by AxonRouter."
      />
      <MetricCard
        label="Total Input Tokens"
        value={fmt(stats.totalPromptTokens)}
        description="Prompt-side volume across routed traffic."
        tone="primary"
      />
      <MetricCard
        label="Output Tokens"
        value={fmt(stats.totalCompletionTokens)}
        description="Completion-side throughput from successful responses."
        tone="success"
      />
      <MetricCard
        label="Total Cost"
        value={fmtCost(stats.totalCost)}
        description="Calculated by the backend pricing engine from provider and model pricing."
        tone="warning"
      />
      <MetricCard
        label="Morph Fast Models"
        value={fmt(morphFastStats?.requests || 0)}
        description="Shared Morph fast-model requests routed through AxonRouter."
        tone="purple"
      />
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
};
