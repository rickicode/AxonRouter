import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

function makeJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("open-sse/handlers/sttCore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns 400 when provider has no STT config", async () => {
    const { handleSttCore } = await import("../../open-sse/handlers/sttCore.ts");
    const formData = new FormData();
    formData.set("file", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");

    const result = await handleSttCore({ provider: "claude", model: "claude-sonnet", formData });

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/does not support STT/);
  });

  it("rejects invalid HuggingFace model ids before fetching", async () => {
    global.fetch = vi.fn();
    const { handleSttCore } = await import("../../open-sse/handlers/sttCore.ts");
    const formData = new FormData();
    formData.set("file", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");

    const result = await handleSttCore({
      provider: "huggingface",
      model: "../bad-model",
      formData,
      credentials: { apiKey: "hf-key" },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("normalizes Deepgram transcript payloads to { text }", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeJsonResponse({
      results: {
        channels: [{ alternatives: [{ transcript: "deepgram transcript" }] }],
      },
    }));

    const { handleSttCore } = await import("../../open-sse/handlers/sttCore.ts");
    const formData = new FormData();
    formData.set("file", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");

    const result = await handleSttCore({
      provider: "deepgram",
      model: "nova-3",
      formData,
      credentials: { apiKey: "dg-key" },
    });

    expect(result.success).toBe(true);
    const body = await result.response.json();
    expect(body).toEqual({ text: "deepgram transcript" });
  });

  it("normalizes Gemini STT generateContent payloads to { text }", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeJsonResponse({
      candidates: [
        {
          content: {
            parts: [{ text: "gemini transcript" }],
          },
        },
      ],
    }));

    const { handleSttCore } = await import("../../open-sse/handlers/sttCore.ts");
    const formData = new FormData();
    formData.set("file", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");

    const result = await handleSttCore({
      provider: "gemini",
      model: "gemini-2.5-flash",
      formData,
      credentials: { apiKey: "gemini-key" },
    });

    expect(result.success).toBe(true);
    const body = await result.response.json();
    expect(body).toEqual({ text: "gemini transcript" });
  });

  it("normalizes Nvidia STT payloads to { text }", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeJsonResponse({ transcript: "nvidia transcript" }));

    const { handleSttCore } = await import("../../open-sse/handlers/sttCore.ts");
    const formData = new FormData();
    formData.set("file", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");

    const result = await handleSttCore({
      provider: "nvidia",
      model: "nvidia/parakeet-ctc-1.1b-asr",
      formData,
      credentials: { apiKey: "nv-key" },
    });

    expect(result.success).toBe(true);
    const body = await result.response.json();
    expect(body).toEqual({ text: "nvidia transcript" });
  });

  it("normalizes HuggingFace STT payloads to { text }", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeJsonResponse({ text: "hf transcript" }));

    const { handleSttCore } = await import("../../open-sse/handlers/sttCore.ts");
    const formData = new FormData();
    formData.set("file", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");

    const result = await handleSttCore({
      provider: "huggingface",
      model: "openai/whisper-small",
      formData,
      credentials: { apiKey: "hf-key" },
    });

    expect(result.success).toBe(true);
    const body = await result.response.json();
    expect(body).toEqual({ text: "hf transcript" });
  });

  it("polls AssemblyAI until transcript completes", async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeJsonResponse({ upload_url: "https://upload.example/audio" }))
      .mockResolvedValueOnce(makeJsonResponse({ id: "transcript-1" }))
      .mockResolvedValueOnce(makeJsonResponse({ status: "completed", text: "assembly transcript" }));

    const { handleSttCore } = await import("../../open-sse/handlers/sttCore.ts");
    const formData = new FormData();
    formData.set("file", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");

    const promise = handleSttCore({
      provider: "assemblyai",
      model: "universal-3-pro",
      formData,
      credentials: { apiKey: "aai-key" },
    });

    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          audio_url: "https://upload.example/audio",
          speech_models: ["universal-3-pro"],
          language_detection: true,
        }),
      }),
    );
    expect(result.success).toBe(true);
    const body = await result.response.json();
    expect(body).toEqual({ text: "assembly transcript" });
    vi.useRealTimers();
  });

  it("returns AssemblyAI error payloads as failures", async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeJsonResponse({ upload_url: "https://upload.example/audio" }))
      .mockResolvedValueOnce(makeJsonResponse({ id: "transcript-2" }))
      .mockResolvedValueOnce(makeJsonResponse({ status: "error", error: "assembly failed" }));

    const { handleSttCore } = await import("../../open-sse/handlers/sttCore.ts");
    const formData = new FormData();
    formData.set("file", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");

    const promise = handleSttCore({
      provider: "assemblyai",
      model: "universal-3-pro",
      formData,
      credentials: { apiKey: "aai-key" },
    });

    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toBe("assembly failed");
    vi.useRealTimers();
  });

  it("times out AssemblyAI polling after 120 seconds", async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeJsonResponse({ upload_url: "https://upload.example/audio" }))
      .mockResolvedValueOnce(makeJsonResponse({ id: "transcript-timeout" }))
      .mockImplementation(async () => makeJsonResponse({ status: "processing" }));

    const { handleSttCore } = await import("../../open-sse/handlers/sttCore.ts");
    const formData = new FormData();
    formData.set("file", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");

    const promise = handleSttCore({
      provider: "assemblyai",
      model: "universal-3-pro",
      formData,
      credentials: { apiKey: "aai-key" },
    });

    await vi.advanceTimersByTimeAsync(120000);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.status).toBe(504);
    expect(result.error).toMatch(/timeout/i);
    vi.useRealTimers();
  });
});
