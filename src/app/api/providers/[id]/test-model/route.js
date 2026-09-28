import { NextResponse } from "@/lib/http/response.js";
import { getProviderConnectionById } from "@/lib/localDb";
import { PROVIDER_ID_TO_ALIAS } from "open-sse/config/providerModels.js";
import { pingModelByKind } from "@/app/api/models/test/ping";

/**
 * POST /api/providers/[id]/test-model
 * Test a specific connection [id] with a specific model selected by the user.
 * Request body: { model: string, kind?: string }
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { model, kind = "llm" } = body;

    if (!model) {
      return NextResponse.json({ error: "model is required in request body" }, { status: 400 });
    }

    const providerId = connection.provider;
    const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;

    // Normalize fullModel: if it doesn't already have the alias or provider prefix, prepend it
    const fullModel = (model.includes("/") && !model.startsWith(`${alias}/`))
      ? `${alias}/${model}`
      : (model.startsWith(`${alias}/`) ? model : `${alias}/${model}`);

    const result = await pingModelByKind(fullModel, kind, undefined, id);

    return NextResponse.json({
      connectionId: id,
      provider: providerId,
      model,
      fullModel,
      ...result,
    });
  } catch (error) {
    console.error("Error in test-model route:", error);
    return NextResponse.json({ ok: false, error: error.message || "Test failed" }, { status: 500 });
  }
}
