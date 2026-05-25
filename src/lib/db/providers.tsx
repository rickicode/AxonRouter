/**
 * Provider Connections Database
 * 
 * Provides access to provider connection data.
 */

import { getProviderConnections as getAllProviderConnections } from "../localDb";

/**
 * Get provider connections
 * @param {Object} options - Filter options
 * @param {string} options.provider - Filter by provider ID
 * @param {boolean} options.isActive - Filter by active status
 * @returns {Promise<Array>} Array of connections
 */
type ProviderConnectionFilter = {
  provider?: string;
  isActive?: boolean;
};

type ProviderConnectionRecord = {
  provider?: string;
  isActive?: boolean;
};

export async function getProviderConnections({ provider, isActive }: ProviderConnectionFilter = {}) {
  try {
    const connections = (await getAllProviderConnections({ provider, isActive })) as ProviderConnectionRecord[];

    let filtered = connections;

    if (provider) {
      filtered = filtered.filter((c) => c.provider === provider);
    }

    if (typeof isActive === "boolean") {
      filtered = filtered.filter((c) => c.isActive === isActive);
    }

    return filtered;
  } catch (error) {
    console.warn("getProviderConnections failed:", error);
    return [];
  }
}

/**
 * Get connections for a specific provider
 * @param {string} providerId - Provider ID
 * @returns {Promise<Array>} Array of connections
 */
export async function getConnectionsForProvider(providerId: string) {
  return getProviderConnections({ provider: providerId });
}

/**
 * Get active connections count for a provider
 * @param {string} providerId - Provider ID
 * @returns {Promise<number>} Active connection count
 */
export async function getActiveConnectionCount(providerId: string) {
  const connections = await getProviderConnections({ provider: providerId, isActive: true });
  return connections.length;
}
