/**
 * Antigravity CLI Auto-Switch Logic
 *
 * Manages which Antigravity account is active for the CLI by writing the
 * selected connection's OAuth tokens to ~/.gemini/antigravity-cli/antigravity-oauth-token.
 * This allows switching between multiple Antigravity accounts without
 * having to manually re-authenticate in the CLI.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import { getCurrentSettings, atomicUpdateCurrentSettings } from "./settingsAccess";
import { getCurrentProviderConnections } from "./connectionAccess";
import { getConnectionCentralizedStatus } from "./connectionStatus";

const ANTIGRAVITY_CLI_DIR = path.join(os.homedir(), ".gemini", "antigravity-cli");
const ANTIGRAVITY_OAUTH_TOKEN_PATH = path.join(ANTIGRAVITY_CLI_DIR, "antigravity-oauth-token");

interface AntigravityAutoSwitchConfig {
  enabled: boolean;
  activeConnectionId: string | null;
}

async function getConfig(): Promise<AntigravityAutoSwitchConfig> {
  try {
    const settings = await getCurrentSettings();
    const cfg = settings?.antigravityAutoSwitch || {};
    return {
      enabled: cfg.enabled === true,
      activeConnectionId: typeof cfg.activeConnectionId === "string" ? cfg.activeConnectionId : null,
    };
  } catch {
    return { enabled: false, activeConnectionId: null };
  }
}

/**
 * Persist the active connection ID (and optional rotation event) to settings.
 * Uses atomic update to avoid race conditions.
 *
 * - rotationEvent = { ... } → set rotation event
 * - rotationEvent = null → clear rotation events
 * - rotationEvent = undefined → preserve existing
 */
async function persistActiveConnection(
  connectionId: string | null,
  rotationEvent?: { lastRotatedFrom: string | null; lastRotatedTo: string } | null,
) {
  try {
    await atomicUpdateCurrentSettings((current: any) => ({
      antigravityAutoSwitch: {
        ...(current?.antigravityAutoSwitch || {}),
        enabled: current?.antigravityAutoSwitch?.enabled === true,
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
    console.error("[AntigravityAutoSwitch] Failed to persist active connection:", error);
  }
}

/**
 * Build the oauth token file content from a connection's credentials.
 */
function buildTokenFileContent(connection: any): string {
  const accessToken = connection.accessToken || connection.apiKey || "";
  const refreshToken = connection.refreshToken || "";
  const expiresIn = connection.expiresIn || 3600;

  const expiry = new Date(Date.now() + (typeof expiresIn === "number" ? expiresIn : 3600) * 1000).toISOString();

  const tokenFile = {
    token: {
      access_token: accessToken,
      token_type: "Bearer",
      refresh_token: refreshToken,
      expiry,
    },
    auth_method: "consumer",
  };

  return JSON.stringify(tokenFile, null, 2);
}

/**
 * Write the given connection's OAuth tokens to the Antigravity CLI token file.
 */
async function updateAntigravityAuthToken(connection: any): Promise<boolean> {
  try {
    await fs.mkdir(ANTIGRAVITY_CLI_DIR, { recursive: true });

    const token = connection.accessToken || connection.apiKey || "";
    if (!token) return false;

    const content = buildTokenFileContent(connection);
    await fs.writeFile(ANTIGRAVITY_OAUTH_TOKEN_PATH, content, { mode: 0o600 });

    return true;
  } catch (error) {
    console.error("[AntigravityAutoSwitch] Failed to update oauth token:", error);
    return false;
  }
}

/**
 * Find the next healthy Antigravity connection after the current one.
 * Uses round-robin: starts after activeConnectionId and wraps around.
 */
async function findNextHealthyConnection(
  activeConnectionId: string | null,
): Promise<any | null> {
  const connections = await getCurrentProviderConnections({
    provider: "antigravity",
    isActive: true,
  });

  if (!Array.isArray(connections) || connections.length === 0) return null;
  if (connections.length === 1) return null;

  const healthyConnections = connections.filter((c: any) => {
    if (c.id === activeConnectionId) return false;
    const status = getConnectionCentralizedStatus(c);
    if (status === "exhausted" || status === "blocked" || status === "disabled") return false;
    return true;
  });

  if (healthyConnections.length === 0) return null;

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

  return healthyConnections[0] || null;
}

/**
 * Check if auto-switch should rotate and do so if needed.
 */
export async function checkAndRotateAntigravityAccount(): Promise<string | null> {
  const config = await getConfig();
  if (!config.enabled) return null;

  const activeConnectionId = config.activeConnectionId;
  if (!activeConnectionId) {
    const firstHealthy = await findNextHealthyConnection(null);
    if (firstHealthy) {
      await updateAntigravityAuthToken(firstHealthy);
      await persistActiveConnection(firstHealthy.id);
      console.log(`[AntigravityAutoSwitch] Set initial active account: ${firstHealthy.id?.slice(0, 8)}`);
      return firstHealthy.id;
    }
    return null;
  }

  // Find the next healthy account
  const nextConnection = await findNextHealthyConnection(activeConnectionId);
  if (!nextConnection) {
    console.log("[AntigravityAutoSwitch] No healthy Antigravity account available for rotation");
    return null;
  }

  // Rotate: update token file + persist new active connection with rotation event
  const authUpdated = await updateAntigravityAuthToken(nextConnection);
  if (authUpdated) {
    await persistActiveConnection(nextConnection.id, {
      lastRotatedFrom: activeConnectionId,
      lastRotatedTo: nextConnection.id,
    });
    console.log(
      `[AntigravityAutoSwitch] Rotated: ${activeConnectionId?.slice(0, 8)} → ${nextConnection.id?.slice(0, 8)}`,
    );
    return nextConnection.id;
  }

  return null;
}

/**
 * Get info about the currently active Antigravity CLI account.
 */
export async function getActiveAntigravityAccount(): Promise<{
  connectionId: string | null;
  connectionName: string | null;
  email: string | null;
  projectId: string | null;
} | null> {
  const config = await getConfig();

  const connections = await getCurrentProviderConnections({
    provider: "antigravity",
    isActive: true,
  });

  let actualActiveId: string | null = null;
  try {
    const tokenDataRaw = await fs.readFile(ANTIGRAVITY_OAUTH_TOKEN_PATH, "utf-8");
    const tokenData = JSON.parse(tokenDataRaw);
    const currentToken = tokenData?.token?.access_token || tokenData?.token?.apiKey;
    if (currentToken) {
      const matchedConn = connections.find(
        (c: any) => c.accessToken === currentToken || c.apiKey === currentToken,
      );
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

  return {
    connectionId: conn.id || null,
    connectionName: conn.name || conn.email || conn.displayName || null,
    email: conn.email || null,
    projectId: conn.providerSpecificData?.projectId || null,
  };
}

/**
 * Manually set the active Antigravity CLI account.
 * Updates the antigravity-oauth-token file with the selected connection's tokens.
 */
export async function setActiveAntigravityAccount(connectionId: string | null): Promise<boolean> {
  if (!connectionId) {
    // Clear active connection AND rotation events
    await persistActiveConnection(null, null);
    return true;
  }

  const connections = await getCurrentProviderConnections({
    provider: "antigravity",
    isActive: true,
  });
  const conn = connections.find((c: any) => c.id === connectionId);
  if (!conn) return false;

  const authUpdated = await updateAntigravityAuthToken(conn);
  if (authUpdated) {
    // Clear rotation events on manual set
    await persistActiveConnection(connectionId, null);
    return true;
  }
  return false;
}
