import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  disableCurrentModels,
  enableCurrentModels,
  getCurrentDisabledModels,
} from "@/lib/modelCatalogAccess";

export const dynamic = "force-dynamic";

type DisabledModelsMap = Record<string, string[]>;

type DisabledModelsRequestBody = {
  providerAlias?: string;
  ids?: unknown;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// GET /api/models/disabled?providerAlias=xxx
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const all = (await getCurrentDisabledModels()) as DisabledModelsMap;

    if (providerAlias) {
      return NextResponse.json({ ids: all[providerAlias] || [] });
    }

    return NextResponse.json({ disabled: all });
  } catch (error) {
    console.log("Error fetching disabled models:", getErrorMessage(error));
    return NextResponse.json({ error: "Failed to fetch disabled models" }, { status: 500 });
  }
}

// POST /api/models/disabled body: { providerAlias, ids: [...] }
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { providerAlias, ids } = (await request.json()) as DisabledModelsRequestBody;

    if (!providerAlias || !Array.isArray(ids)) {
      return NextResponse.json({ error: "providerAlias and ids[] required" }, { status: 400 });
    }

    await disableCurrentModels(providerAlias, ids as string[]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error disabling models:", getErrorMessage(error));
    return NextResponse.json({ error: "Failed to disable models" }, { status: 500 });
  }
}

// DELETE /api/models/disabled?providerAlias=xxx[&id=yyy]
export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const id = searchParams.get("id");

    if (!providerAlias) {
      return NextResponse.json({ error: "providerAlias required" }, { status: 400 });
    }

    await enableCurrentModels(providerAlias, id ? [id] : []);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error enabling models:", getErrorMessage(error));
    return NextResponse.json({ error: "Failed to enable models" }, { status: 500 });
  }
}
