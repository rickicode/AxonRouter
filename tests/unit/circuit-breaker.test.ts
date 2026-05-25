import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("open-sse/utils/abort", () => {
  let settings = { enabled: true, failureThreshold: 5, resetTimeoutMs: 60000 };
  return {
    getCircuitBreakerSettings: () => settings,
    __setSettings: (s: any) => { settings = s; },
  };
});

import { circuitBreakerRegistry, CIRCUIT_STATE } from "open-sse/services/circuitBreaker";
import { __setSettings } from "open-sse/utils/abort";

describe("CircuitBreakerRegistry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    circuitBreakerRegistry.resetAll();
    ((__setSettings) as any)({ enabled: true, failureThreshold: 5, resetTimeoutMs: 60000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("circuit stays CLOSED below threshold (4 failures with threshold=5)", () => {
    for (let i = 0; i < 4; i++) {
      circuitBreakerRegistry.recordFailure("conn-1");
    }
    const status = circuitBreakerRegistry.getStatus("conn-1");
    expect(status.state).toBe(CIRCUIT_STATE.CLOSED);
    expect(status.failureCount).toBe(4);
    expect(circuitBreakerRegistry.canExecute("conn-1")).toBe(true);
  });

  it("circuit opens after 5 consecutive failures", () => {
    for (let i = 0; i < 5; i++) {
      circuitBreakerRegistry.recordFailure("conn-1");
    }
    const status = circuitBreakerRegistry.getStatus("conn-1");
    expect(status.state).toBe(CIRCUIT_STATE.OPEN);
    expect(status.failureCount).toBe(5);
  });

  it("canExecute returns false when OPEN", () => {
    for (let i = 0; i < 5; i++) {
      circuitBreakerRegistry.recordFailure("conn-1");
    }
    expect(circuitBreakerRegistry.canExecute("conn-1")).toBe(false);
  });

  it("circuit transitions to HALF_OPEN after resetTimeoutMs", () => {
    for (let i = 0; i < 5; i++) {
      circuitBreakerRegistry.recordFailure("conn-1");
    }
    expect(circuitBreakerRegistry.canExecute("conn-1")).toBe(false);

    vi.advanceTimersByTime(60000);

    expect(circuitBreakerRegistry.canExecute("conn-1")).toBe(true);
    const status = circuitBreakerRegistry.getStatus("conn-1");
    expect(status.state).toBe(CIRCUIT_STATE.HALF_OPEN);
  });

  it("canExecute returns true when HALF_OPEN (probe allowed)", () => {
    for (let i = 0; i < 5; i++) {
      circuitBreakerRegistry.recordFailure("conn-1");
    }
    vi.advanceTimersByTime(60000);
    // Transition to HALF_OPEN
    circuitBreakerRegistry.canExecute("conn-1");

    expect(circuitBreakerRegistry.canExecute("conn-1")).toBe(true);
  });

  it("successful probe closes circuit", () => {
    for (let i = 0; i < 5; i++) {
      circuitBreakerRegistry.recordFailure("conn-1");
    }
    vi.advanceTimersByTime(60000);
    circuitBreakerRegistry.canExecute("conn-1"); // triggers HALF_OPEN

    circuitBreakerRegistry.recordSuccess("conn-1");

    const status = circuitBreakerRegistry.getStatus("conn-1");
    expect(status.state).toBe(CIRCUIT_STATE.CLOSED);
    expect(status.failureCount).toBe(0);
    expect(circuitBreakerRegistry.canExecute("conn-1")).toBe(true);
  });

  it("failed probe re-opens circuit", () => {
    for (let i = 0; i < 5; i++) {
      circuitBreakerRegistry.recordFailure("conn-1");
    }
    vi.advanceTimersByTime(60000);
    circuitBreakerRegistry.canExecute("conn-1"); // triggers HALF_OPEN

    circuitBreakerRegistry.recordFailure("conn-1");

    const status = circuitBreakerRegistry.getStatus("conn-1");
    expect(status.state).toBe(CIRCUIT_STATE.OPEN);
    expect(circuitBreakerRegistry.canExecute("conn-1")).toBe(false);
  });

  it("recordSuccess resets failure count", () => {
    circuitBreakerRegistry.recordFailure("conn-1");
    circuitBreakerRegistry.recordFailure("conn-1");
    circuitBreakerRegistry.recordFailure("conn-1");

    circuitBreakerRegistry.recordSuccess("conn-1");

    const status = circuitBreakerRegistry.getStatus("conn-1");
    expect(status.state).toBe(CIRCUIT_STATE.CLOSED);
    expect(status.failureCount).toBe(0);
  });

  it("circuit breaker disabled (enabled=false) -> canExecute always returns true", () => {
    ((__setSettings) as any)({ enabled: false, failureThreshold: 5, resetTimeoutMs: 60000 });

    for (let i = 0; i < 10; i++) {
      circuitBreakerRegistry.recordFailure("conn-1");
    }

    expect(circuitBreakerRegistry.canExecute("conn-1")).toBe(true);
  });

  it("resetAll clears all breakers", () => {
    for (let i = 0; i < 5; i++) {
      circuitBreakerRegistry.recordFailure("conn-1");
      circuitBreakerRegistry.recordFailure("conn-2");
    }

    expect(circuitBreakerRegistry.canExecute("conn-1")).toBe(false);
    expect(circuitBreakerRegistry.canExecute("conn-2")).toBe(false);

    circuitBreakerRegistry.resetAll();

    expect(circuitBreakerRegistry.canExecute("conn-1")).toBe(true);
    expect(circuitBreakerRegistry.canExecute("conn-2")).toBe(true);
    expect(circuitBreakerRegistry.getAllStatuses()).toHaveLength(0);
  });

  it("getStatus returns retryAfterMs for OPEN circuit", () => {
    for (let i = 0; i < 5; i++) {
      circuitBreakerRegistry.recordFailure("conn-1");
    }
    vi.advanceTimersByTime(20000);

    const status = circuitBreakerRegistry.getStatus("conn-1");
    expect(status.state).toBe(CIRCUIT_STATE.OPEN);
    expect(status.retryAfterMs).toBe(40000);
  });

  it("getAllStatuses returns entries for all tracked connections", () => {
    circuitBreakerRegistry.recordFailure("conn-1");
    circuitBreakerRegistry.recordFailure("conn-2");

    const all = circuitBreakerRegistry.getAllStatuses();
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.connectionId).sort()).toEqual(["conn-1", "conn-2"]);
  });

  it("reset clears a specific breaker", () => {
    for (let i = 0; i < 5; i++) {
      circuitBreakerRegistry.recordFailure("conn-1");
      circuitBreakerRegistry.recordFailure("conn-2");
    }

    circuitBreakerRegistry.reset("conn-1");

    expect(circuitBreakerRegistry.canExecute("conn-1")).toBe(true);
    expect(circuitBreakerRegistry.canExecute("conn-2")).toBe(false);
  });
});
