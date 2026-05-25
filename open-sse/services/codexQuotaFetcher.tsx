/**
 * Codex Quota Fetcher
 * 
 * Fetches quota information for Codex/Claude Code connections.
 */

/**
 * Fetch quota information for a connection
 * @param {string} connectionId - Connection ID
 * @returns {Promise<Object>} Quota info
 */
export async function fetchCodexQuota(connectionId) {
  // Placeholder implementation - returns mock data
  // Real implementation would call the actual API
  
  try {
    const response = await fetch(`/api/connections/${connectionId}/quota`);
    if (!response.ok) {
      throw new Error("Failed to fetch quota");
    }
    return await response.json();
  } catch (error) {
    // Return mock data if API call fails
    return {
      percentUsed: 0.5,
      window5h: {
        resetAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        used: 50000,
        limit: 100000,
      },
      window7d: {
        resetAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        used: 200000,
        limit: 500000,
      },
    };
  }
}
