import { NextResponse } from "next/server";
import { validateCurrentApiKey } from "@/lib/apiKeyAccess";
import {
  getCurrentModelAliases,
  setCurrentModelAlias,
} from "@/lib/modelAliasAccess";

type AliasMap = Record<string, string>;

type AliasRequestBody = {
  model?: string;
  alias?: string;
};

function getBearerToken(request: Request): string {
  const authHeader = request.headers.get("authorization");
  return authHeader?.replace("Bearer ", "") ?? "";
}

// PUT /api/cloud/models/alias - Set model alias (for cloud/CLI)
export async function PUT(request: Request) {
  try {
    const apiKey = getBearerToken(request);

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }

    const isValid = await validateCurrentApiKey(apiKey);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const body = (await request.json()) as AliasRequestBody;
    const { model, alias } = body;

    if (!model || !alias) {
      return NextResponse.json({ error: "Model and alias required" }, { status: 400 });
    }

    const aliases = (await getCurrentModelAliases()) as AliasMap;
    const existingModel = aliases[alias];
    if (existingModel && existingModel !== model) {
      return NextResponse.json(
        {
          error: `Alias '${alias}' already in use for model '${existingModel}'`,
        },
        { status: 400 }
      );
    }

    await setCurrentModelAlias(alias, model);

    return NextResponse.json({
      success: true,
      model,
      alias,
      message: `Alias '${alias}' set for model '${model}'`,
    });
  } catch (error) {
    console.log("Error updating alias:", error);
    return NextResponse.json({ error: "Failed to update alias" }, { status: 500 });
  }
}

// GET /api/cloud/models/alias - Get all aliases
export async function GET(request: Request) {
  try {
    const apiKey = getBearerToken(request);

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }

    const isValid = await validateCurrentApiKey(apiKey);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const aliases = (await getCurrentModelAliases()) as AliasMap;

    return NextResponse.json({ aliases });
  } catch (error) {
    console.log("Error fetching aliases:", error);
    return NextResponse.json({ error: "Failed to fetch aliases" }, { status: 500 });
  }
}
