import { NextResponse } from "@/lib/http/response.js";
import { getSettings } from "@/lib/db/repos/settingsRepo.js";
import { getProxyPools, getProxyPoolById } from "@/lib/db/repos/proxyPoolsRepo.js";
import { getProxyGroupByName, getProxyGroupById } from "@/lib/db/repos/proxyGroupsRepo.js";
import { getProviderProxyStats } from "@/lib/db/repos/analyticsRepo.js";
import { countProviderConnections } from "@/lib/db/repos/connectionsRepo.js";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const params = await context?.params;
    const providerId = params?.id;
    if (!providerId) {
      return NextResponse.json({ error: "Provider ID is required" }, { status: 400 });
    }

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
    const { stats24h, stats1h, errorBreakdown } = await getProviderProxyStats(providerId);

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
      connectionCount = await countProviderConnections(providerId);
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
