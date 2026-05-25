/**
 * Combo Agent Middleware
 * 
 * Applies system message overrides and tool filters to combo requests.
 */

/**
 * Apply combo agent middleware to request body
 * @param {Object} body - Request body
 * @param {Object} combo - Combo config
 * @param {string} provider - Provider name
 * @returns {Object} { body, pinnedModel }
 */
export function applyComboAgentMiddleware(body, combo, provider) {
  const resultBody = { ...body };
  let pinnedModel = null;
  
  // Apply system message override from combo config
  if (combo?.system_message && typeof combo.system_message === "string") {
    // Override system message (this is a simplified implementation)
    // Real implementation would merge with existing system message
    resultBody.system_message = combo.system_message;
  }
  
  // Extract pinned model from context caching tag
  if (body?.messages && Array.isArray(body.messages)) {
    const lastMsg = body.messages[body.messages.length - 1];
    const content = lastMsg?.content;
    if (typeof content === "string") {
      const match = content.match(/<omniModel>([^<]+)<\/omniModel>/);
      if (match) {
        pinnedModel = match[1];
        // Remove the tag from content
        resultBody.messages = [...body.messages.slice(0, -1), {
          ...lastMsg,
          content: content.replace(/<omniModel>[^<]+<\/omniModel>/g, "").trim(),
        }];
      }
    }
  }
  
  return { body: resultBody, pinnedModel };
}

/**
 * Inject model tag into messages
 * @param {Array} messages - Messages array
 * @param {string} model - Model string
 * @returns {Array} Messages with tag injected
 */
export function injectModelTag(messages, model) {
  if (!Array.isArray(messages) || !model) return messages;
  
  // Return messages with model tag appended
  return [...messages, {
    role: "assistant",
    content: `<omniModel>${model}</omniModel>`,
  }];
}
