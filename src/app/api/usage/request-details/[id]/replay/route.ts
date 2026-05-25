import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getRequestDetailById } from "@/lib/usageDb";

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

type ReplayRequestBody = {
  execute?: boolean;
  model?: string;
};

type JsonLikeRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonLikeRecord {
  return value && typeof value === "object" ? (value as JsonLikeRecord) : {};
}

export async function POST(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const resolvedParams = await params;
    const id = resolvedParams?.id;
    if (!id) {
      return NextResponse.json({ error: "Missing request detail id" }, { status: 400 });
    }

    const detail = await getRequestDetailById(id);
    if (!detail) {
      return NextResponse.json({ error: "Request detail not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as ReplayRequestBody;
    const execute = body?.execute === true;
    const overrideModel = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : null;
    const replay = {
      id: detail.id,
      correlationId: detail.correlationId || null,
      endpoint: detail.request?.endpoint || detail.endpoint || null,
      mode: detail.request?.mode || detail.providerResponse?.trace?.mode || null,
      provider: detail.provider || null,
      model: detail.model || null,
      request: detail.request || {},
      trace: detail.providerResponse?.trace || null,
    };

    if (!execute) {
      return NextResponse.json({ replay });
    }

    const payload = asRecord(detail?.request?.body);
    const mode = replay.mode || payload.mode || "text";
    const nextModel = overrideModel || payload.model || replay.model;
    const origin = new URL(request.url).origin;
    const dispatchRes = await fetch(`${origin}/v1/unified`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(detail.correlationId ? { "x-correlation-id": detail.correlationId } : {}),
      },
      body: JSON.stringify({ ...payload, mode, ...(nextModel ? { model: nextModel } : {}) }),
    });
    const contentType = dispatchRes.headers.get("content-type") || "";
    const responsePayload = contentType.includes("application/json")
      ? await dispatchRes.json().catch(() => null)
      : { output_kind: dispatchRes.headers.get("x-axonrouter-output-kind") || null };

    const responseRecord = responsePayload && typeof responsePayload === "object"
      ? (responsePayload as JsonLikeRecord)
      : null;
    const outputValue = responseRecord?.output;
    const outputRecord = outputValue && typeof outputValue === "object"
      ? (outputValue as JsonLikeRecord)
      : null;

    const previousContent = detail?.response?.content || detail?.response?.output || null;
    const nextContent = outputRecord?.content || outputValue || responsePayload || null;

    return NextResponse.json({
      replay,
      execution: {
        status: dispatchRes.status,
        ok: dispatchRes.ok,
        response: responsePayload,
      },
      comparison: {
        previousContent,
        nextContent,
        changed: JSON.stringify(previousContent) !== JSON.stringify(nextContent),
        mode: replay.mode,
        provider: replay.provider,
        model: nextModel || replay.model,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to build replay payload", message }, { status: 500 });
  }
}
