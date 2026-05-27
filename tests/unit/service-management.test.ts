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
  showHelp,
  runWithSudo,
  runWithSudoSilent,
  isUserSessionAvailable,
  getUserUnitPath,
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
    expect(unit).toContain("/usr/local/bin/axonrouter");
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
    expect(unit).toContain("/custom/path/axonrouter");
  });

  it("uses absolute node path in ExecStart to avoid shebang issues", () => {
    const unit = generateSystemdUnit("/usr/local/bin/axonrouter");
    // ExecStart should contain both node path and script path
    expect(unit).toContain(`ExecStart=${process.execPath} /usr/local/bin/axonrouter`);
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
    expect(script).toContain(`NODE="${process.execPath}"`);
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

  it("uses quoted paths in su invocation for privilege dropping", () => {
    const script = generateInitdScript("/usr/local/bin/axonrouter");
    expect(script).toContain('su - "$USER"');
    expect(script).toMatch(/su - "\$USER" -c "HOME='/);
  });
});

describe("service management - SERVICE_COMMANDS export", () => {
  it("exports all expected service command handlers", () => {
    expect(SERVICE_COMMANDS).toHaveProperty("install-service");
    expect(SERVICE_COMMANDS).toHaveProperty("uninstall-service");
    expect(SERVICE_COMMANDS).toHaveProperty("status");
    expect(SERVICE_COMMANDS).toHaveProperty("start");
    expect(SERVICE_COMMANDS).toHaveProperty("stop");
    expect(SERVICE_COMMANDS).toHaveProperty("restart");
    expect(SERVICE_COMMANDS).toHaveProperty("help");
    expect(SERVICE_COMMANDS).toHaveProperty("--help");

    // All handlers should be functions
    for (const [key, handler] of Object.entries(SERVICE_COMMANDS)) {
      expect(typeof handler).toBe("function");
    }
  });

  it("help and --help both point to showHelp", () => {
    expect(SERVICE_COMMANDS["help"]).toBe(showHelp);
    expect(SERVICE_COMMANDS["--help"]).toBe(showHelp);
  });
});

describe("service management - showHelp", () => {
  it("prints help text to console", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    showHelp();
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0];
    expect(output).toContain("AxonRouter");
    expect(output).toContain("install-service");
    expect(output).toContain("uninstall-service");
    expect(output).toContain("status");
    expect(output).toContain("start");
    expect(output).toContain("stop");
    expect(output).toContain("restart");
    expect(output).toContain("mcp");
    expect(output).toContain("help");
    expect(output).toContain("--port");
    spy.mockRestore();
  });
});

describe("service management - sudo helpers", () => {
  it("runWithSudo and runWithSudoSilent are exported functions", () => {
    expect(typeof runWithSudo).toBe("function");
    expect(typeof runWithSudoSilent).toBe("function");
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

  it("detects status as positional command", () => {
    const result = parseArgs(["status"]);
    expect(result.serviceCommand).toBe("status");
  });

  it("detects --status as flag command", () => {
    const result = parseArgs(["--status"]);
    expect(result.serviceCommand).toBe("status");
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

  it("detects help as positional command", () => {
    const result = parseArgs(["help"]);
    expect(result.serviceCommand).toBe("help");
    expect(result.forwardArgs).toEqual([]);
  });

  it("detects --help as flag command", () => {
    const result = parseArgs(["--help"]);
    expect(result.serviceCommand).toBe("help");
    expect(result.forwardArgs).toEqual([]);
  });
});
