import { NextResponse } from "next/server";
import { importCredentials } from "@/lib/credentials/importer";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

type ImportRouteError = Error & {
  code?: string;
  legacyFields?: unknown;
  invalidRecords?: unknown;
};

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const payload = await request.json();
    const result = await importCredentials(payload);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const importError = error as ImportRouteError;

    console.warn("Error importing credentials", {
      code: importError?.code,
      message: importError?.message,
    });

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: "Invalid JSON request body",
          errorCode: "INVALID_JSON",
        },
        { status: 400 },
      );
    }

    if (importError?.code === "INVALID_LEGACY_STATUS_FIELDS") {
      return NextResponse.json(
        {
          error: importError.message,
          errorCode: "INVALID_LEGACY_STATUS_FIELDS",
          legacyFields: Array.isArray(importError.legacyFields) ? importError.legacyFields : [],
        },
        { status: 400 },
      );
    }

    if (importError?.code === "REPLACE_MODE_VALIDATION_FAILED") {
      return NextResponse.json(
        {
          error: importError.message,
          errorCode: "REPLACE_MODE_VALIDATION_FAILED",
          invalidRecords: Array.isArray(importError.invalidRecords) ? importError.invalidRecords : [],
        },
        { status: 400 },
      );
    }

    if (
      importError?.code === "INVALID_IMPORT_PAYLOAD"
      || importError?.code === "DUPLICATE_IMPORT_RECORDS"
    ) {
      return NextResponse.json(
        {
          error: importError.message,
          errorCode: importError.code,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to import credentials" },
      { status: 500 },
    );
  }
}
