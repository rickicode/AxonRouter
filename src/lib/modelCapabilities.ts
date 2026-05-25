/**
 * Model Capabilities
 * 
 * Provides model capability information for combo routing.
 */

/**
 * Get model context window limit
 * @param {string} provider - Provider ID
 * @param {string} model - Model ID
 * @returns {number} Context window size in tokens
 */
export function getModelContextLimit(provider, model) {
  // Default context limits by provider/model
  const defaults = {
    "openai/gpt-4": 128000,
    "openai/gpt-4-turbo": 128000,
    "openai/gpt-4o": 128000,
    "openai/gpt-4o-mini": 128000,
    "openai/gpt-3.5-turbo": 16385,
    "anthropic/claude-opus": 200000,
    "anthropic/claude-sonnet": 200000,
    "anthropic/claude-haiku": 200000,
    "google/gemini-pro": 32768,
    "google/gemini-flash": 131072,
    "deepseek/deepseek-chat": 64000,
    "deepseek/deepseek-coder": 64000,
  };
  
  const key = `${provider}/${model}`.toLowerCase();
  return defaults[key] || 32000;
}

/**
 * Check if model supports tool calling
 * @param {string} modelStr - Model string (provider/model)
 * @returns {boolean}
 */
export function supportsToolCalling(modelStr) {
  const model = modelStr?.toLowerCase() || "";
  
  // Models that support tool calling
  const toolCapable = [
    "gpt-4", "gpt-3.5-turbo", "claude", "gemini-pro", "gemini-1.5",
    "deepseek-chat", "deepseek-coder", "qwen", "llama",
  ];
  
  return toolCapable.some(m => model.includes(m));
}

/**
 * Get resolved model capabilities
 * @param {Object} options - { provider, model }
 * @returns {Object} Capabilities object
 */
export function getResolvedModelCapabilities({ provider, model }) {
  return {
    contextWindow: getModelContextLimit(provider, model),
    maxOutputTokens: 4096,
    supportsThinking: false,
  };
}
