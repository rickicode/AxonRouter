import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentActiveApiKey } from "@/lib/apiKeyAccess";

type ModelTestRequestBody = {
  model?: string;
  kind?: string;
};

type ProviderErrorShape = {
  message?: string;
};

type ProviderResponseShape = {
  error?: string | ProviderErrorShape | null;
  msg?: string;
  message?: string;
  status?: string | number | null;
  data?: Array<{
    embedding?: unknown;
  }>;
  choices?: unknown[];
};

// POST /api/models/test - Ping a single model via internal completions or embeddings
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { model, kind } = (await request.json()) as ModelTestRequestBody;
    if (!model) return NextResponse.json({ error: "Model required" }, { status: 400 });

    const baseUrl =
      process.env.BASE_URL ||
      (() => {
        const u = new URL(request.url);
        return `${u.protocol}//${u.host}`;
      })();

    // Get an active internal API key for auth (if requireApiKey is enabled)
    let apiKey: string | null = null;
    try {
      apiKey = await getCurrentActiveApiKey();
    } catch {}

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const formatGatewayAuthError = (status: number, detail: string) => {
      const shortDetail = String(detail || "").slice(0, 240);
      if ((status === 401 || status === 403) && !apiKey) {
        return `HTTP ${status}: Gateway internal API key is missing/inactive. Activate one API key in dashboard settings, then retry model test.${shortDetail ? ` Detail: ${shortDetail}` : ""}`;
      }
      return `HTTP ${status}${shortDetail ? `: ${shortDetail}` : ""}`;
    };

    const start = Date.now();

    // Route to appropriate endpoint based on kind
    if (kind === "embedding") {
      const res = await fetch(`${baseUrl}/v1/embeddings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, input: "test" }),
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - start;
      const rawText = await res.text().catch(() => "");
      let parsed: ProviderResponseShape | null = null;
      try {
        parsed = rawText ? (JSON.parse(rawText) as ProviderResponseShape) : null;
      } catch {}

      if (!res.ok) {
        const detail =
          (typeof parsed?.error === "object" && parsed?.error?.message) ||
          parsed?.error ||
          rawText;
        return NextResponse.json({
          ok: false,
          latencyMs,
          error: formatGatewayAuthError(res.status, String(detail || "")),
          status: res.status,
        });
      }
      const hasEmbedding =
        Array.isArray(parsed?.data) &&
        parsed.data.length > 0 &&
        Array.isArray(parsed.data[0]?.embedding);
      if (!hasEmbedding) {
        return NextResponse.json({
          ok: false,
          latencyMs,
          status: res.status,
          error: "Provider returned no embedding data",
        });
      }
      return NextResponse.json({ ok: true, latencyMs, error: null, status: res.status });
    }

    // Default: chat completions
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 1,
        stream: false,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;

    const rawText = await res.text().catch(() => "");
    let parsed: ProviderResponseShape | null = null;
    try {
      parsed = rawText ? (JSON.parse(rawText) as ProviderResponseShape) : null;
    } catch {}

    if (!res.ok) {
      const detail =
        (typeof parsed?.error === "object" && parsed?.error?.message) ||
        parsed?.msg ||
        parsed?.message ||
        parsed?.error ||
        rawText;
      const error = formatGatewayAuthError(res.status, String(detail || ""));
      return NextResponse.json({ ok: false, latencyMs, error, status: res.status });
    }

    // Some providers may return HTTP 200 but not a real completion for invalid models.
    const providerStatus = parsed?.status;
    const providerMsg = parsed?.msg || parsed?.message;
    const hasProviderErrorStatus =
      providerStatus !== undefined &&
      providerStatus !== null &&
      String(providerStatus) !== "200" &&
      String(providerStatus) !== "0";
    if (hasProviderErrorStatus && providerMsg) {
      return NextResponse.json({
        ok: false,
        latencyMs,
        status: res.status,
        error: `Provider status ${providerStatus}: ${String(providerMsg).slice(0, 240)}`,
      });
    }

    if (parsed?.error) {
      const providerError =
        (typeof parsed.error === "object" && parsed.error?.message) ||
        parsed.error ||
        "Provider returned an error";
      return NextResponse.json({
        ok: false,
        latencyMs,
        status: res.status,
        error: String(providerError).slice(0, 240),
      });
    }

    const hasChoices = Array.isArray(parsed?.choices) && parsed.choices.length > 0;
    if (!hasChoices) {
      return NextResponse.json({
        ok: false,
        latencyMs,
        status: res.status,
        error: "Provider returned no completion choices for this model",
      });
    }

    return NextResponse.json({ ok: true, latencyMs, error: null, status: res.status });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
