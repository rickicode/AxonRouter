/**
 * Usage Fetcher - Get usage data from provider APIs
 */

import { platform, arch } from "node:os";
import { CLIENT_METADATA, getPlatformUserAgent } from "../config/appConstants";
import { getAntigravityCredentials } from "../utils/publicCreds";
import { extractGoogleValidationUrl } from "../utils/error";

// GitHub API config
const GITHUB_CONFIG = {
  apiVersion: "2022-11-28",
  userAgent: "GitHubCopilotChat/0.26.7",
};

// Antigravity API config (from Quotio)
const ANTIGRAVITY_CONFIG = {
  quotaApiUrl: "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
  userQuotaApiUrl: "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
  loadProjectApiUrl: "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist",
  tokenUrl: "https://oauth2.googleapis.com/token",
  clientId: getAntigravityCredentials().clientId,
  clientSecret: getAntigravityCredentials().clientSecret,
  userAgent: getPlatformUserAgent(),
};

// Codex (OpenAI) API config
const CODEX_CONFIG = {
  usageUrl: "https://chatgpt.com/backend-api/wham/usage",
};

// Claude API config
const CLAUDE_CONFIG = {
  oauthUsageUrl: "https://api.anthropic.com/api/oauth/usage",
  usageUrl: "https://api.anthropic.com/v1/organizations/{org_id}/usage",
  settingsUrl: "https://api.anthropic.com/v1/settings",
  apiVersion: "2023-06-01",
};

/**
 * Get usage data for a provider connection
 * @param {Object} connection - Provider connection with accessToken
 * @returns {Object} Usage data with quotas
 */
export async function getUsageForProvider(connection: any, options?: any) {
  const { provider, accessToken, providerSpecificData, projectId } = connection;
  // The Antigravity/Gemini OAuth flow stores the resolved project id at the connection
  // top-level (not inside providerSpecificData). Merge it so the quota calls can use the
  // real, already-resolved project instead of re-deriving it (or falling back to a mock).
  const providerDataWithProjectId = {
    ...(providerSpecificData || {}),
    ...(projectId ? { projectId } : {}),
  };

  switch (provider) {
    case "github":
      return await getGitHubUsage(accessToken, providerSpecificData);
    case "gemini-cli":
      return await getGeminiUsage(accessToken, providerDataWithProjectId);
    case "antigravity":
      return await getAntigravityUsage(accessToken, providerDataWithProjectId, options);
    case "claude":
      return await getClaudeUsage(accessToken);
    case "codex":
      return await getCodexUsage(accessToken);
    case "kiro":
    case "amazon-q":
      return await getKiroUsage(accessToken, providerSpecificData);
    case "qwen":
      return await getQwenUsage(accessToken, providerSpecificData);
    case "iflow":
      return await getIflowUsage(accessToken);
    case "ollama":
      return await getOllamaUsage(accessToken, providerSpecificData);
    default:
      return { message: `Usage API not implemented for ${provider}` };
  }
}

/**
 * Parse reset date/time to ISO string
 * Handles multiple formats: Unix timestamp (ms), ISO date string, etc.
 */
function parseResetTime(resetValue) {
  if (!resetValue) return null;

  try {
    // If it's already a Date object
    if (resetValue instanceof Date) {
      return resetValue.toISOString();
    }

    // If it's a number (Unix timestamp in milliseconds)
    if (typeof resetValue === 'number') {
      return new Date(resetValue).toISOString();
    }

    // If it's a string (ISO date or any parseable date string)
    if (typeof resetValue === 'string') {
      return new Date(resetValue).toISOString();
    }

    return null;
  } catch (error) {
    console.warn(`Failed to parse reset time: ${resetValue}`, error);
    return null;
  }
}

/**
 * GitHub Copilot Usage
 * Uses GitHub accessToken (not copilotToken) to call copilot_internal/user API
 */
async function getGitHubUsage(accessToken, providerSpecificData) {
  try {
    if (!accessToken) {
      throw new Error("No GitHub access token available. Please re-authorize the connection.");
    }

    // copilot_internal/user API requires GitHub OAuth token, not copilotToken
    const response = await fetch("https://api.github.com/copilot_internal/user", {
      headers: {
        "Authorization": `token ${accessToken}`,
        "Accept": "application/json",
        "X-GitHub-Api-Version": GITHUB_CONFIG.apiVersion,
        "User-Agent": GITHUB_CONFIG.userAgent,
        "Editor-Version": "vscode/1.100.0",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${error}`);
    }

    const data = await response.json();

    // Handle different response formats (paid vs free)
    if (data.quota_snapshots) {
      // Paid plan format
      const snapshots = data.quota_snapshots;
      const resetAt = parseResetTime(data.quota_reset_date);

      return {
        plan: data.copilot_plan,
        resetDate: data.quota_reset_date,
        quotas: {
          chat: { ...formatGitHubQuotaSnapshot(snapshots.chat), resetAt },
          completions: { ...formatGitHubQuotaSnapshot(snapshots.completions), resetAt },
          premium_interactions: { ...formatGitHubQuotaSnapshot(snapshots.premium_interactions), resetAt },
        },
      };
    } else if (data.monthly_quotas || data.limited_user_quotas) {
      // Free/limited plan format
      const monthlyQuotas = data.monthly_quotas || {};
      const usedQuotas = data.limited_user_quotas || {};
      const resetAt = parseResetTime(data.limited_user_reset_date);

      return {
        plan: data.copilot_plan || data.access_type_sku,
        resetDate: data.limited_user_reset_date,
        quotas: {
          chat: {
            used: usedQuotas.chat || 0,
            total: monthlyQuotas.chat || 0,
            unlimited: false,
            resetAt,
          },
          completions: {
            used: usedQuotas.completions || 0,
            total: monthlyQuotas.completions || 0,
            unlimited: false,
            resetAt,
          },
        },
      };
    }

    return { message: "GitHub Copilot connected. Unable to parse quota data." };
  } catch (error) {
    return { message: `GitHub connected. Unable to fetch usage: ${error.message}` };
  }
}

function formatGitHubQuotaSnapshot(quota) {
  if (!quota) return { used: 0, total: 0, unlimited: true };

  return {
    used: quota.entitlement - quota.remaining,
    total: quota.entitlement,
    remaining: quota.remaining,
    unlimited: quota.unlimited || false,
  };
}

/**
 * Gemini CLI Usage - Fetch quota from retrieveUserQuota API
 */
async function getGeminiUsage(accessToken, providerSpecificData = null) {
  try {
    if (!accessToken) {
      return { plan: "Free", message: "Gemini CLI access token not available." };
    }

    // Prefer the connection-stored project id; only call loadCodeAssist if it's missing.
    const subscriptionInfo = await getAntigravitySubscriptionInfo(accessToken);
    const projectId =
      normalizeCloudCodeProjectId(providerSpecificData?.projectId) ||
      normalizeCloudCodeProjectId(subscriptionInfo?.cloudaicompanionProject);

    const plan = getAntigravityTierName(subscriptionInfo);

    if (!projectId) {
      return { plan, message: "Gemini CLI project ID not available. Usage tracking requires a project." };
    }

    // Use retrieveUserQuota endpoint (same as Gemini CLI /stats command)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(
        "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ project: projectId }),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return { plan, message: `Gemini CLI quota error (${response.status}).` };
    }

    const data = await response.json();
    const quotas: any = {};

    // Parse buckets array (each has modelId, remainingFraction, resetTime)
    if (Array.isArray(data.buckets)) {
      for (const bucket of data.buckets) {
        if (!bucket.modelId || bucket.remainingFraction == null) continue;

        const remainingFraction = Number(bucket.remainingFraction) || 0;
        const remainingPercentage = remainingFraction * 100;
        const total = 1000; // Normalized base
        const remaining = Math.round(total * remainingFraction);
        const used = Math.max(0, total - remaining);

        quotas[bucket.modelId] = {
          used,
          total,
          resetAt: parseResetTime(bucket.resetTime),
          remainingPercentage,
          unlimited: false,
        };
      }
    }

    return { plan, quotas };
  } catch (error) {
    return { plan: "Gemini CLI", message: `Gemini CLI error: ${error.message}` };
  }
}

/**
 * Normalize a Cloud Code project reference (string or { id }) to a plain id string.
 */
function normalizeCloudCodeProjectId(project: any) {
  if (typeof project === "string") return project.trim() || null;
  if (project && typeof project === "object" && typeof project.id === "string") {
    return project.id.trim() || null;
  }
  return null;
}

const ANTIGRAVITY_PROJECT_ADJECTIVES = ["useful", "bright", "swift", "calm", "bold"];
const ANTIGRAVITY_PROJECT_NOUNS = ["fuze", "wave", "spark", "flow", "core"];

/**
 * Generate a mock project id (adjective-noun-xxxxx) matching the Antigravity client's
 * fallback format. The fetchAvailableModels quota endpoint returns 403 when no project
 * is supplied, so a project id must always be present in the request body.
 */
function generateMockAntigravityProjectId() {
  const adjective = ANTIGRAVITY_PROJECT_ADJECTIVES[Math.floor(Math.random() * ANTIGRAVITY_PROJECT_ADJECTIVES.length)];
  const noun = ANTIGRAVITY_PROJECT_NOUNS[Math.floor(Math.random() * ANTIGRAVITY_PROJECT_NOUNS.length)];
  // Use crypto UUID for unpredictable suffix (matches executor format)
  const { randomUUID } = require("crypto");
  const suffix = randomUUID().slice(0, 5);
  return `${adjective}-${noun}-${suffix}`;
}

// Tier ids/names that are placeholders rather than a real, readable subscription tier.
const NON_DISPLAY_ANTIGRAVITY_TIERS = new Set(["legacy-tier", "legacy", "unknown", ""]);

// Cached set of known Antigravity model ids from PROVIDER_MODELS (single source of truth).
// Populated lazily on first Antigravity usage fetch to avoid top-level circular import.
// TTL: re-fetch every 30 minutes so new models appear without requiring a restart.
let _cachedAntigravityModelIds: Set<string> | null = null;
let _antigravityModelCacheTs = 0;
const ANTIGRAVITY_MODEL_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function getKnownAntigravityModelIds(): Promise<Set<string>> {
  const now = Date.now();
  if (_cachedAntigravityModelIds && (now - _antigravityModelCacheTs) < ANTIGRAVITY_MODEL_CACHE_TTL_MS) {
    return _cachedAntigravityModelIds;
  }
  try {
    const mod = await import("../config/providerModels");
    const agModels = mod.getModelsByProviderId("antigravity");
    if (agModels?.length) {
      _cachedAntigravityModelIds = new Set(agModels.map((m: any) => m.id));
      _antigravityModelCacheTs = now;
      return _cachedAntigravityModelIds;
    }
  } catch { /* fallback below */ }
  if (!_cachedAntigravityModelIds) {
    _cachedAntigravityModelIds = new Set([
      'gemini-3.5-flash-low',
      'gemini-3.5-flash-medium',
      'gemini-3.5-flash-high',
      'gemini-3.1-pro-low',
      'gemini-3.1-pro-high',
      'claude-sonnet-4-6',
      'claude-opus-4-6-thinking',
      'gpt-oss-120b-medium',
    ]);
  }
  _antigravityModelCacheTs = now;
  return _cachedAntigravityModelIds;
}

/**
 * Return a human-readable subscription tier name only when the API actually reported
 * a real tier. Returns null for placeholder/legacy/unknown tiers so the UI can hide the badge.
 */
function getAntigravityTierName(subscriptionInfo: any) {
  if (!subscriptionInfo) return null;

  // Multi-level fallback matching Antigravity-Manager's logic
  const paidTier = subscriptionInfo.paidTier;
  let raw =
    (typeof paidTier?.name === "string" && paidTier.name.trim()) ||
    (typeof paidTier?.id === "string" && paidTier.id.trim()) ||
    "";

  const isIneligible =
    Array.isArray(subscriptionInfo.ineligibleTiers) &&
    subscriptionInfo.ineligibleTiers.length > 0;

  if (!raw) {
    if (!isIneligible) {
      const currentTier = subscriptionInfo.currentTier;
      raw =
        (typeof currentTier?.name === "string" && currentTier.name.trim()) ||
        (typeof currentTier?.id === "string" && currentTier.id.trim()) ||
        "";
    } else {
      // If account is marked as INELIGIBLE, drop to allowedTiers and extract default
      if (Array.isArray(subscriptionInfo.allowedTiers)) {
        const defaultTier = subscriptionInfo.allowedTiers.find((t: any) => t?.isDefault === true);
        if (defaultTier) {
          const name =
            (typeof defaultTier.name === "string" && defaultTier.name.trim()) ||
            (typeof defaultTier.id === "string" && defaultTier.id.trim()) ||
            "";
          if (name) {
            raw = `${name} (Restricted)`;
          }
        }
      }
    }
  }

  if (!raw) return null;
  if (NON_DISPLAY_ANTIGRAVITY_TIERS.has(raw.toLowerCase())) return null;

  const lower = raw.toLowerCase();
  if (lower.includes("ultra")) {
    return "ULTRA";
  }
  if (lower.includes("pro")) {
    return "PRO";
  }
  if (
    lower.includes("free") ||
    lower === "antigravity"
  ) {
    return "FREE";
  }

  return raw;
}

/**
 * Antigravity Usage - Fetch quota from Google Cloud Code API
 */
async function getAntigravityUsage(accessToken, providerSpecificData, options?: { trigger?: string }) {
  try {
    const isScheduled = options?.trigger === "scheduled";
    const cachedProjectId = normalizeCloudCodeProjectId(providerSpecificData?.projectId);

    let subscriptionInfo = null;
    // Optimization: Skip loadCodeAssist if project_id is cached AND trigger is scheduled to save API quota
    if (isScheduled && cachedProjectId) {
      // Skip fetching subscription info
    } else {
      subscriptionInfo = await getAntigravitySubscriptionInfo(accessToken);
    }

    const projectId =
      cachedProjectId ||
      normalizeCloudCodeProjectId(subscriptionInfo?.cloudaicompanionProject) ||
      generateMockAntigravityProjectId();

    const plan = getAntigravityTierName(subscriptionInfo);

    const baseUrls = [
      "https://daily-cloudcode-pa.sandbox.googleapis.com",
      "https://daily-cloudcode-pa.googleapis.com",
      "https://cloudcode-pa.googleapis.com",
    ];

    let lastError: any = null;

    for (let i = 0; i < baseUrls.length; i++) {
      const baseUrl = baseUrls[i];
      const hasNext = i + 1 < baseUrls.length;

      const quotaApiUrl = `${baseUrl}/v1internal:fetchAvailableModels`;
      const userQuotaApiUrl = `${baseUrl}/v1internal:retrieveUserQuota`;

      let currentPayload = { project: projectId };
      let retryWithoutProject = false;

      // Loop to allow retrying without project on 403
      while (true) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        let response: Response | null = null;
        let userQuotaResponse: Response | null = null;

        try {
          const fetchOpts = {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "User-Agent": ANTIGRAVITY_CONFIG.userAgent,
              "Content-Type": "application/json",
              "x-request-source": "local", // MITM bypass
            },
            body: JSON.stringify(currentPayload),
            signal: controller.signal,
          };

          const [res1, res2] = await Promise.allSettled([
            fetch(quotaApiUrl, fetchOpts),
            fetch(userQuotaApiUrl, fetchOpts),
          ]);

          response = res1.status === "fulfilled" ? res1.value : null;
          userQuotaResponse = res2.status === "fulfilled" ? res2.value : null;
        } catch (err: any) {
          lastError = err;
          console.warn(`[Antigravity Usage] Request failed at ${baseUrl}: ${err.message}`);
          if (hasNext) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            break; // Break the inner loop, try next endpoint
          }
          throw err;
        } finally {
          clearTimeout(timeoutId);
        }

        // Handle HTTP status codes / errors
        const isForbidden = response?.status === 403 && userQuotaResponse?.status !== 200;
        if (isForbidden) {
          if (currentPayload.project && !retryWithoutProject) {
            console.warn(`[Antigravity Usage] Got 403 with project ID at ${baseUrl}, retrying without project ID...`);
            currentPayload = {} as any;
            retryWithoutProject = true;
            continue; // retry same endpoint without project
          }

          // Otherwise if still 403, immediately mark as forbidden and stop trying other endpoints!
          console.warn(`[Antigravity Usage] Account unauthorized (403 Forbidden) at ${baseUrl}, marking as forbidden`);
          let validationUrl: string | null = null;
          try {
            if (response) {
              const errorBody = await response.clone().text();
              validationUrl = extractGoogleValidationUrl(errorBody);
            }
          } catch { /* best effort */ }

          return {
            plan,
            message: validationUrl
              ? "Antigravity account needs verification. Please verify your account to continue."
              : "Antigravity quota API access forbidden. Chat may still work.",
            quotas: {},
            isForbidden: true, // Mark connection as forbidden to align with Antigravity-Manager
            ...(validationUrl ? { validationUrl } : {}),
            subscriptionInfo,
          };
        }

        const isAuthExpired = response?.status === 401 && userQuotaResponse?.status !== 200;
        if (isAuthExpired) {
          // 401 is auth expired, same across all endpoints, return immediately
          return {
            plan,
            message: "Antigravity quota API authentication expired. Chat may still work.",
            quotas: {},
            subscriptionInfo,
          };
        }

        if (response && !response.ok && userQuotaResponse && !userQuotaResponse.ok) {
          const status = response.status;
          // 429/5xx: fallback to next endpoint
          if (hasNext && (status === 429 || status >= 500)) {
            console.warn(`[Antigravity Usage] Endpoint ${baseUrl} returned ${status}, falling back to next endpoint`);
            lastError = new Error(`HTTP ${status}`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            break; // Break the inner loop, try next endpoint
          }
          throw new Error(`Antigravity API error. Fetch: ${response?.status}, UserQuota: ${userQuotaResponse?.status}`);
        }

        // Successfully parsed from one of the endpoints
        const quotas: any = {};
        const knownModelIds = await getKnownAntigravityModelIds();

        // 1. Parse model quotas from fetchAvailableModels
        if (response?.ok) {
          const data = await response.json().catch(() => ({}));
          const uiDisplayNames: Record<string, string> = {};
          try {
            const mod = await import("../config/providerModels");
            const agModels = mod.getModelsByProviderId("antigravity");
            for (const m of agModels ?? []) {
              uiDisplayNames[m.id] = m.name;
            }
          } catch { /* best effort */ }

          if (data.models) {
            for (const [modelKey, rawInfo] of Object.entries(data.models)) {
              const info: any = rawInfo;
              if (!info.quotaInfo || info.isInternal || !knownModelIds.has(modelKey)) continue;

              const remainingFraction = info.quotaInfo.remainingFraction || 0;
              const total = 1000;
              const remaining = Math.round(total * remainingFraction);

              quotas[modelKey] = {
                used: total - remaining,
                total,
                resetAt: parseResetTime(info.quotaInfo.resetTime),
                remainingPercentage: remainingFraction * 100,
                unlimited: false,
                displayName: uiDisplayNames[modelKey] || info.displayName || modelKey,
              };
            }
          }
        }

        // 2. Parse accurate buckets from retrieveUserQuota (overrides fetchAvailableModels)
        if (userQuotaResponse?.ok) {
          const uqData = await userQuotaResponse.json().catch(() => ({}));
          if (uqData.buckets) {
            for (const bucket of uqData.buckets) {
              const modelId = bucket.modelId;
              if (!modelId || !knownModelIds.has(modelId)) continue;

              const remainingFraction = bucket.remainingFraction || 0;
              const total = 1000;
              const remaining = Math.round(total * remainingFraction);

              if (quotas[modelId]) {
                quotas[modelId].used = total - remaining;
                quotas[modelId].remainingPercentage = remainingFraction * 100;
                quotas[modelId].resetAt = parseResetTime(bucket.resetTime) || quotas[modelId].resetAt;
              } else {
                quotas[modelId] = {
                  used: total - remaining,
                  total,
                  resetAt: parseResetTime(bucket.resetTime),
                  remainingPercentage: remainingFraction * 100,
                  unlimited: false,
                  displayName: modelId,
                };
              }
            }
          }
        }

        return {
          plan,
          quotas,
          subscriptionInfo,
        };
      }
    }

    throw lastError || new Error("All endpoints exhausted");
  } catch (error: any) {
    console.error("[Antigravity Usage] Error:", error.message, error.cause);
    return {
      message: `Antigravity error: ${error.message}`,
      quotas: {},
    };
  }
}

/**
 * Get Antigravity project ID from subscription info
 */
async function getAntigravityProjectId(accessToken) {
  try {
    const info = await getAntigravitySubscriptionInfo(accessToken);
    return info?.cloudaicompanionProject || null;
  } catch {
    return null;
  }
}

/**
 * Get Antigravity subscription info
 */
async function getAntigravitySubscriptionInfo(accessToken) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    const response = await fetch(ANTIGRAVITY_CONFIG.loadProjectApiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "User-Agent": ANTIGRAVITY_CONFIG.userAgent,
        "Content-Type": "application/json",
        "x-request-source": "local", // MITM bypass
      },
      body: JSON.stringify({ metadata: CLIENT_METADATA, mode: 1 }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Antigravity Subscription] Error:", error.message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Claude Usage - Primary: OAuth endpoint, Fallback: legacy settings/org endpoint
 */
async function getClaudeUsage(accessToken) {
  try {
    // Primary: OAuth usage endpoint (Claude Code consumer OAuth tokens)
    const oauthResponse = await fetch(CLAUDE_CONFIG.oauthUsageUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "anthropic-version": CLAUDE_CONFIG.apiVersion,
      },
    });

    if (oauthResponse.ok) {
      const data = await oauthResponse.json();
      const quotas: any = {};

      // utilization = % USED (e.g. 87 means 87% used, 13% remaining)
      const hasUtilization = (window) =>
        window && typeof window === "object" && typeof window.utilization === "number";

      const createQuotaObject = (window) => {
        const used = window.utilization;
        const remaining = Math.max(0, 100 - used);
        return {
          used,
          total: 100,
          remaining,
          remainingPercentage: remaining,
          resetAt: parseResetTime(window.resets_at),
          unlimited: false,
        };
      };

      if (hasUtilization(data.five_hour)) {
        quotas["session (5h)"] = createQuotaObject(data.five_hour);
      }

      if (hasUtilization(data.seven_day)) {
        quotas["weekly (7d)"] = createQuotaObject(data.seven_day);
      }

      // Parse model-specific weekly windows (e.g. seven_day_sonnet, seven_day_opus)
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith("seven_day_") && key !== "seven_day" && hasUtilization(value)) {
          const modelName = key.replace("seven_day_", "");
          quotas[`weekly ${modelName} (7d)`] = createQuotaObject(value);
        }
      }

      return {
        plan: "Claude Code",
        extraUsage: data.extra_usage ?? null,
        quotas,
      };
    }

    // Fallback: legacy settings + org usage endpoint
    console.warn(`[Claude Usage] OAuth endpoint returned ${oauthResponse.status}, falling back to legacy`);
    return await getClaudeUsageLegacy(accessToken);
  } catch (error) {
    return { message: `Claude connected. Unable to fetch usage: ${error.message}` };
  }
}

/**
 * Legacy Claude usage for API key / org admin users
 */
async function getClaudeUsageLegacy(accessToken) {
  try {
    const settingsResponse = await fetch(CLAUDE_CONFIG.settingsUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "anthropic-version": CLAUDE_CONFIG.apiVersion,
      },
    });

    if (settingsResponse.ok) {
      const settings = await settingsResponse.json();

      if (settings.organization_id) {
        const usageResponse = await fetch(
          CLAUDE_CONFIG.usageUrl.replace("{org_id}", settings.organization_id),
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "anthropic-version": CLAUDE_CONFIG.apiVersion,
            },
          }
        );

        if (usageResponse.ok) {
          const usage = await usageResponse.json();
          return {
            plan: settings.plan || "Unknown",
            organization: settings.organization_name,
            quotas: usage,
          };
        }
      }

      return {
        plan: settings.plan || "Unknown",
        organization: settings.organization_name,
        message: "Claude connected. Usage details require admin access.",
      };
    }

    return { message: "Claude connected. Usage API requires admin permissions." };
  } catch (error) {
    return { message: `Claude connected. Unable to fetch usage: ${error.message}` };
  }
}

/**
 * Codex (OpenAI) Usage - Fetch from ChatGPT backend API
 */
async function getCodexUsage(accessToken) {
  try {
    const response = await fetch(CODEX_CONFIG.usageUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
        "originator": "codex-cli",
        "User-Agent": `codex-cli/1.0.26 (${platform()}; ${arch()})`,
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });

    if (!response.ok) {
      console.warn(
        `[CodexUsage] Usage API returned ${response.status} ${response.statusText || ""}`.trim(),
      );
      return { message: `Codex connected. Usage API temporarily unavailable (${response.status}).` };
    }

    const data = await response.json();

    // Parse rate limit info
    const rateLimit = data.rate_limit || {};
    const primaryWindow = rateLimit.primary_window;
    const secondaryWindow = rateLimit.secondary_window;
    const quotas: any = {};
    const normalizeUsedPercent = (window) => {
      const usedPercent = Number(window?.used_percent);
      const remainingPercent = Number(window?.remaining_percent);

      if (Number.isFinite(remainingPercent)) {
        return Math.max(0, Math.min(100, 100 - remainingPercent));
      }

      if (Number.isFinite(usedPercent)) {
        return Math.max(0, Math.min(100, usedPercent));
      }

      return 0;
    };

    if (primaryWindow) {
      const sessionResetAt = parseResetTime(primaryWindow.reset_at ? primaryWindow.reset_at * 1000 : null);
      const used = normalizeUsedPercent(primaryWindow);
      const remaining = Math.max(0, 100 - used);

      quotas.session = {
        used,
        total: 100,
        remaining,
        remainingPercentage: remaining,
        resetAt: sessionResetAt,
        unlimited: false,
      };
    }

    if (secondaryWindow) {
      const weeklyResetAt = parseResetTime(secondaryWindow.reset_at ? secondaryWindow.reset_at * 1000 : null);
      const used = normalizeUsedPercent(secondaryWindow);
      const remaining = Math.max(0, 100 - used);

      quotas.weekly = {
        used,
        total: 100,
        remaining,
        remainingPercentage: remaining,
        resetAt: weeklyResetAt,
        unlimited: false,
      };
    }

    if (Object.keys(quotas).length === 0) {
      console.warn(
        `[CodexUsage] Usage response missing rate-limit windows; top-level keys=${Object.keys(data || {}).join(",") || "none"}`,
      );
      throw new Error("Codex usage response missing rate-limit windows");
    }

    const hasSessionWindow = Boolean(quotas.session);
    const hasWeeklyWindow = Boolean(quotas.weekly);

    return {
      plan: data.plan_type || "unknown",
      limitReached: rateLimit.limit_reached || false,
      quotas,
      hasSessionWindow,
      hasWeeklyWindow,
      usageWindowType: hasSessionWindow ? "session_and_weekly" : hasWeeklyWindow ? "weekly_only" : "unknown",
    };
  } catch (error) {
    return { message: `Codex connected. Unable to fetch usage: ${error.message}` };
  }
}

/**
 * Kiro (AWS CodeWhisperer) Usage
 */
function parseKiroQuotaData(data) {
  const usageList = data.usageBreakdownList || [];
  const quotaInfo = {};
  const resetAt = parseResetTime(data.nextDateReset || data.resetDate);
  const bucketAudit = [];

  const getSafeRemaining = (used, total) => {
    if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) return null;
    if (typeof used !== "number" || !Number.isFinite(used) || used < 0) return null;
    return total - used;
  };

  usageList.forEach((breakdown) => {
    const resourceType = breakdown.resourceType?.toLowerCase() || "unknown";
    const used = breakdown.currentUsageWithPrecision || 0;
    const total = breakdown.usageLimitWithPrecision || 0;

    bucketAudit.push({
      name: resourceType,
      hasFreeTrial: Boolean(breakdown.freeTrialInfo),
    });

    quotaInfo[resourceType] = {
      used,
      total,
      remaining: getSafeRemaining(used, total),
      resetAt,
      unlimited: false,
    };

    // Add free trial if available
    if (breakdown.freeTrialInfo) {
      const freeUsed = breakdown.freeTrialInfo.currentUsageWithPrecision || 0;
      const freeTotal = breakdown.freeTrialInfo.usageLimitWithPrecision || 0;

      quotaInfo[`${resourceType}_freetrial`] = {
        used: freeUsed,
        total: freeTotal,
        remaining: getSafeRemaining(freeUsed, freeTotal),
        resetAt: parseResetTime(breakdown.freeTrialInfo.freeTrialExpiry || resetAt),
        unlimited: false,
      };
    }
  });

  return {
    plan: data.subscriptionInfo?.subscriptionTitle || "Kiro",
    quotas: quotaInfo,
    quotaBucketAudit: {
      bucketNames: Object.keys(quotaInfo),
      ignoredForRouting: Object.keys(quotaInfo).filter((name) => name.endsWith("_freetrial")),
      usageBreakdown: bucketAudit,
    },
  };
}

async function getKiroUsage(accessToken, providerSpecificData) {
  const profileArn = providerSpecificData?.profileArn || null;
  const authMethod = providerSpecificData?.authMethod || "builder-id";

  const getUsageParams = new URLSearchParams({
    isEmailRequired: "true",
    origin: "AI_EDITOR",
    resourceType: "AGENTIC_REQUEST",
  });

  // For compatibility, try multiple known Kiro usage endpoints.
  // Avoid inventing a fake profile ARN: it can create noisy, misleading failures.
  const attempts = [
    {
      name: "codewhisperer-get",
      run: async () => fetch(
        `https://codewhisperer.us-east-1.amazonaws.com/getUsageLimits?${getUsageParams.toString()}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Accept": "application/json",
            "x-amz-user-agent": "aws-sdk-js/1.0.0 KiroIDE",
            "user-agent": "aws-sdk-js/1.0.0 KiroIDE",
          },
        },
      ),
    },
    ...(profileArn
      ? [
          {
            name: "codewhisperer-post",
            run: async () => fetch("https://codewhisperer.us-east-1.amazonaws.com", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/x-amz-json-1.0",
                "x-amz-target": "AmazonCodeWhispererService.GetUsageLimits",
                "Accept": "application/json",
              },
              body: JSON.stringify({
                origin: "AI_EDITOR",
                profileArn,
                resourceType: "AGENTIC_REQUEST",
              }),
            }),
          },
          {
            name: "q-get",
            run: async () => {
              const params = new URLSearchParams({
                origin: "AI_EDITOR",
                profileArn,
                resourceType: "AGENTIC_REQUEST",
              });
              return fetch(`https://q.us-east-1.amazonaws.com/getUsageLimits?${params}`, {
                method: "GET",
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                  "Accept": "application/json",
                },
              });
            },
          },
        ]
      : []),
  ];

  let sawAuthError = false;
  const errors = [];

  for (const attempt of attempts) {
    try {
      const response = await attempt.run();
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status === 401 || response.status === 403) {
          sawAuthError = true;
        }
        errors.push(`${attempt.name}:${response.status}${errorText ? `:${errorText}` : ""}`);
        continue;
      }

      const data = await response.json();
      return parseKiroQuotaData(data);
    } catch (error) {
      errors.push(`${attempt.name}:${error.message}`);
    }
  }

  if (sawAuthError && authMethod === "idc") {
    return {
      message: "Kiro quota API is unavailable for the current AWS IAM Identity Center session. Chat may still work. If this persists after renewing your session, reconnect Kiro.",
      quotas: {},
    };
  }

  // Social auth (Google/GitHub) tokens can remain valid for chat while the
  // AWS quota endpoints reject them or require a different session context.
  if (sawAuthError && (authMethod === "google" || authMethod === "github")) {
    return {
      message: "Kiro quota API is unavailable for the current social login session. Chat may still work. If this persists, reconnect Kiro.",
      quotas: {},
    };
  }

  if (sawAuthError) {
    return {
      message: !profileArn
        ? "Kiro connected. Profile ARN not available for quota tracking."
        : "Kiro quota API rejected the current token. Chat may still work.",
      quotas: {},
    };
  }

  const fallbackMessage = !profileArn
    ? "Kiro connected. Profile ARN not available for quota tracking."
    : errors.length > 0
      ? `Unable to fetch Kiro usage right now. (${errors[errors.length - 1]})`
      : "Unable to fetch Kiro usage right now.";

  return {
    message: fallbackMessage,
    quotas: {},
  };
}

/**
 * Qwen Usage
 */
async function getQwenUsage(accessToken, providerSpecificData) {
  try {
    const resourceUrl = providerSpecificData?.resourceUrl;
    if (!resourceUrl) {
      return { message: "Qwen connected. No resource URL available." };
    }

    // Qwen may have usage endpoint at resource URL
    return { message: "Qwen connected. Usage tracked per request." };
  } catch (error) {
    return { message: "Unable to fetch Qwen usage." };
  }
}

/**
 * iFlow Usage
 */
async function getIflowUsage(accessToken) {
  try {
    // iFlow may have usage endpoint
    return { message: "iFlow connected. Usage tracked per request." };
  } catch (error) {
    return { message: "Unable to fetch iFlow usage." };
  }
}

/**
 * Ollama Cloud Usage
 * Ollama Cloud uses an API key from ollama.com/settings/keys
 * and has no public usage API — free tier has light usage limits (resets every 5h & 7d).
 * This returns an informational message with the plan details.
 */
async function getOllamaUsage(accessToken, providerSpecificData) {
  try {
    // Ollama Cloud does not expose a public quota/usage API.
    // The provider is configured as noAuth with a notice explaining limits.
    // We return a graceful message so the UI shows a friendly state instead of an error.
    const plan = providerSpecificData?.plan || "Free";
    return {
      plan,
      message: "Ollama Cloud uses a free tier with light usage limits (resets every 5h & 7d). For detailed usage tracking, visit ollama.com/settings/keys.",
      quotas: [],
    };
  } catch (error) {
    return { message: "Unable to fetch Ollama Cloud usage." };
  }
}
