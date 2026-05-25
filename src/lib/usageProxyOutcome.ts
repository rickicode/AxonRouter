import { getCurrentProviderConnectionById } from "@/lib/connectionStateAccess";
import { saveRequestDetail, saveRequestUsage } from "@/lib/usageDb";
import {
  applyCanonicalUsageRefresh,
  applyLiveQuotaUpdate,
  getCodexLiveQuotaSignal,
  getConnectionAuthBlockedPatch,
  isTransientUpstreamTimeoutError,
  isUpstreamProcessingError,
  syncUsageStatus,
} from "@/lib/usageStatus";

function normalizeReportTokens(report: any = {}) {
  const usage: any = report.usage;
  if (!usage || typeof usage !== "object") return null;

  const promptTokens = Number(
    usage.prompt_tokens
    ?? usage.input_tokens
    ?? usage.promptTokens
    ?? usage.inputTokens
    ?? 0
  );
  const completionTokens = Number(
    usage.completion_tokens
    ?? usage.output_tokens
    ?? usage.completionTokens
    ?? usage.outputTokens
    ?? 0
  );
  const cachedTokens = Number(usage.cached_tokens ?? usage.cachedTokens ?? usage.cache_read_input_tokens ?? 0);

  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens) || !Number.isFinite(cachedTokens)) {
    return null;
  }

  if (promptTokens <= 0 && completionTokens <= 0 && cachedTokens <= 0) {
    return null;
  }

  return {
    prompt_tokens: Math.max(0, Math.trunc(promptTokens)),
    completion_tokens: Math.max(0, Math.trunc(completionTokens)),
    ...(cachedTokens > 0 ? { cached_tokens: Math.max(0, Math.trunc(cachedTokens)) } : {}),
  };
}

function mapReportStatus(report: any = {}) {
  const reportRecord = report as any;
  const outcome = String(reportRecord.outcome || "").toLowerCase();
  if (outcome === "error" || outcome === "failed" || outcome === "failure") {
    return "error";
  }

  const upstreamStatus = Number(reportRecord.upstreamStatus);
  if (Number.isFinite(upstreamStatus) && upstreamStatus >= 400) {
    return "error";
  }

  if (reportRecord.error) {
    return "error";
  }

  return "ok";
}

function getReportObservedAt(report: any = {}) {
  const reportRecord = report as any;
  return reportRecord.observedAt || reportRecord.finishedAt || reportRecord.timestamp || new Date().toISOString();
}

export async function applyProxyOutcomeReport(report: any = {}) {
  const reportRecord = report as any;
  const connectionId = reportRecord.connectionId || null;
  const provider = reportRecord.provider || null;
  const model = reportRecord.model || reportRecord.requestedModel || null;
  const observedAt = getReportObservedAt(report);
  const status = mapReportStatus(reportRecord);
  const tokens = normalizeReportTokens(reportRecord);
  const usageEvidence = reportRecord.usage && typeof reportRecord.usage === "object"
    ? reportRecord.usage
    : null;
  const quotasEvidence = reportRecord.quotas && typeof reportRecord.quotas === "object"
    ? reportRecord.quotas
    : null;
  const hasCanonicalUsageEvidence = Boolean(tokens || usageEvidence || quotasEvidence);

  if (tokens) {
    await saveRequestUsage({
      provider,
      model,
      tokens,
      connectionId,
      endpoint: reportRecord.publicPath || reportRecord.route || null,
      status,
      timestamp: observedAt,
    }, { propagateError: true });
  }

  await saveRequestDetail({
    id: reportRecord.requestId || reportRecord.id || undefined,
    provider,
    model,
    connectionId,
    timestamp: observedAt,
    status,
    latency: {
      totalMs: reportRecord.latencyMs ?? null,
    },
    tokens: tokens || {},
    request: {
      protocolFamily: reportRecord.protocolFamily || null,
      publicPath: reportRecord.publicPath || null,
      method: reportRecord.method || null,
    },
    providerRequest: {
      requestId: reportRecord.requestId || null,
    },
    providerResponse: {
      status: reportRecord.upstreamStatus ?? null,
      error: reportRecord.error || null,
    },
    response: {
      outcome: reportRecord.outcome || null,
    },
  }, { forceFlush: false, propagateError: true });

  if (!connectionId) {
    return { ok: true };
  }

  const connection = await getCurrentProviderConnectionById(connectionId);
  if (!connection) {
    return { ok: true };
  }

  const statusCode = Number.isFinite(Number(reportRecord.upstreamStatus))
    ? Number(reportRecord.upstreamStatus)
    : null;
  const errorMessage = reportRecord.error?.message || reportRecord.error || null;

  if (status === "error") {
    if (isTransientUpstreamTimeoutError(reportRecord.error, {
      statusCode,
      errorCode: reportRecord.error?.code,
    })) {
      await syncUsageStatus(connection, {
        lastCheckedAt: observedAt,
        lastError: null,
        lastErrorType: null,
        lastErrorAt: null,
        errorCode: null,
      });
      return { ok: true };
    }

    if (isUpstreamProcessingError(statusCode, errorMessage)) {
      await syncUsageStatus(connection, {
        lastCheckedAt: observedAt,
      });
      return { ok: true };
    }

    const authPatch = getConnectionAuthBlockedPatch(errorMessage, {
      lastCheckedAt: observedAt,
      statusCode,
    });

    if (authPatch) {
      await syncUsageStatus(connection, authPatch);
      return { ok: true };
    }

    const liveSignal = getCodexLiveQuotaSignal(connection, {
      statusCode,
      errorText: errorMessage,
      errorCode: reportRecord.error?.code,
    });

    if (liveSignal) {
      await applyLiveQuotaUpdate(connection, liveSignal, { observedAt });
      return { ok: true };
    }

    await syncUsageStatus(connection, {
      healthStatus: "degraded",
      lastCheckedAt: observedAt,
      lastError: errorMessage || "Proxy request failed",
      lastErrorType: "proxy_error",
      lastErrorAt: observedAt,
      errorCode: reportRecord.error?.code || "proxy_error",
    });

    return { ok: true };
  }

  if (hasCanonicalUsageEvidence) {
    await applyCanonicalUsageRefresh(connection, {
      quotas: quotasEvidence,
      usage: usageEvidence,
    }, { observedAt });
    return { ok: true };
  }

  await syncUsageStatus(connection, {
    lastCheckedAt: observedAt,
    usageSnapshot: JSON.stringify(usageEvidence || {}),
  });

  return { ok: true };
}
