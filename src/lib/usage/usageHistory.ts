import { getActiveRequests as getLegacyActiveRequests } from "../usageDb";
import { getCanonicalUsageRowsFromDb, getRecentUsageRowsFromDb } from "../usageDb/queries/index";

type UsageHistoryOptions = {
  source?: string;
};

export async function getCanonicalUsageRows(options: UsageHistoryOptions = {}) {
  return getCanonicalUsageRowsFromDb(options as any);
}

export async function getUsageHistory(options: UsageHistoryOptions = {}) {
  return getCanonicalUsageRows(options);
}

export async function getRecentUsageRows(limit = 20, options: UsageHistoryOptions = {}) {
  return getRecentUsageRowsFromDb(limit, { source: options.source || "general" });
}

export async function getLiveActivity() {
  return getLegacyActiveRequests();
}
