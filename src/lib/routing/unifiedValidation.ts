import { getUnifiedModeConfig } from "@/lib/routing/unifiedContract";

function hasMessages(body: any) {
  return Array.isArray(body?.messages) || Array.isArray(body?.input);
}

export function validateUnifiedRequestBody(body: any = {}) {
  const mode = typeof body?.mode === "string" ? body.mode : "text";
  const config = getUnifiedModeConfig(mode);
  if (!config) {
    return { ok: false, status: 400, code: "unsupported_mode", error: `Unsupported mode: ${String(mode)}` };
  }

  if (typeof body?.model !== "string" || !body.model.trim()) {
    return { ok: false, status: 400, code: "missing_model", error: "Missing required field: model" };
  }

  if (mode === "text" && !hasMessages(body)) {
    return { ok: false, status: 400, code: "missing_messages", error: "Text mode requires messages or input" };
  }

  if (mode === "image" && (typeof body?.prompt !== "string" || !body.prompt.trim())) {
    return { ok: false, status: 400, code: "missing_prompt", error: "Image mode requires prompt" };
  }

  if (mode === "audio" && (typeof body?.input !== "string" || !body.input.trim())) {
    return { ok: false, status: 400, code: "missing_input", error: "Audio mode requires input" };
  }

  if (mode === "video" && (typeof body?.prompt !== "string" || !body.prompt.trim())) {
    return { ok: false, status: 400, code: "missing_prompt", error: "Video mode requires prompt" };
  }

  return { ok: true, mode, config };
}
