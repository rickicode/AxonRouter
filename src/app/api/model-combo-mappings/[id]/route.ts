import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  deleteCurrentModelComboMapping,
  getCurrentComboById,
  getCurrentModelComboMappingById,
  updateCurrentModelComboMapping,
} from "@/lib/modelCatalogAccess";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { updateModelComboMappingSchema } from "@/shared/validation/schemas";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const mapping = await getCurrentModelComboMappingById(id);
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }
    return NextResponse.json(mapping);
  } catch (error) {
    console.log("Error fetching model combo mapping:", error);
    return NextResponse.json({ error: "Failed to fetch mapping" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { id } = await params;
    const validation = validateBody(updateModelComboMappingSchema, body);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (validation.data.comboId) {
      const combo = await getCurrentComboById(validation.data.comboId);
      if (!combo) {
        return NextResponse.json({ error: "Combo not found" }, { status: 404 });
      }
    }

    const mapping = await updateCurrentModelComboMapping(id, validation.data);
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }
    return NextResponse.json(mapping);
  } catch (error) {
    console.log("Error updating model combo mapping:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update mapping" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const success = await deleteCurrentModelComboMapping(id);
    if (!success) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting model combo mapping:", error);
    return NextResponse.json({ error: "Failed to delete mapping" }, { status: 500 });
  }
}
