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

export type FreebuffCredentialLike = {
  providerSpecificData?: Record<string, unknown> | null;
  [key: string]: unknown;
} | null | undefined;

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
    freebuff_instance_id?: string;
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

export function buildFreebuffInstanceHeaders(instanceId?: string | null) {
  const normalized = typeof instanceId === "string" ? instanceId.trim() : "";
  return normalized ? { "X-Freebuff-Instance-Id": normalized } : {};
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
  freebuffInstanceId?: string;
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
      ...(options.freebuffInstanceId ? { freebuff_instance_id: options.freebuffInstanceId } : {}),
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

export function resolveFreebuffClientId(credentials?: FreebuffCredentialLike) {
  return resolveFreebuffInstanceId(credentials) || FREEBUFF_DEFAULT_CLIENT_ID;
}

export function resolveFreebuffInstanceId(credentials?: FreebuffCredentialLike) {
  const providerSpecificData = credentials?.providerSpecificData;
  const source = providerSpecificData && typeof providerSpecificData === "object"
    ? providerSpecificData
    : credentials && typeof credentials === "object"
      ? credentials
      : {};

  const candidateKeys = ["instanceId", "fingerprint", "fingerprintId", "accountId"];
  for (const key of candidateKeys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function isFreebuffSessionActive(session: FreebuffSessionResponse | null | undefined) {
  if (!session || typeof session !== "object") return false;
  if (session.status !== "active") return false;
  if (typeof session.remainingMs === "number" && session.remainingMs <= 0) return false;
  if (typeof session.expiresAt === "string") {
    const expiresAtMs = Date.parse(session.expiresAt);
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) return false;
  }
  return true;
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

export function parseFreebuffRetryAfterMs(payload: any) {
  if (!payload || typeof payload !== "object") return null;

  if (typeof payload.retryAfterMs === "number" && payload.retryAfterMs > 0) {
    return payload.retryAfterMs;
  }

  if (typeof payload.resetAt === "string") {
    const resetAtMs = Date.parse(payload.resetAt);
    if (Number.isFinite(resetAtMs) && resetAtMs > Date.now()) {
      return resetAtMs - Date.now();
    }
  }

  const text = [payload.message, payload.error, payload.status]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ");
  if (!text) return null;

  const retryMatch = text.match(/try again in\s+(\d+)\s*(second|seconds|minute|minutes|hour|hours)/i);
  if (!retryMatch) return null;

  const amount = Number(retryMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = retryMatch[2].toLowerCase();
  if (unit.startsWith("second")) return amount * 1000;
  if (unit.startsWith("minute")) return amount * 60 * 1000;
  if (unit.startsWith("hour")) return amount * 60 * 60 * 1000;
  return null;
}

export async function getFreebuffSession(apiKey: string, instanceId?: string) {
  const response = await fetch(buildFreebuffSessionUrl(), {
    method: "GET",
    headers: buildFreebuffHeaders(apiKey, buildFreebuffInstanceHeaders(instanceId)),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

export async function joinFreebuffSession(
  apiKey: string,
  model = FREEBUFF_DEFAULT_MODEL,
  instanceId?: string,
) {
  const response = await fetch(buildFreebuffSessionUrl(), {
    method: "POST",
    headers: buildFreebuffHeaders(apiKey, buildFreebuffInstanceHeaders(instanceId)),
    body: JSON.stringify({ model }),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

export async function ensureFreebuffSession(apiKey: string, options: {
  instanceId?: string;
  model?: string;
  forceJoin?: boolean;
} = {}) {
  if (options.forceJoin) {
    const join = await joinFreebuffSession(
      apiKey,
      options.model || FREEBUFF_DEFAULT_MODEL,
      options.instanceId,
    );
    return {
      active: isFreebuffSessionActive(join.data),
      session: null,
      join,
    };
  }

  const session = await getFreebuffSession(apiKey, options.instanceId);
  if (isFreebuffSessionActive(session.data)) {
    return { active: true, session, join: null };
  }

  const status = session.data?.status;
  if (status === "rate_limited" || status === "country_blocked" || status === "banned") {
    return { active: false, session, join: null };
  }

  const join = await joinFreebuffSession(
    apiKey,
    options.model || FREEBUFF_DEFAULT_MODEL,
    options.instanceId,
  );
  return {
    active: isFreebuffSessionActive(join.data),
    session,
    join,
  };
}

export async function startFreebuffRun(
  apiKey: string,
  agentId = FREEBUFF_DEFAULT_AGENT_ID,
  instanceId?: string,
) {
  const response = await fetch(buildFreebuffAgentRunsUrl(), {
    method: "POST",
    headers: buildFreebuffHeaders(apiKey, buildFreebuffInstanceHeaders(instanceId)),
    body: JSON.stringify(buildFreebuffRunStartRequest(agentId)),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

export async function sendFreebuffCompletion(apiKey: string, options: {
  runId: string;
  prompt: string;
  clientId?: string;
  freebuffInstanceId?: string;
  model?: string;
  providerOrder?: string[];
  maxTokens?: number;
}) {
  const response = await fetch(buildFreebuffChatCompletionsUrl(), {
    method: "POST",
    headers: buildFreebuffHeaders(
      apiKey,
      buildFreebuffInstanceHeaders(options.freebuffInstanceId),
    ),
    body: JSON.stringify(buildFreebuffCompletionRequest(options)),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}
