import {
  markProviderHotStateInvalidated,
  upsertHotState,
} from "./sqliteHelpers";
import { sqliteWriteGate } from "./sqliteWriteGate";
import { setConnectionHotState } from "./providerHotState";

export async function persistConnectionHotStateSnapshot(
  providerId: string,
  connectionId: string,
  state: Record<string, unknown>,
) {
  const storedState = sqliteWriteGate(() => {
    const stored = upsertHotState(providerId, connectionId, state);
    if (stored) {
      markProviderHotStateInvalidated(providerId);
    }
    return stored;
  });

  // Keep the in-process hot-state index in sync for /api/providers reads that
  // happen immediately after a manual usage refresh in the same server process.
  await setConnectionHotState(connectionId, providerId, storedState || state);
  return storedState;
}
