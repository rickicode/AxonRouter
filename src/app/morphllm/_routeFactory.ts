import { dispatchMorphCapability } from "@/app/api/morph/_dispatch";
import { getConfiguredMorphSettings, logMorphApiAccess } from "@/app/api/morph/_shared";
import { normalizeMorphChatResponse } from "@/app/api/v1/_morphThink";

export function createMorphCapabilityPostHandler({ capability, upstreamTarget, requestLabel }) {
  return async function POST(req) {
    logMorphApiAccess(req);
    const morphSettings = await getConfiguredMorphSettings();

    if (!morphSettings) {
      return Response.json({ error: "Morph is not configured" }, { status: 503 });
    }

    const response = await dispatchMorphCapability({
      capability,
      req,
      morphSettings,
      upstreamTarget,
      requestLabel,
    });

    // Keep native Morph chat facade aligned with shared /v1 think handling.
    if (capability === "apply") {
      return normalizeMorphChatResponse(response);
    }

    return response;
  };
}
