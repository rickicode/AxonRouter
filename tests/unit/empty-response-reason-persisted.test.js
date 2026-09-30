/**
 * An empty streaming response was persisted with status "error" and no reason.
 *
 * The detail row is the only durable record of what happened, and with the
 * error field missing the row was indistinguishable from an upstream failure:
 * 13 atria-asi rows in three hours had status "error" with nothing to explain
 * it, so the cause could only be guessed at from logs that had already rolled.
 *
 * Reader-side queries already project data->>'error' (requestDetailsRepo), so
 * the reason has to land at the root of that jsonb, as a string.
 */
import { describe, it, expect } from "vitest";
import { buildRequestDetail } from "../../open-sse/handlers/chatCore/requestDetail.js";

describe("buildRequestDetail carries the empty-response reason", () => {
  const base = {
    provider: "atria-asi",
    model: "Atria-Dawn-Preview",
    latency: { ttft: 95123, total: 111321 },
    tokens: { prompt_tokens: 0, completion_tokens: 233 },
    response: { content: "[Empty streaming response]", type: "streaming" },
    status: "error",
    error: {
      message: "stream completed with no content, reasoning, or tool call",
      type: "empty_response",
      provider: "atria-asi",
      model: "Atria-Dawn-Preview",
    },
  };

  it("puts a readable reason at data->>'error'", () => {
    const detail = buildRequestDetail(base);
    expect(detail.error).toBe("stream completed with no content, reasoning, or tool call");
  });

  it("keeps the reason a string, since the repo projection casts it", () => {
    expect(typeof buildRequestDetail(base).error).toBe("string");
  });

  it("leaves error undefined for a successful response", () => {
    const ok = buildRequestDetail({ ...base, status: "success", error: null });
    expect(ok.error).toBeUndefined();
  });

  it("accepts a plain string reason", () => {
    expect(buildRequestDetail({ ...base, error: "upstream died" }).error).toBe("upstream died");
  });

  it("still records the empty-response content marker for display", () => {
    const detail = buildRequestDetail(base);
    expect(detail.status).toBe("error");
    expect(detail.response.content).toBe("[Empty streaming response]");
  });
});
