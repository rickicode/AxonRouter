import { describe, it, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  saveRequestDetail,
  applyPayloadStorageMode,
  resolvePayloadStorageMode,
  redactSensitivePatterns,
  clampPayload,
  BOUNDED_MAX_BYTES,
  __test__,
} from "../../src/lib/db/repos/requestDetailsRepo.js";

describe("PAYLOAD_STORAGE_MODE support", () => {
  const originalEnvMode = process.env.PAYLOAD_STORAGE_MODE;
  const originalObsEnabled = process.env.OBSERVABILITY_ENABLED;

  beforeEach(() => {
    delete process.env.PAYLOAD_STORAGE_MODE;
    process.env.OBSERVABILITY_ENABLED = "true";
    __test__.clearWriteBuffer?.();
    __test__.clearFlushTimer?.();
  });

  afterEach(() => {
    if (originalEnvMode !== undefined) {
      process.env.PAYLOAD_STORAGE_MODE = originalEnvMode;
    } else {
      delete process.env.PAYLOAD_STORAGE_MODE;
    }
    if (originalObsEnabled !== undefined) {
      process.env.OBSERVABILITY_ENABLED = originalObsEnabled;
    } else {
      delete process.env.OBSERVABILITY_ENABLED;
    }
    __test__.clearWriteBuffer?.();
    __test__.clearFlushTimer?.();
  });
  after(async () => {
    if (global._pgSql) {
      try {
        await global._pgSql.end({ timeout: 1 });
      } catch {}
    }
  });


  describe("Mode resolution", () => {
    it("resolves 'full' mode correctly (case-insensitive)", () => {
      assert.equal(resolvePayloadStorageMode("full"), "full");
      assert.equal(resolvePayloadStorageMode("FULL"), "full");
      assert.equal(resolvePayloadStorageMode("  full  "), "full");

      process.env.PAYLOAD_STORAGE_MODE = "full";
      assert.equal(resolvePayloadStorageMode(), "full");
    });

    it("resolves 'none' mode correctly (case-insensitive)", () => {
      assert.equal(resolvePayloadStorageMode("none"), "none");
      assert.equal(resolvePayloadStorageMode("NONE"), "none");
      assert.equal(resolvePayloadStorageMode(" None "), "none");

      process.env.PAYLOAD_STORAGE_MODE = "none";
      assert.equal(resolvePayloadStorageMode(), "none");
    });

    it("resolves 'bounded' mode correctly", () => {
      assert.equal(resolvePayloadStorageMode("bounded"), "bounded");
      assert.equal(resolvePayloadStorageMode("BOUNDED"), "bounded");

      process.env.PAYLOAD_STORAGE_MODE = "bounded";
      assert.equal(resolvePayloadStorageMode(), "bounded");
    });

    it("defaults to 'bounded' when mode is unset, empty, or unrecognised", () => {
      delete process.env.PAYLOAD_STORAGE_MODE;
      assert.equal(resolvePayloadStorageMode(), "bounded");
      assert.equal(resolvePayloadStorageMode(""), "bounded");
      assert.equal(resolvePayloadStorageMode(null), "bounded");
      assert.equal(resolvePayloadStorageMode(undefined), "bounded");
      assert.equal(resolvePayloadStorageMode("invalid_mode"), "bounded");
      assert.equal(resolvePayloadStorageMode("arbitrary"), "bounded");
    });
  });

  describe("Mode: 'full'", () => {
    it("saves entire prompt and response bodies as-is without clamping", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "full";

      const largePrompt = "p".repeat(50 * 1024); // 50 KB > 32 KB
      const largeResponse = "r".repeat(60 * 1024); // 60 KB > 32 KB

      const detail = {
        id: "detail-full-1",
        provider: "anthropic",
        model: "claude-3-opus",
        status: "success",
        tokens: { prompt_tokens: 12000, completion_tokens: 15000 },
        latency: { ttft: 400, total: 2500 },
        request: { prompt: largePrompt },
        response: { content: largeResponse },
      };

      const saved = await saveRequestDetail(detail);

      assert.equal(saved.request.prompt.length, 50 * 1024);
      assert.equal(saved.request.prompt, largePrompt);
      assert.equal(saved.response.content.length, 60 * 1024);
      assert.equal(saved.response.content, largeResponse);
    });

    it("does not redact sensitive patterns (Bearer tokens or api-keys) in full mode", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "full";

      const secretToken = "sk-proj-1234567890abcdef1234567890";
      const bearerHeader = `Bearer ${secretToken}`;

      const detail = {
        id: "detail-full-2",
        provider: "openai",
        model: "gpt-4o",
        status: "success",
        tokens: { prompt_tokens: 20, completion_tokens: 40 },
        request: {
          headers: {
            authorization: bearerHeader,
            "x-api-key": secretToken,
          },
          apiKey: secretToken,
          prompt: `User token is ${bearerHeader}`,
        },
        response: {
          content: `Authenticated with key ${secretToken}`,
        },
      };

      const saved = await saveRequestDetail(detail);

      assert.equal(saved.request.headers.authorization, bearerHeader);
      assert.equal(saved.request.headers["x-api-key"], secretToken);
      assert.equal(saved.request.apiKey, secretToken);
      assert.ok(saved.request.prompt.includes(secretToken));
      assert.ok(saved.response.content.includes(secretToken));
    });

    it("preserves all metadata in full mode", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "full";

      const detail = {
        id: "meta-full",
        timestamp: "2026-09-25T12:00:00.000Z",
        provider: "google",
        model: "gemini-1.5-pro",
        connectionId: "conn-99",
        status: "success",
        tokens: { prompt_tokens: 100, completion_tokens: 200 },
        latency: { ttft: 150, total: 600 },
        request: { prompt: "Hello" },
        response: { text: "World" },
      };

      const saved = await saveRequestDetail(detail);

      assert.equal(saved.id, "meta-full");
      assert.equal(saved.timestamp, "2026-09-25T12:00:00.000Z");
      assert.equal(saved.provider, "google");
      assert.equal(saved.model, "gemini-1.5-pro");
      assert.equal(saved.connectionId, "conn-99");
      assert.equal(saved.status, "success");
      assert.deepEqual(saved.tokens, { prompt_tokens: 100, completion_tokens: 200 });
      assert.deepEqual(saved.latency, { ttft: 150, total: 600 });
    });
  });

  describe("Mode: 'bounded' (DEFAULT)", () => {
    it("is active by default when PAYLOAD_STORAGE_MODE is unset", () => {
      delete process.env.PAYLOAD_STORAGE_MODE;

      const largePrompt = "a".repeat(40 * 1024);
      const detail = {
        prompt: largePrompt,
        tokens: { prompt_tokens: 10 },
      };

      const result = applyPayloadStorageMode(detail);
      assert.equal(result.prompt.length, BOUNDED_MAX_BYTES);
      assert.equal(BOUNDED_MAX_BYTES, 32 * 1024);
    });

    it("clamps string prompt and response body text to max 32KB per payload", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "bounded";

      const oversizedPrompt = "x".repeat(45 * 1024); // 45 KB
      const oversizedResponse = "y".repeat(50 * 1024); // 50 KB

      const detail = {
        id: "detail-bounded-clamp",
        provider: "openai",
        model: "gpt-4o",
        status: "success",
        tokens: { prompt_tokens: 50, completion_tokens: 50 },
        prompt: oversizedPrompt,
        request: oversizedPrompt,
        response: oversizedResponse,
      };

      const saved = await saveRequestDetail(detail);

      assert.equal(saved.prompt.length, 32 * 1024);
      assert.equal(saved.request.length, 32 * 1024);
      assert.equal(saved.response.length, 32 * 1024);
      assert.equal(saved.prompt, oversizedPrompt.slice(0, 32 * 1024));
      assert.equal(saved.request, oversizedPrompt.slice(0, 32 * 1024));
      assert.equal(saved.response, oversizedResponse.slice(0, 32 * 1024));
    });

    it("clamps nested object string fields (prompt, content, text, messages) to max 32KB", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "bounded";

      const oversized = "z".repeat(40 * 1024);

      const detail = {
        id: "detail-nested-clamp",
        request: {
          prompt: oversized,
          messages: [
            { role: "user", content: oversized },
          ],
        },
        response: {
          content: oversized,
          text: oversized,
        },
      };

      const saved = await saveRequestDetail(detail);

      assert.equal(saved.request.prompt.length, 32 * 1024);
      assert.equal(saved.request.messages[0].content.length, 32 * 1024);
      assert.equal(saved.response.content.length, 32 * 1024);
      assert.equal(saved.response.text.length, 32 * 1024);
    });

    it("leaves prompt/response text under 32KB untouched", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "bounded";

      const normalPrompt = "Hello, what is the capital of France?";
      const normalResponse = "The capital of France is Paris.";

      const detail = {
        id: "detail-bounded-normal",
        request: { prompt: normalPrompt },
        response: { content: normalResponse },
      };

      const saved = await saveRequestDetail(detail);

      assert.equal(saved.request.prompt, normalPrompt);
      assert.equal(saved.response.content, normalResponse);
    });

    it("redacts Bearer tokens in auth headers", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "bounded";

      const token = "sk-ant-api03-1234567890abcdef1234567890";
      const detail = {
        request: {
          headers: {
            authorization: `Bearer ${token}`,
            "Authorization": `Bearer ${token}`,
          },
        },
      };

      const saved = await saveRequestDetail(detail);

      assert.ok(!JSON.stringify(saved).includes(token));
      assert.equal(saved.request.headers.authorization, "Bearer [REDACTED]");
      assert.equal(saved.request.headers["Authorization"], "Bearer [REDACTED]");
    });

    it("redacts api-key-like strings [a-zA-Z0-9_-]{20,} in auth headers and fields", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "bounded";

      const apiKey1 = "sk-proj-1234567890abcdef1234567890";
      const apiKey2 = "AIzaSyD-1234567890abcdef1234567890";
      const token3 = "github_pat_1234567890abcdef1234567890";

      const detail = {
        request: {
          headers: {
            "x-api-key": apiKey1,
            "api-key": apiKey2,
            "token": token3,
          },
          apiKey: apiKey1,
          api_key: apiKey2,
          auth_token: token3,
        },
      };

      const saved = await saveRequestDetail(detail);

      assert.ok(!JSON.stringify(saved).includes(apiKey1));
      assert.ok(!JSON.stringify(saved).includes(apiKey2));
      assert.ok(!JSON.stringify(saved).includes(token3));
      assert.equal(saved.request.headers["x-api-key"], "[REDACTED]");
      assert.equal(saved.request.headers["api-key"], "[REDACTED]");
      assert.equal(saved.request.headers["token"], "[REDACTED]");
      assert.equal(saved.request.apiKey, "[REDACTED]");
      assert.equal(saved.request.api_key, "[REDACTED]");
      assert.equal(saved.request.auth_token, "[REDACTED]");
    });

    it("redacts Bearer tokens embedded in string prompt and response bodies", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "bounded";

      const secret = "eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9-test-token-12345";
      const detail = {
        prompt: `curl -H 'Authorization: Bearer ${secret}' https://api.openai.com/v1/chat`,
        response: `Make sure to pass: Bearer ${secret}`,
      };

      const saved = await saveRequestDetail(detail);

      assert.ok(!saved.prompt.includes(secret));
      assert.ok(!saved.response.includes(secret));
      assert.ok(saved.prompt.includes("Bearer [REDACTED]"));
      assert.ok(saved.response.includes("Bearer [REDACTED]"));
    });

    it("does NOT falsely redact normal long words in prompt text", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "bounded";

      // 34-character legitimate English word
      const longWord = "supercalifragilisticexpialidocious";
      // 36-character UUID
      const testUuid = "123e4567-e89b-12d3-a456-426614174000";

      const detail = {
        prompt: `The word ${longWord} has 34 characters. ID: ${testUuid}.`,
        request: {
          messages: [
            { role: "user", content: `Explain the meaning of ${longWord}` },
          ],
        },
      };

      const saved = await saveRequestDetail(detail);

      assert.ok(saved.prompt.includes(longWord));
      assert.ok(saved.prompt.includes(testUuid));
      assert.ok(saved.request.messages[0].content.includes(longWord));
    });

    it("preserves metadata in bounded mode", async () => {
      delete process.env.PAYLOAD_STORAGE_MODE; // Test default behavior

      const detail = {
        id: "meta-bounded",
        timestamp: "2026-09-25T14:00:00.000Z",
        provider: "cohere",
        model: "command-r-plus",
        connectionId: "conn-12",
        status: "success",
        tokens: { prompt_tokens: 35, completion_tokens: 70 },
        latency: { ttft: 220, total: 850 },
        request: { prompt: "Short text" },
        response: { text: "Short answer" },
      };

      const saved = await saveRequestDetail(detail);

      assert.equal(saved.id, "meta-bounded");
      assert.equal(saved.timestamp, "2026-09-25T14:00:00.000Z");
      assert.equal(saved.provider, "cohere");
      assert.equal(saved.model, "command-r-plus");
      assert.equal(saved.connectionId, "conn-12");
      assert.equal(saved.status, "success");
      assert.deepEqual(saved.tokens, { prompt_tokens: 35, completion_tokens: 70 });
      assert.deepEqual(saved.latency, { ttft: 220, total: 850 });
    });
  });

  describe("Mode: 'none'", () => {
    it("strips prompt & response bodies completely (stores empty string or null)", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "none";

      const detail = {
        id: "detail-none-1",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        status: "success",
        tokens: { prompt_tokens: 50, completion_tokens: 150 },
        latency: { ttft: 300, total: 1200 },
        prompt: "Very secret user input",
        request: {
          messages: [{ role: "user", content: "Top secret query" }],
        },
        providerRequest: {
          messages: [{ role: "user", content: "Top secret query" }],
        },
        response: {
          content: "Top secret assistant reply",
        },
        providerResponse: {
          choices: [{ message: { content: "Top secret assistant reply" } }],
        },
      };

      const saved = await saveRequestDetail(detail);

      // Prompt and response bodies stripped completely (empty string or null)
      assert.ok(saved.prompt === null || saved.prompt === "");
      assert.ok(saved.request === null || saved.request === "");
      assert.ok(saved.response === null || saved.response === "");
      assert.ok(saved.providerRequest === null || saved.providerRequest === "");
      assert.ok(saved.providerResponse === null || saved.providerResponse === "");

      // Ensure no sensitive content remains in any payload property
      assert.ok(!JSON.stringify(saved).includes("Top secret"));
      assert.ok(!JSON.stringify(saved).includes("Very secret"));
    });

    it("saves all metadata (token counts, latencies, model, status, timestamps) in 'none' mode", async () => {
      process.env.PAYLOAD_STORAGE_MODE = "none";

      const detail = {
        id: "detail-none-meta",
        timestamp: "2026-09-25T15:30:00.000Z",
        provider: "openai",
        model: "gpt-4o-mini",
        connectionId: "conn-42",
        status: "success",
        tokens: { prompt_tokens: 42, completion_tokens: 84 },
        latency: { ttft: 180, total: 720 },
        pxpipe: { route: "fast" },
        comboName: "smart-fallback",
        difficulty: "standard",
        request: { prompt: "Sensitive text" },
        response: { answer: "Sensitive answer" },
      };

      const saved = await saveRequestDetail(detail);

      // Metadata is cleanly preserved
      assert.equal(saved.id, "detail-none-meta");
      assert.equal(saved.timestamp, "2026-09-25T15:30:00.000Z");
      assert.equal(saved.provider, "openai");
      assert.equal(saved.model, "gpt-4o-mini");
      assert.equal(saved.connectionId, "conn-42");
      assert.equal(saved.status, "success");
      assert.deepEqual(saved.tokens, { prompt_tokens: 42, completion_tokens: 84 });
      assert.deepEqual(saved.latency, { ttft: 180, total: 720 });
      assert.deepEqual(saved.pxpipe, { route: "fast" });
      assert.equal(saved.comboName, "smart-fallback");
      assert.equal(saved.difficulty, "standard");

      // Bodies are stripped
      assert.ok(saved.request === null || saved.request === "");
      assert.ok(saved.response === null || saved.response === "");
    });
  });

  describe("Edge cases and resilience", () => {
    it("handles null, undefined, or non-object details safely", async () => {
      assert.doesNotThrow(async () => {
        const resNull = await saveRequestDetail(null);
        assert.equal(resNull, undefined);

        const resUndef = await saveRequestDetail(undefined);
        assert.equal(resUndef, undefined);

        const resStr = await saveRequestDetail("not-an-object");
        assert.equal(resStr, undefined);
      });
    });

    it("handles detail objects with missing or null payload fields without error", async () => {
      for (const mode of ["full", "bounded", "none"]) {
        process.env.PAYLOAD_STORAGE_MODE = mode;

        const detail = {
          id: `sparse-${mode}`,
          model: "gpt-4",
          status: "ok",
          tokens: {},
          latency: {},
        };

        assert.doesNotThrow(async () => {
          const saved = await saveRequestDetail(detail);
          assert.equal(saved.id, `sparse-${mode}`);
          assert.equal(saved.model, "gpt-4");
        });
      }
    });

    it("is idempotent: applying bounded mode twice produces identical result", () => {
      const detail = {
        prompt: "x".repeat(40 * 1024),
        request: {
          headers: {
            authorization: "Bearer sk-proj-1234567890abcdef1234567890",
            "x-api-key": "secret-key-12345678901234567890",
          },
        },
      };

      const once = applyPayloadStorageMode(detail, "bounded");
      const twice = applyPayloadStorageMode(once, "bounded");

      assert.deepEqual(once, twice);
      assert.equal(twice.prompt.length, 32 * 1024);
      assert.equal(twice.request.headers.authorization, "Bearer [REDACTED]");
      assert.equal(twice.request.headers["x-api-key"], "[REDACTED]");
    });
  });
});
