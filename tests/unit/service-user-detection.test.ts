import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateSystemdUnit, generateInitdScript, getInstallingUser, getInstallingUserHome, isUserSessionAvailable, getUserUnitPath } from "../../scripts/service.js";

describe("service user detection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubEnv("SUDO_USER", "");
    vi.stubEnv("SUDO_GID", "");
    delete process.env.SUDO_USER;
    delete process.env.SUDO_GID;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getInstallingUser()", () => {
    it("should use SUDO_USER when set", () => {
      process.env.SUDO_USER = "ricki";
      process.env.SUDO_GID = "1000";

      const result = getInstallingUser();
      expect(result.user).toBe("ricki");
      expect(result.home).toBeTruthy();
    });

    it("should fall back to os.userInfo() when SUDO_USER is not set", () => {
      delete process.env.SUDO_USER;
      delete process.env.SUDO_GID;

      const result = getInstallingUser();
      expect(result.user).toBeTruthy();
      expect(typeof result.user).toBe("string");
      expect(result.group).toBeTruthy();
      expect(result.home).toBeTruthy();
    });
  });

  describe("getInstallingUserHome()", () => {
    it("should return /root for root user", () => {
      expect(getInstallingUserHome("root")).toBe("/root");
    });

    it("should resolve home for a regular user", () => {
      const home = getInstallingUserHome("testuser");
      expect(home).toBeTruthy();
      expect(typeof home).toBe("string");
    });
  });

  describe("generateSystemdUnit()", () => {
    it("should contain User= directive when SUDO_USER is set", () => {
      process.env.SUDO_USER = "ricki";
      process.env.SUDO_GID = "1000";

      const unit = generateSystemdUnit("/home/ricki/.nvm/versions/node/v22.6.0/bin/axonrouter");
      expect(unit).toContain("User=ricki");
    });

    it("should always contain User= directive", () => {
      delete process.env.SUDO_USER;

      const unit = generateSystemdUnit("/usr/local/bin/axonrouter");
      expect(unit).toMatch(/User=\S+/);
    });

    it("should always contain Group= directive", () => {
      const unit = generateSystemdUnit("/usr/local/bin/axonrouter");
      expect(unit).toMatch(/Group=\S+/);
    });

    it("should always contain WorkingDirectory= directive", () => {
      const unit = generateSystemdUnit("/usr/local/bin/axonrouter");
      expect(unit).toMatch(/WorkingDirectory=\S+/);
    });

    it("should derive WorkingDirectory from execPath (one level up from bin)", () => {
      const unit = generateSystemdUnit("/home/ricki/.nvm/versions/node/v22.6.0/bin/axonrouter");
      expect(unit).toContain("WorkingDirectory=/home/ricki/.nvm/versions/node/v22.6.0");
    });

    it("should contain Environment=HOME= directive", () => {
      process.env.SUDO_USER = "ricki";
      process.env.SUDO_GID = "1000";

      const unit = generateSystemdUnit("/home/ricki/.nvm/versions/node/v22.6.0/bin/axonrouter");
      expect(unit).toMatch(/Environment=HOME=\S+/);
    });
  });

  describe("generateInitdScript()", () => {
    it("should contain USER variable", () => {
      process.env.SUDO_USER = "ricki";
      process.env.SUDO_GID = "1000";

      const script = generateInitdScript("/home/ricki/.nvm/versions/node/v22.6.0/bin/axonrouter");
      expect(script).toContain('USER="ricki"');
    });

    it("should contain GROUP variable", () => {
      const script = generateInitdScript("/usr/local/bin/axonrouter");
      expect(script).toMatch(/GROUP="/);
    });

    it("should contain su command for privilege dropping", () => {
      process.env.SUDO_USER = "ricki";

      const script = generateInitdScript("/home/ricki/.nvm/versions/node/v22.6.0/bin/axonrouter");
      expect(script).toContain("su - ");
      expect(script).toContain("$USER");
    });

    it("should export HOME in the script", () => {
      const script = generateInitdScript("/usr/local/bin/axonrouter");
      expect(script).toMatch(/export HOME=/);
    });
  });

  describe("generateSystemdUnit() with userMode", () => {
    it("should NOT contain User= directive in user mode", () => {
      const unit = generateSystemdUnit("/usr/local/bin/axonrouter", undefined, { userMode: true });
      expect(unit).not.toMatch(/^User=/m);
    });

    it("should NOT contain Group= directive in user mode", () => {
      const unit = generateSystemdUnit("/usr/local/bin/axonrouter", undefined, { userMode: true });
      expect(unit).not.toMatch(/^Group=/m);
    });

    it("should use WantedBy=default.target in user mode", () => {
      const unit = generateSystemdUnit("/usr/local/bin/axonrouter", undefined, { userMode: true });
      expect(unit).toContain("WantedBy=default.target");
      expect(unit).not.toContain("WantedBy=multi-user.target");
    });

    it("should still contain standard service directives in user mode", () => {
      const unit = generateSystemdUnit("/usr/local/bin/axonrouter", undefined, { userMode: true });
      expect(unit).toContain("[Unit]");
      expect(unit).toContain("[Service]");
      expect(unit).toContain("[Install]");
      expect(unit).toContain("Restart=always");
      expect(unit).toContain("RestartSec=5");
      expect(unit).toContain("Environment=NODE_ENV=production");
      expect(unit).toContain("Environment=PORT=12711");
      expect(unit).toContain("KillMode=control-group");
      expect(unit).toContain("TimeoutStopSec=30");
    });

    it("should contain WorkingDirectory in user mode", () => {
      const unit = generateSystemdUnit("/home/user/.nvm/versions/node/v22/bin/axonrouter", undefined, { userMode: true });
      expect(unit).toContain("WorkingDirectory=/home/user/.nvm/versions/node/v22");
    });

    it("should contain ExecStart with absolute node path in user mode", () => {
      const unit = generateSystemdUnit("/usr/local/bin/axonrouter", undefined, { userMode: true });
      expect(unit).toContain(`ExecStart=${process.execPath} /usr/local/bin/axonrouter`);
    });

    it("should contain Environment=HOME in user mode", () => {
      const unit = generateSystemdUnit("/usr/local/bin/axonrouter", undefined, { userMode: true });
      expect(unit).toMatch(/Environment=HOME=/);
    });
  });

  describe("isUserSessionAvailable()", () => {
    it("should be a function", () => {
      expect(typeof isUserSessionAvailable).toBe("function");
    });

    it("should return true when XDG_RUNTIME_DIR is set", () => {
      process.env.XDG_RUNTIME_DIR = "/run/user/1000";
      expect(isUserSessionAvailable()).toBe(true);
      delete process.env.XDG_RUNTIME_DIR;
    });

    it("should return true when DBUS_SESSION_BUS_ADDRESS is set", () => {
      process.env.DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/1000/bus";
      expect(isUserSessionAvailable()).toBe(true);
      delete process.env.DBUS_SESSION_BUS_ADDRESS;
    });
  });

  describe("getUserUnitPath()", () => {
    it("should return default USER_UNIT_PATH when no user specified", () => {
      const result = getUserUnitPath(undefined);
      expect(result).toContain(".config/systemd/user/axonrouter.service");
    });

    it("should resolve path for a specific user", () => {
      const result = getUserUnitPath("testuser");
      expect(result).toContain(".config/systemd/user/axonrouter.service");
    });

    it("should resolve to /root/.config/systemd/user/ for root user", () => {
      const result = getUserUnitPath("root");
      expect(result).toBe("/root/.config/systemd/user/axonrouter.service");
    });
  });
});
