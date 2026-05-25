/**
 * Shared combo (model combo) handling with fallback support (compact endpoint)
 */

/**
 * Get combo models from combos data
 * @param {string} modelStr - Model string to check
 * @param {Array|Object} combosData - Array of combos or object with combos
 * @returns {string[]|null} Array of models or null if not a combo
 */
export function getComboModelsFromData(modelStr, combosData) {
  // Don't check if it's in provider/model format
  if (modelStr.includes("/")) return null;
  
  // Handle both array and object formats
  const combos = Array.isArray(combosData) ? combosData : (combosData?.combos || []);
  
  const combo = combos.find(c => c.name === modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}

/**
 * Extract the model string from a combo step (handles both string and object steps).
 */
function resolveStepModelStr(step) {
  if (typeof step === "string") return step;
  if (!step || typeof step !== "object") return null;
  if (step.kind === "combo-ref") return null;
  const model = typeof step.model === "string" ? step.model.trim() : null;
  if (!model) return null;
  const providerId = step.providerId || step.provider || null;
  if (providerId && !model.includes("/")) return `${providerId}/${model}`;
  return model;
}

/**
 * Handle combo chat with fallback (compact variant — no rotation, no metrics)
 */
export async function handleComboChat({ body, models, handleSingleModel, log }) {
  // Flatten step objects into model strings
  const flatModels = [];
  for (const step of (models || [])) {
    if (!step) continue;
    const modelStr = typeof step === "string" ? step : resolveStepModelStr(step);
    if (modelStr) flatModels.push(modelStr);
  }

  let lastError = null;

  for (let i = 0; i < flatModels.length; i++) {
    const modelStr = flatModels[i];
    log.info("COMBO", `Trying model ${i + 1}/${flatModels.length}: ${modelStr}`);

    let result;
    try {
      result = await handleSingleModel(body, modelStr);
    } catch (e) {
      lastError = `${modelStr}: ${e.message}`;
      log.warn("COMBO", `Model threw exception, trying next`, { model: modelStr, error: e.message });
      continue;
    }

    // Success or client error - return response
    if (result.ok || result.status < 500) {
      return result;
    }

    // 5xx error - try next model
    lastError = `${modelStr}: ${result.statusText || result.status}`;
    log.warn("COMBO", `Model failed, trying next`, { model: modelStr, status: result.status });
  }

  log.warn("COMBO", "All models failed");
  
  // Return 503 with last error
  return new Response(
    JSON.stringify({ error: lastError || "All combo models unavailable" }),
    { 
      status: 503, 
      headers: { "Content-Type": "application/json" }
    }
  );
}
