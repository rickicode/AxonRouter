import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { reorderCurrentCombos } from "@/lib/modelCatalogAccess";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { reorderCombosSchema } from "@/shared/validation/schemas";

export const dynamic = "force-dynamic";

type ErrorWithMessage = {
  message?: string;
};

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body: unknown = await request.json();
    const validation = validateBody(reorderCombosSchema, body);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const combos = await reorderCurrentCombos(validation.data.comboIds);
    return NextResponse.json({ combos });
  } catch (error) {
    console.log("Error reordering combos:", error);
    const message = (error as ErrorWithMessage)?.message || "Failed to reorder combos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
