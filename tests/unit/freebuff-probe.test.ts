import { describe, expect, it, vi, afterEach } from "vitest";

import {
  FREEBUFF_DEFAULT_AGENT_ID,
  FREEBUFF_DEFAULT_MODEL,
  buildFreebuffCompletionRequest,
  buildFreebuffCredentialRecord,
  buildFreebuffRunStartRequest,
  explainFreebuffError,
  extractFreebuffFingerprint,
  ensureFreebuffSession,
  isValidFreebuffCombo,
  getFreebuffSession,
  joinFreebuffSession,
  resolveFreebuffClientId,
  startFreebuffRun,
  sendFreebuffCompletion,
} from "../../src/lib/freebuff/probe.ts";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("freebuff probe helpers", () => {
  it("builds the known-good free-mode run and completion payloads", () => {
    expect(buildFreebuffRunStartRequest()).toEqual({
      action: "START",
      agentId: FREEBUFF_DEFAULT_AGENT_ID,
    });

    expect(buildFreebuffCompletionRequest({
      runId: "run-123",
      prompt: "Say hello in one word",
    })).toEqual({
      model: FREEBUFF_DEFAULT_MODEL,
      messages: [{ role: "user", content: "Say hello in one word" }],
      max_tokens: 50,
      codebuff_metadata: {
        run_id: "run-123",
        client_id: "axonrouter-freebuff-probe",
        cost_mode: "free",
      },
      provider: {
        order: ["deepseek"],
        allow_fallbacks: true,
      },
    });
  });

  it("derives a reusable credential record with fingerprint/account metadata", () => {
    expect(buildFreebuffCredentialRecord({
      apiKey: "token-1",
      fingerprint: "instance-abc",
      accountId: "acct-1",
      authMethod: "new-account-login",
      name: "Primary Freebuff",
    })).toEqual({
      provider: "freebuff",
      authType: "apikey",
      name: "Primary Freebuff",
      apiKey: "token-1",
      providerSpecificData: {
        authMethod: "new-account-login",
        fingerprint: "instance-abc",
        accountId: "acct-1",
      },
    });
  });

  it("recognizes the valid freebuff combo and common server-side errors", () => {
    expect(isValidFreebuffCombo(FREEBUFF_DEFAULT_AGENT_ID, FREEBUFF_DEFAULT_MODEL)).toBe(true);
    expect(isValidFreebuffCombo("wrong", FREEBUFF_DEFAULT_MODEL)).toBe(false);
    expect(explainFreebuffError({ error: "free_mode_invalid_agent_model" })).toContain("invalid");
    expect(explainFreebuffError({ error: "freebuff_update_required" })).toContain("restart freebuff");
    expect(explainFreebuffError({ status: "rate_limited" })).toContain("daily session limit");
    expect(extractFreebuffFingerprint({ instanceId: "fp-123" })).toBe("fp-123");
  });

  it("resolves the freebuff client id from imported runtime metadata", () => {
    expect(resolveFreebuffClientId({
      providerSpecificData: { instanceId: "inst-123", fingerprint: "fp-123" },
    })).toBe("inst-123");

    expect(resolveFreebuffClientId({
      providerSpecificData: { fingerprint: "fp-123" },
    })).toBe("fp-123");

    expect(resolveFreebuffClientId({})).toBe("axonrouter-freebuff-probe");
  });

  it("calls the expected endpoints for session, run, and completion probes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ status: "active", instanceId: "inst-1" }) })
      .mockResolvedValueOnce({ json: async () => ({ runId: "run-1" }) })
      .mockResolvedValueOnce({ json: async () => ({ error: "freebuff_update_required" }) });

    global.fetch = fetchMock as any;

    const session = await getFreebuffSession("token-abc");
    const run = await startFreebuffRun("token-abc");
    const completion = await sendFreebuffCompletion("token-abc", {
      runId: "run-1",
      prompt: "hello",
      freebuffInstanceId: "inst-1",
    });

    expect(session.data).toMatchObject({ status: "active", instanceId: "inst-1" });
    expect(run.data).toMatchObject({ runId: "run-1" });
    expect(completion.data).toMatchObject({ error: "freebuff_update_required" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://www.codebuff.com/api/v1/freebuff/session",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://www.codebuff.com/api/v1/agent-runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "START", agentId: FREEBUFF_DEFAULT_AGENT_ID }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://www.codebuff.com/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );

    const completionBody = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(completionBody).toMatchObject({
      model: FREEBUFF_DEFAULT_MODEL,
      codebuff_metadata: expect.objectContaining({
        run_id: "run-1",
        cost_mode: "free",
        freebuff_instance_id: "inst-1",
      }),
    });
  });

  it("joins a freebuff session when no active session exists", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ status: "none" }) })
      .mockResolvedValueOnce({
        json: async () => ({
          status: "active",
          instanceId: "inst-1",
          remainingMs: 3_600_000,
        }),
      });

    global.fetch = fetchMock as any;

    const result = await ensureFreebuffSession("token-abc");

    expect(result.active).toBe(true);
    expect(result.join?.data).toMatchObject({ status: "active", instanceId: "inst-1" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://www.codebuff.com/api/v1/freebuff/session",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://www.codebuff.com/api/v1/freebuff/session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: FREEBUFF_DEFAULT_MODEL }),
      }),
    );
  });

  it("can post a freebuff session join request directly", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ status: "rate_limited" }) });

    global.fetch = fetchMock as any;

    const join = await joinFreebuffSession("token-abc");

    expect(join.data).toMatchObject({ status: "rate_limited" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.codebuff.com/api/v1/freebuff/session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: FREEBUFF_DEFAULT_MODEL }),
      }),
    );
  });
});
