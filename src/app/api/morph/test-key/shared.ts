export type MorphKeyStatus = "active" | "inactive" | "cooldown" | "exhausted" | "unknown";

export type MorphKeyStatusPatch = {
  status: MorphKeyStatus;
  isExhausted: boolean;
  lastCheckedAt: string | null;
  lastError: string;
  nextRetryAt: string | null;
};

export type BuildMorphKeyStatusPatchArgs = {
  status?: number;
  responseText?: string;
  fallbackLabel?: string;
};

const MORPH_429_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export function isMorphExhaustedResponse(status: number, responseText: string): boolean {
  const numericStatus = Number(status);
  if (![402, 403].includes(numericStatus)) {
    return false;
  }

  const text = String(responseText || "").toLowerCase();
  if (numericStatus === 402) return true;

  return text.includes("credit")
    || text.includes("quota")
    || text.includes("exhaust")
    || text.includes("rate limit")
    || text.includes("too many requests")
    || text.includes("insufficient")
    || text.includes("payment required")
    || text.includes("billing")
    || text.includes("monthly limit");
}

export function isMorphInvalidKeyResponse(status: number, responseText: string): boolean {
  if (![400, 401, 403].includes(Number(status))) {
    return false;
  }

  const text = String(responseText || "").toLowerCase();
  return text.includes("invalid api key")
    || text.includes("invalid_api_key")
    || text.includes("api key is invalid")
    || text.includes("invalid key")
    || text.includes("unauthorized")
    || text.includes("authentication")
    || text.includes("invalid bearer")
    || text.includes("bad credentials")
    || text.includes("token is invalid")
    || text.includes("token invalid");
}

export function buildMorphKeyStatusPatch({ status = 0, responseText = "", fallbackLabel = "" }: BuildMorphKeyStatusPatchArgs = {}): MorphKeyStatusPatch {
  const now = new Date().toISOString();
  const errorText = responseText || fallbackLabel || `HTTP ${status}`;

  if (status >= 200 && status < 300) {
    return {
      status: "active",
      isExhausted: false,
      lastCheckedAt: now,
      lastError: "",
      nextRetryAt: null,
    };
  }

  if (Number(status) === 429) {
    return {
      status: "cooldown",
      isExhausted: false,
      lastCheckedAt: now,
      lastError: errorText,
      nextRetryAt: new Date(Date.now() + MORPH_429_COOLDOWN_MS).toISOString(),
    };
  }

  if (isMorphExhaustedResponse(status, responseText)) {
    return {
      status: "exhausted",
      isExhausted: true,
      lastCheckedAt: now,
      lastError: errorText,
      nextRetryAt: null,
    };
  }

  if (isMorphInvalidKeyResponse(status, responseText)) {
    return {
      status: "inactive",
      isExhausted: false,
      lastCheckedAt: now,
      lastError: errorText,
      nextRetryAt: null,
    };
  }

  return {
    status: "unknown",
    isExhausted: false,
    lastCheckedAt: now,
    lastError: errorText,
    nextRetryAt: null,
  };
}
