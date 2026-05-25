import { getConfiguredMorphSettings, logMorphApiAccess } from "@/app/api/morph/_shared";
import { buildMorphModelsResponse } from "./shared";

export async function OPTIONS(request: Request) {
  logMorphApiAccess(request);
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function GET(request: Request) {
  logMorphApiAccess(request);
  const morphSettings = await getConfiguredMorphSettings();

  if (!morphSettings) {
    return Response.json({ error: "Morph is not configured" }, { status: 503 });
  }

  return Response.json(buildMorphModelsResponse(), {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}
