type UsageProxyOutcomeModule = typeof import("@/lib/usageProxyOutcome");

async function loadUsageProxyOutcome(): Promise<UsageProxyOutcomeModule> {
  return import("@/lib/usageProxyOutcome");
}

export async function applyProxyOutcomeReport(report: InternalProxyOutcomeReport) {
  const mod = await loadUsageProxyOutcome();
  return mod.applyProxyOutcomeReport(report);
}

export type InternalProxyOutcomeReport = Record<string, unknown>;
