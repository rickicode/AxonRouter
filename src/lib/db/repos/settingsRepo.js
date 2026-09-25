import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";
import { getCatalog, invalidateCatalog } from "@/lib/cache/client.js";


const DEFAULT_SETTINGS = {
  stickyRoundRobinLimit: 3,
  providerStrategies: {},
  quotaVisibility: {},
  comboStrategy: "fallback",
  comboStickyRoundRobinLimit: 1,
  comboStrategies: {},
  defaultProxyGroupSettings: {},
  capacityAdapter: {
    vision: { enabled: true, roundRobin: false, models: [] },
    pdf: { enabled: false, roundRobin: false, models: [] },
    audioInput: { enabled: true, roundRobin: false, models: [] },
    videoInput: { enabled: false, roundRobin: false, models: [] },
  },
  requireLogin: true,
  requireApiKey: true,
  tunnelDashboardAccess: true,
  password: "$2b$10$xrgcy0aGADW76p.8smKPIeT8p/7F7pNr5z35TRhP366LIqFTOrfiy", // default: 12345677
  authMode: "password",
  ssoType: "oidc",
  oidcIssuerUrl: "",
  oidcClientId: "",
  oidcClientSecret: "",
  oidcScopes: "openid profile email",
  oidcLoginLabel: "Sign in with OIDC",
  samlEntryPoint: "",
  samlIssuer: "urn:axonrouter:sp",
  samlCert: "",
  samlLoginLabel: "Sign in with SAML SSO",
  samlAttributeEmail: "email",
  samlAttributeName: "name",
  enableObservability: false,
  observabilityMaxRecords: 1000,
  observabilityBatchSize: 20,
  observabilityFlushIntervalMs: 5000,
  observabilityMaxJsonSize: 5,
  outboundProxyEnabled: false,
  outboundProxyUrl: "",
  outboundNoProxy: "",
  rtkEnabled: true,
  cavemanLevel: "full",
  ponytailEnabled: false,
  ponytailLevel: "full",
  benchmarkRetentionDays: 30,
  usageRetentionDays: 7,
  usageMaxRecords: 100000,
  usagePartitionRetainMonths: 2,
};

const SETTINGS_CACHE_KEY = "axon:catalog:settings";
const SETTINGS_CACHE_TTL_S = 30;

async function readRaw() {
  return getCatalog(SETTINGS_CACHE_KEY, SETTINGS_CACHE_TTL_S, async () => {
    const db = await getAdapter();
    const row = await db.get("SELECT data FROM settings WHERE id = 1");
    return row ? parseJson(row.data, {}) : {};
  });
}

export function mergeWithDefaults(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  for (const [key, defVal] of Object.entries(DEFAULT_SETTINGS)) {
    if (merged[key] === undefined) {
      if (
        key === "outboundProxyEnabled" &&
        typeof merged.outboundProxyUrl === "string" &&
        merged.outboundProxyUrl.trim()
      ) {
        merged[key] = true;
      } else {
        merged[key] = defVal;
      }
    }
  }
  return merged;
}

export async function getSettings() {
  const raw = await readRaw();
  return mergeWithDefaults(raw);
}

export async function updateSettings(updates) {
  const db = await getAdapter();
  let next;
  const updatedAt = new Date().toISOString();

  await db.transaction(async (tx) => {
     const row = await tx.get("SELECT data FROM settings WHERE id = 1 FOR UPDATE");
    const current = row ? parseJson(row.data, {}) : {};
    next = { ...current, ...updates };
    await tx.run(
      `INSERT INTO settings(id, data, updated_at)
       VALUES(1, $1::jsonb, $2)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [next, updatedAt],
    );
  });

  invalidateCatalog(SETTINGS_CACHE_KEY).catch(() => {});
  return mergeWithDefaults(next);
}

export async function exportSettings() {
  return await readRaw();
}

export async function pingDb() {
  const db = await getAdapter();
  const res = await db.get("SELECT 1 as ok");
  return !!res?.ok;
}

export async function getDatabaseSize() {
  const db = await getAdapter();
  const res = await db.get("SELECT pg_size_pretty(pg_database_size(current_database())) AS size");
  return res?.size || null;
}
