/**
 * Unit tests for xAI image generation in handleImageGenerationCore
 *
 * Covers:
 *  - Size mapping: 1024x1024 -> 1:1, 1792x1024 -> 16:9, 1024x1792 -> 9:16
 *  - Default size maps to "1:1"
 *  - Request body includes model, prompt, aspect_ratio, resolution: "1k"
 *  - Authorization header is "Bearer test-token"
 *  - Response normalization passes through OpenAI-compatible format
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("stream", async () => await import("node:stream"));

import { handleImageGenerationCore } from "../../open-sse/handlers/imageGenerationCore.ts";

const originalFetch = global.fetch;

describe("xAI image generation (handleImageGenerationCore)", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("maps size 1024x1024 to aspect_ratio 1:1", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ created: 1234567890, data: [{ url: "https://example.com/img.png" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await handleImageGenerationCore({
      body: { prompt: "A cat", size: "1024x1024" },
      modelInfo: { provider: "xai", model: "grok-imagine-image" },
      credentials: { accessToken: "test-token" },
      log: null,
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);
    expect(requestBody.aspect_ratio).toBe("1:1");
  });

  it("maps size 1792x1024 to aspect_ratio 16:9", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ created: 1234567890, data: [{ url: "https://example.com/img.png" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await handleImageGenerationCore({
      body: { prompt: "A landscape", size: "1792x1024" },
      modelInfo: { provider: "xai", model: "grok-imagine-image" },
      credentials: { accessToken: "test-token" },
      log: null,
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);
    expect(requestBody.aspect_ratio).toBe("16:9");
  });

  it("maps size 1024x1792 to aspect_ratio 9:16", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ created: 1234567890, data: [{ url: "https://example.com/img.png" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await handleImageGenerationCore({
      body: { prompt: "A portrait", size: "1024x1792" },
      modelInfo: { provider: "xai", model: "grok-imagine-image" },
      credentials: { accessToken: "test-token" },
      log: null,
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);
    expect(requestBody.aspect_ratio).toBe("9:16");
  });

  it("defaults unmapped size to aspect_ratio 1:1", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ created: 1234567890, data: [{ url: "https://example.com/img.png" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await handleImageGenerationCore({
      body: { prompt: "Something" },
      modelInfo: { provider: "xai", model: "grok-imagine-image" },
      credentials: { accessToken: "test-token" },
      log: null,
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);
    expect(requestBody.aspect_ratio).toBe("1:1");
  });

  it("request body contains model, prompt, aspect_ratio, resolution", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ created: 1234567890, data: [{ url: "https://example.com/img.png" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await handleImageGenerationCore({
      body: { prompt: "A dog", size: "1024x1024" },
      modelInfo: { provider: "xai", model: "grok-imagine-image" },
      credentials: { accessToken: "test-token" },
      log: null,
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);
    expect(requestBody.model).toBe("grok-imagine-image");
    expect(requestBody.prompt).toBe("A dog");
    expect(requestBody.aspect_ratio).toBe("1:1");
    expect(requestBody.resolution).toBe("1k");
  });

  it("sends Authorization Bearer header with accessToken", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ created: 1234567890, data: [{ url: "https://example.com/img.png" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await handleImageGenerationCore({
      body: { prompt: "A bird", size: "1024x1024" },
      modelInfo: { provider: "xai", model: "grok-imagine-image" },
      credentials: { accessToken: "test-token" },
      log: null,
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    expect(fetchCall[1].headers["Authorization"]).toBe("Bearer test-token");
  });

  it("passes through OpenAI-compatible response format", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          created: 1234567890,
          data: [{ url: "https://example.com/generated.png" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await handleImageGenerationCore({
      body: { prompt: "A bird", size: "1024x1024" },
      modelInfo: { provider: "xai", model: "grok-imagine-image" },
      credentials: { accessToken: "test-token" },
      log: null,
    });

    expect(result.success).toBe(true);
    const responseBody = await result.response.json();
    expect(responseBody.created).toBe(1234567890);
    expect(responseBody.data).toHaveLength(1);
    expect(responseBody.data[0].url).toBe("https://example.com/generated.png");
  });

  it("sends request to xAI image generation endpoint", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ created: 1234567890, data: [{ url: "https://example.com/img.png" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await handleImageGenerationCore({
      body: { prompt: "Test", size: "1024x1024" },
      modelInfo: { provider: "xai", model: "grok-imagine-image" },
      credentials: { accessToken: "test-token" },
      log: null,
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe("https://api.x.ai/v1/images/generations");
  });
});
