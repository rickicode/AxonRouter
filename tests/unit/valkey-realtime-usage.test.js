import { describe, it, expect } from "vitest";
import {
  trackPendingRequest,
  getActiveRequests,
  statsEmitter,
} from "@/lib/db/repos/usageRepo.js";
import { getValkey, publishValkey } from "@/lib/cache/valkeyClient.js";

describe("Valkey Cross-Process Real-Time Usage & SSE Synchronization", () => {
  it("synchronizes active requests through Valkey into getActiveRequests()", async () => {
    const testReqId = `req_valkey_sync_${Date.now()}`;
    const testModel = "claude-3-7-sonnet";
    const testProvider = "anthropic";
    const testConnId = `conn_valkey_${Date.now()}`;

    // Start request
    await trackPendingRequest(testModel, testProvider, testConnId, true, false, {
      requestId: testReqId,
      apiKey: "sk-valkey-test-key",
      isStream: true,
    });

    // getActiveRequests() should include this active request
    const { activeRequests } = await getActiveRequests();
    const found = activeRequests.find((r) => r.model === testModel && r.connectionId === testConnId);
    expect(found).toBeDefined();
    expect(found?.status).toBe("streaming");

    // Complete request
    await trackPendingRequest(testModel, testProvider, testConnId, false, false, {
      requestId: testReqId,
      apiKey: "sk-valkey-test-key",
      isStream: true,
    });

    // getActiveRequests() should no longer include this active request
    const { activeRequests: activeAfter } = await getActiveRequests();
    const foundAfter = activeAfter.find((r) => r.model === testModel && r.connectionId === testConnId);
    expect(foundAfter).toBeUndefined();
  });

  it("synchronizes recent requests through Valkey ring buffer", async () => {
    const valkey = getValkey();
    expect(valkey).toBeTruthy();

    const testEntry = {
      timestamp: new Date().toISOString(),
      provider: "openai",
      model: "gpt-4.5-preview",
      connectionId: "conn-recent-test",
      account: "Test OpenAI Account",
      apiKey: "sk-live-recent-1234",
      endpoint: "/v1/chat/completions",
      status: "ok",
      tokens: { prompt_tokens: 150, completion_tokens: 300 },
      isStream: true,
      cost: 0.005,
    };

    // Simulate gateway worker pushing completed request to Valkey ring buffer
    await valkey.lpush("axon:recent_requests", JSON.stringify(testEntry));
    await valkey.ltrim("axon:recent_requests", 0, 49);

    // Dashboard web server calling getActiveRequests() should see this request in recentRequests
    const { recentRequests } = await getActiveRequests();
    const found = recentRequests.find((r) => r.model === "gpt-4.5-preview" && r.connectionId === "conn-recent-test");
    expect(found).toBeDefined();
    expect(found?.promptTokens).toBe(150);
    expect(found?.completionTokens).toBe(300);
  });

  it("bridges statsEmitter events via Valkey Pub/Sub", async () => {
    let receivedEvent = null;
    const onEvent = () => {
      receivedEvent = "update";
    };
    statsEmitter.on("update", onEvent);

    // Simulate an event published by a different worker process (different PID)
    await publishValkey("axon:events:stats", {
      event: "update",
      originPid: process.pid + 9999, // different PID
      ts: Date.now(),
    });

    // Wait briefly for Pub/Sub dispatch
    await new Promise((r) => setTimeout(r, 150));
    expect(receivedEvent).toBe("update");

    statsEmitter.off("update", onEvent);
  });

  it("synchronizes errorProvider across processes", async () => {
    const valkey = getValkey();
    await valkey.set("axon:last_error_provider", "mistral", "EX", 10);

    const { errorProvider } = await getActiveRequests();
    expect(errorProvider).toBe("mistral");

    await valkey.del("axon:last_error_provider");
  });
});
