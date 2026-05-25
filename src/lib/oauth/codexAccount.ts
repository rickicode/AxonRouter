function decodeJwtPayload(token: any) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(base64 + padding, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

const WORKSPACE_PLAN_TYPES = new Set([
  "team",
  "business",
  "enterprise",
  "edu",
  "hc",
  "self_serve_business_usage_based",
  "enterprise_cbp_usage_based",
]);

const CODEX_USAGE_WINDOW_TYPES = new Set([
  "weekly_only",
  "session_and_weekly",
  "unknown",
]);

const KNOWN_PLAN_LABELS = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  go: "Go",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
  edu: "Edu",
  hc: "Enterprise",
  self_serve_business_usage_based: "Self Serve Business Usage Based",
  enterprise_cbp_usage_based: "Enterprise CBP Usage Based",
};

export function normalizeCodexPlanLabel(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  return KNOWN_PLAN_LABELS[trimmed] || trimmed
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeCodexProviderSpecificData(input: any) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;

  const rawPlanType = typeof input.planTypeRaw === "string"
    ? input.planTypeRaw.trim() || undefined
    : undefined;
  const planType = typeof input.planType === "string"
    ? input.planType.trim() || undefined
    : normalizeCodexPlanLabel(rawPlanType);
  const chatgptUserId = typeof input.chatgptUserId === "string"
    ? input.chatgptUserId.trim() || undefined
    : undefined;
  const chatgptAccountId = typeof input.chatgptAccountId === "string"
    ? input.chatgptAccountId.trim() || undefined
    : undefined;
  const isWorkspaceAccount = typeof input.isWorkspaceAccount === "boolean"
    ? input.isWorkspaceAccount
    : Boolean(rawPlanType && WORKSPACE_PLAN_TYPES.has(rawPlanType));
  const hasSessionWindow = typeof input.hasSessionWindow === "boolean"
    ? input.hasSessionWindow
    : undefined;
  const hasWeeklyWindow = typeof input.hasWeeklyWindow === "boolean"
    ? input.hasWeeklyWindow
    : undefined;
  const usageWindowType = typeof input.usageWindowType === "string"
    && CODEX_USAGE_WINDOW_TYPES.has(input.usageWindowType)
      ? input.usageWindowType
      : undefined;

  const normalized = {
    ...input,
    ...(planType ? { planType } : {}),
    ...(rawPlanType ? { planTypeRaw: rawPlanType } : {}),
    ...(chatgptUserId ? { chatgptUserId } : {}),
    ...(chatgptAccountId ? { chatgptAccountId } : {}),
    ...(planType || rawPlanType || chatgptUserId || chatgptAccountId || input.isWorkspaceAccount !== undefined
      ? { isWorkspaceAccount }
      : {}),
    ...(hasSessionWindow !== undefined ? { hasSessionWindow } : {}),
    ...(hasWeeklyWindow !== undefined ? { hasWeeklyWindow } : {}),
    ...(usageWindowType ? { usageWindowType } : {}),
  };

  if (!planType) delete normalized.planType;
  if (!rawPlanType) delete normalized.planTypeRaw;
  if (!chatgptUserId) delete normalized.chatgptUserId;
  if (!chatgptAccountId) delete normalized.chatgptAccountId;
  if (!(planType || rawPlanType || chatgptUserId || chatgptAccountId || input.isWorkspaceAccount !== undefined)) {
    delete normalized.isWorkspaceAccount;
  }
  if (hasSessionWindow === undefined) delete normalized.hasSessionWindow;
  if (hasWeeklyWindow === undefined) delete normalized.hasWeeklyWindow;
  if (!usageWindowType) delete normalized.usageWindowType;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function getCodexUsageWindowMetadata(usage: any = {}) {
  const quotas = usage?.quotas && typeof usage.quotas === "object" ? usage.quotas : {};
  const hasSessionWindow = Boolean(quotas.session && typeof quotas.session === "object");
  const hasWeeklyWindow = Boolean(quotas.weekly && typeof quotas.weekly === "object");

  let usageWindowType: "weekly_only" | "session_and_weekly" | "unknown" = "unknown";
  if (hasSessionWindow) {
    usageWindowType = "session_and_weekly";
  } else if (hasWeeklyWindow) {
    usageWindowType = "weekly_only";
  }

  return {
    hasSessionWindow,
    hasWeeklyWindow,
    usageWindowType,
  };
}

export function mergeCodexUsageProviderSpecificData(current: any, usage: any = {}) {
  return normalizeCodexProviderSpecificData({
    ...(current && typeof current === "object" ? current : {}),
    ...(typeof usage?.plan === "string" && usage.plan.trim()
      ? {
          planTypeRaw: usage.plan.trim().toLowerCase(),
          planType: normalizeCodexPlanLabel(usage.plan.trim().toLowerCase()),
        }
      : {}),
    ...getCodexUsageWindowMetadata(usage),
  });
}

export function extractCodexIdentity(tokens: any = {}) {
  const idPayload: any = decodeJwtPayload(tokens.id_token) || {};
  const accessPayload: any = decodeJwtPayload(tokens.access_token) || {};
  const idAuthClaims = idPayload["https://api.openai.com/auth"] || {};
  const accessAuthClaims = accessPayload["https://api.openai.com/auth"] || {};
  const planTypeRaw = idAuthClaims.chatgpt_plan_type || accessAuthClaims.chatgpt_plan_type || undefined;

  const email =
    idPayload.email ||
    idPayload.preferred_username ||
    idPayload.sub ||
    accessPayload.email ||
    accessPayload.preferred_username ||
    accessPayload.sub ||
    tokens.email ||
    tokens.preferred_username ||
    tokens.sub ||
    undefined;

  return {
    email,
    name: email,
    providerSpecificData: normalizeCodexProviderSpecificData({
      planType: normalizeCodexPlanLabel(planTypeRaw),
      planTypeRaw,
      chatgptUserId:
        idAuthClaims.chatgpt_user_id ||
        idAuthClaims.user_id ||
        accessAuthClaims.chatgpt_user_id ||
        accessAuthClaims.user_id ||
        undefined,
      chatgptAccountId:
        idAuthClaims.chatgpt_account_id ||
        accessAuthClaims.chatgpt_account_id ||
        undefined,
      isWorkspaceAccount: Boolean(planTypeRaw && WORKSPACE_PLAN_TYPES.has(planTypeRaw)),
    }),
  };
}

export function extractCodexIdentityFromJwt(token: any) {
  const payload: any = decodeJwtPayload(token) || {};
  const authClaims = payload["https://api.openai.com/auth"] || {};

  return {
    email: payload.email || undefined,
    displayName: payload.name || payload.nickname || payload.preferred_username || payload.email || undefined,
    providerSpecificData: normalizeCodexProviderSpecificData({
      planTypeRaw: authClaims.chatgpt_plan_type || undefined,
      chatgptUserId: authClaims.chatgpt_user_id || authClaims.user_id || undefined,
      chatgptAccountId: authClaims.chatgpt_account_id || undefined,
    }),
  };
}
