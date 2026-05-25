import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  createCurrentModelComboMapping,
  getCurrentComboById,
  getCurrentModelComboMappings,
} from "@/lib/modelCatalogAccess";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { createModelComboMappingSchema } from "@/shared/validation/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const mappings = await getCurrentModelComboMappings();
    return NextResponse.json({ mappings });
  } catch (error) {
    console.log("Error fetching model combo mappings:", error);
    return NextResponse.json({ error: "Failed to fetch mappings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body: unknown = await request.json();
    const validation = validateBody(createModelComboMappingSchema, body);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const combo = await getCurrentComboById(validation.data.comboId);
    if (!combo) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    const mapping = await createCurrentModelComboMapping(validation.data);
    return NextResponse.json({ mapping }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create mapping";
    console.log("Error creating model combo mapping:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
