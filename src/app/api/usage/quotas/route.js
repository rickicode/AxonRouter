import { NextResponse } from "@/lib/http/response.js";
import { getBatchProviderQuotas } from "@/lib/db/repos/usageSnapshotsRepo.js";
import { autoHealConnectionOnQuotaRestored } from "@/sse/services/accountExhaustionPolicy.js";
import { setQuotaCache, isQuotaMapExhausted } from "@/domain/quotaCache.js";
export const dynamic = "force-dynamic";

/**
 * GET /api/usage/quotas?provider=xxx
 * Batch quota snapshots for one provider, joined with connection routing info
 * (name, email, priority, is_active, locked_all_until). One round-trip, replaces
 * the per-connection quota storm from the dashboard.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");

    if (!provider) {
      return NextResponse.json(
        { error: "provider query parameter is required" },
        { status: 400 },
      );
    }

    const quotas = await getBatchProviderQuotas(provider);

    // Refresh RAM state and durable status from each persisted snapshot.
    if (Array.isArray(quotas)) {
      for (const item of quotas) {
        if (!item?.connectionId || !item.quotas) continue;
        const cached = await setQuotaCache(item.connectionId, item.quotas, {
          provider: item.provider || provider,
          plan: item.plan || null,
          persist: false,
          persistStatus: true,
          publish: false,
        });
        if (cached?.exhausted) item.testStatus = "exhausted";
        else if (item.testStatus === "exhausted" || item.lockedAllUntil) {
          const healed = await autoHealConnectionOnQuotaRestored(
            item.connectionId,
            { provider: item.provider || provider, quotas: item.quotas, remainingPct: item.remainingPct },
          ).catch(() => false);
          if (healed) {
            item.testStatus = "active";
            item.lockedAllUntil = null;
          }
        }
      }
    }

    return NextResponse.json({ quotas });
  } catch (error) {
    console.error("[API] Failed to fetch provider quotas:", error);
    return NextResponse.json(
      { error: "Failed to fetch provider quotas" },
      { status: 500 },
    );
  }
}