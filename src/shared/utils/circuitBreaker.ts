/**
 * Circuit Breaker Utility
 * 
 * Provides per-model circuit breaker state tracking.
 * Used by combo routing to skip models that are consistently failing.
 */

type CircuitBreakerState = "CLOSED" | "HALF_OPEN" | "OPEN";

type CircuitBreakerConfig = {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  maxHalfOpenProbes: number;
};

type CircuitBreakerStatus = {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
};

const circuitBreakers = new Map<string, CircuitBreakerInstance>();
const MAX_CIRCUIT_BREAKERS = 200;

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 60000, // 1 minute
  maxHalfOpenProbes: 1,
};

export function getCircuitBreaker(key: string) {
  if (!circuitBreakers.has(key)) {
    // Evict oldest if at capacity
    if (circuitBreakers.size >= MAX_CIRCUIT_BREAKERS) {
      const oldestKey = circuitBreakers.keys().next().value;
      if (oldestKey) circuitBreakers.delete(oldestKey);
    }
    circuitBreakers.set(key, new CircuitBreakerInstance(key));
  }
  return circuitBreakers.get(key)!;
}

class CircuitBreakerInstance {
  key: string;
  failures: number;
  successes: number;
  state: CircuitBreakerState;
  lastFailureTime: number | null;
  halfOpenProbes: number;
  config: CircuitBreakerConfig;

  constructor(key: string) {
    this.key = key;
    this.failures = 0;
    this.successes = 0;
    this.state = "CLOSED";
    this.lastFailureTime = null;
    this.halfOpenProbes = 0;
    this.config = { ...DEFAULT_CONFIG };
  }

  recordSuccess() {
    if (this.state === "HALF_OPEN") {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = "CLOSED";
        this.failures = 0;
        this.successes = 0;
        this.halfOpenProbes = 0;
      }
    } else if (this.state === "CLOSED") {
      // Reset failure counter on success to track consecutive failures
      this.failures = 0;
    }
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.successes = 0;
      this.halfOpenProbes = 0;
    } else if (this.state === "CLOSED") {
      if (this.failures >= this.config.failureThreshold) {
        this.state = "OPEN";
      }
    }
  }

  canExecute(): boolean {
    if (this.state === "CLOSED") return true;
    
    if (this.state === "HALF_OPEN") {
      // Limit concurrent probes in HALF_OPEN
      if (this.halfOpenProbes >= this.config.maxHalfOpenProbes) {
        return false;
      }
      this.halfOpenProbes++;
      return true;
    }
    
    // OPEN state - check if timeout has passed
    if (this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.timeout) {
        this.state = "HALF_OPEN";
        this.successes = 0;
        this.halfOpenProbes = 1; // This request is the first probe
        return true;
      }
    }
    return false;
  }

  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset() {
    this.failures = 0;
    this.successes = 0;
    this.state = "CLOSED";
    this.lastFailureTime = null;
    this.halfOpenProbes = 0;
  }
}

export function resetCircuitBreaker(key: string) {
  const breaker = circuitBreakers.get(key);
  if (breaker) breaker.reset();
}

export function resetAllCircuitBreakers() {
  for (const [, breaker] of circuitBreakers) {
    breaker.reset();
  }
}
