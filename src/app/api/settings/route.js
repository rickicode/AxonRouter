import { NextResponse } from "@/lib/http/response.js";
import { getSettings, updateSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { resetComboRotation } from "open-sse/services/combo.js";
import { resolveProviderId } from "@/shared/constants/providers.js";
import { JEV_ALL_MODELS, JEV_PROVIDERS, isKnownJevEndpoint, jevProviderById } from "open-sse/config/jevModels.js";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS_RESPONSE_HEADERS = {
  "Cache-Control": "no-store"
};

// Secrets must never be mass-assigned from request body (CWE-915)
const PROTECTED_SETTING_KEYS = ["password"];

// Combo-level classifier keys are secrets as well: hand out only which providers
// have one, never the value.
function redactComboStrategies(strategies) {
  if (!strategies || typeof strategies !== "object") return strategies;
  return Object.fromEntries(
    Object.entries(strategies).map(([name, strat]) => {
      if (!strat || typeof strat !== "object" || !strat.jevApiKeys) {
        return [name, strat];
      }
      const { jevApiKeys, ...rest } = strat;
      const configured = Object.keys(jevApiKeys).filter((k) => jevApiKeys[k]);
      return [name, { ...rest, jevApiKeysConfigured: configured }];
    })
  );
}

// The dashboard posts the whole comboStrategies map but can never echo back a
// classifier key it did not receive, so an omitted jevApiKeys entry keeps the
// stored key and an explicit "" is what clears it. Derived *Configured flags are
// never stored.
function mergeComboStrategies(stored = {}, incoming = {}) {
  const merged = {};
  for (const [name, strat] of Object.entries(incoming || {})) {
    if (!strat || typeof strat !== "object") {
      merged[name] = strat;
      continue;
    }
    const prev = stored?.[name] && typeof stored[name] === "object" ? stored[name] : {};
    const next = { ...strat };
    // Jev classifier picker: only registered models / providers / endpoints are stored.
    if (next.jevModel !== undefined && !JEV_ALL_MODELS.includes(next.jevModel)) delete next.jevModel;
    if (next.jevProvider !== undefined && !jevProviderById(next.jevProvider)) delete next.jevProvider;
    if (next.jevEndpoint !== undefined && !isKnownJevEndpoint(next.jevEndpoint)) delete next.jevEndpoint;
    delete next.jevApiKeysConfigured;
    next.jevApiKeys = mergeJevApiKeys(prev.jevApiKeys, next.jevApiKeys);
    if (Object.keys(next.jevApiKeys).length === 0) delete next.jevApiKeys;
    merged[name] = next;
  }
  return merged;
}

// Merge { providerId: key } maps. A provider NAMED in `incoming` is authoritative:
// a non-empty value stores the new key and "" clears it (that is the only way the
// dashboard can clear a key it never receives back). A provider omitted from
// `incoming` keeps its stored key.
function mergeJevApiKeys(stored, incoming) {
  const prev = stored && typeof stored === "object" ? stored : {};
  if (incoming === undefined) return { ...prev };
  if (!incoming || typeof incoming !== "object") return {};
  const out = {};
  const named = new Set();
  for (const [provider, key] of Object.entries(incoming)) {
    if (!jevProviderById(provider)) continue;
    named.add(provider);
    const trimmed = key == null ? "" : String(key).trim();
    if (trimmed) out[provider] = trimmed;
  }
  for (const [provider, key] of Object.entries(prev)) {
    if (!named.has(provider) && typeof key === "string" && key) out[provider] = key;
  }
  return out;
}

// Deep-merge provider strategies so partial updates from different dashboard cards
// (e.g. fallbackStrategy toggle vs proxyGroup selector) do not clobber each other.
function mergeProviderStrategies(stored = {}, incoming = {}) {
  if (!incoming || typeof incoming !== "object") return stored;
  const merged = { ...(stored || {}) };
  for (const [providerKey, strat] of Object.entries(incoming)) {
    if (!strat || typeof strat !== "object") {
      delete merged[providerKey];
      continue;
    }
    // Strategies are keyed by canonical provider id. The dashboard can address a
    // provider by its alias ("oc" for opencode, "ag" for antigravity), and every
    // reader — getProviderCredentials, the proxy-stats route — looks up the
    // canonical key. Storing the alias would make the setting invisible to all of
    // them, so the provider silently falls back to direct egress. Canonicalize on
    // write, and fold an existing alias-keyed entry into the canonical one so a
    // pre-existing bad row is repaired instead of shadowed.
    const providerId = resolveProviderId(providerKey);
    const aliasEntry = stored[providerKey];
    const prev =
      (stored[providerId] && typeof stored[providerId] === "object" ? stored[providerId] : {}) ||
      (aliasEntry && typeof aliasEntry === "object" ? aliasEntry : {});
    if (aliasEntry && aliasEntry !== stored[providerId]) delete merged[providerKey];
    const next = { ...prev, ...strat };
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === undefined) {
        delete next[k];
      }
    }
    if (Object.keys(next).length === 0) {
      delete merged[providerId];
      delete merged[providerKey];
    } else {
      merged[providerId] = next;
    }
  }
  return merged;
}

export async function GET() {
  try {
    const settings = await getSettings();
    const { password, oidcClientSecret, jevApiKeys, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    // Classifier provider keys are secrets: expose only which providers have one.
    safeSettings.jevApiKeysConfigured = Object.keys(jevApiKeys || {}).filter((k) => jevApiKeys[k]);
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
    if (Object.prototype.hasOwnProperty.call(body, "jevProvider")) {
      // "" clears the pin and lets the resolver pick by priority.
      if (body.jevProvider === "" || body.jevProvider == null) {
        body.jevProvider = "";
      } else if (!jevProviderById(body.jevProvider)) {
        return NextResponse.json(
          { error: `Invalid jevProvider: expected one of ${JEV_PROVIDERS.map((p) => p.provider).join(", ")}` },
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
    if (Object.prototype.hasOwnProperty.call(body, "jevApiKeys")) {
      // { [providerId]: key }; "" clears a provider key, omitted providers keep theirs.
      const current = await getSettings();
      body.jevApiKeys = mergeJevApiKeys(current.jevApiKeys || {}, body.jevApiKeys);
    }

    // Combo-level keys: the client cannot echo back what GET redacted, so re-attach the
    // stored key for every combo strategy whose key was omitted from the payload.
    if (Object.prototype.hasOwnProperty.call(body, "comboStrategies")) {
      const current = await getSettings();
      body.comboStrategies = mergeComboStrategies(current.comboStrategies || {}, body.comboStrategies);
    }

    if (Object.prototype.hasOwnProperty.call(body, "providerStrategies")) {
      const current = await getSettings();
      body.providerStrategies = mergeProviderStrategies(current.providerStrategies || {}, body.providerStrategies);
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


    const { password, oidcClientSecret, jevApiKeys, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    safeSettings.jevApiKeysConfigured = Object.keys(jevApiKeys || {}).filter((k) => jevApiKeys[k]);
    safeSettings.comboStrategies = redactComboStrategies(safeSettings.comboStrategies);
    return NextResponse.json(safeSettings, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
