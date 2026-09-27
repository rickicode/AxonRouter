import { extractApiKey, isValidApiKey } from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { classifyWithJev } from "open-sse/services/combo.js";
import { errorResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import * as log from "../utils/logger.js";

/**
 * Handle Jev System One classification requests.
 * @param {Request} request
 */
export async function handleSystemOne(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    log.warn("JEV", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const apiKey = extractApiKey(request);
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
  }

  let model = body.model;
  if (typeof model === "string" && model.includes("/")) {
    model = model.split("/")[1];
  }

  try {
    const result = await classifyWithJev(body, { model });
    if (!result) {
      return errorResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, "Jev classifier failed or returned empty response");
    }
    return Response.json({
      model: model || "jev-latest",
      object: "classification",
      ...result,
    });
  } catch (err) {
    log.error("JEV", `Classification failed: ${err.message}`);
    return errorResponse(HTTP_STATUS.INTERNAL_ERROR, err.message || "Internal server error during classification");
  }
}
