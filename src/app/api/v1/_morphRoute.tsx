import { dispatchMorphCapability } from "@/app/api/morph/_dispatch";
import { getConfiguredMorphSettings } from "@/app/api/morph/_shared";
import { createMorphDispatchError } from "@/lib/morph/keySelection";
import { isMorphFastModel } from "@/shared/constants/models";
import { normalizeMorphChatResponse } from "@/app/api/v1/_morphThink";
import { resolveAndInjectMorphInstructions } from "@/lib/morph/instructions";

import { maybeCompactCleanApplyPayload } from "@/lib/morph/compact";
import { maybeBuildMorphFastApplyPayload } from "@/lib/morph/fastApplyIntercept";

function normalizeMorphRequestRoles(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.messages)) {
    return payload;
  }

  let changed = false;
  const messages = payload.messages.map((message) => {
    if (!message || typeof message !== "object") return message;
    if (message.role !== "developer") return message;

    changed = true;
    return {
      ...message,
      role: "system",
    };
  });

  return changed ? { ...payload, messages } : payload;
}

async function readJsonBody(req) {
  try {
    return await req.json();
  } catch {
    throw createMorphDispatchError("Invalid JSON body", {
      status: 400,
      code: "MORPH_INVALID_JSON",
      dispatchStarted: false,
    });
  }
}

export async function maybeDispatchMorphV1Request({ req, capability, requestLabel }) {
  const requestPayload = await readJsonBody(req.clone());
  const model = typeof requestPayload?.model === "string" ? requestPayload.model.trim() : "";

  if (!isMorphFastModel(model.replace(/^morph\//, ""))) {
    return null;
  }

  const morphSettings = await getConfiguredMorphSettings();
  if (!morphSettings) {
    return Response.json({ error: "Morph is not configured" }, { status: 503 });
  }

  const normalizedRequestPayload = normalizeMorphRequestRoles(requestPayload);
  if (typeof normalizedRequestPayload.model === "string") {
    normalizedRequestPayload.model = normalizedRequestPayload.model.replace(/^morph\//, "");
  }
  const instructionInjectedPayload = capability === "apply"
    ? await resolveAndInjectMorphInstructions(normalizedRequestPayload)
    : normalizedRequestPayload;
  const fastApplyIntercept: any = capability === "apply"
    ? await maybeBuildMorphFastApplyPayload(instructionInjectedPayload, morphSettings)
    : { intercept: false };
  const finalRequestPayload = capability === "apply"
    ? (fastApplyIntercept.intercept
      ? fastApplyIntercept.requestPayload
      : await maybeCompactCleanApplyPayload(instructionInjectedPayload, morphSettings))
    : instructionInjectedPayload;

  const response = await dispatchMorphCapability({
    capability,
    req,
    morphSettings,
    requestPayload: finalRequestPayload,
    requestBody: JSON.stringify(finalRequestPayload),
    requestLabel: fastApplyIntercept.intercept ? `${requestLabel}:fast-apply` : requestLabel,
  });

  // Normalize both JSON and SSE chat responses so Morph <think> blocks become
  // reasoning_content instead of leaking into visible assistant text.
  return normalizeMorphChatResponse(response);
}
