import { v4 as uuidv4 } from "uuid";
import { clearHotStateForProvider, markProviderHotStateInvalidated } from "../localDbStorage";
import { clearProviderHotState, deleteConnectionHotState, extractHotState, mergeConnectionsWithHotState, setConnectionHotState, isHotOnlyUpdate } from "../providerHotState";
import {
  isPlainObject,
  stripLegacyMirrorStatusPatch,
  stripLegacyMirrorStatusFields,
  normalizeStoredProviderSpecificData,
  shouldSeedEligibility,
  buildEligibilityRecoveryPatch,
} from "./normalize";
import {
  getDb,
  withLocalDbMutex,
  safeRead,
  persistDbWrite,
  persistCollectionEntityWrite,
  persistCollectionEntityDelete,
  persistCollectionEntitiesWrite,
  peekDbCacheArray,
  filterAndSortConnections,
  getProviderConnectionsWithFallback,
} from "./core";

export async function getProviderConnections(filter = {}) {
  const cached = peekDbCacheArray("providerConnections");
  if (cached !== null) {
    const filtered = filterAndSortConnections(cached, filter);
    return await mergeConnectionsWithHotState(filtered);
  }

  const connections = await getProviderConnectionsWithFallback(filter);
  return await mergeConnectionsWithHotState(connections);
}

export async function deleteProviderConnectionsByProvider(providerId) {
  const db = await getDb();
  let deletedCount = 0;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    const beforeCount = db.data.providerConnections.length;
    db.data.providerConnections = db.data.providerConnections.filter(
      (connection) => connection.provider !== providerId
    );
    deletedCount = beforeCount - db.data.providerConnections.length;
    await persistDbWrite(db);
  });
  if (deletedCount > 0) {
    clearHotStateForProvider(providerId);
    markProviderHotStateInvalidated(providerId);
    await clearProviderHotState(providerId);
  }
  return deletedCount;
}

export async function getProviderConnectionById(id) {
  const db = await getDb();
  const connection = db.data.providerConnections.find(c => c.id === id) || null;
  if (!connection) return null;
  const merged = await mergeConnectionsWithHotState([connection]);
  return merged[0] || connection;
}

export async function createProviderConnection(data) {
  if (!data || typeof data !== "object") throw new Error("Invalid connection data");
  if (!data.provider || typeof data.provider !== "string") throw new Error("provider is required");

  const db = await getDb();
  const normalizedData = stripLegacyMirrorStatusPatch(data || {});
  if (typeof normalizedData.email === "string") {
    normalizedData.email = normalizedData.email.trim().toLowerCase() || undefined;
  }

  let result;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    const now = new Date().toISOString();

    let existingIndex = -1;
    if (normalizedData.authType === "oauth" && normalizedData.email) {
      existingIndex = db.data.providerConnections.findIndex(
        c => c.provider === normalizedData.provider && c.authType === "oauth" && c.email === normalizedData.email
      );
    } else if (normalizedData.authType === "apikey" && normalizedData.name) {
      existingIndex = db.data.providerConnections.findIndex(
        c => c.provider === normalizedData.provider && c.authType === "apikey" && c.name === normalizedData.name
      );
    }

    if (existingIndex !== -1) {
      db.data.providerConnections[existingIndex] = {
        ...db.data.providerConnections[existingIndex],
        ...normalizedData,
        updatedAt: now,
      };

      if (shouldSeedEligibility(db.data.providerConnections[existingIndex])) {
        Object.assign(db.data.providerConnections[existingIndex], buildEligibilityRecoveryPatch());
      }

      await persistCollectionEntityWrite(db, "providerConnections", db.data.providerConnections[existingIndex]);
      result = db.data.providerConnections[existingIndex];
      return;
    }

    let connectionName = normalizedData.name || normalizedData.email || normalizedData.displayName || null;
    if (!connectionName && normalizedData.authType === "oauth") {
      if (normalizedData.email) {
        connectionName = normalizedData.email;
      } else if (normalizedData.displayName) {
        connectionName = normalizedData.displayName;
      } else {
        const existingCount = db.data.providerConnections.filter(
          c => c.provider === normalizedData.provider
        ).length;
        connectionName = `Account ${existingCount + 1}`;
      }
    }

    let connectionPriority = normalizedData.priority;
    if (!connectionPriority) {
      const providerConnections = db.data.providerConnections.filter(c => c.provider === normalizedData.provider);
      const maxPriority = providerConnections.reduce((max, c) => Math.max(max, c.priority || 0), 0);
      connectionPriority = maxPriority + 1;
    }

    const connection: any = {
      id: typeof normalizedData.id === "string" && normalizedData.id.trim() ? normalizedData.id : uuidv4(),
      provider: normalizedData.provider,
      authType: normalizedData.authType || "oauth",
      name: connectionName,
      priority: connectionPriority,
      isActive: normalizedData.isActive !== undefined ? normalizedData.isActive : true,
      createdAt: now,
      updatedAt: now,
    };

    if (normalizedData.routingStatus !== undefined) {
      connection.routingStatus = normalizedData.routingStatus;
    }
    if (normalizedData.healthStatus !== undefined) {
      connection.healthStatus = normalizedData.healthStatus;
    }
    if (normalizedData.quotaState !== undefined) {
      connection.quotaState = normalizedData.quotaState;
    }
    if (normalizedData.authState !== undefined) {
      connection.authState = normalizedData.authState;
    }
    if (normalizedData.reasonCode !== undefined) {
      connection.reasonCode = normalizedData.reasonCode;
    }
    if (normalizedData.reasonDetail !== undefined) {
      connection.reasonDetail = normalizedData.reasonDetail;
    }
    if (normalizedData.nextRetryAt !== undefined) {
      connection.nextRetryAt = normalizedData.nextRetryAt;
    }
    if (normalizedData.resetAt !== undefined) {
      connection.resetAt = normalizedData.resetAt;
    }
    if (normalizedData.lastCheckedAt !== undefined) {
      connection.lastCheckedAt = normalizedData.lastCheckedAt;
    }

    const optionalFields = [
      "displayName", "email", "globalPriority", "defaultModel",
      "accessToken", "refreshToken", "expiresAt", "tokenType",
      "scope", "idToken", "projectId", "apiKey",
      "expiresIn", "consecutiveUseCount"
    ];

    for (const field of optionalFields) {
      if (normalizedData[field] !== undefined && normalizedData[field] !== null) {
        connection[field] = normalizedData[field];
      }
    }

    const normalizedProviderSpecificData = normalizeStoredProviderSpecificData(
      connection.provider,
      normalizedData.providerSpecificData,
    );
    if (normalizedProviderSpecificData) {
      connection.providerSpecificData = normalizedProviderSpecificData;
    }

    if (shouldSeedEligibility(connection)) {
      Object.assign(connection, buildEligibilityRecoveryPatch());
    }

    db.data.providerConnections.push(connection);
    await persistCollectionEntityWrite(db, "providerConnections", connection);
    await reorderProviderConnectionsLocked(db, normalizedData.provider);
    result = connection;
  });

  return result;
}

function assertUniqueRoutingOrderLock(db: any, id: string, providerId: string, providerSpecificData: any) {
  // Locked order numbers stay reserved even while the account is temporarily unroutable.
  if (!providerSpecificData || providerSpecificData.routingOrderLocked !== true) return;

  const routingOrder = Number(providerSpecificData.routingOrder);
  if (!Number.isInteger(routingOrder) || routingOrder < 1) {
    throw new Error("Routing order must be a whole number greater than or equal to 1");
  }

  const conflict = (db.data.providerConnections || []).find((connection: any) => (
    connection.id !== id
    && connection.provider === providerId
    && connection.providerSpecificData?.routingOrderLocked === true
    && Number(connection.providerSpecificData?.routingOrder) === routingOrder
  ));

  if (conflict) throw new Error(`Routing order #${routingOrder} is already used`);
}

function mergeProviderSpecificDataForValidation(current: any, patch: any) {
  if (!patch || typeof patch !== "object") return null;
  return {
    ...(current?.providerSpecificData || {}),
    ...patch,
  };
}

async function syncActiveCliTokens(conn: any) {
  if (!conn || (conn.provider !== "antigravity" && conn.provider !== "codex")) return;
  try {
    if (conn.provider === "antigravity") {
      const { getCurrentSettings } = await import("../settingsAccess");
      const settings = await getCurrentSettings().catch(() => null);
      if (settings?.antigravityAutoSwitch?.enabled !== true) {
        return; // Auto-switch is disabled, do not touch the token file!
      }
      const activeId = settings?.antigravityAutoSwitch?.activeConnectionId;
      let isCurrentlyActive = (activeId === conn.id);
      if (!isCurrentlyActive) {
        const { getActiveAntigravityAccount } = await import("../antigravityAutoSwitch");
        const activeAcc = await getActiveAntigravityAccount().catch(() => null);
        if (activeAcc && activeAcc.connectionId === conn.id) {
          isCurrentlyActive = true;
        }
      }
      if (isCurrentlyActive) {
        const { setActiveAntigravityAccount } = await import("../antigravityAutoSwitch");
        await setActiveAntigravityAccount(conn.id).catch(() => null);
      }
    } else if (conn.provider === "codex") {
      const { getCurrentSettings } = await import("../settingsAccess");
      const settings = await getCurrentSettings().catch(() => null);
      if (settings?.codexAutoSwitch?.enabled !== true) {
        return; // Auto-switch is disabled, do not touch the auth.json file!
      }
      const activeId = settings?.codexAutoSwitch?.activeConnectionId;
      let isCurrentlyActive = (activeId === conn.id);
      if (!isCurrentlyActive) {
        const { getActiveCodexAccount } = await import("../codexAutoSwitch");
        const activeAcc = await getActiveCodexAccount().catch(() => null);
        if (activeAcc && activeAcc.connectionId === conn.id) {
          isCurrentlyActive = true;
        }
      }
      if (isCurrentlyActive) {
        const { setActiveCodexAccount } = await import("../codexAutoSwitch");
        await setActiveCodexAccount(conn.id).catch(() => null);
      }
    }
  } catch (err) {
    console.warn("[localDb/providers] CLI token sync error:", err);
  }
}

export async function updateProviderConnection(id, data) {
  const db = await getDb();
  let result = null;

  await withLocalDbMutex(async () => {
    await safeRead(db);

    const index = db.data.providerConnections.findIndex(c => c.id === id);
    if (index === -1) {
      result = null;
      return;
    }

    const providerId = db.data.providerConnections[index].provider;
    const current = db.data.providerConnections[index];
    const sanitizedInput = stripLegacyMirrorStatusPatch(data || {});
    if (typeof sanitizedInput.email === "string") {
      sanitizedInput.email = sanitizedInput.email.trim().toLowerCase() || undefined;
    }
    const hotStatePatch = extractHotState(sanitizedInput);
    const hasHotStateUpdates = Object.keys(hotStatePatch).length > 0;
    const { id: _stripId, provider: _stripProvider, createdAt: _stripCreatedAt, ...safeDbPatchFields } = Object.fromEntries(
      Object.entries(sanitizedInput).filter(([key]) => !(key in hotStatePatch))
    );
    const dbPatch = safeDbPatchFields;
    const shouldStoreHotState = isHotOnlyUpdate(sanitizedInput);

    const providerSpecificDataForValidation = mergeProviderSpecificDataForValidation(current, dbPatch.providerSpecificData);
    if (providerSpecificDataForValidation) {
      assertUniqueRoutingOrderLock(db, id, providerId, providerSpecificDataForValidation);
    }

    if (hasHotStateUpdates) {
      const hotStateResult = await setConnectionHotState(id, providerId, hotStatePatch);
      const persistedHotState = hotStateResult?.state || hotStatePatch;

      db.data.providerConnections[index] = stripLegacyMirrorStatusFields({
        ...db.data.providerConnections[index],
        ...dbPatch,
        ...persistedHotState,
        updatedAt: new Date().toISOString(),
      });

      if (db.data.providerConnections[index].providerSpecificData) {
        db.data.providerConnections[index].providerSpecificData = normalizeStoredProviderSpecificData(
          providerId,
          db.data.providerConnections[index].providerSpecificData,
        );
      }

      await persistCollectionEntityWrite(db, "providerConnections", db.data.providerConnections[index]);

      if (data.priority !== undefined) await reorderProviderConnectionsLocked(db, providerId);

      if (current && data.isActive === false) {
        await deleteConnectionHotState(id, providerId);
      }

      result = db.data.providerConnections[index];
      return;
    }

    db.data.providerConnections[index] = stripLegacyMirrorStatusFields({
      ...db.data.providerConnections[index],
      ...dbPatch,
      updatedAt: new Date().toISOString(),
    });

    if (db.data.providerConnections[index].providerSpecificData) {
      db.data.providerConnections[index].providerSpecificData = normalizeStoredProviderSpecificData(
        providerId,
        db.data.providerConnections[index].providerSpecificData,
      );
    }

    if (shouldSeedEligibility(db.data.providerConnections[index])) {
      Object.assign(db.data.providerConnections[index], buildEligibilityRecoveryPatch());
    }

    await persistCollectionEntityWrite(db, "providerConnections", db.data.providerConnections[index]);
    if (data.priority !== undefined) await reorderProviderConnectionsLocked(db, providerId);

    if (current && data.isActive === false) {
      await deleteConnectionHotState(id, providerId);
    }

    result = db.data.providerConnections[index];
  });

  if (result) {
    syncActiveCliTokens(result).catch(() => null);
  }

  return result;
}

export async function atomicUpdateProviderConnection(id, mutator) {
  const db = await getDb();
  let result = null;

  await withLocalDbMutex(async () => {
    await safeRead(db);

    const index = db.data.providerConnections.findIndex(c => c.id === id);
    if (index === -1) {
      result = null;
      return;
    }

    const current = db.data.providerConnections[index];
    const patch = await mutator({ ...current });
    if (!patch || typeof patch !== "object") {
      result = await mergeConnectionsWithHotState([db.data.providerConnections[index]]).then((connections) => connections[0] || db.data.providerConnections[index]);
      return;
    }

    const providerId = current.provider;
    const sanitizedInput = stripLegacyMirrorStatusPatch(patch);
    const hotStatePatch = extractHotState(sanitizedInput);
    const hasHotStateUpdates = Object.keys(hotStatePatch).length > 0;
    const { id: _stripId2, provider: _stripProvider2, createdAt: _stripCreatedAt2, ...safeAtomicFields } = Object.fromEntries(
      Object.entries(sanitizedInput).filter(([key]) => !(key in hotStatePatch))
    );
    const dbPatch = safeAtomicFields;
    if (Object.prototype.hasOwnProperty.call(dbPatch, "providerSpecificData")) {
      dbPatch.providerSpecificData = normalizeStoredProviderSpecificData(providerId, dbPatch.providerSpecificData);
    }
    const shouldStoreHotState = isHotOnlyUpdate(sanitizedInput);

    const providerSpecificDataForValidation = mergeProviderSpecificDataForValidation(current, dbPatch.providerSpecificData);
    if (providerSpecificDataForValidation) {
      assertUniqueRoutingOrderLock(db, id, providerId, providerSpecificDataForValidation);
    }

    if (hasHotStateUpdates) {
      const hotStateResult = await setConnectionHotState(id, providerId, hotStatePatch);
      const persistedHotState = hotStateResult?.state || hotStatePatch;

      db.data.providerConnections[index] = stripLegacyMirrorStatusFields({
        ...db.data.providerConnections[index],
        ...dbPatch,
        ...persistedHotState,
        updatedAt: new Date().toISOString(),
      });

      if (db.data.providerConnections[index].providerSpecificData) {
        db.data.providerConnections[index].providerSpecificData = normalizeStoredProviderSpecificData(
          providerId,
          db.data.providerConnections[index].providerSpecificData,
        );
      }

      await persistDbWrite(db);

      if (patch.priority !== undefined) await reorderProviderConnectionsLocked(db, providerId);

      if (current && patch.isActive === false) {
        await deleteConnectionHotState(id, providerId);
      }

      result = await mergeConnectionsWithHotState([db.data.providerConnections[index]]).then((connections) => connections[0] || db.data.providerConnections[index]);
      return;
    }

    db.data.providerConnections[index] = stripLegacyMirrorStatusFields({
      ...db.data.providerConnections[index],
      ...dbPatch,
      updatedAt: new Date().toISOString(),
    });

    if (db.data.providerConnections[index].providerSpecificData) {
      db.data.providerConnections[index].providerSpecificData = normalizeStoredProviderSpecificData(
        providerId,
        db.data.providerConnections[index].providerSpecificData,
      );
    }

    if (shouldSeedEligibility(db.data.providerConnections[index])) {
      Object.assign(db.data.providerConnections[index], buildEligibilityRecoveryPatch());
    }

    await persistDbWrite(db);
    if (patch.priority !== undefined) await reorderProviderConnectionsLocked(db, providerId);

    if (current && patch.isActive === false) {
      await deleteConnectionHotState(id, providerId);
    }

    result = await mergeConnectionsWithHotState([db.data.providerConnections[index]]).then((connections) => connections[0] || db.data.providerConnections[index]);
  });

  if (result) {
    syncActiveCliTokens(result).catch(() => null);
  }

  return result;
}

export async function deleteProviderConnection(id) {
  const db = await getDb();
  let success = false;
  let providerId = null;

  await withLocalDbMutex(async () => {
    await safeRead(db);

    const index = db.data.providerConnections.findIndex(c => c.id === id);
    if (index === -1) {
      success = false;
      return;
    }

    providerId = db.data.providerConnections[index].provider;
    db.data.providerConnections.splice(index, 1);
    await persistCollectionEntityDelete(db, "providerConnections", id);
    await reorderProviderConnectionsLocked(db, providerId);
    success = true;
  });

  if (success && providerId) {
    await deleteConnectionHotState(id, providerId);
  }

  return success;
}

async function reorderProviderConnectionsLocked(db: any, providerId: any) {
  if (!db.data.providerConnections) return;

  const providerConnections = db.data.providerConnections
    .filter((c: any) => c.provider === providerId)
    .sort((a: any, b: any) => {
      const pDiff = Number(a.priority || 0) - Number(b.priority || 0);
      if (pDiff !== 0) return pDiff;
      return Number(new Date(b.updatedAt || 0)) - Number(new Date(a.updatedAt || 0));
    });

  providerConnections.forEach((conn, index) => {
    conn.priority = index + 1;
  });

  await persistCollectionEntitiesWrite(db, "providerConnections", providerConnections);
}

export async function reorderProviderConnections(providerId) {
  const db = await getDb();
  await withLocalDbMutex(async () => {
    await safeRead(db);
    await reorderProviderConnectionsLocked(db, providerId);
  });
}

export async function cleanupProviderConnections() {
  const db = await getDb();
  const fieldsToCheck = [
    "displayName", "email", "globalPriority", "defaultModel",
    "accessToken", "refreshToken", "expiresAt", "tokenType",
    "scope", "idToken", "projectId", "apiKey", "testStatus",
    "lastTested", "lastError", "lastErrorType", "lastErrorAt", "rateLimitedUntil", "expiresIn", "errorCode",
    "consecutiveUseCount"
  ];

  let cleaned = 0;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    cleaned = 0;
    for (const connection of db.data.providerConnections) {
      for (const field of fieldsToCheck) {
        if (connection[field] === null || connection[field] === undefined) {
          delete connection[field];
          cleaned++;
        }
      }
      if (connection.providerSpecificData && Object.keys(connection.providerSpecificData).length === 0) {
        delete connection.providerSpecificData;
        cleaned++;
      }
    }

    if (cleaned > 0) await persistDbWrite(db);
  });
  return cleaned;
}
