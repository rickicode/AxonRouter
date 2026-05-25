import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentOpenCodePreferences } from "@/lib/connectionAccess";

import { buildOpenCodeSyncPreview } from "@/lib/opencodeSync/generator";
import { loadAxonRouterModelCatalog } from "@/lib/opencodeSync/modelCatalog";
import { buildPublicPreviewResponse } from "@/lib/opencodeSync/previewResponse";

const VALIDATION_ERROR_CODES = new Set(["OPENCODE_VALIDATION_ERROR"]);

export const dynamic = "force-dynamic";

function isValidationError(error) {
  return VALIDATION_ERROR_CODES.has(error?.code) || error?.name === "OpenCodeValidationError";
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const [preferences, modelCatalog] = await Promise.all([
      getCurrentOpenCodePreferences(),
      loadAxonRouterModelCatalog(),
    ]);

    const preview = buildOpenCodeSyncPreview({ preferences, modelCatalog });

    return NextResponse.json(buildPublicPreviewResponse(preview, modelCatalog));
  } catch (error) {
    if (isValidationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log("Error generating OpenCode bundle preview:", error);
    return NextResponse.json({ error: "Failed to generate OpenCode bundle preview" }, { status: 500 });
  }
}
