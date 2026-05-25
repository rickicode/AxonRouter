import { instrumentRequest } from "@/lib/observability/otel";
import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

import { getUsageWorkerClient } from "@/lib/usageWorker/client";

type RunMode = "batch" | "all";

type RunRequestBody = {
  reason?: unknown;
  mode?: unknown;
};

type RunResult = {
  timedOut?: boolean;
  overrideRequested?: boolean;
  queued?: boolean;
  status?: unknown;
};

export async function POST(request: Request) {
  return instrumentRequest(
    request,
    "run",
    async () => {
      const authError = await requireManagementAuth(request);
      if (authError) return authError;

      try {
        const body = (await request.json().catch(() => ({}))) as RunRequestBody;
        const reason =
          body?.reason && typeof body.reason === "string" && body.reason.trim()
            ? body.reason.trim()
            : "manual_api";
        const mode: RunMode = body?.mode === "batch" ? "batch" : "all";

        const worker = getUsageWorkerClient();
        const result = (
          mode === "batch"
            ? await worker.runNow(reason)
            : await worker.runAllNow(reason)
        ) as RunResult | undefined;

        return NextResponse.json({
          success: true,
          reason: result?.timedOut
            ? "run_triggered_status_pending"
            : result?.overrideRequested
              ? "override_requested"
              : result?.queued
                ? "queued_full_refresh"
                : "run_triggered",
          requestedReason: reason,
          mode,
          queued: result?.queued === true,
          timedOut: result?.timedOut === true,
          stats: mode === "batch" ? result : null,
          snapshot: result?.status || null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    },
    {
      routePrefix: "/api/usage-worker",
      attributes: { "axonrouter.worker": "usage" },
    },
  );
}
