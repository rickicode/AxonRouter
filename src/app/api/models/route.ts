import { NextResponse } from "next/server";
import { AI_MODELS } from "@/shared/constants/config";
import {
  getCurrentModelAliases,
  setCurrentModelAliasByModel,
} from "@/lib/modelAliasAccess";

type ModelAliasMap = Record<string, string>;

type AliasUpdateBody = {
  model?: string;
  alias?: string;
};

type ConfigModel = {
  provider: string;
  model: string;
} & Record<string, unknown>;

// GET /api/models - Get models with aliases
export async function GET() {
  try {
    const modelAliases = (await getCurrentModelAliases()) as ModelAliasMap;

    const models = (AI_MODELS as ConfigModel[]).map((m) => {
      const fullModel = `${m.provider}/${m.model}`;
      return {
        ...m,
        fullModel,
        alias: modelAliases[fullModel] || m.model,
      };
    });

    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching models:", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}

// PUT /api/models - Update model alias
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as AliasUpdateBody;
    const { model, alias } = body;

    if (!model || !alias) {
      return NextResponse.json({ error: "Model and alias required" }, { status: 400 });
    }

    const modelAliases = (await getCurrentModelAliases()) as ModelAliasMap;

    // Check if alias already exists for different model
    const existingModel = Object.entries(modelAliases).find(
      ([key, val]) => val === alias && key !== model,
    );

    if (existingModel) {
      return NextResponse.json({ error: "Alias already in use" }, { status: 400 });
    }

    // Update alias
    await setCurrentModelAliasByModel(model, alias);

    return NextResponse.json({ success: true, model, alias });
  } catch (error) {
    console.log("Error updating alias:", error);
    return NextResponse.json({ error: "Failed to update alias" }, { status: 500 });
  }
}
