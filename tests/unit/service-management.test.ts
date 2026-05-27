import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { parseArgs } from "../../scripts/start.js";

// We test the service module functions by importing them directly.
// Since service.js uses process.getuid and execSync at the module level only
// inside function bodies, we can safely import and test the pure generators.
import {
  isRoot,
  detectInitSystem,
  generateSystemdUnit,
  generateInitdScript,
  SERVICE_COMMANDS,
} from "../../scripts/service.js";

describe("service management - root detection", () => {
  let originalGetuid: (() => number) | undefined;

  beforeEach(() => {
    originalGetuid = process.getuid;
  });

  afterEach(() => {
    if (originalGetuid) {
      process.getuid = originalGetuid;
    }
  });

  it("returns true when running as root (uid 0)", () => {
    process.getuid = () => 0;
    expect(isRoot()).toBe(true);
  });

  it("returns false when running as non-root user", () => {
    process.getuid = () => 1000;
    expect(isRoot()).toBe(false);
  });
});

describe("service management - init system detection", () => {
  it("detects systemd or initd based on systemctl availability", () => {
    const result = detectInitSystem();
    // In any environment, it should return one of the two valid values
    expect(["systemd", "initd"]).toContain(result);
  });
});

describe("service management - systemd unit generation", () => {
  it("generates a valid systemd unit file", () => {
    const unit = generateSystemdUnit("/usr/local/bin/axonrouter");

    expect(unit).toContain("[Unit]");
    expect(unit).toContain("Description=AxonRouter AI Router");
    expect(unit).toContain("After=network.target");
    expect(unit).toContain("StartLimitIntervalSec=300");
    expect(unit).toContain("StartLimitBurst=5");
    expect(unit).toContain("[Service]");
    expect(unit).toContain("ExecStart=/usr/local/bin/axonrouter");
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("RestartSec=5");
    expect(unit).toContain("Environment=NODE_ENV=production");
    expect(unit).toContain("Environment=PORT=12711");
    expect(unit).toContain("TimeoutStopSec=30");
    expect(unit).toContain("KillMode=control-group");
    expect(unit).toContain("[Install]");
    expect(unit).toContain("WantedBy=multi-user.target");
  });

  it("uses the provided exec path in ExecStart", () => {
    const unit = generateSystemdUnit("/custom/path/axonrouter");
    expect(unit).toContain("ExecStart=/custom/path/axonrouter");
  });
});

describe("service management - init.d script generation", () => {
  it("generates a valid LSB init.d script", () => {
    const script = generateInitdScript("/usr/local/bin/axonrouter");

    expect(script).toContain("### BEGIN INIT INFO");
    expect(script).toContain("### END INIT INFO");
    expect(script).toContain("# Provides:          axonrouter");
    expect(script).toContain("# Short-Description: AxonRouter AI Router");
    expect(script).toContain('DAEMON="/usr/local/bin/axonrouter"');
    expect(script).toContain('PIDFILE="/var/run/axonrouter.pid"');
    expect(script).toContain("NODE_ENV=production");
    expect(script).toContain("PORT=12711");
  });

  it("includes start/stop/restart/status functions", () => {
    const script = generateInitdScript("/usr/local/bin/axonrouter");

    expect(script).toContain("start()");
    expect(script).toContain("stop()");
    expect(script).toContain("restart()");
    expect(script).toContain("status()");
  });

  it("uses the provided exec path in DAEMON", () => {
    const script = generateInitdScript("/opt/bin/axonrouter");
    expect(script).toContain('DAEMON="/opt/bin/axonrouter"');
  });
});

describe("service management - SERVICE_COMMANDS export", () => {
  it("exports all expected service command handlers", () => {
    expect(SERVICE_COMMANDS).toHaveProperty("install-service");
    expect(SERVICE_COMMANDS).toHaveProperty("uninstall-service");
    expect(SERVICE_COMMANDS).toHaveProperty("check-service");
    expect(SERVICE_COMMANDS).toHaveProperty("start");
    expect(SERVICE_COMMANDS).toHaveProperty("stop");
    expect(SERVICE_COMMANDS).toHaveProperty("restart");

    // All handlers should be functions
    for (const [key, handler] of Object.entries(SERVICE_COMMANDS)) {
      expect(typeof handler).toBe("function");
    }
  });
});

describe("service management - CLI arg parsing integration", () => {
  it("detects install-service as positional command", () => {
    const result = parseArgs(["install-service"]);
    expect(result.serviceCommand).toBe("install-service");
    expect(result.forwardArgs).toEqual([]);
  });

  it("detects --install-service as flag command", () => {
    const result = parseArgs(["--install-service"]);
    expect(result.serviceCommand).toBe("install-service");
    expect(result.forwardArgs).toEqual([]);
  });

  it("detects uninstall-service as positional command", () => {
    const result = parseArgs(["uninstall-service"]);
    expect(result.serviceCommand).toBe("uninstall-service");
  });

  it("detects --uninstall-service as flag command", () => {
    const result = parseArgs(["--uninstall-service"]);
    expect(result.serviceCommand).toBe("uninstall-service");
  });

  it("detects check-service as positional command", () => {
    const result = parseArgs(["check-service"]);
    expect(result.serviceCommand).toBe("check-service");
  });

  it("detects --check-service as flag command", () => {
    const result = parseArgs(["--check-service"]);
    expect(result.serviceCommand).toBe("check-service");
  });

  it("detects start as positional command", () => {
    const result = parseArgs(["start"]);
    expect(result.serviceCommand).toBe("start");
  });

  it("detects --start as flag command", () => {
    const result = parseArgs(["--start"]);
    expect(result.serviceCommand).toBe("start");
  });

  it("detects stop as positional command", () => {
    const result = parseArgs(["stop"]);
    expect(result.serviceCommand).toBe("stop");
  });

  it("detects --stop as flag command", () => {
    const result = parseArgs(["--stop"]);
    expect(result.serviceCommand).toBe("stop");
  });

  it("detects restart as positional command", () => {
    const result = parseArgs(["restart"]);
    expect(result.serviceCommand).toBe("restart");
  });

  it("detects --restart as flag command", () => {
    const result = parseArgs(["--restart"]);
    expect(result.serviceCommand).toBe("restart");
  });

  it("returns null serviceCommand when no service command given", () => {
    const result = parseArgs(["--port", "3000"]);
    expect(result.serviceCommand).toBeNull();
    expect(result.port).toBe("3000");
  });

  it("preserves port along with service command", () => {
    const result = parseArgs(["--port", "3000", "install-service"]);
    expect(result.serviceCommand).toBe("install-service");
    expect(result.port).toBe("3000");
  });

  it("mcp subcommand is not confused with service commands", () => {
    const result = parseArgs(["mcp"]);
    expect(result.serviceCommand).toBeNull();
    expect(result.forwardArgs).toEqual(["mcp"]);
  });
});
