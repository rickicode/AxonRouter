import { runDedupedUsageRefreshJob } from "../../../../lib/usageRefreshQueue";
import { refreshUsageWithTransientSkip } from "@/lib/usageRefreshAccess";
import { ensureUsageCheckSchedulerStarted } from "@/lib/usageCheckScheduler/bootstrap";
import { getCurrentProviderConnectionById } from "@/lib/connectionStateAccess";
import { syncUsageStatus } from "@/lib/usageStatus";

type RouteContext = {
  params: Promise<{
    connectionId: string;
  }>;
};

type UsageRefreshError = Error & {
  status?: number;
  testResult?: unknown;
};

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const { connectionId } = await params;
    ensureUsageCheckSchedulerStarted().catch(() => {});
    const searchParams = new URL(request.url).searchParams;
    const runConnectionTest = searchParams.get("test") === "1";
    const includeMetadata = runConnectionTest || searchParams.get("meta") === "1";
    const forceRefresh = searchParams.get("force") === "1";

    // Force refresh: reset backoff state before re-checking
    if (forceRefresh) {
      const connection = await getCurrentProviderConnectionById(connectionId);
      if (connection) {
        await syncUsageStatus(connection, {
          backoffLevel: 0,
          nextRetryAt: null,
          routingStatus: "eligible",
          healthStatus: "healthy",
          quotaState: "ok",
          authState: "ok",
          reasonCode: null,
          reasonDetail: null,
          lastCheckedAt: new Date().toISOString(),
        });
      }
    }

    return (await runDedupedUsageRefreshJob(connectionId, async () => {
      const result = await refreshUsageWithTransientSkip(connectionId, {
        runConnectionTest: forceRefresh || runConnectionTest,
      });
      if (includeMetadata || forceRefresh) {
        return Response.json({
          usage: result.usage,
          testResult: result.testResult,
          skipped: result.skipped,
          skipReason: result.skipReason || null,
        });
      }

      return Response.json(result.usage);
    })) as Response;
  } catch (error) {
    const typedError = error as UsageRefreshError;
    const status = Number.isInteger(typedError?.status) ? typedError.status : 500;
    console.warn(`[Usage] ${typedError.message}`);
    return Response.json(
      {
        error: typedError.message,
        ...(typedError?.testResult ? { testResult: typedError.testResult } : {}),
      },
      { status },
    );
  }
}
