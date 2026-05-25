import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { testProxyUrl } from "@/lib/network/proxyTest";

type ProxyTestRequestBody = {
  proxyUrl?: unknown;
  testUrl?: unknown;
  timeoutMs?: unknown;
};

type ProxyTestResult = {
  ok?: boolean;
  status?: number;
  error?: string;
};

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as ProxyTestRequestBody;
    const result = (await testProxyUrl({
      proxyUrl: body?.proxyUrl,
      testUrl: body?.testUrl,
      timeoutMs: body?.timeoutMs,
    })) as ProxyTestResult;

    if (result?.ok) {
      return NextResponse.json(result);
    }

    const status = typeof result?.status === "number" ? result.status : 500;
    return NextResponse.json({ ok: false, error: result?.error || "Proxy test failed" }, { status });
  } catch (err) {
    const error = err as { name?: string; message?: string };
    const message = error?.name === "AbortError" ? "Proxy test timed out" : error?.message || String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
