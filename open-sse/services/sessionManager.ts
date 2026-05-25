/**
 * Session Manager
 * 
 * Manages session-to-connection mappings.
 */

const sessionConnections = new Map();

/**
 * Get session connection ID
 * @param {string} sessionId - Session ID
 * @returns {string|null} Connection ID
 */
export function getSessionConnection(sessionId) {
  if (!sessionId) return null;
  return sessionConnections.get(sessionId) || null;
}

/**
 * Set session connection mapping
 * @param {string} sessionId - Session ID
 * @param {string} connectionId - Connection ID
 */
export function setSessionConnection(sessionId, connectionId) {
  if (sessionId && connectionId) {
    sessionConnections.set(sessionId, connectionId);
  }
}

/**
 * Clear session connection
 * @param {string} sessionId - Session ID
 */
export function clearSessionConnection(sessionId) {
  if (sessionId) {
    sessionConnections.delete(sessionId);
  }
}
