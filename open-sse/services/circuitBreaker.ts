import { getCircuitBreakerSettings } from "../utils/abort";

/**
 * Circuit Breaker per connection.
 * States: CLOSED (normal) -> OPEN (blocked) -> HALF_OPEN (probing) -> CLOSED
 *
 * After N consecutive failures, circuit opens.
 * After resetTimeoutMs, circuit goes half-open (allows 1 probe).
 * If probe succeeds -> CLOSED. If probe fails -> re-OPEN.
 */

export const CIRCUIT_STATE = {
  CLOSED: "closed",
  OPEN: "open",
  HALF_OPEN: "half-open",
} as const;

type CircuitState = (typeof CIRCUIT_STATE)[keyof typeof CIRCUIT_STATE];

interface CircuitEntry {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number | null;
  openedAt: number | null;
}

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitEntry>;
  private lastCleanup: number;

  constructor() {
    this.breakers = new Map();
    this.lastCleanup = Date.now();
  }

  /** Check if a connection can execute (not blocked by circuit breaker) */
  canExecute(connectionId: string): boolean {
    const settings = getCircuitBreakerSettings();
    if (!settings.enabled) return true;

    const entry = this.breakers.get(connectionId);
    if (!entry) return true;

    if (entry.state === CIRCUIT_STATE.CLOSED) return true;

    if (entry.state === CIRCUIT_STATE.HALF_OPEN) return true;

    if (entry.state === CIRCUIT_STATE.OPEN) {
      const elapsed = Date.now() - (entry.openedAt || 0);
      if (elapsed >= settings.resetTimeoutMs) {
        entry.state = CIRCUIT_STATE.HALF_OPEN;
        return true;
      }
      return false;
    }

    return true;
  }

  /** Record a successful request - resets circuit to CLOSED */
  recordSuccess(connectionId: string): void {
    const settings = getCircuitBreakerSettings();
    if (!settings.enabled) return;

    const entry = this.breakers.get(connectionId);
    if (!entry) return;

    entry.state = CIRCUIT_STATE.CLOSED;
    entry.failureCount = 0;
    entry.lastFailureAt = null;
    entry.openedAt = null;
  }

  /** Record a failed request - increments failure count, may open circuit */
  recordFailure(connectionId: string): void {
    const settings = getCircuitBreakerSettings();
    if (!settings.enabled) return;

    let entry = this.breakers.get(connectionId);
    if (!entry) {
      entry = {
        state: CIRCUIT_STATE.CLOSED,
        failureCount: 0,
        lastFailureAt: null,
        openedAt: null,
      };
      this.breakers.set(connectionId, entry);
    }

    entry.failureCount++;
    entry.lastFailureAt = Date.now();

    if (entry.state === CIRCUIT_STATE.HALF_OPEN) {
      // Probe failed, re-open circuit
      entry.state = CIRCUIT_STATE.OPEN;
      entry.openedAt = Date.now();
      return;
    }

    if (entry.failureCount >= settings.failureThreshold) {
      entry.state = CIRCUIT_STATE.OPEN;
      entry.openedAt = Date.now();
    }

    this.maybeCleanup();
  }

  /** Get status of a specific breaker */
  getStatus(connectionId: string): CircuitEntry & { retryAfterMs: number } {
    const settings = getCircuitBreakerSettings();
    const entry = this.breakers.get(connectionId);
    const defaultEntry: CircuitEntry = {
      state: CIRCUIT_STATE.CLOSED,
      failureCount: 0,
      lastFailureAt: null,
      openedAt: null,
    };
    const current = entry || defaultEntry;
    let retryAfterMs = 0;

    if (current.state === CIRCUIT_STATE.OPEN && current.openedAt) {
      const elapsed = Date.now() - current.openedAt;
      retryAfterMs = Math.max(0, settings.resetTimeoutMs - elapsed);
    }

    return { ...current, retryAfterMs };
  }

  /** Get all breaker statuses */
  getAllStatuses(): Array<{ connectionId: string } & CircuitEntry & { retryAfterMs: number }> {
    const settings = getCircuitBreakerSettings();
    const results: Array<{ connectionId: string } & CircuitEntry & { retryAfterMs: number }> = [];

    for (const [connectionId, entry] of this.breakers) {
      let retryAfterMs = 0;
      if (entry.state === CIRCUIT_STATE.OPEN && entry.openedAt) {
        const elapsed = Date.now() - entry.openedAt;
        retryAfterMs = Math.max(0, settings.resetTimeoutMs - elapsed);
      }
      results.push({ connectionId, ...entry, retryAfterMs });
    }

    return results;
  }

  /** Reset a specific breaker */
  reset(connectionId: string): void {
    this.breakers.delete(connectionId);
  }

  /** Reset all breakers */
  resetAll(): void {
    this.breakers.clear();
  }

  /** Periodically clean up stale entries */
  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < CLEANUP_INTERVAL_MS) return;
    this.lastCleanup = now;

    for (const [id, entry] of this.breakers) {
      if (
        entry.state === CIRCUIT_STATE.CLOSED &&
        entry.failureCount === 0 &&
        (!entry.lastFailureAt || now - entry.lastFailureAt > CLEANUP_INTERVAL_MS)
      ) {
        this.breakers.delete(id);
      }
    }
  }
}

// Singleton instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
