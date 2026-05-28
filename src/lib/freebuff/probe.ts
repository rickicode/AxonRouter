export const FREEBUFF_BASE_URL = "https://www.codebuff.com";
export const FREEBUFF_DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
export const FREEBUFF_DEFAULT_AGENT_ID = "base2-free-deepseek-flash";
export const FREEBUFF_DEFAULT_CLIENT_ID = "axonrouter-freebuff-probe";

export type FreebuffAuthMethod = "manual-token" | "import-session" | "new-account-login";

export type FreebuffProbeCredential = {
  name?: string;
  apiKey: string;
  fingerprint?: string;
  accountId?: string;
  authMethod?: FreebuffAuthMethod;
  providerSpecificData?: Record<string, unknown>;
};

export type FreebuffSessionResponse = {
  status?: string;
  accessTier?: string;
  instanceId?: string;
  model?: string;
  resetAt?: string;
  recentCount?: number;
  retryAfterMs?: number;
  countryCode?: string;
  countryBlockReason?: string;
  [key: string]: unknown;
};

export type FreebuffRunStartRequest = {
  action: "START";
  agentId: string;
};

export type FreebuffCompletionRequest = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  codebuff_metadata: {
    run_id: string;
    client_id: string;
    cost_mode: "free";
  };
  provider: {
    order: string[];
    allow_fallbacks: boolean;
  };
};

export function buildFreebuffHeaders(apiKey: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "ai-sdk/openai-compatible/0.0.96/codebuff-freebuff",
    ...extra,
  };
}

export function buildFreebuffSessionUrl() {
  return `${FREEBUFF_BASE_URL}/api/v1/freebuff/session`;
}

export function buildFreebuffAgentRunsUrl() {
  return `${FREEBUFF_BASE_URL}/api/v1/agent-runs`;
}

export function buildFreebuffChatCompletionsUrl() {
  return `${FREEBUFF_BASE_URL}/api/v1/chat/completions`;
}

export function buildFreebuffRunStartRequest(agentId = FREEBUFF_DEFAULT_AGENT_ID): FreebuffRunStartRequest {
  return {
    action: "START",
    agentId,
  };
}

export function buildFreebuffCompletionRequest(options: {
  runId: string;
  prompt: string;
  clientId?: string;
  model?: string;
  providerOrder?: string[];
  maxTokens?: number;
}): FreebuffCompletionRequest {
  const providerOrder = options.providerOrder?.length ? options.providerOrder : ["deepseek"];

  return {
    model: options.model || FREEBUFF_DEFAULT_MODEL,
    messages: [{ role: "user", content: options.prompt }],
    max_tokens: options.maxTokens ?? 50,
    codebuff_metadata: {
      run_id: options.runId,
      client_id: options.clientId || FREEBUFF_DEFAULT_CLIENT_ID,
      cost_mode: "free",
    },
    provider: {
      order: providerOrder,
      allow_fallbacks: true,
    },
  };
}

export function extractFreebuffFingerprint(session: FreebuffSessionResponse | null | undefined) {
  if (!session || typeof session !== "object") return undefined;
  const direct = session.instanceId;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return undefined;
}

export function buildFreebuffCredentialRecord(input: FreebuffProbeCredential) {
  const authMethod = input.authMethod || "manual-token";
  const providerSpecificData: Record<string, unknown> = {
    ...(input.providerSpecificData || {}),
    authMethod,
  };

  if (input.fingerprint) providerSpecificData.fingerprint = input.fingerprint;
  if (input.accountId) providerSpecificData.accountId = input.accountId;

  return {
    provider: "freebuff",
    authType: "apikey",
    name: input.name || input.accountId || input.fingerprint || "Freebuff Account",
    apiKey: input.apiKey,
    providerSpecificData,
  };
}

export function isValidFreebuffCombo(agentId: string, model: string) {
  return agentId === FREEBUFF_DEFAULT_AGENT_ID && model === FREEBUFF_DEFAULT_MODEL;
}

export function explainFreebuffError(payload: any) {
  const code = payload?.error;
  if (code === "free_mode_invalid_agent_model") {
    return "Agent/model combo is invalid for free mode.";
  }
  if (code === "freebuff_update_required") {
    return "Runtime/session state is not accepted for free mode; restart freebuff and re-check session admission.";
  }
  if (code === "No runId found in request body") {
    return "Completion payload is missing codebuff_metadata.run_id.";
  }
  if (payload?.status === "rate_limited") {
    return "Freebuff daily session limit is exhausted until resetAt.";
  }
  return null;
}

export async function getFreebuffSession(apiKey: string) {
  const response = await fetch(buildFreebuffSessionUrl(), {
    method: "GET",
    headers: buildFreebuffHeaders(apiKey),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

export async function startFreebuffRun(apiKey: string, agentId = FREEBUFF_DEFAULT_AGENT_ID) {
  const response = await fetch(buildFreebuffAgentRunsUrl(), {
    method: "POST",
    headers: buildFreebuffHeaders(apiKey),
    body: JSON.stringify(buildFreebuffRunStartRequest(agentId)),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

export async function sendFreebuffCompletion(apiKey: string, options: {
  runId: string;
  prompt: string;
  clientId?: string;
  model?: string;
  providerOrder?: string[];
  maxTokens?: number;
}) {
  const response = await fetch(buildFreebuffChatCompletionsUrl(), {
    method: "POST",
    headers: buildFreebuffHeaders(apiKey),
    body: JSON.stringify(buildFreebuffCompletionRequest(options)),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}
