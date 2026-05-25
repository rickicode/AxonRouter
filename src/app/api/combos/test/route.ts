import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentActiveApiKey } from "@/lib/apiKeyAccess";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getComboModelProvider, getComboStepTarget, normalizeComboModels } from "@/lib/combos/steps";
import { getCurrentComboByName, getCurrentCombos } from "@/lib/modelCatalogAccess";
import { DEFAULT_AXONROUTER_PORT } from "@/shared/constants/runtimeDefaults";

export const dynamic = "force-dynamic";

type ValidationError = {
  message: string;
  details: Array<{ field: string; message: string }>;
};

type ValidationResult =
  | { success: true; data: { comboName: string } }
  | { success: false; error: ValidationError };

type ComboStepTarget = {
  modelStr: string;
  provider: string;
  stepId: string | null;
  executionKey: string;
  connectionId: string | null;
  label: string | null;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  } | string;
};

type ComboTestResult =
  | (ComboStepTarget & {
      status: "ok";
      latencyMs: number;
      responseText: string;
    })
  | (ComboStepTarget & {
      status: "error";
      latencyMs: number;
      statusCode?: number;
      error: string;
    });

const DEFAULT_COMBO_TEST_MAX_DEPTH = 8;

function getComboTestMaxDepth(combo: any): number {
  const configured = Number(combo?.config?.maxComboDepth);
  return Number.isFinite(configured) && configured >= 1
    ? Math.min(Math.floor(configured), 10)
    : DEFAULT_COMBO_TEST_MAX_DEPTH;
}

function validateBody(body: unknown): ValidationResult {
  const comboName =
    typeof (body as { comboName?: unknown } | null)?.comboName === "string"
      ? (body as { comboName: string }).comboName.trim()
      : "";

  if (!comboName) {
    return {
      success: false,
      error: {
        message: "Validation failed",
        details: [{ field: "comboName", message: "comboName is required" }],
      },
    };
  }

  return { success: true, data: { comboName } };
}

async function getInternalApiKey(): Promise<string | null> {
  try {
    return await getCurrentActiveApiKey();
  } catch {
    return null;
  }
}

function resolveNestedComboTargets(
  combo: any,
  allCombos: any[],
  depth = 0,
  trail: string[] = [],
  maxDepth = getComboTestMaxDepth(combo),
): ComboStepTarget[] {
  if (!combo || depth >= maxDepth) return [];

  const normalized = normalizeComboModels(combo.models || [], {
    comboName: combo.name,
    allCombos,
  }) as any[];
  const results: ComboStepTarget[] = [];

  for (const step of normalized) {
    if (!step) continue;

    if (step.kind === "combo-ref") {
      const comboName = step.comboName;
      if (!comboName || trail.includes(comboName)) continue;
      const nested = allCombos.find((entry) => entry.name === comboName);
      if (!nested) continue;
      results.push(
        ...resolveNestedComboTargets(
          nested,
          allCombos,
          depth + 1,
          [...trail, comboName].filter(Boolean),
          maxDepth,
        ),
      );
      continue;
    }

    const modelStr = getComboStepTarget(step, { comboName: combo.name, allCombos }) as
      | string
      | null
      | undefined;
    if (!modelStr) continue;
    results.push({
      modelStr,
      provider:
        (getComboModelProvider(step) as string | null | undefined) ||
        (typeof modelStr === "string" ? modelStr.split("/")[0] : "unknown"),
      stepId: step.id || null,
      executionKey: step.id || modelStr,
      connectionId: step.connectionId || null,
      label: step.label || null,
    });
  }

  return results;
}

function buildTestBody(modelStr: string) {
  return {
    model: modelStr,
    stream: false,
    messages: [
      {
        role: "system",
        content: "You are a health check. Reply with a very short plain-text acknowledgement.",
      },
      { role: "user", content: "Reply with: combo test ok" },
    ],
    max_tokens: 24,
    temperature: 0,
  };
}

function extractResponseText(json: ChatCompletionResponse | null): string {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join(" ")
      .trim();
  }
  return "";
}

async function testComboTarget(
  target: ComboStepTarget,
  baseUrl: string,
  internalApiKey: string | null,
): Promise<ComboTestResult> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalApiKey ? { Authorization: `Bearer ${internalApiKey}` } : {}),
          "X-Internal-Test": "combo-health-check",
          "X-OmniRouter-No-Cache": "true",
          ...(target.connectionId ? { "X-OmniRoute-Connection": target.connectionId } : {}),
          "X-Request-Id": `combo-test-${randomUUID()}`,
        },
        body: JSON.stringify(buildTestBody(target.modelStr)),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const latencyMs = Date.now() - startTime;
    if (!response.ok) {
      let error = response.statusText;
      try {
        const json = (await response.json()) as ChatCompletionResponse;
        error =
          (typeof json?.error === "object" ? json.error?.message : json?.error) || error;
      } catch {
        // keep status text fallback
      }
      return { ...target, status: "error", statusCode: response.status, error, latencyMs };
    }

    let responseBody: ChatCompletionResponse | null = null;
    try {
      responseBody = (await response.json()) as ChatCompletionResponse;
    } catch {
      // keep empty response body fallback
    }
    const responseText = extractResponseText(responseBody);
    if (!responseText) {
      return {
        ...target,
        status: "error",
        statusCode: 200,
        error: "Provider returned HTTP 200 but no text content.",
        latencyMs,
      };
    }

    return { ...target, status: "ok", latencyMs, responseText };
  } catch (error) {
    const typedError = error as { name?: string; message?: string } | undefined;
    return {
      ...target,
      status: "error",
      error:
        typedError?.name === "AbortError"
          ? "Timeout (20s)"
          : typedError?.message || "Unknown error",
      latencyMs: Date.now() - startTime,
    };
  }
}

function getInternalBaseUrl(request: Request): string {
  // Always use loopback — the server knows its own port
  const port = process.env.PORT || DEFAULT_AXONROUTER_PORT;
  return `http://127.0.0.1:${port}`;
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 },
    );
  }

  const validation = validateBody(rawBody);
  if (!validation.success) {
    return NextResponse.json({ error: (validation as any).error }, { status: 400 });
  }

  try {
    const { comboName } = validation.data;
    const combo = await getCurrentComboByName(comboName);
    if (!combo) return NextResponse.json({ error: "Combo not found" }, { status: 404 });

    const allCombos = await getCurrentCombos();
    const targets = resolveNestedComboTargets(combo, allCombos);
    if (targets.length === 0) {
      return NextResponse.json({ error: "Combo has no models" }, { status: 400 });
    }

    // Dedup targets by executionKey to avoid testing the same model twice (diamond patterns)
    const seen = new Set<string>();
    const dedupedTargets: ComboStepTarget[] = [];
    for (const target of targets) {
      if (seen.has(target.executionKey)) continue;
      seen.add(target.executionKey);
      dedupedTargets.push(target);
    }

    const baseUrl = getInternalBaseUrl(request);
    const internalApiKey = await getInternalApiKey();

    // Limit concurrency to 4 parallel tests to avoid overwhelming the local instance
    const CONCURRENCY_LIMIT = 4;
    const results: ComboTestResult[] = [];
    for (let i = 0; i < dedupedTargets.length; i += CONCURRENCY_LIMIT) {
      const batch = dedupedTargets.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.all(
        batch.map((target) => testComboTarget(target, baseUrl, internalApiKey)),
      );
      results.push(...batchResults);
    }

    const resolvedResult = results.find((result) => result.status === "ok") || null;

    return NextResponse.json({
      comboName,
      strategy: combo.strategy || "priority",
      resolvedBy: resolvedResult?.modelStr || null,
      resolvedByExecutionKey: resolvedResult?.executionKey || null,
      resolvedByTarget: resolvedResult
        ? {
            model: resolvedResult.modelStr,
            provider: resolvedResult.provider,
            stepId: resolvedResult.stepId,
            executionKey: resolvedResult.executionKey,
            connectionId: resolvedResult.connectionId,
            label: resolvedResult.label,
          }
        : null,
      results,
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log("Error testing combo:", error);
    return NextResponse.json(
      { error: (error as { message?: string } | undefined)?.message || "Failed to test combo" },
      { status: 500 },
    );
  }
}
