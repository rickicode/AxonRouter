import { NextResponse } from "@/lib/http/response.js";
import { getSettings, updateSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { resetComboRotation } from "open-sse/services/combo.js";
import { JEV_ALL_MODELS, isKnownJevEndpoint } from "open-sse/config/jevModels.js";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS_RESPONSE_HEADERS = {
  "Cache-Control": "no-store"
};

// Secrets must never be mass-assigned from request body (CWE-915)
const PROTECTED_SETTING_KEYS = ["password"];

// Combo-level TypeSafe keys are secrets as well: hand out only their presence so the
// dashboard can badge them without ever receiving the value.
function redactComboStrategies(strategies) {
  if (!strategies || typeof strategies !== "object") return strategies;
  return Object.fromEntries(
    Object.entries(strategies).map(([name, strat]) => {
      if (!strat || typeof strat !== "object" || !strat.typeSafeApiKey) {
        return [name, strat];
      }
      const { typeSafeApiKey, ...rest } = strat;
      return [name, { ...rest, typeSafeKeyConfigured: true }];
    })
  );
}

// The dashboard posts the whole comboStrategies map but can never echo back a combo
// key it did not receive, so an omitted typeSafeApiKey keeps the stored value and an
// explicit "" is what clears it. The derived typeSafeKeyConfigured flag is never stored.
function mergeComboStrategies(stored = {}, incoming = {}) {
  const merged = {};
  for (const [name, strat] of Object.entries(incoming || {})) {
    if (!strat || typeof strat !== "object") {
      merged[name] = strat;
      continue;
    }
    const prev = stored?.[name] && typeof stored[name] === "object" ? stored[name] : {};
    const next = { ...strat };
    // Jev classifier picker: only known model ids / System One endpoints are stored.
    if (next.jevModel !== undefined && !JEV_ALL_MODELS.includes(next.jevModel)) delete next.jevModel;
    if (next.jevEndpoint !== undefined && !isKnownJevEndpoint(next.jevEndpoint)) delete next.jevEndpoint;
    delete next.typeSafeKeyConfigured;
    if (!Object.prototype.hasOwnProperty.call(next, "typeSafeApiKey")) {
      if (typeof prev.typeSafeApiKey === "string" && prev.typeSafeApiKey) {
        next.typeSafeApiKey = prev.typeSafeApiKey;
      }
    } else {
      const key = next.typeSafeApiKey == null ? "" : String(next.typeSafeApiKey).trim();
      if (key) next.typeSafeApiKey = key;
      else delete next.typeSafeApiKey;
    }
    merged[name] = next;
  }
  return merged;
}

export async function GET() {
  try {
    const settings = await getSettings();
    const { password, oidcClientSecret, typeSafeApiKey, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    // TypeSafe key is a secret: expose only whether one is configured.
    safeSettings.typeSafeKeyConfigured = !!typeSafeApiKey;
    safeSettings.comboStrategies = redactComboStrategies(safeSettings.comboStrategies);
    
    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === "true";
    const enableTranslator = process.env.ENABLE_TRANSLATOR === "true";
    
    return NextResponse.json({ 
      ...safeSettings, 
      enableRequestLogs,
      enableTranslator,
      hasPassword: !!password
    }, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error getting settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    // Strip protected secrets before any internal handling sets them
    for (const key of PROTECTED_SETTING_KEYS) delete body[key];

    // If updating password, hash it
    if (body.newPassword) {
      const settings = await getSettings();
      const currentHash = settings.password;

      // Verify current password if it exists
      if (currentHash) {
        if (!body.currentPassword) {
          return NextResponse.json({ error: "Current password required" }, { status: 400 });
        }
        const isValid = await bcrypt.compare(body.currentPassword, currentHash);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      } else {
        // First time setting password, no current password needed
        // Allow empty currentPassword or default "12345677"
        if (body.currentPassword && body.currentPassword !== "12345677") {
           return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      }

      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(body.newPassword, salt);
      delete body.newPassword;
      delete body.currentPassword;
    }

    if (Object.prototype.hasOwnProperty.call(body, "oidcClientSecret")) {
      if (!body.oidcClientSecret || !String(body.oidcClientSecret).trim()) {
        delete body.oidcClientSecret;
      }
    }

    // Difficulty judge settings: validate before mass-assignment (CWE-915).
    const JUDGE_MODES = ["two-layer", "jev-only", "llm-only"];
    if (Object.prototype.hasOwnProperty.call(body, "judgeMode")) {
      if (!JUDGE_MODES.includes(body.judgeMode)) {
        return NextResponse.json(
          { error: `Invalid judgeMode: expected one of ${JUDGE_MODES.join(", ")}` },
          { status: 400 }
        );
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "jevModel")) {
      if (!JEV_ALL_MODELS.includes(body.jevModel)) {
        return NextResponse.json(
          { error: `Invalid jevModel: expected one of ${JEV_ALL_MODELS.join(", ")}` },
          { status: 400 }
        );
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "jevConfidenceThreshold")) {
      const threshold = Number(body.jevConfidenceThreshold);
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
        return NextResponse.json(
          { error: "Invalid jevConfidenceThreshold: expected a number between 0 and 1" },
          { status: 400 }
        );
      }
      body.jevConfidenceThreshold = threshold;
    }
    if (Object.prototype.hasOwnProperty.call(body, "typeSafeApiKey")) {
      // "" clears the key (falls back to TYPESAFE_API_KEY env).
      body.typeSafeApiKey = body.typeSafeApiKey == null ? "" : String(body.typeSafeApiKey).trim();
    }

    // Combo-level keys: the client cannot echo back what GET redacted, so re-attach the
    // stored key for every combo strategy whose key was omitted from the payload.
    if (Object.prototype.hasOwnProperty.call(body, "comboStrategies")) {
      const current = await getSettings();
      body.comboStrategies = mergeComboStrategies(current.comboStrategies || {}, body.comboStrategies);
    }

    const settings = await updateSettings(body);

    // Apply outbound proxy settings immediately (no restart required)
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }

    // Invalidate combo rotation state when strategy settings change
    if (
      Object.prototype.hasOwnProperty.call(body, "comboStrategy") ||
      Object.prototype.hasOwnProperty.call(body, "comboStickyRoundRobinLimit") ||
      Object.prototype.hasOwnProperty.call(body, "comboStrategies")
    ) {
      resetComboRotation();
    }


    const { password, oidcClientSecret, typeSafeApiKey, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    safeSettings.typeSafeKeyConfigured = !!typeSafeApiKey;
    safeSettings.comboStrategies = redactComboStrategies(safeSettings.comboStrategies);
    return NextResponse.json(safeSettings, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
