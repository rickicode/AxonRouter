import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { normalizeMorphInstructionsSettings } from "../../../../open-sse/config/morphInstructionsResolver";
import { normalizeCavemanSettings } from "../../../../open-sse/config/caveman";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import {
  getCurrentSettings,
  getDefaultCurrentChatRuntimeSettings,
  normalizeCurrentChatRuntimeSettings,
  normalizeCurrentMorphSettings,
  updateCurrentSettings,
} from "@/lib/settingsAccess";
import { buildMorphKeyStatusPatch } from "@/app/api/morph/test-key/shared";
import { MORPH_CORE_INTERNAL_MODELS } from "@/shared/constants/models";
import bcrypt from "bcryptjs";

const DEFAULT_QUOTA_EXHAUSTED_THRESHOLD_PERCENT = 10;
const LEGACY_REMOVED_RESPONSE_KEYS = [
  String.fromCharCode(114, 116, 107, 69, 110, 97, 98, 108, 101, 100),
];

function resolveQuotaExhaustedThresholdPercent(value) {
  if (!Number.isFinite(value)) return DEFAULT_QUOTA_EXHAUSTED_THRESHOLD_PERCENT;
  return Math.min(100, Math.max(0, value));
}

function sanitizeSettingsResponse(settings: any = {}) {
  const safeSettings = { ...settings };

  delete safeSettings.password;
  for (const legacyKey of LEGACY_REMOVED_RESPONSE_KEYS) {
    delete safeSettings[legacyKey];
  }

  return safeSettings;
}

function buildMorphValidationUrl(baseUrl) {
  return new URL("/v1/chat/completions", `${String(baseUrl).replace(/\/+$/, "")}/`).toString();
}

async function validateMorphApiKeys(baseUrl, apiKeys = [], previousApiKeys = []) {
  if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
    return [];
  }

  const previousByEmail = new Map(
    (Array.isArray(previousApiKeys) ? previousApiKeys : [])
      .filter((entry) => entry?.email)
      .map((entry) => [entry.email, entry])
  );

  const validationResults = await Promise.all(apiKeys.map(async (entry) => {
    if (!entry?.email || !entry?.key) {
      return entry;
    }

    const previous = previousByEmail.get(entry.email);
    if (previous?.key === entry.key && previous?.status) {
      return {
        ...entry,
        status: previous.status,
        isExhausted: previous.isExhausted === true,
        lastCheckedAt: previous.lastCheckedAt || entry.lastCheckedAt || null,
        lastError: previous.lastError || "",
      };
    }

    try {
      const response = await fetch(buildMorphValidationUrl(baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${entry.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MORPH_CORE_INTERNAL_MODELS.fastValidation,
          messages: [
            {
              role: "user",
              content: "<instruction>Reply with exactly OK</instruction>",
            },
          ],
        }),
      });

      const responseText = await response.text().catch(() => "");
      return {
        ...entry,
        ...buildMorphKeyStatusPatch({
          status: response.status,
          responseText,
          fallbackLabel: `HTTP ${response.status}`,
        }),
      };
    } catch (error) {
      const validationError: any = error;
      return {
        ...entry,
        status: "unknown",
        isExhausted: false,
        lastCheckedAt: new Date().toISOString(),
        lastError: validationError?.message || "Failed to validate Morph API key",
      };
    }
  }));

  return validationResults;
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const settings: any = await getCurrentSettings();
    const safeSettings = sanitizeSettingsResponse(settings);
    const password = settings?.password;
    const quotaExhaustedThresholdPercent = resolveQuotaExhaustedThresholdPercent(
      settings?.quotaExhaustedThresholdPercent
    );

    const enableRequestLogs = settings?.enableRequestLogs === true;
    const enableTranslator = settings?.enableTranslator === true;

    return NextResponse.json({
      ...safeSettings,
      quotaExhaustedThresholdPercent,
      enableRequestLogs,
      enableTranslator,
      hasPassword: !!password,
    });
  } catch (error) {
    const routeError: any = error;
    console.error("Error getting settings:", error);
    return NextResponse.json({ error: routeError?.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body: any = await request.json();
    const updates: any = { ...body };
    const needsCurrentSettings = body.newPassword || body.morph || body.caveman !== undefined || body.chatRuntime !== undefined || body.resetChatRuntimeDefaults === true;
    const currentSettings: any = needsCurrentSettings ? await getCurrentSettings() : null;

    // If updating password, hash it
    if (body.newPassword) {
      const currentHash = currentSettings.password;

      // Verify current password if it exists
      if (currentHash) {
        if (!body.currentPassword) {
          return NextResponse.json({ error: "Current password required" }, { status: 400 });
        }
        const isValid = await bcrypt.compare(body.currentPassword, currentHash);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      }

      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(body.newPassword, salt);
      delete updates.newPassword;
      delete updates.currentPassword;
    }

    if (
      body.routing !== undefined
      || body.fallbackStrategy !== undefined
      || body.stickyRoundRobinLimit !== undefined
      || body.providerStrategies !== undefined
      || body.comboStrategy !== undefined
      || body.comboStrategies !== undefined
      || body.roundRobin !== undefined
      || body.sticky !== undefined
      || body.stickyDuration !== undefined
    ) {
      const baseRouting: any = currentSettings?.routing || {};
      const nextRouting: any = {
        ...baseRouting,
        ...(body.routing && typeof body.routing === "object" && !Array.isArray(body.routing)
          ? body.routing
          : {}),
      };

      if (body.fallbackStrategy !== undefined) {
        nextRouting.strategy = body.fallbackStrategy;
      }
      if (body.stickyRoundRobinLimit !== undefined) {
        nextRouting.stickyLimit = body.stickyRoundRobinLimit;
      }
      if (body.providerStrategies !== undefined) {
        nextRouting.providerStrategies = body.providerStrategies;
      }
      if (body.comboStrategy !== undefined) {
        nextRouting.comboStrategy = body.comboStrategy;
      }
      if (body.comboStrategies !== undefined) {
        nextRouting.comboStrategies = body.comboStrategies;
      }
      if (body.routingProfile !== undefined) {
        nextRouting.profile = body.routingProfile;
      }
      if (body.roundRobin !== undefined) {
        nextRouting.strategy = body.roundRobin ? "round-robin" : "fill-first";
      }
      if (body.sticky !== undefined || body.stickyDuration !== undefined) {
        nextRouting.sticky = {
          ...(baseRouting.sticky || {}),
          ...(nextRouting.sticky && typeof nextRouting.sticky === "object" ? nextRouting.sticky : {}),
        };
        if (body.sticky !== undefined) {
          nextRouting.sticky.enabled = body.sticky;
        }
        if (body.stickyDuration !== undefined) {
          nextRouting.sticky.durationSeconds = body.stickyDuration;
        }
      }

      updates.routing = nextRouting;
      delete updates.roundRobin;
      delete updates.sticky;
      delete updates.stickyDuration;
      delete updates.fallbackStrategy;
      delete updates.stickyRoundRobinLimit;
      delete updates.providerStrategies;
      delete updates.comboStrategy;
      delete updates.comboStrategies;
      delete updates.routingProfile;
    }

    if (body.morph !== undefined) {
      const nextMorph = await normalizeCurrentMorphSettings({
        ...(currentSettings?.morph || {}),
        ...(body.morph && typeof body.morph === "object" && !Array.isArray(body.morph)
          ? body.morph
          : {}),
      });

      updates.morph = {
        ...nextMorph,
        apiKeys: await validateMorphApiKeys(
          nextMorph.baseUrl,
          nextMorph.apiKeys,
          currentSettings?.morph?.apiKeys || []
        ),
      };
    }

    if (body.morphInstructions !== undefined) {
      updates.morphInstructions = normalizeMorphInstructionsSettings({
        ...(currentSettings?.morphInstructions || {}),
        ...(body.morphInstructions && typeof body.morphInstructions === "object" && !Array.isArray(body.morphInstructions)
          ? body.morphInstructions
          : {}),
      });
    }

    if (body.caveman !== undefined) {
      updates.caveman = normalizeCavemanSettings({
        ...(currentSettings?.caveman || {}),
        ...(body.caveman && typeof body.caveman === "object" && !Array.isArray(body.caveman)
          ? body.caveman
          : {}),
      });
    }

    if (body.providerProxyDefaults !== undefined) {
      const incoming = body.providerProxyDefaults;
      if (typeof incoming === "object" && incoming !== null && !Array.isArray(incoming)) {
        // Merge: only update keys present in incoming, preserve others
        const currentDefaults = currentSettings?.providerProxyDefaults || {};
        const mergedDefaults = { ...currentDefaults };
        for (const [key, value] of Object.entries(incoming)) {
          if (value === null || value === undefined) {
            delete mergedDefaults[key];
          } else {
            // Validate: proxy pool must exist and be active
            const poolId = typeof value === "object" && value !== null ? (value as any).proxyPoolId : value;
            if (typeof poolId === "string" && poolId.trim()) {
              const { getCurrentProxyPoolById } = await import("@/lib/connectionAccess");
              const pool = await getCurrentProxyPoolById(poolId.trim());
              if (!pool) {
                return NextResponse.json({ error: `Proxy pool "${poolId.trim()}" not found for provider "${key}"` }, { status: 400 });
              }
              if (pool.isActive !== true) {
                return NextResponse.json({ error: `Proxy pool "${poolId.trim()}" is inactive for provider "${key}". Activate it first.` }, { status: 400 });
              }
            }
            // Validate: proxy group must exist and be active (if provided)
            const groupId = typeof value === "object" && value !== null ? (value as any).proxyGroupId : undefined;
            if (typeof groupId === "string" && groupId.trim()) {
              const { getCurrentProxyGroupById } = await import("@/lib/proxyGroupAccess");
              const group = await getCurrentProxyGroupById(groupId.trim());
              if (!group) {
                return NextResponse.json({ error: `Proxy group "${groupId.trim()}" not found for provider "${key}"` }, { status: 400 });
              }
              if (group.isActive !== true) {
                return NextResponse.json({ error: `Proxy group "${groupId.trim()}" is inactive for provider "${key}". Activate it first.` }, { status: 400 });
              }
            }
            mergedDefaults[key] = value;
          }
        }
        updates.providerProxyDefaults = mergedDefaults;
      } else {
        updates.providerProxyDefaults = {};
      }
    }

    if (body.governance !== undefined) {
      updates.governance = {
        ...(currentSettings?.governance || {}),
        ...(body.governance && typeof body.governance === "object" && !Array.isArray(body.governance)
          ? body.governance
          : {}),
      };
    }

    if (body.enterprise !== undefined) {
      updates.enterprise = {
        ...(currentSettings?.enterprise || {}),
        ...(body.enterprise && typeof body.enterprise === "object" && !Array.isArray(body.enterprise)
          ? body.enterprise
          : {}),
      };
    }

    if (body.chatRuntime !== undefined || body.resetChatRuntimeDefaults === true) {
      const baseChatRuntime = body.resetChatRuntimeDefaults === true
        ? await getDefaultCurrentChatRuntimeSettings()
        : currentSettings?.chatRuntime || {};
      updates.chatRuntime = await normalizeCurrentChatRuntimeSettings({
        ...baseChatRuntime,
        ...(body.chatRuntime && typeof body.chatRuntime === "object" && !Array.isArray(body.chatRuntime)
          ? body.chatRuntime
          : {}),
      });
      delete updates.resetChatRuntimeDefaults;
    }

    const settings = await updateCurrentSettings(updates);

    // Apply outbound proxy settings immediately (no restart required)
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }

    // Apply request logging toggle immediately
    if (Object.prototype.hasOwnProperty.call(body, "enableRequestLogs")) {
      (globalThis as any).__AXONROUTER_REQUEST_LOGS_ENABLED = settings.enableRequestLogs === true;
    }

    const safeSettings = sanitizeSettingsResponse(settings);
    return NextResponse.json(safeSettings);
  } catch (error) {
    const routeError: any = error;
    if (routeError?.message === "Morph base URL must be a valid absolute http(s) URL") {
      return NextResponse.json({ error: routeError.message }, { status: 400 });
    }
    console.error("Error updating settings:", error);
    return NextResponse.json({ error: routeError?.message }, { status: 500 });
  }
}
