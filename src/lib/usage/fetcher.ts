/**
 * Usage Fetcher - legacy compatibility wrapper.
 *
 * Keep a single active usage-fetch implementation in `open-sse/services/usage`
 * so provider usage behavior does not drift across duplicate modules.
 */

import { getUsageForProvider as getActiveUsageForProvider } from "../../../open-sse/services/usage";

export async function getUsageForProvider(connection) {
  return getActiveUsageForProvider(connection);
}
