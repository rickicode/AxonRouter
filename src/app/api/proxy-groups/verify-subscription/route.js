import { NextResponse } from "@/lib/http/response.js";
import { parseProxyList } from "open-sse/services/proxyAutoFetcher.js";
import { testProxyUrl } from "@/lib/network/proxyTest.js";

// POST /api/proxy-groups/verify-subscription
// Verifies a subscription URL by parsing proxies, counting total proxies,
// and actively testing candidate proxies until at least 4 succeed or sample limit reached.
export async function POST(request) {
  try {
    const body = await request.json();
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const minRequired = Number.isFinite(Number(body?.minRequired)) ? Math.max(1, Number(body.minRequired)) : 4;

    if (!url) {
      return NextResponse.json({ error: "Subscription URL is required" }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid subscription URL format" }, { status: 400 });
    }

    let responseText = "";
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "AxonRouter-ProxyAutoFetcher/1.0",
          "Accept": "text/plain, application/json, */*",
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: `Subscription endpoint returned HTTP ${res.status}: ${res.statusText}` },
          { status: 400 }
        );
      }

      responseText = await res.text();
    } catch (fetchErr) {
      return NextResponse.json(
        { error: `Failed to fetch subscription URL: ${fetchErr?.message || String(fetchErr)}` },
        { status: 400 }
      );
    }

    const proxies = parseProxyList(responseText);
    const totalCount = proxies.length;

    if (totalCount === 0) {
      return NextResponse.json(
        {
          error: "No valid proxies could be parsed from the subscription URL",
          totalCount: 0,
          verifiedCount: 0,
          ok: false,
        },
        { status: 400 }
      );
    }

    // Test a sample of proxies concurrently (up to 12 candidates) to find minRequired working ones
    const sampleSize = Math.min(12, totalCount);
    const candidates = proxies.slice(0, sampleSize);

    const testResults = await Promise.all(
      candidates.map(async (proxyUrl) => {
        try {
          const testRes = await testProxyUrl({ proxyUrl, timeoutMs: 6000 });
          return {
            proxyUrl,
            ok: testRes.ok,
            status: testRes.status,
            elapsedMs: testRes.elapsedMs,
            error: testRes.error,
          };
        } catch (e) {
          return {
            proxyUrl,
            ok: false,
            error: e?.message || "Connection failed",
          };
        }
      })
    );

    const successfulProxies = testResults.filter((r) => r.ok);
    const verifiedCount = successfulProxies.length;
    const isVerified = verifiedCount >= minRequired;

    return NextResponse.json({
      ok: isVerified,
      totalCount,
      verifiedCount,
      minRequired,
      testedCount: candidates.length,
      sampleResults: testResults.slice(0, 6),
      message: isVerified
        ? `Successfully verified ${verifiedCount} proxies (Total found: ${totalCount})`
        : `Only ${verifiedCount}/${candidates.length} tested proxies responded (minimum ${minRequired} required)`,
    });
  } catch (error) {
    console.error("Error verifying proxy subscription:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to verify proxy subscription" },
      { status: 500 }
    );
  }
}
