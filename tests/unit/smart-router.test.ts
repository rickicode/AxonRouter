import { describe, expect, it } from "vitest";
import { SmartRouter, VIRTUAL_MODEL_IDS, DEFAULT_CONFIG } from "../../src/lib/smart-router/router";
import { extractFeatures } from "../../src/lib/smart-router/features";
import { makeDecision } from "../../src/lib/smart-router/policy";
import { normalizeRequest } from "../../src/lib/smart-router/normalizer";
import { compileTaskClasses, DEFAULT_TASK_CLASSES } from "../../src/lib/smart-router/task-classes";

describe("SmartRouter", () => {
  const router = new SmartRouter();

  describe("isVirtualModel", () => {
    it("recognizes virtual model IDs", () => {
      for (const id of VIRTUAL_MODEL_IDS) {
        expect(router.isVirtualModel(id)).toBe(true);
      }
    });

    it("rejects non-virtual models", () => {
      expect(router.isVirtualModel("gpt-4o")).toBe(false);
      expect(router.isVirtualModel("morph/qwen35-397b")).toBe(false);
      expect(router.isVirtualModel("")).toBe(false);
    });
  });

  describe("decide", () => {
    it("returns null for non-virtual models (passthrough)", () => {
      const result = router.decide("/v1/chat/completions", { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] });
      expect(result).toBeNull();
    });

    it("routes simple prompts to small target", () => {
      const result = router.decide("/v1/chat/completions", {
        model: "auto",
        messages: [{ role: "user", content: "hi" }],
      });
      expect(result).not.toBeNull();
      expect(result!.target).toBe("auto-small");
      expect(result!.complexity).toBe("low");
      expect(result!.task).toBe("general");
    });

    it("routes complex coding prompts to large target", () => {
      const result = router.decide("/v1/chat/completions", {
        model: "auto",
        messages: [
          { role: "system", content: "You are a coding assistant." },
          { role: "user", content: "Refactor the authentication module to support OAuth2 with PKCE flow. Review the security implications and debug any issues with the token refresh logic. Consider the architecture for multi-tenant support." },
        ],
        tools: [
          { type: "function", function: { name: "read_file" } },
          { type: "function", function: { name: "write_file" } },
          { type: "function", function: { name: "search_files" } },
        ],
      });
      expect(result).not.toBeNull();
      expect(result!.complexity).not.toBe("low");
      expect(["auto-medium", "auto-planning", "auto-large"]).toContain(result!.target);
    });

    it("applies scoreBias for auto-fast profile", () => {
      const autoResult = router.decide("/v1/chat/completions", {
        model: "auto",
        messages: [{ role: "user", content: "analyze this code and compare it with best practices" }],
      });
      const fastResult = router.decide("/v1/chat/completions", {
        model: "auto-fast",
        messages: [{ role: "user", content: "analyze this code and compare it with best practices" }],
      });
      expect(autoResult).not.toBeNull();
      expect(fastResult).not.toBeNull();
      expect(fastResult!.score).toBeLessThanOrEqual(autoResult!.score);
    });

    it("applies scoreBias for auto-quality profile", () => {
      const autoResult = router.decide("/v1/chat/completions", {
        model: "auto",
        messages: [{ role: "user", content: "hi" }],
      });
      const qualityResult = router.decide("/v1/chat/completions", {
        model: "auto-quality",
        messages: [{ role: "user", content: "hi" }],
      });
      expect(autoResult).not.toBeNull();
      expect(qualityResult).not.toBeNull();
      expect(qualityResult!.score).toBeGreaterThan(autoResult!.score);
    });

    it("detects planning tasks", () => {
      const result = router.decide("/v1/chat/completions", {
        model: "auto",
        messages: [{ role: "user", content: "Create an architecture plan for migrating from REST to GraphQL" }],
      });
      expect(result).not.toBeNull();
      expect(result!.task).toBe("planning");
    });

    it("detects debugging tasks", () => {
      const result = router.decide("/v1/chat/completions", {
        model: "auto",
        messages: [{ role: "user", content: "Debug this error: TypeError: Cannot read property 'map' of undefined at line 42" }],
      });
      expect(result).not.toBeNull();
      expect(result!.task).toBe("debugging");
    });

    it("detects risk hard floor for production/security prompts", () => {
      const result = router.decide("/v1/chat/completions", {
        model: "auto",
        messages: [{ role: "user", content: "Fix the production authentication bug with payment credentials" }],
      });
      expect(result).not.toBeNull();
      expect(result!.complexity).toBe("high");
    });

    it("includes feature details in decision", () => {
      const result = router.decide("/v1/chat/completions", {
        model: "auto",
        messages: [{ role: "user", content: "hello world" }],
      });
      expect(result).not.toBeNull();
      expect(result!.features).toBeDefined();
      expect(result!.features.chars).toBeGreaterThan(0);
      expect(result!.features.estimatedTokens).toBeGreaterThan(0);
      expect(result!.features.ruleScore).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("normalizeRequest", () => {
  it("normalizes OpenAI Chat format", () => {
    const result = normalizeRequest("/v1/chat/completions", {
      model: "auto",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ],
      tools: [{ type: "function", function: { name: "search" } }],
    });
    expect(result.allText).toContain("Hello");
    expect(result.systemText).toBe("You are helpful.");
    expect(result.messageCount).toBe(2);
    expect(result.toolCount).toBe(1);
  });

  it("normalizes Anthropic Messages format", () => {
    const result = normalizeRequest("/v1/messages", {
      model: "claude-sonnet-4",
      system: "Be helpful.",
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
    });
    expect(result.systemText).toBe("Be helpful.");
    expect(result.latestUserText).toContain("Hi");
  });

  it("detects image content", () => {
    const result = normalizeRequest("/v1/chat/completions", {
      model: "auto",
      messages: [{ role: "user", content: [{ type: "text", text: "describe" }, { type: "image_url", image_url: { url: "data:..." } }] }],
    });
    expect(result.hasImage).toBe(true);
  });
});

describe("extractFeatures", () => {
  it("returns low score for short prompts", () => {
    const features = extractFeatures(
      { allText: "hi", latestUserText: "hi", systemText: "", messageCount: 1, toolCount: 0, hasImage: false, hasStructuredOutput: false, reasoningEffort: null },
      { medium: 35, high: 70 },
    );
    expect(features.ruleScore).toBeLessThan(35);
    expect(features.task).toBe("general");
  });

  it("detects coding task", () => {
    const features = extractFeatures(
      { allText: "implement a new function in Python", latestUserText: "implement a new function in Python", systemText: "", messageCount: 1, toolCount: 0, hasImage: false, hasStructuredOutput: false, reasoningEffort: null },
      { medium: 35, high: 70 },
    );
    expect(features.task).toBe("coding");
  });

  it("returns higher score for tool-heavy requests", () => {
    const features = extractFeatures(
      { allText: "fix this bug", latestUserText: "fix this bug", systemText: "", messageCount: 2, toolCount: 10, hasImage: false, hasStructuredOutput: false, reasoningEffort: null },
      { medium: 35, high: 70 },
    );
    expect(features.ruleScore).toBeGreaterThan(10);
  });
});

describe("task-classes", () => {
  it("compiles default task classes", () => {
    const compiled = compileTaskClasses(DEFAULT_TASK_CLASSES);
    expect(compiled.taskClasses.length).toBeGreaterThan(0);
    expect(compiled.taskClasses.find((tc) => tc.id === "general")).toBeDefined();
  });
});

describe("edge cases", () => {
  const router = new SmartRouter();

  it("handles null body gracefully", () => {
    expect(router.decide("/v1/chat/completions", null as any)).toBeNull();
  });

  it("handles undefined body gracefully", () => {
    expect(router.decide("/v1/chat/completions", undefined as any)).toBeNull();
  });

  it("handles empty body gracefully", () => {
    expect(router.decide("/v1/chat/completions", {})).toBeNull();
  });

  it("handles body with model but no messages", () => {
    const result = router.decide("/v1/chat/completions", { model: "auto" });
    expect(result).not.toBeNull();
    expect(result!.target).toBe("auto-small"); // empty = simplest
  });

  it("handles non-array messages", () => {
    const result = router.decide("/v1/chat/completions", {
      model: "auto",
      messages: "not-an-array" as any,
    });
    expect(result).not.toBeNull();
    expect(result!.target).toBe("auto-small");
  });

  it("handles null content in messages", () => {
    const result = router.decide("/v1/chat/completions", {
      model: "auto",
      messages: [{ role: "user", content: null }],
    });
    expect(result).not.toBeNull();
    expect(result!.complexity).toBe("low");
  });

  it("handles OpenAI Responses format (body.input)", () => {
    const result = router.decide("/v1/responses", {
      model: "auto",
      input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
    });
    expect(result).not.toBeNull();
    expect(result!.target).toBe("auto-small");
  });

  it("routes image requests to auto-vision", () => {
    const result = router.decide("/v1/chat/completions", {
      model: "auto",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "describe this" },
          { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
        ],
      }],
    });
    expect(result).not.toBeNull();
    expect(result!.target).toBe("auto-vision");
  });

  it("clamps score to 0-100 range", () => {
    // Very long prompt with many tools → should clamp at 100
    const result = router.decide("/v1/chat/completions", {
      model: "auto",
      messages: [
        { role: "system", content: "x".repeat(10000) },
        { role: "user", content: "plan the architecture for production security migration of payment authentication with review and debug and evaluate" },
      ],
      tools: Array.from({ length: 50 }, (_, i) => ({ type: "function", function: { name: `tool_${i}` } })),
    });
    expect(result).not.toBeNull();
    expect(result!.score).toBeLessThanOrEqual(100);
    expect(result!.score).toBeGreaterThanOrEqual(0);
  });

  it("handles empty pathname", () => {
    const result = router.decide("", { model: "auto", messages: [{ role: "user", content: "hi" }] });
    expect(result).not.toBeNull(); // still routes, pathname only affects format detection
  });

  it("handles model as number (not string)", () => {
    const result = router.decide("/v1/chat/completions", { model: 123 as any });
    expect(result).toBeNull(); // not a virtual model → passthrough
  });

  it("handles quick task (translate) with negative delta", () => {
    const result = router.decide("/v1/chat/completions", {
      model: "auto",
      messages: [{ role: "user", content: "translate this to french" }],
    });
    expect(result).not.toBeNull();
    expect(result!.task).toBe("quick");
    expect(result!.score).toBeLessThan(10); // 5 (short) + (-15) clamped to 0
  });

  it("BUG-1: matches 'vulnerability' in review task", () => {
    const result = router.decide("/v1/chat/completions", {
      model: "auto",
      messages: [{ role: "user", content: "review this code for vulnerability in the authentication" }],
    });
    expect(result).not.toBeNull();
    expect(result!.task).toBe("review");
  });

  it("BUG-3: planning task routes to auto-planning even at high complexity", () => {
    const result = router.decide("/v1/chat/completions", {
      model: "auto",
      messages: [
        { role: "system", content: "You are a senior architect." },
        { role: "user", content: "Create a comprehensive architecture plan for migrating our production database from PostgreSQL to distributed CockroachDB with zero downtime, including security review and rollback strategy for the payment system" },
      ],
      tools: [
        { type: "function", function: { name: "read_file" } },
        { type: "function", function: { name: "write_file" } },
        { type: "function", function: { name: "search_files" } },
        { type: "function", function: { name: "execute_code" } },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.task).toBe("planning");
    expect(result!.target).toBe("auto-planning");
  });

  it("handles multiple task matches (debug + code)", () => {
    const result = router.decide("/v1/chat/completions", {
      model: "auto",
      messages: [{ role: "user", content: "debug this code error in the function" }],
    });
    expect(result).not.toBeNull();
    // debugging has higher priority (70) than coding (50)
    expect(result!.task).toBe("debugging");
  });
});
