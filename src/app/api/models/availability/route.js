import { NextResponse } from "next/server";
import {
  getUnavailableOrLockedConnections,
  getProviderConnections,
  updateProviderConnection,
} from "@/lib/localDb";
import { setAccountCooldown, setModelCooldown } from "@/lib/cache/client.js";

const MODEL_LOCK_PREFIX = "modelLock_";

function getActiveModelLocks(connection) {
  const now = Date.now();
  const locks = [];
  if (connection.lockedAllUntil && new Date(connection.lockedAllUntil).getTime() > now) {
    locks.push({
      model: "__all",
      until: connection.lockedAllUntil,
      active: true,
    });
  }
  const modelLocks = connection.modelLocks || {};
  for (const [model, until] of Object.entries(modelLocks)) {
    if (until && new Date(until).getTime() > now) {
      locks.push({
        model,
        until,
        active: true,
      });
    }
  }
  return locks;
}

export async function GET() {
  try {
    const connections = await getUnavailableOrLockedConnections();
    const models = [];

    for (const connection of connections) {
      const locks = getActiveModelLocks(connection);
      for (const lock of locks) {
        models.push({
          provider: connection.provider,
          model: lock.model,
          status: "cooldown",
          until: lock.until,
          connectionId: connection.id,
          connectionName: connection.name || connection.email || connection.id,
          lastError: connection.lastError || null,
        });
      }

      if (locks.length === 0 && connection.testStatus === "unavailable") {
        models.push({
          provider: connection.provider,
          model: "__all",
          status: "unavailable",
          connectionId: connection.id,
          connectionName: connection.name || connection.email || connection.id,
          lastError: connection.lastError || null,
        });
      }
    }

    return NextResponse.json({
      models,
      unavailableCount: models.length,
    });
  } catch (error) {
    console.error("[API] Failed to get model availability:", error);
    return NextResponse.json(
      { error: "Failed to fetch model availability" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const { action, provider, model } = await request.json();

    if (action !== "clearCooldown" || !provider || !model) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const connections = await getProviderConnections({ provider });
    const lockKey = `${MODEL_LOCK_PREFIX}${model}`;
    const isAll = model === "__all";

    await Promise.all(
      connections
        .filter((c) => c[lockKey] || c.modelLocks?.[model] || (isAll && (c.lockedAllUntil || c.rateLimitedUntil)))
        .map(async (connection) => {
          const patch = {
            [lockKey]: null,
            ...(isAll ? { lockedAllUntil: null, rateLimitedUntil: null } : {}),
            modelLocks: { ...(connection.modelLocks || {}), [model]: null },
            ...(connection.testStatus === "unavailable"
              ? {
                  testStatus: "active",
                  lastError: null,
                  lastErrorAt: null,
                  backoffLevel: 0,
                }
              : {}),
          };
          await updateProviderConnection(connection.id, patch);
          if (isAll) {
            setAccountCooldown(connection.id, 0).catch(() => {});
          } else {
            setModelCooldown(connection.id, model, 0).catch(() => {});
          }
        }),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API] Failed to clear model cooldown:", error);
    return NextResponse.json(
      { error: "Failed to clear cooldown" },
      { status: 500 },
    );
  }
}
