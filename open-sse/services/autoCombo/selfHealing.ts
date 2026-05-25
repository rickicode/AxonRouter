/**
 * Auto-Combo Self-Healing
 *
 * Features:
 *   - Temporary exclusion when score < 0.2
 *   - Circuit breaker awareness (OPEN → excluded, HALF_OPEN → probe)
 *   - Incident mode (>50% OPEN → exploitation only)
 *   - Cooldown recovery with progressive backoff
 */

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_COOLDOWN_MS = 30 * 60 * 1000;
const REENTRY_THRESHOLD = 0.3;
const EXCLUSION_THRESHOLD = 0.2;
const INCIDENT_MODE_THRESHOLD = 0.5;

export class SelfHealingManager {
  exclusions: Map<string, any>;
  incidentMode: boolean;

  constructor() {
    this.exclusions = new Map();
    this.incidentMode = false;
  }

  isExcluded(provider) {
    const entry = this.exclusions.get(provider);
    if (!entry) return false;
    if (Date.now() - entry.excludedAt > entry.cooldownMs) return false;
    return true;
  }

  evaluate(provider, score, circuitBreakerState) {
    const existing = this.exclusions.get(provider);

    if (
      existing &&
      score >= REENTRY_THRESHOLD &&
      Date.now() - existing.excludedAt > existing.cooldownMs
    ) {
      this.exclusions.delete(provider);
      return {
        excluded: false,
        reason: `Re-admitted: score ${score.toFixed(2)} >= ${REENTRY_THRESHOLD}`,
      };
    }

    if (this.isExcluded(provider)) {
      if (circuitBreakerState === "HALF_OPEN" && existing) {
        existing.probeCount++;
        return { excluded: false, isProbe: true, reason: `Probe request #${existing.probeCount}` };
      }
      return { excluded: true, reason: existing?.reason || "Excluded" };
    }

    if (score < EXCLUSION_THRESHOLD) {
      const cooldownMs = existing
        ? Math.min(existing.cooldownMs * 2, MAX_COOLDOWN_MS)
        : DEFAULT_COOLDOWN_MS;
      this.exclusions.set(provider, {
        provider,
        excludedAt: Date.now(),
        cooldownMs,
        reason: `Score ${score.toFixed(2)} < ${EXCLUSION_THRESHOLD}`,
        probeCount: 0,
      });
      return { excluded: true, reason: `Excluded: score ${score.toFixed(2)} below threshold` };
    }

    if (circuitBreakerState === "OPEN") {
      this.exclusions.set(provider, {
        provider,
        excludedAt: Date.now(),
        cooldownMs: DEFAULT_COOLDOWN_MS,
        reason: "Circuit breaker OPEN",
        probeCount: 0,
      });
      return { excluded: true, reason: "Circuit breaker OPEN" };
    }

    return { excluded: false };
  }

  recordProbeResult(provider, success) {
    const entry = this.exclusions.get(provider);
    if (!entry) return;

    if (success && entry.probeCount >= 3) {
      this.exclusions.delete(provider);
    } else if (!success) {
      entry.cooldownMs = Math.min(entry.cooldownMs * 2, MAX_COOLDOWN_MS);
      entry.excludedAt = Date.now();
      entry.probeCount = 0;
    }
  }

  updateIncidentMode(circuitBreakerStates) {
    const total = circuitBreakerStates.length;
    if (total === 0) {
      this.incidentMode = false;
      return false;
    }

    const openCount = circuitBreakerStates.filter((s) => s === "OPEN").length;
    this.incidentMode = openCount / total > INCIDENT_MODE_THRESHOLD;
    return this.incidentMode;
  }

  isInIncidentMode() {
    return this.incidentMode;
  }

  getExclusions() {
    return [...this.exclusions.values()];
  }

  getStatus() {
    const now = Date.now();
    return {
      exclusionCount: this.exclusions.size,
      incidentMode: this.incidentMode,
      exclusions: [...this.exclusions.values()].map((e) => ({
        provider: e.provider,
        reason: e.reason,
        remainingMs: Math.max(0, e.cooldownMs - (now - e.excludedAt)),
      })),
    };
  }
}

let _instance = null;
export function getSelfHealingManager() {
  if (!_instance) _instance = new SelfHealingManager();
  return _instance;
}
