function parseSnapshot(value: any): any {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function buildCodexSyntheticSnapshot(
  connection: any = {},
  snapshot: any = {},
  { checkedAt = new Date().toISOString() }: { checkedAt?: string } = {},
) {
  const previousSnapshot: any = parseSnapshot(connection?.usageSnapshot);
  const reasonDetail = snapshot?.message || connection?.reasonDetail || null;
  const quotas = snapshot?.quotas && typeof snapshot.quotas === "object"
    ? snapshot.quotas
    : (previousSnapshot?.quotas && typeof previousSnapshot?.quotas === "object"
        ? previousSnapshot.quotas
        : {});

  const nextSnapshot: any = {
    provider: connection?.provider || "codex",
    checkedAt,
    ...previousSnapshot,
    ...snapshot,
    quotas,
  };

  if (!nextSnapshot.message && reasonDetail) {
    nextSnapshot.message = reasonDetail;
  }
  if (!nextSnapshot.resetAt && (snapshot?.resetAt || connection?.resetAt)) {
    nextSnapshot.resetAt = snapshot?.resetAt || connection?.resetAt;
  }
  if (!nextSnapshot.nextRetryAt && (snapshot?.nextRetryAt || connection?.nextRetryAt)) {
    nextSnapshot.nextRetryAt = snapshot?.nextRetryAt || connection?.nextRetryAt;
  }

  return nextSnapshot;
}

export function ensureUsageSnapshot(
  connection: any,
  updates: any = {},
  { checkedAt }: { checkedAt?: string } = {},
) {
  if (updates?.usageSnapshot !== undefined && updates?.usageSnapshot !== null) {
    return updates;
  }

  const syntheticSnapshot: any = {
    provider: connection?.provider || null,
    checkedAt: checkedAt || new Date().toISOString(),
    message: updates?.reasonDetail || updates?.reasonCode || "Status updated",
    routingStatus: updates?.routingStatus || null,
    quotaState: updates?.quotaState || null,
    authState: updates?.authState || null,
    healthStatus: updates?.healthStatus || null,
    ...(updates?.resetAt ? { resetAt: updates.resetAt } : {}),
    ...(updates?.nextRetryAt ? { nextRetryAt: updates.nextRetryAt } : {}),
  };

  if (connection?.provider === "codex") {
    const codexSnapshot = buildCodexSyntheticSnapshot(connection, {
      message: updates?.reasonDetail || null,
      resetAt: updates?.resetAt || null,
      nextRetryAt: updates?.nextRetryAt || null,
    }, { checkedAt });

    return {
      ...updates,
      usageSnapshot: JSON.stringify(codexSnapshot),
    };
  }

  return {
    ...updates,
    usageSnapshot: JSON.stringify(syntheticSnapshot),
  };
}
