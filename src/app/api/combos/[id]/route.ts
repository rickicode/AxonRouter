import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { validateComboDAG } from "@/lib/combos/dag";
import { normalizeComboModels } from "@/lib/combos/steps";
import {
  deleteCurrentCombo,
  getCurrentComboById,
  getCurrentComboByName,
  getCurrentCombos,
  renameCurrentComboWithDependents,
  updateCurrentCombo,
} from "@/lib/modelCatalogAccess";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { updateComboSchema } from "@/shared/validation/schemas";
import { findComboDependents } from "@/lib/combos/domain";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

type ComboRecord = {
  id: string;
  name?: string;
  [key: string]: unknown;
};

type UpdateComboPayload = {
  name?: string;
  models?: unknown;
  [key: string]: unknown;
};


export async function PUT(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body", details: [{ field: "body", message: "Invalid JSON body" }] } }, { status: 400 });
  }

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    const validation = validateBody(updateComboSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const currentCombo = (await getCurrentComboById(id)) as ComboRecord | null;
    if (!currentCombo) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    const allCombos = (await getCurrentCombos()) as ComboRecord[];
    const validatedData = validation.data as UpdateComboPayload;
    const comboName = validatedData.name || currentCombo.name;
    const normalizedUpdate = validatedData.models
      ? {
          ...validatedData,
          models: normalizeComboModels(validatedData.models, { comboName, allCombos }),
        }
      : validatedData;

    if (normalizedUpdate.name) {
      const existing = (await getCurrentComboByName(normalizedUpdate.name)) as ComboRecord | null;
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "Combo name already exists" }, { status: 409 });
      }
    }

    const nextComboState = { ...currentCombo, ...normalizedUpdate, name: comboName };
    validateComboDAG(comboName, allCombos.map((combo) => (combo.id === id ? nextComboState : combo)));

    // If renaming, use atomic rename that updates dependents in single transaction
    const oldName = typeof currentCombo.name === "string" ? currentCombo.name.trim() : "";
    const isRename = normalizedUpdate.name && normalizedUpdate.name !== oldName;
    if (isRename && oldName) {
      const combo = await renameCurrentComboWithDependents(id, normalizedUpdate, oldName, normalizedUpdate.name);
      if (!combo) {
        return NextResponse.json({ error: "Combo not found (deleted concurrently)" }, { status: 404 });
      }
      return NextResponse.json(combo);
    }

    const combo = await updateCurrentCombo(id, normalizedUpdate);
    if (!combo) {
      return NextResponse.json({ error: "Combo not found (deleted concurrently)" }, { status: 404 });
    }
    return NextResponse.json(combo);
  } catch (error) {
    console.error("Error updating combo:", error);
    const message = error instanceof Error ? error.message : "Failed to update combo";
    if (message === "Combo name already exists") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("Circular combo reference") || message.includes("exceeds maximum depth")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const combo = id ? ((await getCurrentComboById(id)) as ComboRecord | null) : null;
    if (!combo) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    const comboName = typeof combo.name === "string" ? combo.name.trim() : "";
    if (comboName) {
      const allCombos = (await getCurrentCombos()) as ComboRecord[];
      const dependents = findComboDependents(comboName, allCombos, id);
      if (dependents.length > 0) {
        return NextResponse.json(
          {
            error: "Combo is referenced by other combos",
            dependents: dependents.map((dependent) => ({ id: dependent.id, name: dependent.name })),
          },
          { status: 409 },
        );
      }
    }

    const success = await deleteCurrentCombo(id);
    if (!success) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting combo:", error);
    return NextResponse.json({ error: "Failed to delete combo" }, { status: 500 });
  }
}
