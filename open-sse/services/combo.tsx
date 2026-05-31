/**
 * Shared combo (model combo) handling with fallback support
 */

import { checkFallbackError, formatRetryAfter } from "./accountFallback";
import { unavailableResponse } from "../utils/error";
import { recordComboRequest } from "./comboMetrics";
import { getCircuitBreaker } from "@/shared/utils/circuitBreaker";

/**
 * Track rotation state per combo (for round-robin strategy)
 * Uses a monotonic counter; safe within synchronous sections of single-threaded Node.js.
 */
const comboRotationState = new Map();
const MAX_COMBO_ROTATION_STATE_ENTRIES = 500;

function rememberComboRotationState(comboName: string, state: { counter: number }) {
  const key = typeof comboName === "string" && comboName.trim() ? comboName : "__default__";
  if (!comboRotationState.has(key) && comboRotationState.size >= MAX_COMBO_ROTATION_STATE_ENTRIES) {
    const oldestKey = comboRotationState.keys().next().value;
    if (oldestKey) comboRotationState.delete(oldestKey);
  }
  comboRotationState.set(key, state);
}

export function clearComboRotationState(comboName: string | null = null) {
  if (typeof comboName === "string" && comboName.trim()) {
    comboRotationState.delete(comboName);
    return;
  }
  comboRotationState.clear();
}

function normalizeStickyLimit(stickyLimit: unknown): number {
  const value = Number(stickyLimit);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

/**
 * Extract the model string from a combo step (handles both string and object steps).
 */
function resolveStepModelStr(step: unknown): string | null {
  if (typeof step === "string") return step;
  if (!step || typeof step !== "object") return null;
  const s = step as Record<string, unknown>;
  if (s.kind === "combo-ref") return null; // handled separately
  const model = typeof s.model === "string" ? (s.model as string).trim() : null;
  if (!model) return null;
  const providerId = s.providerId || s.provider || null;
  if (providerId && !model.includes("/")) return `${providerId}/${model}`;
  return model;
}

/**
 * Flatten combo steps into an ordered list of model strings, resolving combo-ref recursively.
 */
function flattenComboSteps(steps: unknown[], resolveCombo: unknown, allCombos: any[], visited = new Set(), maxDepth = 10, depth = 0): string[] {
  if (depth >= maxDepth || !Array.isArray(steps)) return [];
  const result: string[] = [];
  for (const step of steps) {
    if (!step) continue;
    if (typeof step === "string") {
      const matchedCombo = Array.isArray(allCombos) ? allCombos.find((c) => c?.name === step) : null;
      if (matchedCombo && !visited.has(step)) {
        visited.add(step);
        if (Array.isArray(matchedCombo.models)) {
          result.push(...flattenComboSteps(matchedCombo.models, resolveCombo, allCombos, visited, maxDepth, depth + 1));
        }
      } else if (!matchedCombo) {
        result.push(step);
      }
      continue;
    }
    if (typeof step === "object") {
      const s = step as Record<string, unknown>;
      if (s.kind === "combo-ref") {
        const refName = typeof s.comboName === "string" ? (s.comboName as string).trim() : "";
        if (!refName || visited.has(refName)) continue;
        visited.add(refName);
        const refCombo = Array.isArray(allCombos) ? allCombos.find((c) => c?.name === refName) : null;
        if (refCombo && Array.isArray(refCombo.models)) {
          result.push(...flattenComboSteps(refCombo.models, resolveCombo, allCombos, visited, maxDepth, depth + 1));
        }
        continue;
      }
      const modelStr = resolveStepModelStr(step);
      if (modelStr) result.push(modelStr);
    }
  }
  return result;
}

/**
 * Get rotated model list based on strategy.
 * Counter increment is safe within synchronous code in single-threaded Node.js but not across await boundaries.
 */
export function getRotatedModels(models: string[], comboName: string, strategy: string, stickyLimit = 1): string[] {
  if (!models || models.length <= 1 || strategy !== "round-robin") {
    return models;
  }

  const normalizedStickyLimit = normalizeStickyLimit(stickyLimit);
  const stateKey = typeof comboName === "string" && comboName.trim() ? comboName : "__default__";

  // Atomic: read counter and immediately increment
  const state = comboRotationState.get(stateKey) || { counter: 0 };
  const currentCounter = state.counter;
  state.counter = currentCounter + 1;
  rememberComboRotationState(stateKey, state);

  // Derive index from counter and sticky limit
  const effectiveIndex = Math.floor(currentCounter / normalizedStickyLimit) % models.length;
  const rotatedModels = [...models];
  for (let i = 0; i < effectiveIndex; i++) {
    const moved = rotatedModels.shift()!;
    rotatedModels.push(moved);
  }

  return rotatedModels;
}

/**
 * Get combo models from combos data
 */
export function getComboModelsFromData(modelStr: string, combosData: unknown): unknown[] | null {
  if (modelStr.includes("/")) return null;
  const combos = Array.isArray(combosData) ? combosData : ((combosData as any)?.combos || []);
  const combo = combos.find((c: any) => c.name === modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}

/**
 * Extract provider prefix from model string for circuit breaker keying.
 * Uses full model string (e.g., "if/kimi-k2-thinking") for per-model granularity.
 */
function getCircuitBreakerKey(modelStr: string): string {
  return modelStr;
}

/** Default timeout budget for entire combo execution (30s) */
const DEFAULT_COMBO_TIMEOUT_MS = 30000;

/** Buffer size for mid-stream fallback (bytes). If stream fails within this window, retry next model. */
const STREAM_BUFFER_SIZE = 4096;

/**
 * Handle combo chat with fallback.
 * Includes: pre-filter unavailable models, total timeout budget, circuit breaker,
 * and mid-stream fallback buffer.
 */
export async function handleComboChat({ body, combo, models, handleSingleModel, log, comboName, comboStrategy, comboStickyLimit, resolveCombo, allCombos, settings, isModelAvailable }: {
  body: any;
  combo: any;
  models: any[];
  handleSingleModel: (body: any, model: string) => Promise<Response>;
  log: any;
  comboName: string;
  comboStrategy: string;
  comboStickyLimit?: number;
  resolveCombo?: unknown;
  allCombos?: any[];
  settings?: any;
  isModelAvailable?: (model: string, target?: any) => Promise<boolean>;
}) {
  const startTime = Date.now();
  const timeoutMs = Number(combo?.config?.queueTimeoutMs) || DEFAULT_COMBO_TIMEOUT_MS;

  // Flatten step objects into model strings, resolving combo-ref recursively
  const maxDepth = Number(combo?.config?.maxComboDepth) || 10;
  const flatModels = flattenComboSteps(models, resolveCombo, allCombos || [], new Set(comboName ? [comboName] : []), maxDepth);

  if (flatModels.length === 0) {
    log.warn("COMBO", `Combo "${comboName}" has no resolvable models`);
    return new Response(
      JSON.stringify({ error: { message: "Combo has no resolvable models" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Pre-filter: skip models whose circuit breaker is OPEN or known unavailable
  // Check isModelAvailable BEFORE canExecute to avoid consuming HALF_OPEN probe slots
  let availableModels = flatModels;
  if (isModelAvailable || true) {
    const filtered: string[] = [];
    for (const modelStr of flatModels) {
      // Check availability first (doesn't mutate circuit breaker state)
      if (isModelAvailable) {
        try {
          const available = await isModelAvailable(modelStr);
          if (!available) {
            log.info("COMBO", `Skipping ${modelStr} — model unavailable`);
            continue;
          }
        } catch {
          // If availability check fails, still try the model
        }
      }
      // Only call canExecute (which may consume a probe slot) after availability is confirmed
      const cbKey = getCircuitBreakerKey(modelStr);
      const breaker = getCircuitBreaker(cbKey);
      if (!breaker.canExecute()) {
        log.info("COMBO", `Skipping ${modelStr} — circuit breaker OPEN`);
        continue;
      }
      filtered.push(modelStr);
    }
    availableModels = filtered.length > 0 ? filtered : flatModels; // fallback to all if all filtered
  }

  // Apply rotation strategy
  const rotatedModels = getRotatedModels(availableModels, comboName, comboStrategy, comboStickyLimit);

  let lastError: string | null = null;
  let earliestRetryAfter: string | null = null;
  let lastStatus: number | null = null;
  let fallbackCount = 0;
  let resolvedModel: string | null = null;

  for (let i = 0; i < rotatedModels.length; i++) {
    // Check timeout budget
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      log.warn("COMBO", `Timeout budget exhausted (${elapsed}ms >= ${timeoutMs}ms) after ${i} attempts`);
      break;
    }

    const modelStr = rotatedModels[i];
    const cbKey = getCircuitBreakerKey(modelStr);
    log.info("COMBO", `Trying model ${i + 1}/${rotatedModels.length}: ${modelStr}`);

    // Per-attempt timeout: remaining budget for this attempt
    const remainingMs = timeoutMs - (Date.now() - startTime);

    try {
      const attemptTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Combo attempt timeout")), remainingMs)
      );
      const result = await Promise.race([handleSingleModel(body, modelStr), attemptTimeout]) as Response;

      if (result.ok) {
        // Mid-stream fallback: buffer initial bytes to detect early stream failures
        const contentType = result.headers.get("content-type") || "";
        const isStreaming = contentType.includes("text/event-stream");

        if (isStreaming && i < rotatedModels.length - 1) {
          // Buffer the stream — if it fails within STREAM_BUFFER_SIZE, try next model
          const originalBody = result.body;
          if (originalBody) {
            const reader = originalBody.getReader();
            const chunks: Uint8Array[] = [];
            let totalBuffered = 0;
            let streamFailed = false;

            try {
              while (totalBuffered < STREAM_BUFFER_SIZE) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                totalBuffered += value.length;
              }
            } catch (streamErr) {
              streamFailed = true;
              log.warn("COMBO", `Model ${modelStr} stream failed during buffer phase, trying next`);
              try { reader.cancel(); } catch { /* ignore */ }
            }

            if (streamFailed) {
              const breaker = getCircuitBreaker(cbKey);
              breaker?.recordFailure();
              lastError = "Stream failed during buffer phase";
              if (!lastStatus) lastStatus = 502;
              fallbackCount++;
              continue;
            }

            // Stream is healthy — commit buffered data + rest of stream to client
            const breaker = getCircuitBreaker(cbKey);
            breaker?.recordSuccess();
            resolvedModel = modelStr;
            recordComboRequest(comboName || "__unnamed__", modelStr, {
              success: true,
              latencyMs: Date.now() - startTime,
              fallbackCount,
              strategy: comboStrategy || "priority",
              target: modelStr,
            });

            // Create a new ReadableStream that replays buffered chunks then continues
            const replayStream = new ReadableStream({
              async start(controller) {
                for (const chunk of chunks) {
                  controller.enqueue(chunk);
                }
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    controller.enqueue(value);
                  }
                  controller.close();
                } catch {
                  controller.close();
                }
              },
              cancel() {
                reader.cancel();
              }
            });

            return new Response(replayStream, {
              status: result.status,
              headers: result.headers,
            });
          }
        }

        // Non-streaming success or last model
        log.info("COMBO", `Model ${modelStr} succeeded`);
        const breaker = getCircuitBreaker(cbKey);
        breaker?.recordSuccess();
        resolvedModel = modelStr;
        recordComboRequest(comboName || "__unnamed__", modelStr, {
          success: true,
          latencyMs: Date.now() - startTime,
          fallbackCount,
          strategy: comboStrategy || "priority",
          target: modelStr,
        });
        return result;
      }

      // Extract error info from response
      let errorText = result.statusText || "";
      let retryAfter: string | null = null;
      try {
        const errorBody = await result.clone().json();
        errorText = errorBody?.error?.message || errorBody?.error || errorBody?.message || errorText;
        retryAfter = errorBody?.retryAfter || null;
      } catch {
        // Ignore JSON parse errors
      }

      if (retryAfter && (!earliestRetryAfter || new Date(retryAfter) < new Date(earliestRetryAfter))) {
        earliestRetryAfter = retryAfter;
      }

      if (typeof errorText !== "string") {
        try { errorText = JSON.stringify(errorText); } catch { errorText = String(errorText); }
      }

      const { shouldFallback, cooldownMs } = checkFallbackError(result.status, errorText);

      // Record failure in circuit breaker
      const breaker = getCircuitBreaker(cbKey);
      breaker?.recordFailure();

      if (!shouldFallback) {
        log.warn("COMBO", `Model ${modelStr} failed (no fallback)`, { status: result.status });
        recordComboRequest(comboName || "__unnamed__", modelStr, {
          success: false,
          latencyMs: Date.now() - startTime,
          fallbackCount,
          strategy: comboStrategy || "priority",
          target: modelStr,
        });
        return result;
      }

      // For transient errors, wait for cooldown (capped by remaining budget)
      if (cooldownMs && cooldownMs > 0 && cooldownMs <= 5000 &&
          (result.status === 503 || result.status === 502 || result.status === 504)) {
        const remainingBudget = timeoutMs - (Date.now() - startTime);
        const waitMs = Math.min(cooldownMs, Math.max(0, remainingBudget - 1000));
        if (waitMs > 0) {
          log.info("COMBO", `Model ${modelStr} transient ${result.status}, waiting ${waitMs}ms before next`);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }

      lastError = errorText || String(result.status);
      if (!lastStatus) lastStatus = result.status;
      fallbackCount++;
      log.warn("COMBO", `Model ${modelStr} failed, trying next`, { status: result.status });
    } catch (error: any) {
      const breaker = getCircuitBreaker(cbKey);
      breaker?.recordFailure();
      lastError = error.message || String(error);
      if (!lastStatus) lastStatus = 500;
      fallbackCount++;
      log.warn("COMBO", `Model ${modelStr} threw error, trying next`, { error: lastError });
    }
  }

  // All models failed
  recordComboRequest(comboName || "__unnamed__", null, {
    success: false,
    latencyMs: Date.now() - startTime,
    fallbackCount,
    strategy: comboStrategy || "priority",
    target: resolvedModel || "",
  });

  const allDisabled = lastError && lastError.toLowerCase().includes("no credentials");
  const status = allDisabled ? 503 : (lastStatus || 503);
  const msg = lastError || "All combo models unavailable";

  if (earliestRetryAfter) {
    const retryHuman = formatRetryAfter(earliestRetryAfter);
    log.warn("COMBO", `All models failed | ${msg} (${retryHuman})`);
    return unavailableResponse(status, msg, earliestRetryAfter, retryHuman);
  }

  log.warn("COMBO", `All models failed | ${msg}`);
  return new Response(
    JSON.stringify({ error: { message: msg } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
