import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateSystemdUnit, generateInitdScript, getInstallingUser, getInstallingUserHome } from "../../scripts/service.js";

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
});
