import { NextResponse } from "@/lib/http/response.js";
import { getSettings } from "@/lib/db/repos/settingsRepo.js";
import { getProxyPools, getProxyPoolById } from "@/lib/db/repos/proxyPoolsRepo.js";
import { getProxyGroupByName, getProxyGroupById } from "@/lib/db/repos/proxyGroupsRepo.js";
import { getAdapter } from "@/lib/db/driver.js";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const params = await context?.params;
    const providerId = params?.id;
    if (!providerId) {
      return NextResponse.json({ error: "Provider ID is required" }, { status: 400 });
    }

    const db = await getAdapter();
    const settings = await getSettings();
    const providerStrategy = (settings.providerStrategies || {})[providerId] || {};

    let routingMode = "direct";
    if (providerStrategy.proxyGroup) {
      routingMode = "group";
    } else if (providerStrategy.rotateStrategy && providerStrategy.rotateStrategy !== "none") {
      routingMode = "all";
    } else if (providerStrategy.proxyPoolId && providerStrategy.proxyPoolId !== "__none__") {
      routingMode = "single";
    }

    const proxyConfig = {
      mode: routingMode,
      proxyGroup: providerStrategy.proxyGroup || null,
      proxyPoolId: providerStrategy.proxyPoolId || null,
      rotateStrategy: providerStrategy.rotateStrategy || "none",
      fallbackStrategy: providerStrategy.fallbackStrategy || null,
      autoAppliedToNewAccounts: true,
    };

    // 1. Success rate statistics from analytics_events (past 24h & past 1h)
    let stats24h = { total: 0, success: 0, failure: 0, successRate: 100 };
    let stats1h = { total: 0, success: 0, failure: 0, successRate: 100 };
    let errorBreakdown = [];

    try {
      const row24h = await db.get(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE success = true)::int AS success_count,
           COUNT(*) FILTER (WHERE success = false)::int AS failure_count,
           ROUND((COUNT(*) FILTER (WHERE success = true)::numeric / NULLIF(COUNT(*)::numeric, 0)) * 100, 1) AS success_rate
         FROM analytics_events
         WHERE provider = $1 AND timestamp >= NOW() - INTERVAL '24 hours'`,
        [providerId],
      );
      if (row24h && row24h.total > 0) {
        stats24h = {
          total: Number(row24h.total || 0),
          success: Number(row24h.success_count || 0),
          failure: Number(row24h.failure_count || 0),
          successRate: Number(row24h.success_rate || 0),
        };
      }

      const row1h = await db.get(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE success = true)::int AS success_count,
           COUNT(*) FILTER (WHERE success = false)::int AS failure_count,
           ROUND((COUNT(*) FILTER (WHERE success = true)::numeric / NULLIF(COUNT(*)::numeric, 0)) * 100, 1) AS success_rate
         FROM analytics_events
         WHERE provider = $1 AND timestamp >= NOW() - INTERVAL '1 hour'`,
        [providerId],
      );
      if (row1h && row1h.total > 0) {
        stats1h = {
          total: Number(row1h.total || 0),
          success: Number(row1h.success_count || 0),
          failure: Number(row1h.failure_count || 0),
          successRate: Number(row1h.success_rate || 0),
        };
      }

      const errRows = await db.all(
        `SELECT error_category, COUNT(*)::int AS count
         FROM analytics_events
         WHERE provider = $1 AND success = false AND timestamp >= NOW() - INTERVAL '24 hours'
         GROUP BY error_category
         ORDER BY count DESC
         LIMIT 5`,
        [providerId],
      );
      errorBreakdown = errRows.map((r) => ({ category: r.error_category || "unknown", count: Number(r.count || 0) }));
    } catch (e) {
      console.warn("[proxy-stats] Error reading analytics_events:", e?.message);
    }

    // 2. Proxy group or pool details & health info
    let groupHealth = null;
    let singlePoolHealth = null;

    if (routingMode === "group" && providerStrategy.proxyGroup) {
      const gName = providerStrategy.proxyGroup;
      let customGroup = null;
      try {
        customGroup = await getProxyGroupByName(gName);
        if (!customGroup) customGroup = await getProxyGroupById(gName);
      } catch {}

      let matchingPools = [];
      if (customGroup && Array.isArray(customGroup.poolIds) && customGroup.poolIds.length > 0) {
        const allPools = await getProxyPools();
        const idSet = new Set(customGroup.poolIds);
        matchingPools = allPools.filter((p) => idSet.has(p.id));
      } else {
        const allPools = await getProxyPools();
        matchingPools = allPools.filter(
          (p) => String(p.group || "").toLowerCase() === gName.toLowerCase() || String(p.type || "").toLowerCase() === gName.toLowerCase(),
        );
      }

      const total = matchingPools.length;
      const active = matchingPools.filter((p) => p.isActive && p.testStatus !== "unhealthy" && p.testStatus !== "dead" && (p.consecutiveFailures || 0) < 3).length;
      const degraded = matchingPools.filter((p) => p.isActive && p.testStatus === "degraded" && (p.consecutiveFailures || 0) > 0 && (p.consecutiveFailures || 0) < 3).length;
      const unhealthy = matchingPools.filter((p) => !p.isActive || p.testStatus === "unhealthy" || p.testStatus === "dead" || (p.consecutiveFailures || 0) >= 3).length;
      const healthRate = total > 0 ? Math.round((active / total) * 100) : 0;

      groupHealth = {
        name: gName,
        totalPools: total,
        activePools: active,
        degradedPools: degraded,
        unhealthyPools: unhealthy,
        healthRate,
        isSticky: customGroup?.isSticky || false,
        stickyLimit: customGroup?.stickyLimit || 3,
      };
    } else if (routingMode === "single" && providerStrategy.proxyPoolId) {
      try {
        const pool = await getProxyPoolById(providerStrategy.proxyPoolId);
        if (pool) {
          singlePoolHealth = {
            id: pool.id,
            name: pool.name,
            type: pool.type,
            isActive: pool.isActive,
            testStatus: pool.testStatus,
            consecutiveFailures: pool.consecutiveFailures || 0,
            lastTestedAt: pool.lastTestedAt,
            lastError: pool.lastError,
          };
        }
      } catch {}
    } else if (routingMode === "all") {
      const allPools = await getProxyPools();
      const total = allPools.length;
      const active = allPools.filter((p) => p.isActive && p.testStatus !== "unhealthy" && p.testStatus !== "dead" && (p.consecutiveFailures || 0) < 3).length;
      groupHealth = {
        name: "All Active Pools",
        totalPools: total,
        activePools: active,
        degradedPools: allPools.filter((p) => p.isActive && p.testStatus === "degraded").length,
        unhealthyPools: allPools.filter((p) => !p.isActive || (p.consecutiveFailures || 0) >= 3).length,
        healthRate: total > 0 ? Math.round((active / total) * 100) : 0,
      };
    }

    // 3. Count connected accounts for this provider
    let connectionCount = 0;
    try {
      const countRow = await db.get(
        `SELECT COUNT(*)::int AS count FROM provider_connections WHERE provider = $1`,
        [providerId],
      );
      connectionCount = Number(countRow?.count || 0);
    } catch {}

    return NextResponse.json({
      success: true,
      providerId,
      proxyConfig,
      stats24h,
      stats1h,
      errorBreakdown,
      groupHealth,
      singlePoolHealth,
      connectionCount,
    });
  } catch (error) {
    console.error("[proxy-stats] Error in GET handler:", error);
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
