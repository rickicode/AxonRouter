/**
 * Codex Auto-Switch Logic
 *
 * When a Codex account's remaining quota drops below the configured threshold,
 * automatically rotate to the next healthy Codex account and update the Codex
 * CLI's auth.json (~/.codex/auth.json) so the CLI uses the new account.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import { getCurrentSettings, atomicUpdateCurrentSettings } from "./settingsAccess";
import { getCurrentProviderConnections } from "./connectionAccess";
import { getConnectionCentralizedStatus } from "./connectionStatus";

const CODEX_DIR = path.join(os.homedir(), ".codex");
const CODEX_AUTH_PATH = path.join(CODEX_DIR, "auth.json");
const CODEX_CONFIG_PATH = path.join(CODEX_DIR, "config.toml");

interface CodexAutoSwitchConfig {
  enabled: boolean;
  thresholdPercent: number;
  activeConnectionId: string | null;
}

async function getConfig(): Promise<CodexAutoSwitchConfig> {
  try {
    const settings = await getCurrentSettings();
    const cfg = settings?.codexAutoSwitch || {};
    return {
      enabled: cfg.enabled === true,
      thresholdPercent: normalizeThreshold(cfg.thresholdPercent),
      activeConnectionId: typeof cfg.activeConnectionId === "string" ? cfg.activeConnectionId : null,
    };
  } catch {
    return { enabled: false, thresholdPercent: 10, activeConnectionId: null };
  }
}

function normalizeThreshold(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 10;
  return Math.max(1, Math.min(99, Math.round(num)));
}

/**
 * Parse the usageSnapshot JSON to extract quota info.
 */
function parseUsageSnapshot(conn: any): { quotas: Array<{ name: string; remainingPercentage?: number; used?: number; total?: number }> } {
  const raw = conn?.usageSnapshot;
  if (!raw) return { quotas: [] };

  let snapshot: any;
  try {
    snapshot = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { quotas: [] };
  }

  if (!snapshot?.quotas || typeof snapshot.quotas !== "object") return { quotas: [] };

  const quotas: Array<{ name: string; remainingPercentage?: number; used?: number; total?: number }> = [];
  for (const [name, q] of Object.entries(snapshot.quotas)) {
    const quota = q as any;
    if (!quota || typeof quota !== "object") continue;

    // Calculate remaining percentage
    let remainingPercentage: number | undefined;
    const explicitPct = quota.remainingPercentage;
    if (typeof explicitPct === "number" && explicitPct >= 0 && explicitPct <= 100) {
      remainingPercentage = explicitPct;
    }

    // Fallback: calculate from used/total
    if (remainingPercentage === undefined) {
      const used = typeof quota.used === "number" ? quota.used : undefined;
      const total = typeof quota.total === "number" ? quota.total : undefined;
      if (used !== undefined && total !== undefined && total > 0) {
        remainingPercentage = Math.round(((total - used) / total) * 100);
      }
    }

    quotas.push({ name, remainingPercentage, used: quota.used, total: quota.total });
  }

  return { quotas };
}

/**
 * Check if a specific Codex connection's remaining quota is below the threshold.
 */
async function isConnectionBelowThreshold(
  connectionId: string,
  thresholdPercent: number,
): Promise<boolean> {
  const connections = await getCurrentProviderConnections({
    provider: "codex",
    isActive: true,
  });
  const conn = connections.find((c: any) => c.id === connectionId);
  if (!conn) return false;

  const { quotas } = parseUsageSnapshot(conn);

  // Check session (5h) and weekly (7d) windows
  for (const quota of quotas) {
    const remainingPercent = quota.remainingPercentage ?? 100;
    if (remainingPercent <= thresholdPercent) {
      return true;
    }
  }

  return false;
}

/**
 * Find the next healthy Codex connection after the current one.
 * Uses round-robin selection: starts after activeConnectionId and wraps around.
 */
async function findNextHealthyConnection(
  activeConnectionId: string | null,
): Promise<any | null> {
  const connections = await getCurrentProviderConnections({
    provider: "codex",
    isActive: true,
  });

  if (!Array.isArray(connections) || connections.length === 0) return null;
  if (connections.length === 1) return null; // No other account to switch to

  // Filter out connections that are known to be exhausted/blocked
  const healthyConnections = connections.filter((c: any) => {
    if (c.id === activeConnectionId) return false;
    const status = getConnectionCentralizedStatus(c);
    if (status === "exhausted" || status === "blocked" || status === "disabled") return false;
    return true;
  });

  if (healthyConnections.length === 0) return null;

  // Find the index after the active connection, wrap around
  const activeIndex = connections.findIndex((c: any) => c.id === activeConnectionId);
  let startIndex = activeIndex >= 0 ? (activeIndex + 1) % connections.length : 0;
  const scanned = new Set<string>();

  while (scanned.size < connections.length) {
    const candidate = connections[startIndex];
    if (candidate && healthyConnections.some((h: any) => h.id === candidate.id)) {
      return candidate;
    }
    scanned.add(candidate?.id || "");
    startIndex = (startIndex + 1) % connections.length;
  }

  // Fallback: pick the first healthy connection
  return healthyConnections[0] || null;
}

/**
 * Update ~/.codex/auth.json with the given connection's access token.
 * Codex CLI reads OPENAI_API_KEY from auth.json.
 * Also ensures config.toml has the AxonRouter provider configured.
 */
async function updateCodexAuthJson(connection: any): Promise<boolean> {
  try {
    await fs.mkdir(CODEX_DIR, { recursive: true });

    let authData: Record<string, any> = {};
    try {
      const existing = await fs.readFile(CODEX_AUTH_PATH, "utf-8");
      authData = JSON.parse(existing);
    } catch {
      // File doesn't exist yet — start fresh
    }

    // Use accessToken (OAuth session token) as the OPENAI_API_KEY
    const token = connection.accessToken || connection.apiKey || "";
    if (!token) return false;

    authData.OPENAI_API_KEY = token;

    // Also populate the tokens block expected by Codex CLI
    if (connection.accessToken) {
      authData.tokens = {
        access_token: connection.accessToken,
        refresh_token: connection.refreshToken || "",
        id_token: connection.idToken || "",
        expires_in: connection.expiresIn || 3600,
        token_type: "Bearer",
      };
    } else {
      authData.tokens = {
        access_token: token,
        token_type: "Bearer",
      };
    }

    await fs.writeFile(CODEX_AUTH_PATH, JSON.stringify(authData, null, 2));

    return true;
  } catch (error) {
    console.error("[CodexAutoSwitch] Failed to update auth.json:", error);
    return false;
  }
}

/**
 * Ensure ~/.codex/config.toml has proper AxonRouter provider configuration.
 * If config.toml already has [model_providers.axonrouter], preserve its base_url.
 * If it doesn't exist or lacks AxonRouter config, create a minimal setup.
 */
async function ensureCodexConfigToml(): Promise<void> {
  try {
    const { parseTOML, stringifyTOML } = await import("confbox");

    await fs.mkdir(CODEX_DIR, { recursive: true });

    let parsed: Record<string, any> = {};
    let configExists = false;

    try {
      const existing = await fs.readFile(CODEX_CONFIG_PATH, "utf-8");
      if (existing.trim()) {
        parsed = parseTOML(existing) as Record<string, any>;
        configExists = true;
      }
    } catch {
      // File doesn't exist — will create fresh
    }

    // Check if already configured
    const hasAxonRouterProvider = parsed?.model_provider === "axonrouter" ||
      parsed?.model_providers?.axonrouter !== undefined;

    if (hasAxonRouterProvider) {
      // Already configured — no changes needed
      return;
    }

    // Determine base_url: read server's own URL or use default
    const port = process.env.PORT || "12711";
    const hostname = process.env.HOSTNAME || "127.0.0.1";
    const protocol = hostname === "0.0.0.0" || hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https";
    const baseUrl = `${protocol}://${hostname === "0.0.0.0" ? "127.0.0.1" : hostname}:${port}/v1`;

    // Set up AxonRouter as the provider
    parsed.model_provider = "axonrouter";
    if (!parsed.model_providers) parsed.model_providers = {};
    parsed.model_providers.axonrouter = {
      name: "AxonRouter",
      base_url: baseUrl,
      wire_api: "responses",
    };

    // Preserve model if already set
    if (!parsed.model) {
      parsed.model = "gpt-5.4";
    }

    const configContent = stringifyTOML(parsed);
    await fs.writeFile(CODEX_CONFIG_PATH, configContent);

    console.log("[CodexAutoSwitch] Created config.toml with AxonRouter provider");
  } catch (error) {
    // Non-critical — auth.json is the primary auth mechanism
    console.warn("[CodexAutoSwitch] Failed to ensure config.toml:", error);
  }
}

/**
 * Persist the active connection ID (and optional rotation event) to settings.
 * Uses atomic update to avoid race conditions between concurrent refreshes.
 *
 * - Call with rotationEvent = { ... } to set a new rotation event (auto-rotate).
 * - Call with rotationEvent = null to actively clear rotation events (manual switch).
 * - Call with rotationEvent = undefined (omitted) to preserve existing rotation events (initial set).
 */
async function persistActiveConnection(
  connectionId: string | null,
  rotationEvent?: { lastRotatedFrom: string | null; lastRotatedTo: string } | null,
) {
  try {
    await atomicUpdateCurrentSettings((current: any) => ({
      codexAutoSwitch: {
        ...(current?.codexAutoSwitch || {}),
        enabled: current?.codexAutoSwitch?.enabled === true,
        thresholdPercent: normalizeThreshold(current?.codexAutoSwitch?.thresholdPercent),
        activeConnectionId: connectionId,
        ...(rotationEvent !== undefined
          ? rotationEvent
            ? {
                lastRotatedAt: new Date().toISOString(),
                lastRotatedFrom: rotationEvent.lastRotatedFrom,
                lastRotatedTo: rotationEvent.lastRotatedTo,
              }
            : {
                lastRotatedAt: null,
                lastRotatedFrom: null,
                lastRotatedTo: null,
              }
          : {}),
      },
    }));
  } catch (error) {
    console.error("[CodexAutoSwitch] Failed to persist active connection:", error);
  }
}

export async function checkAndRotateCodexAccount(): Promise<string | null> {
  const config = await getConfig();
  if (!config.enabled) return null;

  const activeConnectionId = config.activeConnectionId;
  if (!activeConnectionId) {
    // No active account set — pick the first healthy one and set as active
    const firstHealthy = await findNextHealthyConnection(null);
    if (firstHealthy) {
      await updateCodexAuthJson(firstHealthy);
      await persistActiveConnection(firstHealthy.id);
      console.log(`[CodexAutoSwitch] Set initial active account: ${firstHealthy.id?.slice(0, 8)}`);
      return firstHealthy.id;
    }
    return null;
  }

  // Check if current active account is below threshold
  const needsRotation = await isConnectionBelowThreshold(activeConnectionId, config.thresholdPercent);
  if (!needsRotation) return null;

  // Find the next healthy account
  const nextConnection = await findNextHealthyConnection(activeConnectionId);
  if (!nextConnection) {
    console.log("[CodexAutoSwitch] No healthy Codex account available for rotation");
    return null;
  }

  // Rotate: update auth.json + persist new active connection with rotation event
  const authUpdated = await updateCodexAuthJson(nextConnection);
  if (authUpdated) {
    await persistActiveConnection(nextConnection.id, {
      lastRotatedFrom: activeConnectionId,
      lastRotatedTo: nextConnection.id,
    });
    console.log(
      `[CodexAutoSwitch] Rotated: ${activeConnectionId?.slice(0, 8)} → ${nextConnection.id?.slice(0, 8)}`,
    );
    return nextConnection.id;
  }

  return null;
}

/**
 * Get info about the currently active Codex account.
 */
export async function getActiveCodexAccount(): Promise<{
  connectionId: string | null;
  connectionName: string | null;
  email: string | null;
  planType: string | null;
  remainingPercent: number | null;
} | null> {
  const config = await getConfig();

  const connections = await getCurrentProviderConnections({
    provider: "codex",
    isActive: true,
  });

  let actualActiveId: string | null = null;
  try {
    const authDataRaw = await fs.readFile(CODEX_AUTH_PATH, "utf-8");
    const authData = JSON.parse(authDataRaw);
    const currentToken = authData.OPENAI_API_KEY || authData.tokens?.access_token;
    if (currentToken) {
      const matchedConn = connections.find((c: any) => c.accessToken === currentToken || c.apiKey === currentToken);
      if (matchedConn) {
        actualActiveId = matchedConn.id;
      }
    }
  } catch (error) {
    // Ignore read errors
  }

  const effectiveConnectionId = actualActiveId || config.activeConnectionId;
  if (!effectiveConnectionId) return null;

  const conn = connections.find((c: any) => c.id === effectiveConnectionId);
  if (!conn) return null;

  const { quotas } = parseUsageSnapshot(conn);

  // Get the minimum remaining percent across all quota windows
  let minRemaining = 100;
  for (const quota of quotas) {
    const pct = quota.remainingPercentage ?? 100;
    if (pct < minRemaining) minRemaining = pct;
  }

  return {
    connectionId: conn.id || null,
    connectionName: conn.name || conn.email || conn.displayName || null,
    email: conn.email || null,
    planType: conn.providerSpecificData?.planType || null,
    remainingPercent: minRemaining < 100 ? minRemaining : null,
  };
}

/**
 * Manually set the active Codex account (used by frontend).
 */
export async function setActiveCodexAccount(connectionId: string | null): Promise<boolean> {
  if (!connectionId) {
    // Clear active connection AND rotation events
    await persistActiveConnection(null, null);
    return true;
  }

  const connections = await getCurrentProviderConnections({
    provider: "codex",
    isActive: true,
  });
  const conn = connections.find((c: any) => c.id === connectionId);
  if (!conn) return false;

  const authUpdated = await updateCodexAuthJson(conn);
  if (authUpdated) {
    // Clear rotation events on manual set — user explicitly chose this account
    await persistActiveConnection(connectionId, null);
    return true;
  }
  return false;
}
