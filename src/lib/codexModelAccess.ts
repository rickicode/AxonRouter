const CODEX_PREMIUM_MODEL_IDS = new Set<string>([]);

export function isCodexFreePlan(connection: any = {}) {
  if (connection?.provider !== "codex") return false;
  const planTypeRaw = String(connection?.providerSpecificData?.planTypeRaw || "").trim().toLowerCase();
  const planType = String(connection?.providerSpecificData?.planType || "").trim().toLowerCase();
  const usageWindowType = String(connection?.providerSpecificData?.usageWindowType || "").trim().toLowerCase();
  return planTypeRaw === "free" || planType === "free" || usageWindowType === "weekly_only";
}

export function isCodexPremiumModel(modelId: any) {
  const normalized = typeof modelId === "string" ? modelId.trim() : "";
  return CODEX_PREMIUM_MODEL_IDS.has(normalized);
}

export function canCodexConnectionUseModel(connection: any, modelId: any) {
  if (connection?.provider !== "codex") return true;
  if (!isCodexPremiumModel(modelId)) return true;
  return !isCodexFreePlan(connection);
}

export function filterCodexModelsForConnection(connection: any, models: any[] = []) {
  if (!Array.isArray(models) || models.length === 0) return [];
  return models.filter((model) => canCodexConnectionUseModel(connection, model?.id));
}

export function filterCodexModelsForConnections(connections: any[] = [], models: any[] = []) {
  if (!Array.isArray(models) || models.length === 0) return [];
  if (!Array.isArray(connections) || connections.length === 0) {
    return models.filter((model) => !isCodexPremiumModel(model?.id));
  }

  return models.filter((model) => {
    if (!isCodexPremiumModel(model?.id)) return true;
    return connections.some((connection) => canCodexConnectionUseModel(connection, model?.id));
  });
}
