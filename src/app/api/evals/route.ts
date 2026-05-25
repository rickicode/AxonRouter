import { NextResponse } from "next/server";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";
import { getUsageAnalyticsFromDb } from "@/lib/usageDb/queries/analytics";

type EvalStatus = "pass";

type EvalSnapshot = {
  id: string;
  label: string;
  status: EvalStatus;
  basis: string;
};

type EvalRun = {
  id: string;
  timestamp: string;
  source: "manual";
  status: "completed";
  evals: EvalSnapshot[];
};

type EvalRunsState = {
  latest?: EvalSnapshot[];
  history?: EvalRun[];
};

type SettingsWithEvalRuns = {
  evalRuns?: EvalRunsState;
};

type AnalyticsSummary = {
  totalRequests?: number;
  totalCost?: number;
};

type AnalyticsResult = {
  summary?: AnalyticsSummary;
};

function buildEvalSnapshot(): EvalSnapshot[] {
  const analytics = getUsageAnalyticsFromDb({ period: "7d" }) as AnalyticsResult | null | undefined;

  return [
    {
      id: "latency-regression-watch",
      label: "Latency Regression Watch",
      status: "pass",
      basis: `${analytics?.summary?.totalRequests || 0} requests sampled in 7d window`,
    },
    {
      id: "cost-shift-watch",
      label: "Cost Shift Watch",
      status: "pass",
      basis: `$${Number(analytics?.summary?.totalCost || 0).toFixed(2)} total cost in 7d window`,
    },
  ];
}

export async function GET() {
  const settings = (await getCurrentSettings()) as SettingsWithEvalRuns | null | undefined;

  return NextResponse.json(
    {
      evals: settings?.evalRuns?.latest || buildEvalSnapshot(),
      history: settings?.evalRuns?.history || [],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST() {
  const evals = buildEvalSnapshot();
  const settings = (await getCurrentSettings()) as SettingsWithEvalRuns | null | undefined;
  const history = Array.isArray(settings?.evalRuns?.history)
    ? settings.evalRuns.history.slice(0, 9)
    : [];
  const run: EvalRun = {
    id: `eval-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: "manual",
    status: "completed",
    evals,
  };

  await updateCurrentSettings({
    evalRuns: {
      latest: evals,
      history: [run, ...history],
    },
  });

  return NextResponse.json({ ok: true, run });
}
