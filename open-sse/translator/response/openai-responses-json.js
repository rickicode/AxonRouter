import { RESPONSES_ITEM } from "../../translator/schema/index.js";

export function responsesCompletionToOpenAI(responseBody) {
  if (!responseBody?.output || !Array.isArray(responseBody.output)) return responseBody;
  const message = { role: "assistant", content: "" };
  const toolCalls = [];
  const reasoning = [];
  for (const item of responseBody.output) {
    if (item?.type === RESPONSES_ITEM.MESSAGE) {
      for (const part of item.content || []) {
        if (part?.type === RESPONSES_ITEM.OUTPUT_TEXT && typeof part.text === "string") message.content += part.text;
      }
    } else if (item?.type === RESPONSES_ITEM.REASONING) {
      for (const part of item.summary || []) if (typeof part?.text === "string") reasoning.push(part.text);
    } else if (item?.type === RESPONSES_ITEM.FUNCTION_CALL || item?.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL) {
      toolCalls.push({ id: item.call_id || item.id || `call_${toolCalls.length}`, type: "function", function: { name: item.name || "", arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments || item.input || {}) } });
    }
  }
  if (toolCalls.length) message.tool_calls = toolCalls;
  if (reasoning.length) message.reasoning_content = reasoning.join("\n");
  const usage = responseBody.usage || {};
  return {
    id: `chatcmpl-${responseBody.id || Date.now()}`,
    object: "chat.completion",
    created: responseBody.created_at || Math.floor(Date.now() / 1000),
    model: responseBody.model || "unknown",
    choices: [{ index: 0, message, finish_reason: toolCalls.length ? "tool_calls" : responseBody.status === "incomplete" ? "length" : "stop" }],
    usage: { prompt_tokens: usage.input_tokens || 0, completion_tokens: usage.output_tokens || 0, total_tokens: usage.total_tokens || (usage.input_tokens || 0) + (usage.output_tokens || 0) },
  };
}
