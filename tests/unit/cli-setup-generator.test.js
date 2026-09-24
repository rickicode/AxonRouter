import { describe, expect, it } from "vitest";
import { TOOL_TEMPLATES } from "../../src/shared/constants/cliToolTemplates.js";
import { generateBashScript } from "../../src/lib/cliSetup/bashGenerator.js";
import { generatePowerShellScript } from "../../src/lib/cliSetup/powershellGenerator.js";
import { GET } from "../../src/app/api/cli-tools/setup/[toolId]/route.js";

describe("cliToolTemplates", () => {
  it("defines supported templates with correct structures", () => {
    const supported = [
      "claude",
      "codex",
      "openclaw",
      "droid",
      "hermes",
      "opencode",
      "cline",
      "kilo",
      "deepseek-tui",
      "jcode",
      "grok-build",
      "copilot",
      "cowork",
      "qwen",
      "amp",
    ];

    for (const toolId of supported) {
      const tpl = TOOL_TEMPLATES[toolId];
      expect(tpl, `Template for ${toolId} should exist`).toBeDefined();
      expect(tpl.id).toBe(toolId);
      expect(tpl.name).toBeTruthy();
      expect(tpl.format).toBeTruthy();

      if (tpl.format === "multi_file") {
        expect(Array.isArray(tpl.files)).toBe(true);
        expect(tpl.files.length).toBeGreaterThan(0);
        for (const f of tpl.files) {
          expect(f.pathPosix).toBeTruthy();
          expect(f.pathWin).toBeTruthy();
          expect(typeof f.content).toBe("function");
        }
      } else {
        expect(tpl.paths).toBeDefined();
        expect(Array.isArray(tpl.paths.posix || tpl.paths.darwin)).toBe(true);
        expect(Array.isArray(tpl.paths.windows)).toBe(true);
        expect(typeof tpl.generateConfig).toBe("function");
      }
    }
  });

  it("generates correct claude config object", () => {
    const config = TOOL_TEMPLATES.claude.generateConfig({
      baseUrl: "http://127.0.0.1:10128",
      apiKey: "sk_test_123",
      models: {
        sonnet: "cc/claude-sonnet-5",
        opus: "cc/claude-opus-5",
        haiku: "cc/claude-haiku-4-5-20251001",
      },
      maxContextTokens: 200000,
    });

    expect(config.hasCompletedOnboarding).toBe(true);
    expect(config.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:10128");
    expect(config.env.ANTHROPIC_AUTH_TOKEN).toBe("sk_test_123");
    expect(config.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("cc/claude-sonnet-5");
    expect(config.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("cc/claude-opus-5");
    expect(config.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("cc/claude-haiku-4-5-20251001");
    expect(config.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe("200000");
  });

  it("generates correct codex toml string", () => {
    const toml = TOOL_TEMPLATES.codex.generateConfig({
      baseUrl: "http://127.0.0.1:10128/v1",
      apiKey: "sk_codex_key",
      model: "gpt-5",
      subagentModel: "gpt-5-mini",
    });

    expect(toml).toContain('model = "gpt-5"');
    expect(toml).toContain('model_provider = "axonrouter"');
    expect(toml).toContain('[model_providers.axonrouter]');
    expect(toml).toContain('base_url = "http://127.0.0.1:10128"');
    expect(toml).toContain('Authorization = "Bearer sk_codex_key"');
    expect(toml).toContain('default_subagent_model = "gpt-5-mini"');
  });

  it("generates correct droid custom models config", () => {
    const config = TOOL_TEMPLATES.droid.generateConfig({
      baseUrl: "http://127.0.0.1:10128",
      apiKey: "sk_droid",
      modelsList: ["claude-sonnet-5", "gpt-5"],
    });

    expect(Array.isArray(config.customModels)).toBe(true);
    expect(config.customModels).toHaveLength(2);
    expect(config.customModels[0].model).toBe("claude-sonnet-5");
    expect(config.customModels[0].baseUrl).toBe("http://127.0.0.1:10128/v1");
    expect(config.customModels[0].apiKey).toBe("sk_droid");
    expect(config.customModels[1].model).toBe("gpt-5");
  });
});

describe("bashGenerator", () => {
  it("generates valid Bash script with backup and directory creation for single file", () => {
    const script = generateBashScript("claude", {
      baseUrl: "http://localhost:10128",
      apiKey: "sk_axonrouter_live",
      models: { sonnet: "cc/claude-sonnet-5" },
    });

    expect(script).toContain("#!/usr/bin/env bash");
    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("mkdir -p");
    expect(script).toContain(".claude/settings.json");
    expect(script).toContain("ANTHROPIC_BASE_URL");
    expect(script).toContain("ANTHROPIC_DEFAULT_SONNET_MODEL");
    expect(script).toContain(".bak.");
    expect(script).toContain("[AxonRouter] ✓ Configuration for %s applied successfully!");
  });

  it("generates valid Bash script for multi-file tools (hermes)", () => {
    const script = generateBashScript("hermes", {
      baseUrl: "http://localhost:10128",
      apiKey: "sk_hermes_test",
      model: "hermes-3-llama-3.1-405b",
    });

    expect(script).toContain("#!/usr/bin/env bash");
    expect(script).toContain(".hermes/config.yaml");
    expect(script).toContain(".hermes/.env");
    expect(script).toContain("OPENAI_API_KEY=sk_hermes_test");
    expect(script).toContain("hermes-3-llama-3.1-405b");
    expect(script).toContain("[AxonRouter] ✓ Configuration for %s applied successfully!");
  });

  it("returns error script for unknown tool", () => {
    const script = generateBashScript("nonexistent-tool", {});
    expect(script).toContain("Unknown tool 'nonexistent-tool'");
    expect(script).toContain("exit 1");
  });
});

describe("powershellGenerator", () => {
  it("generates valid PowerShell script with backup and json merge logic", () => {
    const script = generatePowerShellScript("claude", {
      baseUrl: "http://localhost:10128",
      apiKey: "sk_win_claude",
      models: { sonnet: "cc/claude-sonnet-5" },
    });

    expect(script).toContain('$ErrorActionPreference = "Stop"');
    expect(script).toContain("Join-Path $env:USERPROFILE");
    expect(script).toContain(".claude\\settings.json");
    expect(script).toContain("ConvertFrom-Json");
    expect(script).toContain("ConvertTo-Json -Depth 10");
    expect(script).toContain("[AxonRouter] ✓ Configuration for Claude Code applied successfully!");
  });

  it("generates valid PowerShell script for multi-file tools (cline)", () => {
    const script = generatePowerShellScript("cline", {
      baseUrl: "http://localhost:10128",
      apiKey: "sk_cline_win",
      model: "claude-sonnet-5",
    });

    expect(script).toContain('$ErrorActionPreference = "Stop"');
    expect(script).toContain(".cline\\data\\globalState.json");
    expect(script).toContain(".cline\\data\\secrets.json");
    expect(script).toContain("sk_cline_win");
    expect(script).toContain("[AxonRouter] ✓ Configuration for Cline applied successfully!");
  });

  it("returns error script for unknown tool in PowerShell", () => {
    const script = generatePowerShellScript("nonexistent-tool", {});
    expect(script).toContain("Unknown tool 'nonexistent-tool'");
  });
});

describe("GET /api/cli-tools/setup/[toolId]", () => {
  it("returns bash setup script with correct headers and substituted values", async () => {
    const req = new Request(
      "http://localhost:10128/api/cli-tools/setup/claude?baseUrl=http://127.0.0.1:10128&apiKey=sk_live_endpoint&sonnet=cc/claude-sonnet-5"
    );
    const res = await GET(req, { params: Promise.resolve({ toolId: "claude" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/x-shellscript");
    const body = await res.text();
    expect(body).toContain("ANTHROPIC_BASE_URL");
    expect(body).toContain("sk_live_endpoint");
    expect(body).toContain("http://127.0.0.1:10128");
  });

  it("returns powershell setup script when format=ps1", async () => {
    const req = new Request(
      "http://localhost:10128/api/cli-tools/setup/claude?format=ps1&baseUrl=http://127.0.0.1:10128&apiKey=sk_win"
    );
    const res = await GET(req, { params: Promise.resolve({ toolId: "claude" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("ConvertFrom-Json");
    expect(body).toContain("sk_win");
  });

  it("returns 404 for unsupported tool", async () => {
    const req = new Request("http://localhost:10128/api/cli-tools/setup/unknown-tool");
    const res = await GET(req, { params: Promise.resolve({ toolId: "unknown-tool" }) });

    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("not supported");
  });
});
