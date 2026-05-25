type ProductionConfigIssue = {
  code: string;
  message: string;
};

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function getProductionConfigIssues() {
  const issues: ProductionConfigIssue[] = [];
  // All secrets are now auto-generated and persisted to AxonRouter home storage.
  // No env vars are required for production startup.
  return issues;
}

export function assertProductionConfigReady() {
  if (!isProductionRuntime()) return;

  const issues = getProductionConfigIssues();
  if (issues.length === 0) return;

  const detail = issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
  throw new Error(`AxonRouter production configuration is not safe:\n${detail}`);
}
