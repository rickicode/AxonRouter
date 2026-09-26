import { NextResponse } from "@/lib/http/response.js";
import { getProxyPoolById, updateProxyPool } from "@/models";
import { testProxyPoolEntry } from "@/lib/network/proxyTest";
import { computeProxyTestHealth } from "@/lib/network/proxyHealth.js";

// POST /api/proxy-pools/[id]/test - Test proxy pool entry
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const proxyPool = await getProxyPoolById(id);

    if (!proxyPool) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    const result = await testProxyPoolEntry(proxyPool);
    const healthUpdate = computeProxyTestHealth(proxyPool, result);
    await updateProxyPool(id, healthUpdate);

    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      statusText: result.statusText || null,
      error: result.error || null,
      elapsedMs: result.elapsedMs || 0,
      testedAt: healthUpdate.lastTestedAt,
      consecutiveFailures: healthUpdate.consecutiveFailures,
      testStatus: healthUpdate.testStatus,
      isActive: healthUpdate.isActive,
    });
  } catch (error) {
    console.log("Error testing proxy pool:", error);
    return NextResponse.json({ error: "Failed to test proxy pool" }, { status: 500 });
  }
}
