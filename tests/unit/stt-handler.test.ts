import { beforeEach, describe, expect, it, vi } from "vitest";

const getSettings = vi.fn();
const extractApiKey = vi.fn();
const isValidApiKey = vi.fn();
const getProviderCredentials = vi.fn();
const markAccountUnavailable = vi.fn();
const getModelInfo = vi.fn();
const handleSttCore = vi.fn();

vi.mock("@/lib/localDb", () => ({
  getSettings,
  getApiKeys: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/sse/services/auth.tsx", () => ({
  extractApiKey,
  isValidApiKey,
  hasApiKeys: vi.fn().mockResolvedValue(false),
  getProviderCredentials,
  markAccountUnavailable,
}));

vi.mock("../../src/sse/services/model.ts", () => ({
  getModelInfo,
}));

vi.mock("../../open-sse/handlers/sttCore.ts", () => ({
  handleSttCore,
}));

describe("src/sse/handlers/stt.handleStt", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSettings.mockResolvedValue({ requireApiKey: false });
    getModelInfo.mockResolvedValue({ provider: "openai", model: "whisper-1" });
    handleSttCore.mockResolvedValue({
      success: true,
      response: new Response(JSON.stringify({ text: "hello" }), { status: 200 }),
    });
  });

  it("returns 400 when file is missing", async () => {
    const { handleStt } = await import("../../src/sse/handlers/stt.ts");
    const formData = new FormData();
    formData.set("model", "openai/whisper-1");
    const request = { formData: vi.fn(async () => formData) };

    const response = await handleStt(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toMatch(/Missing required field: file/);
  });

  it("uses provider credentials for credentialed STT providers", async () => {
    getProviderCredentials.mockResolvedValueOnce({ connectionId: "conn-openai", connectionName: "OpenAI", apiKey: "key-openai" });

    const { handleStt } = await import("../../src/sse/handlers/stt.ts");
    const formData = new FormData();
    formData.set("model", "openai/whisper-1");
    formData.set("file", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");
    const request = { formData: vi.fn(async () => formData) };

    const response = await handleStt(request);

    expect(getProviderCredentials).toHaveBeenCalledWith("openai", expect.any(Set), "whisper-1", null, null);
    expect(handleSttCore).toHaveBeenCalledWith({
      provider: "openai",
      model: "whisper-1",
      formData,
      credentials: { connectionId: "conn-openai", connectionName: "OpenAI", apiKey: "key-openai" },
    });
    expect(response.status).toBe(200);
  });

  it("falls back to another credentialed account when markAccountUnavailable allows it", async () => {
    getModelInfo.mockResolvedValue({ provider: "deepgram", model: "nova-3" });
    getProviderCredentials
      .mockResolvedValueOnce({ connectionId: "conn-1", connectionName: "One", apiKey: "key-1" })
      .mockResolvedValueOnce({ connectionId: "conn-2", connectionName: "Two", apiKey: "key-2" });
    handleSttCore
      .mockResolvedValueOnce({ success: false, status: 429, error: "rate limited", response: new Response("x", { status: 429 }) })
      .mockResolvedValueOnce({ success: true, response: new Response(JSON.stringify({ text: "ok" }), { status: 200 }) });
    markAccountUnavailable.mockResolvedValue({ shouldFallback: true });

    const { handleStt } = await import("../../src/sse/handlers/stt.ts");
    const formData = new FormData();
    formData.set("model", "deepgram/nova-3");
    formData.set("file", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");
    const request = { formData: vi.fn(async () => formData) };

    const response = await handleStt(request);

    expect(getProviderCredentials).toHaveBeenCalledTimes(2);
    expect(markAccountUnavailable).toHaveBeenCalledWith("conn-1", 429, "rate limited", "deepgram", "nova-3");
    expect(response.status).toBe(200);
  });
});
