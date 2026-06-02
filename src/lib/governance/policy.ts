import { getUsageAnalyticsFromDb } from "@/lib/usageDb/queries/analytics";

type LocalDbModule = typeof import("@/lib/localDb");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

async function resolveApiKeyPolicy(settings: any = {}, apiKey = null) {
  if (!apiKey) return null;
  const { getApiKeys } = await loadLocalDb();
  const keys = await getApiKeys();
  const keyRecord = (keys || []).find((entry) => entry.key === apiKey);
  if (!keyRecord?.id) return null;
  const policies = settings?.governance?.apiKeyPolicies || {};
  return policies[keyRecord.id] || null;
}

export async function evaluateGovernancePolicy({ settings = {}, providerId = null, apiKey = null, enterprise = null }: any = {}) {
  const governance = settings?.governance || {};
  if (governance.enabled !== true) {
    return { allowed: true, reasonCode: null, reasonDetail: null };
  }

  const apiKeyPolicy = await resolveApiKeyPolicy(settings, apiKey);
  const enterprisePolicy = enterprise || settings?.enterprise || {};

  const allowedProviders = Array.isArray(apiKeyPolicy?.allowedProviders)
    ? apiKeyPolicy.allowedProviders.filter(Boolean)
    : (Array.isArray(governance.allowedProviders)
        ? governance.allowedProviders.filter(Boolean)
        : []);
  if (allowedProviders.length > 0 && providerId && !allowedProviders.includes(providerId)) {
    return {
      allowed: false,
      reasonCode: "provider_not_allowed",
      reasonDetail: `${providerId} is not in governance allowlist`,
    };
  }

  const monthlyBudgetCapUsd = Number(apiKeyPolicy?.monthlyBudgetCapUsd ?? governance.monthlyBudgetCapUsd ?? 0);
  if (monthlyBudgetCapUsd > 0) {
    const analytics = getUsageAnalyticsFromDb({ period: "30d" });
    const totalCost = Number(analytics?.summary?.totalCost || 0);
    if (totalCost >= monthlyBudgetCapUsd) {
      return {
        allowed: false,
        reasonCode: "budget_cap_exceeded",
        reasonDetail: `30d spend ${totalCost.toFixed(2)} exceeds cap ${monthlyBudgetCapUsd.toFixed(2)}`,
      };
    }
  }

  if (enterprisePolicy?.complianceMode === "strict" && providerId && ["perplexity-web"].includes(providerId)) {
    return {
      allowed: false,
      reasonCode: "compliance_blocked_provider",
      reasonDetail: `${providerId} is blocked under strict compliance mode`,
    };
  }

  return { allowed: true, reasonCode: null, reasonDetail: null };
}
