const VALID_NAME = /^[a-zA-Z0-9_-]+$/;

export function sanitizeOpenAIFunctionName(name, fallback = "tool") {
  const raw = typeof name === "string" ? name.trim() : "";
  if (!raw) return fallback;
  if (VALID_NAME.test(raw)) return raw;
  const normalized = raw.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function sanitizeOpenAIToolChoice(choice) {
  if (!choice || typeof choice !== "object") return choice;
  if (choice.type === "function" && choice.function?.name) {
    return {
      ...choice,
      function: {
        ...choice.function,
        name: sanitizeOpenAIFunctionName(choice.function.name),
      },
    };
  }
  if (choice.type === "tool" && choice.name) {
    return {
      ...choice,
      name: sanitizeOpenAIFunctionName(choice.name),
    };
  }
  return choice;
}
