import { runCanonicalUsageWorker } from "@/lib/canonicalUsageWorker";
import { ensureUsageCheckSchedulerStarted } from "@/lib/usageCheckScheduler/bootstrap";

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

    const result = await runCanonicalUsageWorker({
      connectionId,
      trigger: "manual",
      force: forceRefresh,
      runConnectionTest,
      skipTransientConnectivityErrors: true,
      metadata: { endpoint: "/api/usage/[connectionId]" },
    });

    if (includeMetadata || forceRefresh) {
      return Response.json({
        usage: result.usage,
        testResult: result.testResult,
        skipped: result.skipped,
        skipReason: result.skipReason || null,
        worker: result.worker,
      });
    }

    return Response.json(result.usage);
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
