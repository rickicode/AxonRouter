import "open-sse/index.js";

import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
  checkModelAvailability,
} from "../services/auth.js";
import { markAccountExhaustedFrom429, markAccountExhaustedFromCredits, refreshQuota } from "@/domain/quotaCache.js";
import { canonicalFreebuffModel } from "open-sse/executors/freebuff.js";
import { getSettings, lockAccountToModel, lockProxyPoolForScope } from "@/lib/localDb";
import { saveFailedRequest, saveRequestDetail } from "@/lib/usageDb.js";
import { getModelInfo, getComboModels } from "../services/model.js";
import { handleChatCore } from "open-sse/handlers/chatCore.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { handleComboChat, handleFusionChat, handleDifficultyChat, detectRequiredCapabilities } from "open-sse/services/combo.js";
import { augmentModelsWithCapacityAdapter, withCapacityAdapterStripping, getActiveAdapterStrategy } from "open-sse/services/capacityAdapter.js";
import { handleBypassRequest } from "open-sse/utils/bypassHandler.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { MAX_FALLBACK_ATTEMPTS, MAX_TOTAL_ROTATION_ATTEMPTS, MODEL_FAILOVER_THRESHOLD, MODEL_FAILOVER_WINDOW_S, LKG_TTL_S } from "open-sse/config/errorConfig.js";
import {
  incrModelFailCount,
  resetModelFailCount,
  setModelFailCount,
  getModelFailCounts,
  incrSharedCounter,
  setLkg,
  resetDeadCircuit,
  setProviderDead,
  isProviderDead,
  clearProviderDead,
} from "@/lib/cache/client.js";
import { bumpRoutingMetric } from "open-sse/services/routingMetrics.js";

/**
 * Strict round-robin start index via an atomic shared counter. Every request
 * (across all processes/replicas) gets a unique sequence number, so each one
 * starts at a different member — no thundering herd, no per-process drift.
 * Honors stickyLimit (N consecutive requests per member).
 */
async function strictRRStartIndex(comboName, memberCount, stickyLimit) {
  const sticky = Math.max(1, Number(stickyLimit) || 1);
  const seq = await incrSharedCounter(`rr_seq:${comboName || "__default__"}`);
  if (seq === null || !Number.isFinite(memberCount) || memberCount <= 0) return null;
  return Math.floor((seq - 1) / sticky) % memberCount;
}

function rotateFromIndex(models, startIndex) {
  const n = models.length;
  const s = ((startIndex % n) + n) % n;
  return [...models.slice(s), ...models.slice(0, s)];
}

/**
 * Race a cache read against a deadline so a slow read can never
 * head-of-line-block combo routing — on timeout the caller takes its
 * fail-open path (in-memory rotation / unchanged order).
 */
function withDeadline(promise, ms = 500) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise.catch(() => null), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Prepare combo member order + effective strategy.
 * - fallback: health-reorder moves failing members to the back (order is the
 *   contract, rotation never applies).
 * - round-robin / round-robin-sticky / random: pure rotation/shuffle — health
 *   reorder is SKIPPED so every member keeps its turn; dead members are
 *   handled by the combo loop's fast-skip instead of being demoted (demoting
 *   after rotation would defeat the rotation and starve back-of-list members).
 * Returns { models, strategy }.
 */
async function prepareComboOrder(models, comboName, strategy, stickyLimit) {
  let ordered = Array.isArray(models) ? models : [];
  let effectiveStrategy = strategy;
  // "round-robin-sticky" shares the round-robin path: the sticky window is
  // settings.comboStickyRoundRobinLimit (per-request N before switching).
  if ((strategy === "round-robin" || strategy === "round-robin-sticky") && ordered.length > 1) {
    const start = await withDeadline(strictRRStartIndex(comboName, ordered.length, stickyLimit));
    if (start !== null) {
      ordered = rotateFromIndex(ordered, start);
      effectiveStrategy = "fallback";
    }
  }
  const healthReordered = effectiveStrategy === "fallback"
    ? await reorderComboByHealth(ordered)
    : ordered;
  return { models: healthReordered, strategy: effectiveStrategy };
}

/**
 * Reorder combo members by cross-request health: members with
 * MODEL_FAILOVER_THRESHOLD consecutive upstream failures are moved to the
 * back so the next request starts at a working model instead of re-burning
 * rotations on the dead one. Never drops a member — if all are failing the
 * original order is kept.
 */
async function reorderComboByHealth(models) {
  if (!Array.isArray(models) || models.length <= 1) return models;
  const counts = await withDeadline(getModelFailCounts(models)).catch(() => ({})) || {};
  const failing = new Set();

  for (const m of models) {
    if ((counts[m] || 0) >= MODEL_FAILOVER_THRESHOLD) {
      failing.add(m);
      continue;
    }
    try {
      const info = await getModelInfo(m);
      if (info?.provider) {
        // Entire provider is marked dead (100% accounts exhausted/dead): demote all its models
        if (await isProviderDead(info.provider)) {
          failing.add(m);
          continue;
        }
        const avail = await checkModelAvailability(info.provider, info.model).catch(() => ({ available: true }));
        if (avail && avail.available === false) {
          failing.add(m);
          continue;
        }
        const canonical = `${info.provider}/${info.model}`;
        if (canonical !== m) {
          const canonicalCounts = await withDeadline(getModelFailCounts([canonical])).catch(() => ({})) || {};
          if ((canonicalCounts[canonical] || 0) >= MODEL_FAILOVER_THRESHOLD) {
            failing.add(m);
          }
        }
      }
    } catch {}
  }

  if (failing.size === 0 || failing.size >= models.length) return models;
  const healthy = models.filter((m) => !failing.has(m));
  const bad = models.filter((m) => failing.has(m));
  bumpRoutingMetric("failoverDemotions", bad.length);
  log.info("CHAT", `Failover reorder: ${bad.join(", ")} failing/dead → back`);
  return [...healthy, ...bad];
}
import { detectFormatByEndpoint } from "open-sse/translator/formats.js";
import * as log from "../utils/logger.js";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
import { getProjectIdForConnection } from "open-sse/services/projectId.js";
import { stripModelContextMarker } from "open-sse/utils/modelMarkers.js";

/**
 * Handle chat completion request
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats
 * Format detection and translation handled by translator
 */
export async function handleChat(request, clientRawRequest = null) {
  let body;
  try {
    body = await request.json();
  } catch {
    log.warn("CHAT", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  // Build clientRawRequest for logging (if not provided)
  if (!clientRawRequest) {
    const url = new URL(request.url);
    clientRawRequest = {
      endpoint: url.pathname,
      body,
      headers: Object.fromEntries(request.headers.entries())
    };
  }
  const isTestRequest = request.headers.get("x-axonrouter-test-request") === "1";
  // Claude Code marks a 1M-context request as `<model>[1m]`; the marker matches
  // no combo, alias or provider/model pair, so it must not reach resolution.
  // The capability travels in the anthropic-beta header, forwarded as-is.
  const { model: modelStr, contextMarker } = stripModelContextMarker(body.model);
  if (contextMarker) body.model = modelStr;

  // Request summary is emitted as the unified "▶" line in chatCore (has fmt/thinking/account)

  // Log API key (masked)
  const authHeader = request.headers.get("Authorization");
  const apiKey = extractApiKey(request);
  if (authHeader && apiKey) {
    const masked = log.maskKey(apiKey);
    log.debug("AUTH", `API Key: ${masked}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Enforce API key if enabled in settings
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

  if (!modelStr) {
    log.warn("CHAT", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }

  // Bypass naming/warmup requests before combo rotation to avoid wasting rotation slots
  const userAgent = request?.headers?.get("user-agent") || "";
  const bypassResponse = handleBypassRequest(body, modelStr, userAgent, !!settings.ccFilterNaming);
  if (bypassResponse) return bypassResponse.response || bypassResponse;

  const requiredCapabilities = detectRequiredCapabilities(body);

  // Shared rotation budget for this client request: every upstream account
  // attempt across every combo member consumes one slot. Caps total upstream
  // calls at MAX_TOTAL_ROTATION_ATTEMPTS so a long combo of dead accounts
  // stops with a 503 instead of hanging the client. `max` mirrors the cap for
  // the combo loop's own top-of-loop short-circuit (no import cycle: combo.js
  // must not import chat.js config readers).
  const rotationBudget = { used: 0, max: MAX_TOTAL_ROTATION_ATTEMPTS };

  // Check if model is a combo (has multiple models with fallback)
  const externalSignal = request?.signal ?? null;
  const comboModels = await getComboModels(modelStr);
  if (comboModels) {
    // Check for combo-specific strategy first, fallback to global
  const comboStrategies = settings.comboStrategies || {};
  const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
  const comboStrategy = comboSpecificStrategy || settings.comboStrategy || "fallback";
  // Per-combo sticky window wins over the global comboStickyRoundRobinLimit.
  const comboStickyLimit = comboStrategies[modelStr]?.stickyLimit ?? settings.comboStickyRoundRobinLimit ?? 1;
    // A combo is an explicit routing contract. Never inject a model from a
    // different provider into it; its members and configured strategy define
    // the complete fallback set.
    const augmentedModels = comboModels;
    const adapterAdded = augmentedModels.filter((m) => !comboModels.includes(m));
    const comboMemberHealth = {
      getFailCounts: (members) => getModelFailCounts(members),
      onSuccess: (m) => { if (!isTestRequest) resetModelFailCount(m).catch(() => {}); },
      onFailure: (m) => { if (!isTestRequest) incrModelFailCount(m, MODEL_FAILOVER_WINDOW_S).catch(() => {}); },
      checkAvailability: async (m) => {
        try {
          const info = await getModelInfo(m);
          if (info?.provider) {
            return await checkModelAvailability(info.provider, info.model);
          }
        } catch {}
        return { available: true };
      },
    };

    if (comboStrategy === "fusion") {
      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
      return handleFusionChat({
        body,
        models: comboModels,
        handleSingleModel: (b, m, isPanel) => {
          // 3rd arg is `true` (legacy) or { signal, isPanel } (abort-capable).
          const panelOpts = isPanel && typeof isPanel === "object" ? isPanel : {};
          let cleanRawReq = clientRawRequest;
          if (isPanel && clientRawRequest) {
            const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
            cleanRawReq = { ...clientRawRequest, body: cleanBody };
          }
          return handleSingleModelChat(b, m, cleanRawReq, request, apiKey, modelStr, isTestRequest, rotationBudget, panelOpts.signal || null);
        },
        log,
        comboName: modelStr,
        judgeModel: comboStrategies[modelStr]?.judgeModel,
        tuning: comboStrategies[modelStr]?.fusionTuning,
        rotationBudget,
        externalSignal,
        memberHealth: comboMemberHealth,
      });
    }

    if (comboStrategy === "difficulty") {
      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: difficulty)`);
      const diffCtx = {};
      return handleDifficultyChat({
        body,
        models: comboModels,
        handleSingleModel: (b, m, opts) => {
          const diffPayload = {
            tier: diffCtx.tier || null,
            winningModel: diffCtx.winningModel || m || null,
            judgeUsed: !!diffCtx.judgeUsed,
            judgeModel: diffCtx.judgeModel || null,
            source: diffCtx.source || null,
            domain: diffCtx.domain || null,
            ambiguity: diffCtx.ambiguity || null,
            confidence: diffCtx.confidence ?? null,
            policy: diffCtx.policy || null,
          };
          const crr = clientRawRequest
            ? { ...clientRawRequest, difficulty: diffPayload }
            : { difficulty: diffPayload };
          return handleSingleModelChat(b, m, crr, request, apiKey, modelStr, isTestRequest, rotationBudget, opts?.signal ?? null);
        },
        log,
        comboName: modelStr,
        judgeModel: comboStrategies[modelStr]?.judgeModel || "cline-free/z-ai/glm-4.5",
        tuning: {
          easyModels: comboStrategies[modelStr]?.easyModels,
          mediumModels: comboStrategies[modelStr]?.mediumModels,
          hardModels: comboStrategies[modelStr]?.hardModels,
          policy: comboStrategies[modelStr]?.difficultyPolicy || "balanced",
        },
        onDecision: (d) => Object.assign(diffCtx, d),
        rotationBudget,
        externalSignal,
        memberHealth: comboMemberHealth,
      });
    }

    // Per-combo autoSwitch opt-out: cost-ordered combos can keep their explicit
    // member order even when the request carries media/search. Default true.
    const comboAutoSwitch = comboStrategies[modelStr]?.autoSwitch !== false;
    log.info("CHAT", `Combo "${modelStr}" with ${augmentedModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
    const preparedTop = await prepareComboOrder(
      augmentedModels, modelStr, comboStrategy, comboStickyLimit);
    return handleComboChat({
      body,
      models: preparedTop.models,
      handleSingleModel: withCapacityAdapterStripping(
        (b, m, opts) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, modelStr, isTestRequest, rotationBudget, opts?.signal ?? null),
        adapterAdded
      ),
      log,
      comboName: modelStr,
      comboStrategy: preparedTop.strategy,
      comboStickyLimit,
      autoSwitch: comboAutoSwitch,
      rotationBudget,
        externalSignal,
      memberHealth: comboMemberHealth,
    });
  }

  // Single model request — may still switch to a capacity-adapter model if the
  // target lacks a capability the request needs (e.g. no vision, request has an image).
  const soloAugmented = augmentModelsWithCapacityAdapter([modelStr], requiredCapabilities, settings);
  if (soloAugmented.length > 1) {
    const adapterAdded = soloAugmented.filter((m) => m !== modelStr);
    log.info("CHAT", `Capacity adapter for [${[...requiredCapabilities].join(",")}] on "${modelStr}" → trying ${soloAugmented.join(", ")}`);
    const adapterStrategy = getActiveAdapterStrategy(requiredCapabilities, settings);
    const preparedSolo = await prepareComboOrder(
      soloAugmented, modelStr, adapterStrategy, 1);
    return handleComboChat({
      body,
      models: preparedSolo.models,
      handleSingleModel: withCapacityAdapterStripping(
        (b, m, opts) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, modelStr, isTestRequest, rotationBudget, opts?.signal ?? null),
        adapterAdded
      ),
      log,
      comboName: modelStr,
      comboStrategy: preparedSolo.strategy,
      rotationBudget,
        externalSignal,
      memberHealth: {
        getFailCounts: (members) => getModelFailCounts(members),
        onSuccess: (m) => { if (!isTestRequest) resetModelFailCount(m).catch(() => {}); },
        onFailure: (m) => { if (!isTestRequest) incrModelFailCount(m, MODEL_FAILOVER_WINDOW_S).catch(() => {}); },
        checkAvailability: async (m) => {
          try {
            const info = await getModelInfo(m);
            if (info?.provider) {
              return await checkModelAvailability(info.provider, info.model);
            }
          } catch {}
          return { available: true };
        },
      },
    });
  }

  return handleSingleModelChat(body, modelStr, clientRawRequest, request, apiKey, null, isTestRequest, rotationBudget);
}

/**
 * Handle single model chat request.
 * Exported for unit tests (rotation-budget contract); production entry is handleChat().
 */
export async function handleSingleModelChat(body, modelStr, clientRawRequest = null, request = null, apiKey = null, comboName = null, isTestRequest = false, rotationBudget = null, externalSignal = null) {
  const modelInfo = await getModelInfo(modelStr);

  // If provider is null, this might be a combo name - check and handle
  if (!modelInfo.provider) {
    const comboModels = await getComboModels(modelStr);
    if (comboModels) {
      const chatSettings = await getSettings();
      // Check for combo-specific strategy first, fallback to global
      const comboStrategies = chatSettings.comboStrategies || {};
      const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
      const comboStrategy = comboSpecificStrategy || chatSettings.comboStrategy || "fallback";
      const comboStickyLimit = comboStrategies[modelStr]?.stickyLimit ?? chatSettings.comboStickyRoundRobinLimit ?? 1;
      const requiredCapabilities = detectRequiredCapabilities(body);
       const augmentedModels = comboModels;
      const adapterAdded = augmentedModels.filter((m) => !comboModels.includes(m));
      const comboMemberHealth = {
        getFailCounts: (members) => getModelFailCounts(members),
        onSuccess: (m) => { if (!isTestRequest) resetModelFailCount(m).catch(() => {}); },
        onFailure: (m) => { if (!isTestRequest) incrModelFailCount(m, MODEL_FAILOVER_WINDOW_S).catch(() => {}); },
        checkAvailability: async (m) => {
          try {
            const info = await getModelInfo(m);
            if (info?.provider) {
              return await checkModelAvailability(info.provider, info.model);
            }
          } catch {}
          return { available: true };
        },
      };

      if (comboStrategy === "fusion") {
        log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
        return handleFusionChat({
          body,
          models: comboModels,
          handleSingleModel: (b, m, isPanel) => {
            const panelOpts = isPanel && typeof isPanel === "object" ? isPanel : {};
            let cleanRawReq = clientRawRequest;
            if (isPanel && clientRawRequest) {
              const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
              cleanRawReq = { ...clientRawRequest, body: cleanBody };
            }
            return handleSingleModelChat(b, m, cleanRawReq, request, apiKey, modelStr, isTestRequest, rotationBudget, panelOpts.signal || null);
          },
          log,
          comboName: modelStr,
          judgeModel: comboStrategies[modelStr]?.judgeModel,
          tuning: comboStrategies[modelStr]?.fusionTuning,
          rotationBudget,
          externalSignal,
          memberHealth: comboMemberHealth,
        });
      }

      // Difficulty / smart-routing: judge picks a tier (easy/medium/hard),
      // then ONLY that tier runs (one model at a time, escalate on failure).
      // Tier decisions flow into request_details via clientRawRequest.difficulty
      // so the analytics tab can show per-tier usage + judge hit rate.
      if (comboStrategy === "difficulty") {
        log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: difficulty)`);
        const diffCtx = {};
        return handleDifficultyChat({
          body,
          models: comboModels,
          handleSingleModel: (b, m, opts) => {
            const diffPayload = {
              tier: diffCtx.tier || null,
              winningModel: diffCtx.winningModel || m || null,
              judgeUsed: !!diffCtx.judgeUsed,
              judgeModel: diffCtx.judgeModel || null,
              source: diffCtx.source || null,
              domain: diffCtx.domain || null,
              ambiguity: diffCtx.ambiguity || null,
              confidence: diffCtx.confidence ?? null,
              policy: diffCtx.policy || null,
            };
            const crr = clientRawRequest
              ? { ...clientRawRequest, difficulty: diffPayload }
              : { difficulty: diffPayload };
            return handleSingleModelChat(b, m, crr, request, apiKey, modelStr, isTestRequest, rotationBudget, opts?.signal ?? null);
          },
          log,
          comboName: modelStr,
          judgeModel: comboStrategies[modelStr]?.judgeModel || "cline-free/z-ai/glm-4.5",
          tuning: {
            easyModels: comboStrategies[modelStr]?.easyModels,
            mediumModels: comboStrategies[modelStr]?.mediumModels,
            hardModels: comboStrategies[modelStr]?.hardModels,
            policy: comboStrategies[modelStr]?.difficultyPolicy || "balanced",
          },
          onDecision: (d) => Object.assign(diffCtx, d),
          rotationBudget,
          externalSignal,
          memberHealth: comboMemberHealth,
        });
      }

      const nestedAutoSwitch = comboStrategies[modelStr]?.autoSwitch !== false;
      log.info("CHAT", `Combo "${modelStr}" with ${augmentedModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
      const preparedNested = await prepareComboOrder(
        augmentedModels, modelStr, comboStrategy, comboStickyLimit);
      return handleComboChat({
        body,
        models: preparedNested.models,
      handleSingleModel: withCapacityAdapterStripping(
        (b, m, opts) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, modelStr, isTestRequest, rotationBudget, opts?.signal ?? null),
        adapterAdded
      ),
        log,
        comboName: modelStr,
        comboStrategy: preparedNested.strategy,
        comboStickyLimit,
        autoSwitch: nestedAutoSwitch,
        rotationBudget,
        externalSignal,
        memberHealth: comboMemberHealth,
      });
    }
    log.warn("CHAT", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  const { provider, model } = modelInfo;
  if (clientRawRequest) {
    clientRawRequest = { ...clientRawRequest, comboName: comboName || clientRawRequest.comboName || null };
  }

  // Routing shown in the unified "▶" line (client model → provider/model)

  // Extract userAgent from request
  const userAgent = request?.headers?.get("user-agent") || "";

  // Try with available accounts (fallback on errors)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;
  let lastAttemptedAccount = null;
  let lastAttemptedConnectionId = null;
  // Attempts spent on THIS combo member. Dynamic fair-share: the cap is
  // recomputed from the REMAINING budget over REMAINING members, so early
  // members can't starve the tail (static ceil() overshoots: with budget 5
  // and 4 members it grants 2+2 and leaves M3/M4 with 1/0). When the member
  // set is unknown (solo/fusion/test calls) the whole remaining budget is it.
  // A 401 token-refresh retry is exempt once: the refreshed token was just
  // paid for and must be used, not evicted by the cap.
  let attemptsThisMember = 0;
  let refreshedRetryPending = false;
  // Snapshot once per member: recomputing from the shrinking remainder every
  // iteration would narrow the cap mid-member and strand budget unused.
  let memberAttemptCap = null;
  const getMemberAttemptCap = () => {
    if (memberAttemptCap === null) {
      memberAttemptCap = !rotationBudget?.membersTotal
        ? MAX_TOTAL_ROTATION_ATTEMPTS
        : Math.max(1, Math.floor(
            (MAX_TOTAL_ROTATION_ATTEMPTS - rotationBudget.used) /
            Math.max(1, rotationBudget.membersTotal - (rotationBudget.memberIndex || 0))));
    }
    return memberAttemptCap;
  };

  // Probe pinning (model Test buttons): x-connection-id selects the exact
  // account under test; x-connection-pin: strict turns a missed pin into an
  // honest error instead of silently testing a sibling account.
  const pinnedConnectionId = request?.headers?.get?.("x-connection-id") || null;
  const strictPinProbe = request?.headers?.get?.("x-connection-pin") === "strict";
  // Set after a successful 401 token refresh: the retry must use the account
  // whose token was just refreshed (see F8 handling below).
  let pinnedRetryConnectionId = null;
  const effectivePin = () => pinnedRetryConnectionId || pinnedConnectionId;

  // Shared-budget cutoff shared by the loop-top pre-check (avoids a wasted
  // credential/refresh lookup once the budget is spent) and the post-select
  // check below. Reads lastError/lastStatus at call time.
  const rotationBudgetExceededResponse = () => {
    const budgetMsg = `Max rotation attempts (${MAX_TOTAL_ROTATION_ATTEMPTS}) reached${lastError ? `: ${lastError}` : ""}`;
    log.warn("FALLBACK", budgetMsg, { provider, model });
    if (!isTestRequest) saveFailedRequest({ provider, model, connectionId: lastAttemptedConnectionId || null, account: lastAttemptedAccount, apiKey, endpoint: clientRawRequest?.endpoint, errorStatus: HTTP_STATUS.SERVICE_UNAVAILABLE, isStream: body?.stream, error: budgetMsg, comboName: comboName || clientRawRequest?.comboName || null }).catch(() => {});
    return errorResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, `[${provider}/${model}] ${budgetMsg}`);
  };

  while (true) {
    // Pre-check: don't pay a credential + token-refresh lookup when the
    // request already spent its whole rotation budget on previous attempts.
    // Skipped on the first iteration so empty-credential providers still get
    // their accurate NO_CREDENTIALS response below.
    if (rotationBudget && rotationBudget.used >= MAX_TOTAL_ROTATION_ATTEMPTS && excludeConnectionIds.size > 0) {
      return rotationBudgetExceededResponse();
    }
    // Model probes pin to the tested connection (x-connection-id); strict pin
    // means a missed pin is an honest error, never a sibling account.
    // A 401-refresh retry pins to the refreshed account for the same reason.
    const pin = effectivePin();
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model,
      pin ? { preferredConnectionId: pin, strictPin: strictPinProbe } : undefined);

    // Strict probe pin missed the tested connection — report it, don't route.
    if (credentials?.pinnedMiss) {
      const msg = credentials.lastError || "Pinned connection unavailable";
      log.warn("CHAT", `[${provider}/${model}] probe pin missed: ${msg}`);
      return errorResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, `[${provider}/${model}] ${msg}`);
    }

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = HTTP_STATUS.SERVICE_UNAVAILABLE;
        const failedAccount = lastAttemptedAccount || credentials.lastAccount || credentials.connectionName
          || (credentials.blockedNames?.length ? credentials.blockedNames.join(", ") : null)
          || `${provider} (all accounts blocked)`;
        const failedConnId = lastAttemptedConnectionId || credentials.lastConnectionId;
        const blockedList = credentials.blockedNames?.length ? ` [${credentials.blockedNames.join(", ")}]` : "";
        log.warn("CHAT", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})${blockedList}`);
        if (!isTestRequest) {
          setModelFailCount(modelStr, MODEL_FAILOVER_THRESHOLD, MODEL_FAILOVER_WINDOW_S).catch(() => {});
          if (provider && model && `${provider}/${model}` !== modelStr) {
            setModelFailCount(`${provider}/${model}`, MODEL_FAILOVER_THRESHOLD, MODEL_FAILOVER_WINDOW_S).catch(() => {});
          }
          if (credentials.lastErrorCode === "ACCOUNT_EXHAUSTED" || credentials.lastErrorCode === "ACCOUNT_UNAVAILABLE") {
            const ttlSec = credentials.retryAfter && new Date(credentials.retryAfter).getTime() > Date.now()
              ? Math.min(Math.ceil((new Date(credentials.retryAfter).getTime() - Date.now()) / 1000), 86400)
              : 300;
            setProviderDead(provider, ttlSec).catch(() => {});
          } else if ((credentials.blockedNames?.length || 0) > 0 && credentials.statusBreakdown
            && Number(credentials.statusBreakdown.disabled || 0) > 0
            && Number(credentials.statusBreakdown.active || 0) === 0) {
            // Every account exists but is disabled (e.g. freebuff 33/33 banned):
            // mark the provider dead so combo health-reorder demotes (fallback)
            // and the loop fast-skips (RR) its members instead of re-scanning
            // the whole disabled fleet on every rotation.
            setProviderDead(provider, 300).catch(() => {});
          }
        }
         if (!isTestRequest) saveFailedRequest({ provider, model, connectionId: failedConnId || null, account: failedAccount, apiKey, endpoint: clientRawRequest?.endpoint, errorStatus: status, isStream: body?.stream, error: errorMsg, comboName: comboName || clientRawRequest?.comboName || null }).catch(() => {});
         if (!isTestRequest) saveRequestDetail({
          provider, model, connectionId: failedConnId || null,
          comboName: comboName || clientRawRequest?.comboName || null,
          account: failedAccount,
          latency: { ttft: 0, total: 0 },
          tokens: { prompt_tokens: 0, completion_tokens: 0 },
          request: body,
          response: { error: errorMsg, status, thinking: null, blockedAccounts: credentials.blockedNames || [] },
          status: "error",
          error: errorMsg,
          errorCode: status,
         }).catch(() => {});
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman, {
          code: credentials.lastErrorCode,
          provider,
          model,
          account: failedAccount,
          statusBreakdown: credentials.statusBreakdown,
        });
      }
      if (excludeConnectionIds.size === 0) {
        if (!isTestRequest) {
          setModelFailCount(modelStr, MODEL_FAILOVER_THRESHOLD, MODEL_FAILOVER_WINDOW_S).catch(() => {});
          if (provider && model && `${provider}/${model}` !== modelStr) {
            setModelFailCount(`${provider}/${model}`, MODEL_FAILOVER_THRESHOLD, MODEL_FAILOVER_WINDOW_S).catch(() => {});
          }
          setProviderDead(provider, 300).catch(() => {});
        }
        // No credentials exist for this provider at all (or none active).
        // 503, not 404: the provider/node EXISTS but has no usable account —
        // 404 tells clients the endpoint/model is wrong and they stop retrying.
        log.warn("AUTH", `No active credentials for provider: ${provider}`);
        const noCredMsg = `No active credentials for provider: ${provider} — add an account or re-enable disabled ones`;
         if (!isTestRequest) saveFailedRequest({ provider, model, connectionId: null, apiKey, endpoint: clientRawRequest?.endpoint, errorStatus: HTTP_STATUS.SERVICE_UNAVAILABLE, isStream: body?.stream, error: noCredMsg, comboName: comboName || clientRawRequest?.comboName || null }).catch(() => {});
         if (!isTestRequest) saveRequestDetail({
          provider, model, connectionId: null,
          comboName: comboName || clientRawRequest?.comboName || null,
          latency: { ttft: 0, total: 0 },
          tokens: { prompt_tokens: 0, completion_tokens: 0 },
          request: body,
          response: { error: noCredMsg, status: HTTP_STATUS.SERVICE_UNAVAILABLE, thinking: null },
          status: "error",
          error: noCredMsg,
          errorCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
        }).catch(() => {});
        return unavailableResponse(
          HTTP_STATUS.SERVICE_UNAVAILABLE,
          noCredMsg,
          null,
          null,
          { code: "NO_CREDENTIALS", provider, model },
        );
      }
      log.warn("CHAT", "No more accounts available", { provider });
      const noMoreMsg = lastError || "All accounts unavailable";
      const noMoreStatus = lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE;
       if (!isTestRequest) saveFailedRequest({ provider, model, connectionId: lastAttemptedConnectionId || null, account: lastAttemptedAccount, apiKey, endpoint: clientRawRequest?.endpoint, errorStatus: noMoreStatus, isStream: body?.stream, error: noMoreMsg, comboName: comboName || clientRawRequest?.comboName || null }).catch(() => {});
        if (!isTestRequest) saveRequestDetail({
        provider, model, connectionId: lastAttemptedConnectionId || null,
        comboName: comboName || clientRawRequest?.comboName || null,
        account: lastAttemptedAccount,
        latency: { ttft: 0, total: 0 },
        tokens: { prompt_tokens: 0, completion_tokens: 0 },
        request: body,
        response: { error: noMoreMsg, status: noMoreStatus, thinking: null },
        status: "error",
        error: noMoreMsg,
        errorCode: noMoreStatus,
      }).catch(() => {});
      return errorResponse(noMoreStatus, noMoreMsg);
    }

    lastAttemptedConnectionId = credentials.connectionId;
    lastAttemptedAccount = credentials.connectionName || credentials.name || credentials.email || (credentials.connectionId ? `Account ${credentials.connectionId.slice(0, 8)}...` : null);

    // Shared rotation budget: stop the whole request (all combo members) once
    // MAX_TOTAL_ROTATION_ATTEMPTS upstream account attempts are spent, instead
    // of hanging the client while every dead account is retried.
    if (rotationBudget) {
      if (rotationBudget.used >= MAX_TOTAL_ROTATION_ATTEMPTS) {
        return rotationBudgetExceededResponse();
      }
      // Fair-share cutoff: hand control back to the combo loop so remaining
      // members get their share of the budget instead of this member burning
      // it all on its own dead accounts.
      if (!refreshedRetryPending && attemptsThisMember >= getMemberAttemptCap()) {
        log.warn("FALLBACK", `Member ${modelStr} spent its attempt share → next combo member`, { provider, model });
        return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "Member attempt share exhausted");
      }
      refreshedRetryPending = false;
      rotationBudget.used++;
      attemptsThisMember++;
      bumpRoutingMetric("upstreamAttempts");
    }

    // Account selection shown in the unified "▶" line (acc:...)
    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    // Ensure real project ID is available for providers that need it (P0 fix: cold miss)
    if ((provider === "antigravity" || provider === "gemini-cli") && !refreshedCredentials.projectId) {
      const pid = await getProjectIdForConnection(credentials.connectionId, refreshedCredentials.accessToken, provider, credentials.connectionName);
      if (pid) {
        refreshedCredentials.projectId = pid;
        // Persist to DB in background so subsequent requests have it immediately
        updateProviderCredentials(credentials.connectionId, { projectId: pid }).catch(() => { });
      }
    }

    // Use shared chatCore
    const chatSettings = await getSettings();
    const providerThinking = (chatSettings.providerThinking || {})[provider] || null;
    const result = await handleChatCore({
      body: { ...body, model: `${provider}/${model}` },
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      clientRawRequest,
      connectionId: credentials.connectionId,
      userAgent,
      apiKey,
      isTestRequest,
      ccFilterNaming: !!chatSettings.ccFilterNaming,
      rtkEnabled: !!chatSettings.rtkEnabled,
      cavemanEnabled: !!chatSettings.cavemanEnabled,
      cavemanLevel: chatSettings.cavemanLevel || "full",
      ponytailEnabled: !!chatSettings.ponytailEnabled,
      ponytailLevel: chatSettings.ponytailLevel || "full",
      providerThinking,
      // Pool-scoped failure recovery: re-resolve proxy config excluding the
      // failed pool so the request retries via another pool, not a dead end.
      resolveProxyConfig: async (creds, excludePoolIds = []) => {
        const psd = { ...(creds?.providerSpecificData || {}) };
        if (psd.proxyPoolIds?.length || psd.proxyGroup) psd.proxyPoolScope = `${provider}::${model}`;
        const resolved = await resolveConnectionProxyConfig(psd, creds?.connectionId || creds?.id, excludePoolIds);
        if (!resolved?.proxyPoolId) return null;
        return {
          connectionProxyEnabled: resolved.connectionProxyEnabled,
          connectionProxyUrl: resolved.connectionProxyUrl,
          connectionNoProxy: resolved.connectionNoProxy,
          connectionProxyPoolId: resolved.proxyPoolId || null,
          vercelRelayUrl: resolved.vercelRelayUrl || "",
          proxyPoolId: resolved.proxyPoolId || null,
          strictProxy: resolved.strictProxy === true,
        };
      },
      // Detect source format by endpoint + body
      sourceFormatOverride: request?.url ? detectFormatByEndpoint(new URL(request.url).pathname, body) : null,
      isTestRequest,
      comboName,
      difficulty: clientRawRequest?.difficulty || null,
      // Fusion straggler / combo target-timeout abort: linked to the stream
      // controller inside chatCore (fail-open when ignored downstream).
      externalSignal,
       onCredentialsRefreshed: async (newCreds) => {
         await updateProviderCredentials(credentials.connectionId, {
           ...newCreds,
           existingProviderSpecificData: credentials.providerSpecificData,
           // Refreshing credentials must not resurrect a model/account that
           // was concurrently exhausted by another request.
           ...(credentials.testStatus === "active" ? { testStatus: "active" } : {}),
         });
      },
      onRequestSuccess: async () => {
        // Model probes must not rewire production routing: no failover
        // resets, no LKG pointer, no affinity/proxy locks from test traffic.
        // (Usage stats are already suppressed for probes in chatCore.)
        if (isTestRequest) {
          return;
        }
        // The model just proved itself healthy — reset its failover counter so
        // a recovered member returns to the front of the combo immediately.
        resetModelFailCount(modelStr).catch(() => {});
        if (provider && model && `${provider}/${model}` !== modelStr) {
          resetModelFailCount(`${provider}/${model}`).catch(() => {});
        }
        clearProviderDead(provider).catch(() => {});
        // Publish this account as last-known-good: the next selection for the
        // same provider+model fast-paths straight here (60s TTL) instead of
        // scanning PG. Also closes any dead-circuit for the pair.
        setLkg(provider, model, credentials.connectionId, LKG_TTL_S).catch(() => {});
        resetDeadCircuit(provider, model).catch(() => {});
        await clearAccountError(credentials.connectionId, credentials, model);
        // Quota cache is refreshed only on quota errors; successful requests
        // do not need legacy strike-breaker cleanup.

        // Freebuff 1-hour model affinity lock: lock account to the successful model
        if (provider === "freebuff" && model && credentials.connectionId) {
          const canonical = canonicalFreebuffModel(model);
          lockAccountToModel(credentials.connectionId, canonical, 60 * 60 * 1000).catch((e) => {
            log.warn("AUTH", `Failed to lock Freebuff account to model ${canonical}:`, e);
          });
        }

        // Lock working proxy pool: lock the successful proxy for this provider/scope
        // until it fails or becomes unfit.
        const successfulPoolId = credentials?.providerSpecificData?.proxyPoolId || credentials?.providerSpecificData?.connectionProxyPoolId;
        if (successfulPoolId) {
          lockProxyPoolForScope(provider, successfulPoolId, credentials?.providerSpecificData?.proxyGroup || null);
        }
      }
    });

    if (result.success) return result.response;

    // Upstream 401: If connection has a refreshToken, attempt one immediate forced refresh before locking account
    if (result.status === 401 && credentials.refreshToken && !credentials._tokenRefreshedOn401) {
      log.warn("TOKEN_REFRESH", `Upstream 401 on ${provider} — attempting immediate force token refresh for ${credentials.connectionName}`);
      credentials._tokenRefreshedOn401 = true;
      const ref = await checkAndRefreshToken(provider, credentials, { force: true });
      if (ref?.accessToken && ref.accessToken !== refreshedCredentials.accessToken) {
        log.info("TOKEN_REFRESH", `Immediate token refresh succeeded for ${provider} (${credentials.connectionName}), retrying request`);
        // Exempt the retry from the fair-share cutoff once: evicting the
        // member here would throw away the just-refreshed token. The retry
        // still consumes one shared-budget slot below like any attempt.
        refreshedRetryPending = true;
        // Pin the retry to the refreshed account: without this the loop top
        // may select a different account (LKG/jitter) and waste both the
        // fresh token and a budget slot on an unrefreshed sibling.
        pinnedRetryConnectionId = credentials.connectionId;
        continue;
      }
    }

    // Preserve upstream status before quota handling; chatCore may wrap it.
    const upstreamStatus = result.extra?.upstreamStatus || result.status;
    const effectiveStatus = upstreamStatus;
    // Antigravity 409/429: refresh live quota to get exact resetAt before locking
    let quotaResetMs = null;
    let resetsAtMs = result.resetsAtMs;
    if (provider === "antigravity" && (upstreamStatus === 409 || upstreamStatus === 429)) {
      const refreshedQuotas = await refreshQuota(
        credentials.connectionId,
        refreshedCredentials.accessToken,
        credentials.providerSpecificData,
        { force: true },
      );
      quotaResetMs = await markAccountExhaustedFrom429({
        connectionId: credentials.connectionId,
        provider,
        model,
        resetAtMs: resetsAtMs,
        quotas: refreshedQuotas,
      });
      if (quotaResetMs) resetsAtMs = quotaResetMs;
    }
    // Freebuff 403/429: refresh live quota to get exact resetAt before locking (unless limited tier on proxy IP)
    const isFreebuffLimitedIp = provider === "freebuff" && (
      result.extra?.freebuffKind === "limited_ip" ||
      /accesstier["']?\s*:\s*["']?limited|pool["']?\s*:\s*["']?freebucks|limited-tier|limited_ip/i.test(String(result.error || ""))
    );
    if (isFreebuffLimitedIp) {
      resetsAtMs = null;
    } else if (provider === "freebuff" && (result.status === 403 || result.status === 429) && !resetsAtMs) {
      const fbResetMs = await handleFreebuffQuotaError(
        credentials.connectionId, model,
        refreshedCredentials.accessToken, credentials.providerSpecificData,
        credentials.proxyOptions,
      );
      if (fbResetMs) resetsAtMs = fbResetMs;
    }
    if (!isTestRequest && effectiveStatus === 402) {
      await markAccountExhaustedFromCredits({
        connectionId: credentials.connectionId,
        provider,
        model,
        resetAtMs: resetsAtMs,
      });
    }
    // Strict probe pin: report the pinned account's actual upstream outcome
    // without touching ANY routing state — no locks, no cooldowns, no token
    // refresh, no failover counters. The probe verdict must describe exactly
    // the tested connection.
    if (strictPinProbe && pinnedConnectionId) {
      const probeStatus = effectiveStatus || result.status || HTTP_STATUS.SERVICE_UNAVAILABLE;
      return errorResponse(probeStatus, `[${provider}/${model}] ${result.error || "Probe request failed"}`);
    }

    // When Freebuff upstream reports model_locked, immediately bind account to currentModel and fallback to next account
    if (provider === "freebuff") {
      let currentLockedModel = result.extra?.currentModel;
      if (!currentLockedModel) {
        const match = String(result.error || "").match(/"currentModel"\s*:\s*"([^"]+)"/);
        if (match) currentLockedModel = match[1];
      }
      if (currentLockedModel && credentials?.connectionId) {
        const canonical = canonicalFreebuffModel(currentLockedModel);
        log.warn("AUTH", `Freebuff account ${credentials.connectionName} locked to "${canonical}" upstream — updating local lock for 1h`);
        lockAccountToModel(credentials.connectionId, canonical, 60 * 60 * 1000).catch((e) => {
          log.warn("AUTH", `Failed to record Freebuff upstream lock for model ${canonical}:`, e);
        });
      }
      if (upstreamStatus === 409 || /(model_locked|session_model_mismatch|locked to another model)/i.test(String(result.error || ""))) {
        log.warn("FALLBACK", `⇄ ACC:${credentials.connectionName} Freebuff model locked to other model (${currentLockedModel || "other"}) → NEXT ACCOUNT`);
        excludeConnectionIds.add(credentials.connectionId);
        lastError = result.error;
        lastStatus = 409;
        if (excludeConnectionIds.size >= MAX_FALLBACK_ATTEMPTS) {
          log.warn("FALLBACK", `Reached maximum fallback attempts (${MAX_FALLBACK_ATTEMPTS}), stopping`);
          return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, `Max fallback attempts (${MAX_FALLBACK_ATTEMPTS}) reached: ${lastError}`);
        }
        continue;
      }
    }

    // A Freebuff proxy-egress refusal (free_mode_unavailable / anonymous_network)
    // already rotated pools inside chatCore — never treat it as a ban even
    // when the message embeds upstream JSON. Just fall back to next account.
    const isFreebuffProxyRefusal = provider === "freebuff"
      && (result.extra?.freebuffKind === "free_mode_unavailable"
        || /free_mode_unavailable|anonymous_network/i.test(String(result.error || "")));

    // A banned Freebuff account is permanently disabled (is_active=false, test_status="disabled")
    // and gateway falls back to the next healthy account
    if (!isFreebuffProxyRefusal && !isFreebuffLimitedIp && (result.extra?.freebuffKind === "banned" || (provider === "freebuff" && /(^|[^a-z])banned([^a-z]|$)/i.test(String(result.error || ""))))) {
      const connName = credentials.connectionName || credentials.name || credentials.email || credentials.connectionId?.slice(0, 8) || "account";
      const rawError = String(result.error || '{"status":"banned"}');
      const banReason = rawError.includes(connName)
        ? rawError
        : `Freebuff account "${connName}" banned (403): ${rawError}`;
      // Probes never mutate production account state (locks, disables).
      if (!isTestRequest) await markAccountUnavailable(
        credentials.connectionId,
       effectiveStatus || 403,
        banReason,
        provider,
        model,
        resetsAtMs,
        "banned",
        result.rawBody || result.extra?.rawBody,
      );
      log.warn("FALLBACK", `⇄ ACC:${connName} BANNED & DISABLED → NEXT ACCOUNT`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = banReason;
      lastStatus = HTTP_STATUS.FORBIDDEN;
      if (excludeConnectionIds.size >= MAX_FALLBACK_ATTEMPTS) {
        log.warn("FALLBACK", `Reached maximum fallback attempts (${MAX_FALLBACK_ATTEMPTS}), stopping`);
        return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, `Max fallback attempts (${MAX_FALLBACK_ATTEMPTS}) reached: ${lastError}`);
      }
      continue;
    }

    const quotaFailure = provider === "antigravity"
      && (effectiveStatus === 409 || effectiveStatus === 429)
      && /resource_exhausted|quota_exhausted|exhausted|capacity|rate.?limit|try again/i.test(String(result.error || ""));
    // Probes never mutate production account state (locks, cooldowns). The
    // in-request exclusion loop below still applies so one probe request can
    // try several accounts and report honestly.
    const shouldFallback = isTestRequest
      ? true
      : (await markAccountUnavailable(
        credentials.connectionId,
        effectiveStatus,
        result.error,
        provider,
        model,
        resetsAtMs,
        result.extra?.freebuffKind,
        result.rawBody || result.extra?.rawBody,
       )).shouldFallback;

    if (shouldFallback || quotaFailure) {
      excludeConnectionIds.add(credentials.connectionId);
      log.warn("FALLBACK", `⇄ ACC:${credentials.connectionName} UNAVAILABLE (${result.status}) → NEXT ACCOUNT`);
      // noAuth provider: only one synthesized "Public" account exists — if it
      // just failed there is nothing left to rotate to. Return immediately with
      // the upstream status code instead of burning the rotation budget on
      // retries that will always hit the same egress.
      if (credentials.connectionId === "noauth") {
        const noAuthMsg = result.error || "No-auth provider unavailable from this egress";
        log.warn("FALLBACK", `noAuth provider ${provider} — no more accounts, failing fast`);
        if (!isTestRequest) saveFailedRequest({ provider, model, connectionId: "noauth", account: "Public", apiKey, endpoint: clientRawRequest?.endpoint, errorStatus: effectiveStatus || HTTP_STATUS.FORBIDDEN, isStream: body?.stream, error: noAuthMsg, comboName: comboName || clientRawRequest?.comboName || null }).catch(() => {});
        if (!isTestRequest) saveRequestDetail({
          provider, model, connectionId: "noauth",
          comboName: comboName || clientRawRequest?.comboName || null,
          account: "Public",
          latency: { ttft: 0, total: 0 },
          tokens: { prompt_tokens: 0, completion_tokens: 0 },
          request: body,
          response: { error: noAuthMsg, status: effectiveStatus || HTTP_STATUS.FORBIDDEN, thinking: null },
          status: "error",
          error: noAuthMsg,
          errorCode: effectiveStatus || HTTP_STATUS.FORBIDDEN,
        }).catch(() => {});
        return errorResponse(effectiveStatus || HTTP_STATUS.FORBIDDEN, `[${provider}/${model}] ${noAuthMsg}`);
      }
      // Consecutive-failure tracking for combo failover: after
      // MODEL_FAILOVER_THRESHOLD straight failures this member is deprioritized
      // on subsequent requests. Only fallback-class errors count — a 400-class
      // client error must never penalize a healthy model. Probe traffic never
      // counts either.
      if (!isTestRequest) incrModelFailCount(modelStr, MODEL_FAILOVER_WINDOW_S).catch(() => {});
      lastError = result.error;
      lastStatus = effectiveStatus || result.status;
      if (excludeConnectionIds.size >= MAX_FALLBACK_ATTEMPTS) {
        log.warn("FALLBACK", `Reached maximum fallback attempts (${MAX_FALLBACK_ATTEMPTS}), stopping`);
        return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, `Max fallback attempts (${MAX_FALLBACK_ATTEMPTS}) reached: ${lastError}`);
      }
      continue;
    }

    return result.response || errorResponse(
      result.status || HTTP_STATUS.BAD_GATEWAY,
      result.error || "Chat request failed",
    );
  }
}
