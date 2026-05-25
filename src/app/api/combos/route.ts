import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { validateComboDAG } from "@/lib/combos/dag";
import { normalizeComboModels } from "@/lib/combos/steps";
import { createCurrentCombo, getCurrentComboByName, getCurrentCombos } from "@/lib/modelCatalogAccess";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { createComboSchema } from "@/shared/validation/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const combos = await getCurrentCombos();
    return NextResponse.json({ combos });
  } catch (error) {
    console.log("Error fetching combos:", error);
    return NextResponse.json({ error: "Failed to fetch combos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body: unknown = await request.json();
    const validation = validateBody(createComboSchema, body);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const allCombos = await getCurrentCombos();
    const normalizedModels = normalizeComboModels(validation.data.models, {
      comboName: validation.data.name,
      allCombos,
    });
    const comboInput = {
      ...validation.data,
      models: normalizedModels,
    };

    const existing = await getCurrentComboByName(comboInput.name);
    if (existing) {
      return NextResponse.json({ error: "Combo name already exists" }, { status: 400 });
    }

    validateComboDAG(comboInput.name, [...allCombos, comboInput]);

    const combo = await createCurrentCombo(comboInput);
    return NextResponse.json(combo, { status: 201 });
  } catch (error) {
    console.error("Error creating combo:", error);
    const message = error instanceof Error ? error.message : "Failed to create combo";
    if (message === "Combo name already exists" || message === "Combo ID already exists") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("Circular combo reference") || message.includes("exceeds maximum depth") || message === "name is required" || message === "models array is required" || message === "Invalid combo data") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
