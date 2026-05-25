import { NextResponse } from "next/server";
import { fetch as undiciFetch } from "undici";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { testProxyUrl } from "@/lib/network/proxyTest";
import { getCurrentProxyPoolById, updateCurrentProxyPool } from "@/lib/proxyPoolAccess";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ProxyTestResult = {
  ok: boolean;
  status: number;
  statusText?: string;
  elapsedMs?: number;
  error?: string;
};

async function testRelay(relayUrl: string, timeoutMs = 10000): Promise<ProxyTestResult> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await undiciFetch(relayUrl, {
      method: "GET",
      headers: {
        "x-relay-target": "https://httpbin.org",
        "x-relay-path": "/get",
      },
      signal: controller.signal,
    });

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    const error = err as { name?: string; message?: string } | undefined;

    return {
      ok: false,
      status: 500,
      error: error?.name === "AbortError" ? "Relay test timed out" : error?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

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
