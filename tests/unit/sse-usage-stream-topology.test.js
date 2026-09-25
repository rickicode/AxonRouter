import { describe, it, expect, vi } from "vitest";
import { GET } from "@/app/api/usage/stream/route.js";
import { trackPendingRequest, recordRequestUsage, statsEmitter } from "@/lib/db/repos/usageRepo.js";
import { getValkey, publishValkey } from "@/lib/cache/valkeyClient.js";

describe("Live SSE Push Updates & Provider Topology Cross-Process Sync", () => {
  it("streams cross-process active request changes via SSE for Provider Topology", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // Read initial stream connection handshake and initial state
    let initialChunks = "";
    while (!initialChunks.includes("data: ")) {
      const { value, done } = await reader.read();
      if (done) break;
      initialChunks += decoder.decode(value, { stream: true });
    }
    expect(initialChunks).toContain("data: ");

    // Simulate Worker process starting a request for 'anthropic' provider
    const reqId = `cross_proc_${Date.now()}`;
    const model = "claude-3-7-sonnet";
    const provider = "anthropic";
    const connId = `conn_${Date.now()}`;

    // Record pending request in usageRepo (updates Valkey distributed registry and emits pending)
    await trackPendingRequest(model, provider, connId, true, false, {
      requestId: reqId,
      apiKey: "sk-ant-test",
      isStream: true,
    });

    // Read the pending update pushed through SSE
    let sseOutput = "";
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const readPromise = reader.read();
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 500));
      const res = await Promise.race([readPromise, timeoutPromise]);
      if (res.timeout) continue;
      if (res.done) break;
      sseOutput += decoder.decode(res.value, { stream: true });
      if (sseOutput.includes(provider) && sseOutput.includes(model)) break;
    }

    expect(sseOutput).toContain(provider);
    expect(sseOutput).toContain(model);

    // Verify parsed data contains activeRequests with this provider
    const lines = sseOutput.split("\n").filter((l) => l.startsWith("data: "));
    const lastDataLine = lines[lines.length - 1];
    const payload = JSON.parse(lastDataLine.replace("data: ", ""));
    const active = payload.activeRequests?.find((r) => r.model === model && r.connectionId === connId);
    expect(active).toBeDefined();
    expect(active?.provider).toBe(provider);

    // Clean up active request
    await trackPendingRequest(model, provider, connId, false, false, {
      requestId: reqId,
      apiKey: "sk-ant-test",
      isStream: true,
    });

    await reader.cancel();
  });

  it("streams cross-process completed request and recentRequests for Provider Topology lastProvider", async () => {
    const response = await GET();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // Consume initial frame
    let initialChunks = "";
    while (!initialChunks.includes("data: ")) {
      const { value, done } = await reader.read();
      if (done) break;
      initialChunks += decoder.decode(value, { stream: true });
    }

    const testProvider = "deepseek";
    const testModel = "deepseek-reasoner";
    const testConn = `conn_ds_${Date.now()}`;

    // Simulate completion event published over Valkey Pub/Sub from another gateway process
    const valkey = getValkey();
    const recentEntry = {
      timestamp: new Date().toISOString(),
      provider: testProvider,
      model: testModel,
      connectionId: testConn,
      account: "DeepSeek Primary",
      apiKey: "sk-ds-key",
      endpoint: "/v1/chat/completions",
      status: "ok",
      tokens: { prompt_tokens: 200, completion_tokens: 500 },
      isStream: false,
      cost: 0.001,
    };

    await valkey.lpush("axon:recent_requests", JSON.stringify(recentEntry));
    await valkey.ltrim("axon:recent_requests", 0, 49);

    // Broadcast stats update event from another PID
    await publishValkey("axon:events:stats", {
      event: "update",
      originPid: process.pid + 8888,
      ts: Date.now(),
    });

    // Read the update pushed through SSE
    let sseOutput = "";
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const readPromise = reader.read();
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 500));
      const res = await Promise.race([readPromise, timeoutPromise]);
      if (res.timeout) continue;
      if (res.done) break;
      sseOutput += decoder.decode(res.value, { stream: true });
      if (sseOutput.includes(testProvider) && sseOutput.includes(testModel)) break;
    }

    expect(sseOutput).toContain(testProvider);
    expect(sseOutput).toContain(testModel);

    const lines = sseOutput.split("\n").filter((l) => l.startsWith("data: "));
    const lastDataLine = lines[lines.length - 1];
    const payload = JSON.parse(lastDataLine.replace("data: ", ""));
    expect(payload.recentRequests?.[0]?.provider).toBe(testProvider);
    expect(payload.recentRequests?.[0]?.model).toBe(testModel);

    await reader.cancel();
  });
});
