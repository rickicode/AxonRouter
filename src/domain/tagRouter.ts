/**
 * Tag Router
 * 
 * Provides routing tag matching for combo targets.
 */

/**
 * Get routing tags from a connection's provider-specific data
 * @param {Object} providerSpecificData - Connection's provider-specific data
 * @returns {Array} Array of tags
 */
export function getConnectionRoutingTags(providerSpecificData) {
  if (!providerSpecificData || typeof providerSpecificData !== "object") return [];
  
  const tags = providerSpecificData?.routingTags || 
               providerSpecificData?.tags ||
               providerSpecificData?.metadata?.tags ||
               [];
  
  return Array.isArray(tags) ? tags : [];
}

/**
 * Check if connection tags match request tags
 * @param {Array} connectionTags - Tags from connection
 * @param {Array} requestTags - Tags from request
 * @param {string} matchMode - Match mode: "all" | "any" | "none"
 * @returns {boolean} Whether tags match
 */
export function matchesRoutingTags(connectionTags, requestTags, matchMode = "all") {
  if (!requestTags || requestTags.length === 0) return true;
  if (!connectionTags || connectionTags.length === 0) {
    return matchMode === "none";
  }
  
  switch (matchMode) {
    case "all":
      return requestTags.every(tag => connectionTags.includes(tag));
    case "any":
      return requestTags.some(tag => connectionTags.includes(tag));
    case "none":
      return !requestTags.some(tag => connectionTags.includes(tag));
    default:
      return false;
  }
}

/**
 * Resolve routing tags from request body
 * @param {Object} body - Request body
 * @returns {Object} { tags, matchMode }
 */
export function resolveRequestRoutingTags(body) {
  if (!body) return { tags: [], matchMode: "all" };
  
  // Extract tags from various possible locations
  const tags = body.routingTags ||
               body.tags ||
               body.metadata?.routingTags ||
               [];
  
  const matchMode = body.routingTagMatchMode ||
                   body.routingTagMode ||
                   "all";
  
  return {
    tags: Array.isArray(tags) ? tags : [],
    matchMode: ["all", "any", "none"].includes(matchMode) ? matchMode : "all",
  };
}
