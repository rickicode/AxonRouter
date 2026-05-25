import { instrumentRequest } from "@/lib/observability/otel";
import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

import { getUsageWorkerClient } from "@/lib/usageWorker/client";

export async function GET(request: Request) {
  return instrumentRequest(
    request,
    "status",
    async () => {
      const authError = await requireManagementAuth(request);
      if (authError) return authError;

      try {
        const worker = getUsageWorkerClient();
        const status = await worker.getStatus();
        return NextResponse.json(status);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    },
    {
      routePrefix: "/api/usage-worker",
      attributes: { "axonrouter.worker": "usage" },
    },
  );
}
