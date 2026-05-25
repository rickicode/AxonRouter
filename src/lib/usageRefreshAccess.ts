type RefreshUsageOptions = {
  runConnectionTest?: boolean;
};

export async function refreshUsageWithTransientSkip(
  connectionId: string,
  options: RefreshUsageOptions = {}
) {
  const { refreshConnectionUsage } = await import("@/lib/connectionUsageRefresh");
  return refreshConnectionUsage(connectionId, {
    ...options,
    skipTransientConnectivityErrors: true,
  });
}
