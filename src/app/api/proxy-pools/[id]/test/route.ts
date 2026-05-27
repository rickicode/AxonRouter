import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { testProxyUrl, testRelay } from "@/lib/network/proxyTest";
import { getCurrentProxyPoolById, updateCurrentProxyPool } from "@/lib/proxyPoolAccess";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// POST /api/proxy-pools/[id]/test - Test proxy pool entry
export async function POST(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const proxyPool = await getCurrentProxyPoolById(id);

    if (!proxyPool) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    const result =
      proxyPool.type === "relay"
        ? await testRelay(proxyPool.proxyUrl)
        : await testProxyUrl({ proxyUrl: proxyPool.proxyUrl });
    const now = new Date().toISOString();

    await updateCurrentProxyPool(id, {
      testStatus: result.ok ? "active" : "error",
      lastTestedAt: now,
      lastError: result.ok ? null : result.error || `Proxy test failed with status ${result.status}`,
      responseTimeMs: result.elapsedMs ?? null,
    });

    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      statusText: result.statusText || null,
      error: result.error || null,
      elapsedMs: result.elapsedMs || 0,
      testedAt: now,
    });
  } catch (error) {
    console.log("Error testing proxy pool:", error);
    return NextResponse.json({ error: "Failed to test proxy pool" }, { status: 500 });
  }
}
