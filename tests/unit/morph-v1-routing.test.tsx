import { beforeEach, describe, expect, it, vi } from "vitest";

import { MORPH_CORE_INTERNAL_MODELS } from "../../src/shared/constants/models.ts";

const handleChat = vi.fn();
const handleEmbeddings = vi.fn();
const initTranslators = vi.fn();
const getSettings = vi.fn();
const getApiKeys = vi.fn();
const validateApiKey = vi.fn();
const dispatchMorphCapability = vi.fn();
const resolveMorphInstructionsForRequest = vi.fn();
const buildMorphRepoContext = vi.fn();


vi.mock("@/sse/handlers/chat", () => ({
  handleChat,
}));

vi.mock("@/sse/handlers/embeddings", () => ({
  handleEmbeddings,
}));

vi.mock("open-sse/translator/index.ts", () => ({
  initTranslators,
}));

vi.mock("@/shared/utils/cloud", () => ({
  callCloudWithMachineId: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getSettings,
  getApiKeys,
  validateApiKey,
}));

vi.mock("@/app/api/morph/_dispatch", () => ({
  dispatchMorphCapability,
}));

vi.mock("open-sse/config/morphInstructionsResolver.ts", () => ({
  resolveMorphInstructionsForRequest,
}));

vi.mock("@/lib/morph/repoContext", () => ({
  buildMorphRepoContext,
}));

describe("Morph v1 route bridging", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    handleChat.mockResolvedValue(new Response(JSON.stringify({ source: "chat" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    handleEmbeddings.mockResolvedValue(new Response(JSON.stringify({ source: "embeddings" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    getApiKeys.mockResolvedValue([]);
    validateApiKey.mockResolvedValue(true);
    getSettings.mockResolvedValue({
      morph: {
        baseUrl: "https://api.morphllm.com",
        apiKeys: [{ email: "morph@example.com", key: "mk-1", status: "active", isExhausted: false }],
        roundRobinEnabled: false,
      },
    });
    dispatchMorphCapability.mockResolvedValue(new Response(JSON.stringify({ source: "morph-direct" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    resolveMorphInstructionsForRequest.mockResolvedValue("Morph default instructions");
    buildMorphRepoContext.mockReturnValue({
      workingDir: "/workspaces/axonrouter",
      date: "2026-05-07",
      environment: "linux-x64, Node.js v24.0.0",
      structure: [],
      isGitRepo: true,
      currentBranch: "main",
      mainBranch: "main",
      gitStatus: "M 0, D 0, ?? 0",
      recentCommits: [],
    });
  });

  it("keeps generic chat-completions traffic on the standard handler", async () => {
    const { POST } = await import("../../src/app/api/v1/chat/completions/route.ts");
    const request = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "hi" }] }),
    });

    const response = await POST(request);

    expect(initTranslators).toHaveBeenCalledTimes(1);
    expect(handleChat).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ source: "chat" });
  });

  it("keeps /v1/messages on the standard handler", async () => {
    const { POST } = await import("../../src/app/api/v1/messages/route.ts");
    const request = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MORPH_CORE_INTERNAL_MODELS.applyDefault, messages: [{ role: "user", content: "hi" }] }),
    });

    const response = await POST(request);

    expect(initTranslators).toHaveBeenCalledTimes(1);
    expect(handleChat).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ source: "chat" });
  });

  it("keeps /v1/responses on the standard handler", async () => {
    const { POST } = await import("../../src/app/api/v1/responses/route.ts");
    const request = new Request("http://localhost/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MORPH_CORE_INTERNAL_MODELS.applyDefault, input: [{ role: "user", content: "hi" }] }),
    });

    const response = await POST(request);

    expect(initTranslators).toHaveBeenCalledTimes(1);
    expect(handleChat).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ source: "chat" });
  });

  it("routes /v1/responses/compact to Morph native compact when a usable key exists", async () => {
    const { POST } = await import("../../src/app/api/v1/responses/compact/route.ts");
    const request = new Request("http://localhost/v1/responses/compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MORPH_CORE_INTERNAL_MODELS.applyDefault, messages: [{ role: "user", content: "hi" }] }),
    });

    const response = await POST(request);

    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(dispatchMorphCapability).toHaveBeenCalledWith({
      capability: "compact",
      req: request,
      morphSettings: expect.objectContaining({
        baseUrl: "https://api.morphllm.com",
      }),
      upstreamTarget: { method: "POST", path: "/v1/compact" },
      requestLabel: "morph:/v1/compact",
    });
    expect(handleChat).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ source: "morph-direct" });
  });

  it("falls back to the standard handler when Morph has no usable compact key", async () => {
    getSettings.mockResolvedValueOnce({
      morph: {
        baseUrl: "https://api.morphllm.com",
        apiKeys: [{ email: "morph@example.com", key: "mk-1", status: "inactive", isExhausted: false }],
        roundRobinEnabled: false,
      },
    });

    const { POST } = await import("../../src/app/api/v1/responses/compact/route.ts");
    const request = new Request("http://localhost/v1/responses/compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MORPH_CORE_INTERNAL_MODELS.applyDefault, messages: [{ role: "user", content: "hi" }] }),
    });

    const response = await POST(request);

    expect(dispatchMorphCapability).not.toHaveBeenCalled();
    expect(handleChat).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ source: "chat" });
  });

  it("keeps generic embeddings traffic on the standard handler", async () => {
    const { POST } = await import("../../src/app/api/v1/embeddings/route.ts");
    const request = new Request("http://localhost/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/text-embedding-3-small", input: "hello" }),
    });

    const response = await POST(request);

    expect(handleEmbeddings).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ source: "embeddings" });
  });

  it("injects Morph default instructions into shared fast-model chat requests", async () => {
    const { POST } = await import("../../src/app/api/v1/chat/completions/route.ts");
    const request = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "morph/morph-qwen35-397b", messages: [{ role: "user", content: "hi" }] }),
    });

    await POST(request);

    expect(dispatchMorphCapability).toHaveBeenCalledWith(expect.objectContaining({
      requestPayload: expect.objectContaining({
        messages: [
          {
            role: "system",
            content: expect.stringContaining("Morph default instructions"),
          },
          { role: "user", content: "hi" },
        ],
        morphContext: expect.objectContaining({
          repo: expect.objectContaining({
            workingDir: "/workspaces/axonrouter",
          }),
        }),
      }),
    }));
  });

  it("normalizes developer messages to system before dispatching Morph fast-model chat requests", async () => {
    const { POST } = await import("../../src/app/api/v1/chat/completions/route.ts");
    const request = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/morph-qwen35-397b",
        messages: [
          { role: "developer", content: "Reply tersely" },
          { role: "user", content: "hi" },
        ],
      }),
    });

    await POST(request);

    expect(dispatchMorphCapability).toHaveBeenCalledWith(expect.objectContaining({
      requestPayload: expect.objectContaining({
        messages: [
          {
            role: "system",
            content: expect.stringContaining("Reply tersely"),
          },
          { role: "user", content: "hi" },
        ],
      }),
    }));
  });

  it("injects commandcode-style repo context for shared fast-model chat requests", async () => {
    const { POST } = await import("../../src/app/api/v1/chat/completions/route.ts");
    const request = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "morph/morph-qwen35-397b", messages: [{ role: "user", content: "kamu tau ini kode apa?" }] }),
    });

    await POST(request);

    expect(dispatchMorphCapability).toHaveBeenCalledWith(expect.objectContaining({
      requestPayload: expect.objectContaining({
        morphContext: expect.objectContaining({
          repo: expect.objectContaining({
            workingDir: "/workspaces/axonrouter",
            currentBranch: "main",
          }),
        }),
        messages: [
          { role: "system", content: expect.stringContaining("Morph default instructions") },
          { role: "user", content: "kamu tau ini kode apa?" },
        ],
      }),
    }));
  });

  it("serves explicit Morph chat-completions without generic `/v1` probing", async () => {
    dispatchMorphCapability.mockResolvedValueOnce(new Response(JSON.stringify({
      id: "chatcmpl_native_1",
      choices: [{ message: { role: "assistant", content: "<think>inspect</think>done" }, finish_reason: "stop" }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const { POST } = await import("../../src/app/morphllm/v1/chat/completions/route.ts");
    const request = new Request("http://localhost/morphllm/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MORPH_CORE_INTERNAL_MODELS.applyDefault, messages: [{ role: "user", content: "hi" }] }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(dispatchMorphCapability).toHaveBeenCalledWith({
      capability: "apply",
      req: request,
      morphSettings: expect.objectContaining({
        baseUrl: "https://api.morphllm.com",
      }),
      upstreamTarget: { method: "POST", path: "/v1/chat/completions" },
      requestLabel: "morph:/v1/chat/completions",
    });
    expect(payload.choices[0].message.content).toBe("done");
    expect(payload.choices[0].message.reasoning_content).toBe("inspect");
  });

  it("serves Morph MCP chat-completions without the `/v1` prefix", async () => {
    const { POST } = await import("../../src/app/morphllm/chat/completions/route.ts");
    const request = new Request("http://localhost/morphllm/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MORPH_CORE_INTERNAL_MODELS.applyDefault, messages: [{ role: "user", content: "hi" }] }),
    });

    const response = await POST(request);

    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(dispatchMorphCapability).toHaveBeenCalledWith({
      capability: "apply",
      req: request,
      morphSettings: expect.objectContaining({
        baseUrl: "https://api.morphllm.com",
      }),
      upstreamTarget: { method: "POST", path: "/v1/chat/completions" },
      requestLabel: "morph:/v1/chat/completions",
    });
    await expect(response.json()).resolves.toEqual({ source: "morph-direct" });
  });

  it("serves explicit Morph compact without generic `/v1` probing", async () => {
    const { POST } = await import("../../src/app/morphllm/v1/compact/route.ts");
    const request = new Request("http://localhost/morphllm/v1/compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "trim history" }),
    });

    const response = await POST(request);

    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(dispatchMorphCapability).toHaveBeenCalledWith({
      capability: "compact",
      req: request,
      morphSettings: expect.objectContaining({
        baseUrl: "https://api.morphllm.com",
      }),
      upstreamTarget: { method: "POST", path: "/v1/compact" },
      requestLabel: "morph:/v1/compact",
    });
    await expect(response.json()).resolves.toEqual({ source: "morph-direct" });
  });

  it("serves Morph compact without the `/v1` prefix", async () => {
    const { POST } = await import("../../src/app/morphllm/compact/route.ts");
    const request = new Request("http://localhost/morphllm/compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "trim history" }),
    });

    const response = await POST(request);

    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(dispatchMorphCapability).toHaveBeenCalledWith({
      capability: "compact",
      req: request,
      morphSettings: expect.objectContaining({
        baseUrl: "https://api.morphllm.com",
      }),
      upstreamTarget: { method: "POST", path: "/v1/compact" },
      requestLabel: "morph:/v1/compact",
    });
    await expect(response.json()).resolves.toEqual({ source: "morph-direct" });
  });

  it("serves explicit Morph models for MCP discovery", async () => {
    const { GET } = await import("../../src/app/morphllm/v1/models/route.ts");

    const response = await GET();
    const payload = await response.json();

    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(payload.object).toBe("list");
    expect(payload.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "morph-qwen35-397b", object: "model", owned_by: "morph", root: "morph-qwen35-397b" }),
        expect.objectContaining({ id: "morph-minimax27-230b", object: "model", owned_by: "morph", root: "morph-minimax27-230b" }),
        expect.objectContaining({ id: "morph-qwen36-27b", object: "model", owned_by: "morph", root: "morph-qwen36-27b" }),
      ])
    );
  });

  it("serves Morph models without the `/v1` prefix", async () => {
    const { GET } = await import("../../src/app/morphllm/models/route.ts");

    const response = await GET();
    const payload = await response.json();

    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(payload.object).toBe("list");
    expect(payload.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "morph-qwen35-397b", object: "model", owned_by: "morph", root: "morph-qwen35-397b" }),
      ])
    );
  });

  it("returns 503 for explicit Morph models when Morph is not configured", async () => {
    getSettings.mockResolvedValueOnce({ morph: { baseUrl: "", apiKeys: [], roundRobinEnabled: false } });

    const { GET } = await import("../../src/app/morphllm/v1/models/route.ts");
    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Morph is not configured" });
  });
});
