/**
 * Model Capabilities (Open-SSE Service)
 */

/**
 * Check if model supports tool calling
 * @param {string} modelStr - Model string
 * @returns {boolean}
 */
export function supportsToolCalling(modelStr) {
  const model = (modelStr || "").toLowerCase();
  
  const toolCapable = [
    "gpt-4", "gpt-3.5-turbo", "claude", "gemini-pro", "gemini-1.5",
    "deepseek-chat", "deepseek-coder", "qwen", "llama", "codex",
  ];
  
  return toolCapable.some(m => model.includes(m));
}
