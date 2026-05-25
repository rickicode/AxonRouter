import { getUsageAnalyticsFromDb } from "@/lib/usageDb/queries/index";

export async function getUsageAnalytics(options = {}) {
  return getUsageAnalyticsFromDb(options);
}
