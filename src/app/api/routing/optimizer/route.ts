import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  getCurrentSettings,
  updateCurrentSettings,
} from "@/lib/settingsAccess";
import { getUsageAnalyticsFromDb } from "@/lib/usageDb/queries/analytics";

type OptimizerProfile = "economy" | "balanced" | "premium";

type ProviderAnalytics = {
  provider: string;
  cost: number;
};

type OptimizerRun = {
  id: string;
  timestamp: string;
  appliedProfile: OptimizerProfile;
  reason: string;
  feedbackScore: number;
};

type OptimizerRequestBody = {
  profile?: unknown;
  reason?: unknown;
  feedbackScore?: unknown;
};

const VALID_PROFILES: OptimizerProfile[] = ["economy", "balanced", "premium"];

function isOptimizerProfile(value: unknown): value is OptimizerProfile {
  return typeof value === "string" && VALID_PROFILES.includes(value as OptimizerProfile);
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const analytics = getUsageAnalyticsFromDb({ period: "30d" }) as {
    byProvider?: ProviderAnalytics[];
  } | null;
  const settings = (await getCurrentSettings()) as {
    optimizerRuns?: {
      history?: Array<Partial<OptimizerRun>>;
    };
  };
  const byProvider = analytics?.byProvider || [];
  const top = [...byProvider].sort((a, b) => b.cost - a.cost).slice(0, 5);
  const history = settings?.optimizerRuns?.history || [];
  const lastProfile = history[0]?.appliedProfile || null;
  const recommendations = top.map((provider) => {
    const suggestedProfile: OptimizerProfile = provider.cost > 50 ? "economy" : "balanced";
    const feedbackScore = suggestedProfile === lastProfile ? 0.5 : 1;
    return {
      provider: provider.provider,
      recommendation:
        provider.cost > 0 ? "Review routing profile or provider configuration" : "Stable",
      suggestedProfile,
      feedbackScore,
      estimatedImpact:
        provider.cost > 0
          ? `Spend review based on $${provider.cost.toFixed(2)} backend-calculated cost`
          : "No action",
    };
  });

  return NextResponse.json(
    {
      recommendations,
      summary: {
        providersReviewed: byProvider.length,
        highestSpendProvider: top[0]?.provider || null,
      },
      history: settings?.optimizerRuns?.history || [],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as OptimizerRequestBody;
  const profile = body?.profile;
  if (!isOptimizerProfile(profile)) {
    return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
  }

  const current = (await getCurrentSettings()) as {
    optimizerRuns?: {
      history?: OptimizerRun[];
    };
  };
  const history = Array.isArray(current?.optimizerRuns?.history)
    ? current.optimizerRuns.history.slice(0, 9)
    : [];
  const run: OptimizerRun = {
    id: `optimizer-${Date.now()}`,
    timestamp: new Date().toISOString(),
    appliedProfile: profile,
    reason: typeof body?.reason === "string" ? body.reason : "manual-apply",
    feedbackScore: Number(body?.feedbackScore || 1),
  };
  const settings = await updateCurrentSettings({
    routingProfile: profile,
    optimizerRuns: {
      latest: run,
      history: [run, ...history],
    },
  });
  return NextResponse.json({ ok: true, appliedProfile: profile, routing: settings.routing || null, run });
}
